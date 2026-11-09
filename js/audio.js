// Synthesized sound: no audio files, everything is generated with WebAudio.
window.MD = window.MD || {};
MD.Audio = (function () {
  let ctx = null, master = null, muted = false, noiseBuf = null, level = 1;
  try { muted = localStorage.getItem('md-muted') === '1'; } catch (e) {}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55 * level;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (MD.Music) MD.Music.wake();
  }
  const ok = () => ctx && master && ctx.state === 'running';

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ok()) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, 0.005, vol || 0.2, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, q, delay, type) {
    if (!ok()) return;
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    const g = ctx.createGain(); env(g, t, 0.003, vol || 0.2, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  // Robot quack: sawtooth through two formant filters, pitch-bent down. Each duck has its own voice pitch.
  function quack(pitch, len, delay, vol) {
    if (!ok()) return;
    const t = ctx.currentTime + (delay || 0), L = len || 0.16, p = pitch || 1;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(520 * p, t);
    o.frequency.exponentialRampToValueAtTime(300 * p, t + L);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 38; lg.gain.value = 40 * p; lfo.connect(lg); lg.connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100 * p; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2600 * p; f2.Q.value = 6;
    const g = ctx.createGain(); env(g, t, 0.01, vol || 0.5, L);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(master);
    o.start(t); lfo.start(t); o.stop(t + L + 0.05); lfo.stop(t + L + 0.05);
  }
  // A sung note: same voice, held, with vibrato.
  function sing(freq, dur, delay, vol) {
    if (!ok()) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 6; lg.gain.value = freq * 0.015; lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq * 3; f.Q.value = 2.5;
    const g = ctx.createGain(); env(g, t, 0.02, vol || 0.35, dur * 0.95);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  const api = {
    init,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('md-muted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.55 * level;
      return muted;
    },
    quack, tone, noise,
    getCtx() { return ctx; },
    // Video recording (tools/record.js): play into another context, e.g. an OfflineAudioContext.
    useContext(c) {
      ctx = c; master = c.createGain(); master.gain.value = 0.55 * level; master.connect(c.destination);
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    },
    getMaster() { return master; },
    // A Wilhelm-style scream, but as a quack.
    wilhelm(pitch) {
      if (!ok()) return;
      const t = ctx.currentTime, p = pitch || 1;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(500 * p, t); o.frequency.exponentialRampToValueAtTime(1150 * p, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(820 * p, t + 0.4); o.frequency.exponentialRampToValueAtTime(380 * p, t + 0.85);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1300 * p; f1.Q.value = 3;
      const g = ctx.createGain(); env(g, t, 0.02, 0.45, 0.9);
      o.connect(f1); f1.connect(g); g.connect(master); o.start(t); o.stop(t + 0.95);
    },
    squeak() { tone(1500, 0.08, 'sine', 0.25, 1100); tone(1700, 0.1, 'sine', 0.22, 1200, 0.1); },
    slurp() { noise(0.35, 0.3, 300, 0.6, 0, 'lowpass'); tone(500, 0.3, 'sine', 0.1, 1200); },
    meow() { tone(700, 0.15, 'sawtooth', 0.12, 1000); tone(1000, 0.35, 'sawtooth', 0.12, 600, 0.15); },
    setLevel(v) { level = v; if (master) master.gain.value = muted ? 0 : 0.55 * level; },
    servo() { tone(180 + Math.random() * 60, 0.09, 'sawtooth', 0.03, 260); },
    clack() { noise(0.04, 0.35, 3200, 3); tone(1400, 0.03, 'square', 0.06); },
    peckHit() { noise(0.05, 0.5, 2400, 2); tone(900, 0.06, 'square', 0.12, 500); },
    thump() { tone(160, 0.22, 'sine', 0.7, 50); noise(0.08, 0.4, 900, 1); },
    block() { tone(700, 0.05, 'triangle', 0.25, 900); noise(0.03, 0.2, 5000, 4); },
    whoosh() { noise(0.25, 0.25, 900, 0.7, 0, 'lowpass'); },
    skate() { noise(0.4, 0.18, 400, 0.5, 0, 'lowpass'); tone(90, 0.4, 'sawtooth', 0.05, 140); },
    hop() { tone(300, 0.12, 'square', 0.08, 620); },
    land() { noise(0.06, 0.3, 600, 1); },
    clatter() { for (let i = 0; i < 6; i++) noise(0.05, 0.3, 1500 + Math.random() * 3000, 3, i * 0.06); tone(220, 0.3, 'sine', 0.3, 60); },
    fallOff() { tone(900, 1.1, 'sine', 0.25, 120); noise(0.3, 0.4, 500, 1, 1.0); },
    zap() { tone(1800, 0.12, 'sine', 0.08, 2600); },
    coin() { tone(988, 0.08, 'square', 0.12); tone(1319, 0.3, 'square', 0.12, null, 0.08); },
    rug() { tone(600, 0.9, 'sawtooth', 0.14, 70); },
    pickup() { tone(660, 0.07, 'triangle', 0.2); tone(990, 0.12, 'triangle', 0.2, null, 0.07); },
    power() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 'square', 0.1, null, i * 0.06)); },
    sleep() { tone(400, 0.6, 'sine', 0.2, 120); },
    boot(delay) { [392, 523, 659].forEach((f, i) => tone(f, 0.09, 'square', 0.1, null, (delay || 0) + i * 0.08)); },
    beep(f, d) { tone(f || 880, d || 0.08, 'square', 0.1); },
    // "Alle meine Entchen" (All my little ducklings), a public-domain German folk song.
    song(pitch, count) {
      const C = 392 * (pitch || 1), st = n => C * Math.pow(2, n / 12);
      const notes = [[0,1],[2,1],[4,1],[5,1],[7,2],[7,2],[9,1],[9,1],[9,1],[9,1],[7,4],[9,1],[9,1],[9,1],[9,1],[7,4],[5,1],[5,1],[5,1],[5,1],[4,2],[4,2],[2,1],[2,1],[2,1],[2,1],[0,4]];
      let t = 0; const beat = 0.21;
      const timeline = [];
      notes.slice(0, count || notes.length).forEach(([n, b]) => { sing(st(n), b * beat, t, 0.3); timeline.push([t, b * beat]); t += b * beat; });
      return timeline;
    },
  };
  return api;
})();
