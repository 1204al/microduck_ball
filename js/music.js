// Background music: an original chiptune-funk loop, synthesized live with a lookahead step sequencer.
// "menu" is a laid-back lab groove; "fight" is faster with a lead melody. Slow-mo drops tempo and pitch.
window.MD = window.MD || {};
MD.Music = (function () {
  let on = true;
  try { on = localStorage.getItem('md-music') !== '0'; } catch (e) {}
  let ctx = null, bus = null, comp = null, timer = null, step = 0, nextT = 0, mode = 'off', rate = 1, duckLvl = 1, intensity = 0, loop = 0;
  const F2 = 87.307;
  const hz = (semi) => F2 * Math.pow(2, semi / 12) * (rate < 1 ? 0.84 : 1);

  const SONGS = {
    // Christmas: "Jingle Bells" chorus (James Lord Pierpont, 1857, public domain) with sleigh-bell hats.
    xmas: {
      bpm: 132, roots: [0, 0, 0, 0, 5, 0, 2, 7], quals: [[0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7, 10], [0, 4, 7, 10]],
      kick: '1000000010000000', snare: '0000100000001000', hat: '1010101010101010',
      bass: [0, null, null, null, 7, null, null, null, 0, null, null, null, 7, null, null, null],
      pad: true, leadAlways: true, leadType: 'triangle',
      lead: [
        { 0: 4, 4: 4, 8: 4 }, { 0: 4, 4: 4, 8: 4 }, { 0: 4, 4: 7, 8: 0, 12: 2 }, { 0: 4 },
        { 0: 5, 4: 5, 8: 5, 12: 5 }, { 0: 5, 4: 4, 8: 4, 12: 4 }, { 0: 4, 4: 2, 8: 2, 12: 4 }, { 0: 2, 8: 7 },
      ],
    },
    // Disco for the Quack Club: four on the floor, octave bass, open hats, string pads, a minor-key hook.
    disco: {
      bpm: 124, roots: [0, 5, 3, 7], quals: [[0, 3, 7, 10], [0, 3, 7, 10], [0, 4, 7, 10], [0, 3, 7, 10]],
      kick: '1000100010001000', snare: '0000100000001000', hat: '0010001000100010',
      bass: [0, null, 12, null, 0, null, 12, null, 0, null, 12, null, 0, 12, 10, 12],
      pad: true, stabs: [3, 11],
      lead: [
        { 0: 12, 3: 15, 6: 17, 8: 15, 10: 12, 12: 10 },
        { 0: 8, 2: 10, 4: 12, 8: 10, 12: 8 },
        { 0: 7, 2: 8, 4: 10, 6: 12, 8: 15, 12: 12 },
        { 0: 10, 4: 12, 8: 7, 12: 5 },
      ],
    },
    menu: {
      bpm: 94, roots: [0, 4, 5, 7], quals: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 10]],
      kick: '1000000010100000', snare: '0000100000001000', hat: '0010001000100010',
      bass: [0, null, null, null, null, null, null, 7, 0, null, null, 12, null, null, 10, null],
      pad: true, bell: [0, 3, 6, 9, 12], lead: null,
    },
    fight: {
      bpm: 128, roots: [0, 9, 5, 7], quals: [[0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]],
      kick: '1000100010001010', snare: '0000100000001000', hat: '0010001000100010',
      bass: [0, null, null, 0, null, null, 12, null, 0, null, 7, null, null, 12, null, 10],
      stabs: [2, 6, 10, 14],
      // Original melody, semitones above F4, one row per bar of 16 steps.
      lead: [
        { 0: 7, 2: 9, 4: 12, 7: 9, 8: 7, 10: 4, 12: 7 },
        { 0: 9, 2: 7, 4: 5, 6: 4, 8: 2, 11: 4, 12: 5, 14: 9 },
        { 0: 12, 2: 10, 4: 9, 6: 7, 8: 5, 10: 7, 12: 9, 14: 12 },
        { 0: 14, 3: 12, 4: 11, 6: 7, 8: 11, 10: 12, 12: 14 },
      ],
    },
  };

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function osc(type, f, t, dur, vol, opts) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts && opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    env(g, t, (opts && opts.a) || 0.004, vol, dur);
    let out = o;
    if (opts && opts.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = opts.lp; fl.Q.value = opts.q || 1; o.connect(fl); out = fl; }
    out.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(t, dur, vol, type, freq) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, t, 0.002, vol, dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.05);
  }

  function playStep(S, st, t, sd) {
    const bar = Math.floor(st / 16) % S.roots.length, i = st % 16;
    const root = S.roots[bar], chord = S.quals[bar];
    if (S.kick[i] === '1') osc('sine', 150 * (rate < 1 ? 0.8 : 1), t, 0.2, 0.75, { slide: 42 });
    if (S.snare[i] === '1') { noise(t, 0.13, mode === 'menu' ? 0.12 : 0.28, 'bandpass', 1800); osc('triangle', 210, t, 0.06, 0.12); }
    if (S.hat[i] === '1' || (intensity > 0 && mode === 'fight' && i % 2 === 0)) noise(t, 0.035, i % 4 === 2 ? 0.1 : 0.05, 'highpass', 7000);
    const b = S.bass[i];
    if (b != null) osc(mode === 'menu' ? 'triangle' : 'square', hz(root + b), t, sd * (mode === 'menu' ? 3 : 1.6), mode === 'menu' ? 0.32 : 0.16, { lp: mode === 'menu' ? 900 : 700, q: 4 });
    if (S.pad && i === 0) chord.forEach(n => osc('triangle', hz(root + n + 24), t, sd * 15, 0.035, { a: 0.25 }));
    if (S.bell && S.bell.includes(i)) { const n = chord[S.bell.indexOf(i) % chord.length]; osc('sine', hz(root + n + 36), t, 0.5, 0.05); osc('sine', hz(root + n + 48), t, 0.25, 0.015); }
    if (S.stabs && S.stabs.includes(i)) chord.forEach(n => osc('sawtooth', hz(root + n + 24), t, 0.09, 0.035, { lp: 1600 }));
    if (S.lead && (S.leadAlways || loop % 4 >= 1)) {
      const n = S.lead[Math.floor(st / 16) % S.lead.length][i];
      if (n != null) osc(S.leadType || 'square', hz(n + 24), t, sd * (S.leadType ? 3 : 1.7), S.leadType ? 0.09 : 0.055, { lp: 2600 });
    }
  }

  function tick() {
    if (!ctx || mode === 'off') return;
    const S = SONGS[mode];
    const sd = 60 / S.bpm / 4 / rate;
    if (nextT < ctx.currentTime - 0.2) nextT = ctx.currentTime + 0.05;
    while (nextT < ctx.currentTime + 0.12) {
      playStep(S, step, nextT, sd);
      nextT += sd; step++;
      if (step % 64 === 0) loop++;
    }
  }
  function applyGain() {
    if (!bus) return;
    bus.gain.setTargetAtTime(on && mode !== 'off' ? 0.42 * duckLvl : 0, ctx.currentTime, 0.12);
  }
  function ensure() {
    if (ctx) return true;
    ctx = MD.Audio.getCtx();
    if (!ctx) return false;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    bus = ctx.createGain(); bus.gain.value = 0;
    bus.connect(comp); comp.connect(MD.Audio.getMaster());
    timer = setInterval(tick, 25);
    return true;
  }

  return {
    get on() { return on; },
    setMode(m) {
      if (!ensure()) { mode = m; return; }
      if (m === mode) return;
      mode = m; step = 0; loop = 0; nextT = ctx.currentTime + 0.08; applyGain();
    },
    // Called after the first user gesture creates the AudioContext.
    wake() { if (ensure()) { nextT = ctx.currentTime + 0.08; applyGain(); } },
    setRate(r) { rate = r; },
    // Video recording (tools/record.js): play into another context (its own stem) and step the sequencer by
    // hand with pump() instead of the timer, which background tabs slow down.
    useContext(c) {
      if (timer) clearInterval(timer);
      timer = null; ctx = c; noiseBuf = null; on = true;
      comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
      bus = c.createGain(); bus.gain.value = 0;
      bus.connect(comp); comp.connect(c.destination);
      nextT = c.currentTime + 0.08; applyGain();
    },
    pump() { tick(); },
    setIntensity(i) { intensity = i; },
    duck(v) { if (duckLvl !== v) { duckLvl = v; applyGain(); } },
    toggle() { on = !on; try { localStorage.setItem('md-music', on ? '1' : '0'); } catch (e) {} applyGain(); return on; },
  };
})();
