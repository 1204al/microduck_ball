// Video recorder (dev tool, not part of the game).
//
// Open the game from tools/record_server.py (it saves what this file sends), load this file with a <script>
// tag and call REC.run(). It plays a round with a bot frame by frame at a fixed 30 fps,
// draws a video HUD over every frame (mass counter, tier pips, what the duck can eat now, what it just ate)
// and POSTs each frame as a JPEG. The quiet stretches between tiers are skipped, so the result is already
// cut: each tier shows the last moments before the switch and the first moments after it. For the video the duck
// is driven calmly (it keeps to things ahead of it instead of zigzagging) and the camera turns slower than the
// game's. Sound is rendered offline into two stems (music, effects) that line up with the frames.
// tools/make_video.sh assembles it.
window.REC = (function () {
  const W = 1920, H = 1080, FPS = 30, DT = 1 / FPS, SR = 48000, MAX_S = 120;
  const D = MD.Debug, B = MD.Ball, RL = MD.Rules, WD = MD.World;
  const YEL = '#f5c518', PAPER = '#f3eee4', INK = '#1d1b22';
  const FONT_D = '"Lilita One", "Arial Rounded MT Bold", sans-serif', FONT_B = 'Chivo, "Segoe UI", sans-serif', FONT_M = '"Chivo Mono", Menlo, monospace';
  // What each tier opens up, for the "now eating" card.
  const EATS = [
    'Batteries · controllers · Raspberry Pi',
    'Keyboards · monitors · routers · PS5',
    'GPUs · gaming PCs · robot vacuums',
    'Optimus · Figure 02 · Atlas · Unitree H1',
    'Spot · robot arms · delivery robots',
    'DGX Stations · DGX H100 servers',
    'SuperPOD racks · server racks',
    'The Mega Microduck itself',
  ];
  // Capture policy, in seconds: after a tier switch, and the run-up before the next one.
  const AFTER = 2.6, BEFORE = 2.0, RUNUP = 0.74, CUT_FX = 7;
  // Right after a switch the duck brakes for a moment, so it stands up on its skates and you see how big it got.
  const BRAKE = 1.5;
  // How fast the video camera turns after the duck (the game's own camera: 5).
  const CAM_TURN = 1.5;
  // Growth multiplier per tier: a beat longer among the batteries, then brisk.
  const GROW = [1.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2];

  const R = { status: 'idle', frame: 0, sim: 0, cuts: [], tiers: [], error: null };
  const clock = { t: 0, live: true };
  let out, g, offMusic, offSfx, pending = [];
  let ti = 0, tierT = 99, runupT = 0, shownMass = 12, cutFx = 0, flash = 0, banner = 0, cardPop = 0;
  const feed = [];
  let capturing = false, phase = 'intro', phaseT = 0, startMass = 12, peakMass = 12;

  // ---------- Audio: the game plays into offline contexts that run on the video's clock ----------
  function proxy(ctx) {
    return new Proxy(ctx, {
      get(t, p) {
        if (p === 'currentTime') return clock.t;
        if (p === 'state') return clock.live ? 'running' : 'suspended';
        if (p === 'resume' || p === 'suspend') return () => Promise.resolve();
        const v = Reflect.get(t, p, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  }

  async function setup() {
    await Promise.all([`150px ${FONT_D}`, `800 40px ${FONT_B}`, `400 40px ${FONT_B}`, `600 40px ${FONT_M}`].map(f => document.fonts.load(f)));
    // A fixed render size, without the adaptive pixel ratio.
    WD.adapt = () => {};
    WD.renderer.setPixelRatio(1); WD.renderer.setSize(W, H, false);
    WD.camera.aspect = W / H; WD.camera.updateProjectionMatrix();
    out = document.createElement('canvas'); out.width = W; out.height = H; g = out.getContext('2d');
    offMusic = new OfflineAudioContext(2, SR * MAX_S, SR); offSfx = new OfflineAudioContext(2, SR * MAX_S, SR);
    MD.Audio.useContext(proxy(offSfx)); MD.Music.useContext(proxy(offMusic));
    D.manual = true;
    // What the duck eats goes into the on-screen feed (only the things worth naming).
    const orig = B.onAbsorb;
    B.onAbsorb = (o, gain) => {
      orig && orig(o, gain);
      if (!capturing) return;
      const cur = RL.tierOf(B.mass);
      if (o.boss || o.golden || o.tier - 1 >= cur - 1 || gain > B.mass * 0.03) {
        feed.unshift({ text: (o.boss ? '' : '+ ') + o.name, gold: !!o.golden || !!o.boss, t: 0 });
        feed.length = Math.min(feed.length, 5);
      }
    };
  }

  // ---------- One step of the game, captured or skipped ----------
  async function stepCaptured(camFx) {
    clock.live = true; clock.t = R.frame / FPS;
    MD.Music.pump();
    D.noRender = true; D.step(DT); D.noRender = false;
    if (camFx) camFx();
    WD.render();
    draw();
    await send();
  }
  function stepSkipped() {
    clock.live = false;
    D.noRender = true; D.step(DT); D.noRender = false;
    clock.live = true;
  }

  async function send() {
    const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.92));
    const name = 'frames/f' + String(R.frame).padStart(5, '0') + '.jpg';
    R.frame++;
    pending.push(fetch('/__rec/' + name, { method: 'POST', body: blob }));
    if (pending.length > 6) await pending.shift();
  }
  const post = (name, body) => fetch('/__rec/' + name, { method: 'POST', body });

  // ---------- Drawing ----------
  const ease = x => x * x * (3 - 2 * x), clamp01 = x => Math.max(0, Math.min(1, x));
  const fmtMass = m => m < 1000 ? `${Math.round(m)} kg` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} t`;
  function text(s, x, y, size, font, fill, opts) {
    opts = opts || {};
    g.font = `${opts.weight || ''} ${size}px ${font}`.trim();
    g.textAlign = opts.align || 'center'; g.textBaseline = 'alphabetic';
    g.letterSpacing = opts.spacing || '0px';
    g.lineJoin = 'round';
    if (opts.stroke) { g.lineWidth = opts.sw || size * 0.12; g.strokeStyle = opts.stroke; g.strokeText(s, x, y); }
    g.fillStyle = fill; g.fillText(s, x, y);
    g.letterSpacing = '0px';
  }
  function rrect(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
  function pop(t, dur) { const k = clamp01(t / dur); return 1 + 0.35 * Math.sin(k * Math.PI) * (1 - k) * 2; }

  function draw() {
    const gl = WD.renderer.domElement;
    if (cutFx > 0) {
      // Right after a skip: a quick punch-in and a white blink, so the cut reads as a jump ahead.
      const k = cutFx / CUT_FX, z = 1 + 0.05 * k;
      g.drawImage(gl, -W * (z - 1) / 2, -H * (z - 1) / 2, W * z, H * z);
    } else g.drawImage(gl, 0, 0, W, H);
    // Shade the top and bottom a little so the text reads on a bright floor.
    let gr = g.createLinearGradient(0, 0, 0, 330); gr.addColorStop(0, 'rgba(20,18,26,.55)'); gr.addColorStop(1, 'rgba(20,18,26,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, 330);
    gr = g.createLinearGradient(0, 720, 0, H); gr.addColorStop(0, 'rgba(20,18,26,0)'); gr.addColorStop(1, 'rgba(20,18,26,.55)');
    g.fillStyle = gr; g.fillRect(0, 720, W, H - 720);

    if (phase === 'intro') drawIntro();
    else if (phase === 'outro') drawOutro();
    else drawHud();

    const fl = Math.max(flash, cutFx > 0 ? (cutFx / CUT_FX) * 0.3 : 0);
    if (fl > 0) { g.fillStyle = `rgba(255,255,255,${fl})`; g.fillRect(0, 0, W, H); }
  }

  // "MICRODUCK BALL." on one line, white and yellow.
  function titleLine(y, size, sw) {
    g.font = `${size}px ${FONT_D}`;
    const a = g.measureText('MICRODUCK ').width, b = g.measureText('BALL.').width, x = W / 2 - (a + b) / 2;
    text('MICRODUCK ', x, y, size, FONT_D, '#fff', { stroke: INK, sw, align: 'left' });
    text('BALL.', x + a, y, size, FONT_D, YEL, { stroke: INK, sw, align: 'left' });
  }

  function drawIntro() {
    const k = clamp01(phaseT / 0.5), fade = clamp01((2.4 - phaseT) / 0.35);
    g.globalAlpha = Math.min(k, fade);
    const s = 0.85 + 0.15 * ease(k);
    g.save(); g.translate(W / 2, 190); g.scale(s, s); g.translate(-W / 2, 0);
    titleLine(0, 150, 20);
    g.restore();
    text('ROLL · GRAB · GROW', W / 2, 270, 38, FONT_M, PAPER, { weight: 600, spacing: '10px', stroke: INK, sw: 9 });
    g.globalAlpha = 1;
  }

  function drawHud() {
    // Mass counter, counting up smoothly.
    const sc = pop(tierT, 0.5);
    g.save(); g.translate(W / 2, 128); g.scale(sc, sc);
    text(fmtMass(shownMass), 0, 0, 112, FONT_D, '#fff', { stroke: INK, sw: 18 });
    g.restore();
    text(`${Math.round(B.r * 20)} cm`, W / 2, 180, 32, FONT_M, PAPER, { weight: 600, spacing: '6px', stroke: INK, sw: 8 });
    // Tier pips: one per tier, the reached ones filled.
    const n = RL.TIERS.length, gap = 56, x0 = W / 2 - gap * (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap, y = 226, on = i <= ti, cur = i === ti;
      const r = cur ? 14 * pop(tierT, 0.6) : 10;
      g.beginPath(); g.arc(x, y, r + 4, 0, 7); g.fillStyle = INK; g.fill();
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = on ? (cur ? YEL : PAPER) : 'rgba(243,238,228,.25)'; g.fill();
    }

    // "Now eating" card in the bottom left, with a bar towards the next tier.
    const cw = 780, ch = 232, cx = 56, cy = H - 52 - ch, cp = pop(cardPop, 0.45), L = cx + 44;
    g.save(); g.translate(cx + cw / 2, cy + ch / 2); g.scale(cp, cp); g.translate(-(cx + cw / 2), -(cy + ch / 2));
    rrect(cx, cy, cw, ch, 32); g.fillStyle = 'rgba(29,27,34,.78)'; g.fill();
    g.lineWidth = 5; g.strokeStyle = cardPop < 0.6 ? YEL : 'rgba(243,238,228,.18)'; g.stroke();
    text('NOW EATING', L, cy + 50, 28, FONT_M, YEL, { weight: 600, spacing: '8px', align: 'left' });
    text(RL.TIERS[ti].name, L, cy + 110, 50, FONT_D, '#fff', { align: 'left' });
    text(EATS[ti], L, cy + 150, 28, FONT_B, 'rgba(243,238,228,.85)', { align: 'left' });
    if (ti + 1 < n) {
      const lo = RL.TIERS[ti].gate, hi = RL.TIERS[ti + 1].gate, p = clamp01(Math.log(Math.max(lo, B.mass) / lo) / Math.log(hi / lo));
      const bw = cw - 88, by = cy + 170;
      rrect(L, by, bw, 10, 5); g.fillStyle = 'rgba(243,238,228,.18)'; g.fill();
      rrect(L, by, Math.max(10, bw * p), 10, 5); g.fillStyle = YEL; g.fill();
      text(`NEXT: ${RL.TIERS[ti + 1].name.toUpperCase()} · ${fmtMass(hi)}`, L, cy + 210, 22, FONT_M, 'rgba(243,238,228,.75)', { weight: 600, spacing: '3px', align: 'left' });
    }
    g.restore();

    // What it just ate, in the bottom right.
    feed.forEach((f, i) => {
      const a = clamp01(Math.min(f.t / 0.15, (2.4 - f.t) / 0.4));
      if (a <= 0) return;
      g.globalAlpha = a;
      const x = W - 64 + (1 - clamp01(f.t / 0.2)) * 40;
      text(f.text, x, H - 70 - i * 58, 44, FONT_B, f.gold ? YEL : '#fff', { weight: 800, align: 'right', stroke: INK, sw: 10 });
      g.globalAlpha = 1;
    });

    // The tier switch.
    if (banner > 0) {
      const t = 1.7 - banner, k = clamp01(t / 0.25), out = clamp01(banner / 0.3);
      g.globalAlpha = out;
      const s = (0.6 + 0.4 * ease(k)) * (1 + 0.15 * Math.sin(k * Math.PI));
      g.save(); g.translate(W / 2, 380); g.rotate(-0.05); g.scale(s, s);
      text('LEVEL UP!', 0, 0, 140, FONT_D, YEL, { stroke: INK, sw: 22 });
      text(RL.TIERS[ti].name.toUpperCase(), 0, 76, 46, FONT_D, '#fff', { stroke: INK, sw: 11 });
      g.restore();
      g.globalAlpha = 1;
    }
  }

  function drawOutro() {
    const k = clamp01(phaseT / 0.3);
    g.globalAlpha = k;
    g.save(); g.translate(W / 2, 200); g.rotate(-0.04); const s = 0.7 + 0.3 * ease(k); g.scale(s, s);
    text('TOPPLED!', 0, 0, 150, FONT_D, YEL, { stroke: INK, sw: 24 });
    g.restore();
    text(`${fmtMass(startMass)}  →  ${fmtMass(peakMass)}`, W / 2, 300, 70, FONT_D, '#fff', { stroke: INK, sw: 14 });
    const k2 = clamp01((phaseT - 1.6) / 0.5);
    g.globalAlpha = k2;
    titleLine(H - 110, 110, 16);
    text('ROLL · GRAB · GROW', W / 2, H - 50, 34, FONT_M, PAPER, { weight: 600, spacing: '10px', stroke: INK, sw: 8 });
    g.globalAlpha = 1;
  }

  function tickFx(dt) {
    phaseT += dt; tierT += dt; cardPop += dt;
    cutFx = Math.max(0, cutFx - 1);
    flash = Math.max(0, flash - dt * 3);
    banner = Math.max(0, banner - dt);
    shownMass += (B.mass - shownMass) * Math.min(1, dt * 7);
    feed.forEach(f => { f.t += dt; });
    while (feed.length && feed[feed.length - 1].t > 2.4) feed.pop();
  }

  // ---------- The intro camera: from the duck's face round to the play view ----------
  const UP = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3(), Q0 = new THREE.Quaternion();
  function introCam(k) {
    const C = WD.camera, e = ease(k);
    Q0.copy(C.quaternion);
    V.copy(C.position).sub(new THREE.Vector3(B.x, 0, B.z));
    V.applyAxisAngle(UP, Math.PI * 0.9 * (1 - e)).multiplyScalar(0.62 + 0.38 * e);
    V.y = Math.max(V.y, B.r * 2.2);
    C.position.set(B.x + V.x, V.y, B.z + V.z);
    C.lookAt(B.x, B.r * (2.5 - 0.9 * e), B.z);
    // Keep the duck in the middle; only at the end turn to the game's own aim.
    const w = clamp01((e - 0.7) / 0.3);
    C.quaternion.slerp(Q0, w * w);
  }

  // ---------- Calm driving for the video ----------
  // Like the bot in tools/sim.js, but it keeps its target until it gets it, prefers things ahead of it over
  // things to the side, and eases the steering, so the duck runs in long arcs rather than zigzags.
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const dv = { tgt: null, tx: 0, tz: 0, scan: 0, chase: 0, turn: 0, stuck: 0, escape: 0, dir: 1, skip: new Map() };
  function calmInput(b, w) {
    const inp = MD.UI.input;
    dv.stuck = (b.speed || 0) < 1.2 ? dv.stuck + DT : 0;
    if (dv.stuck > 0.9) { dv.stuck = 0; dv.escape = 1; dv.dir = dv.turn >= 0 ? 1 : -1; if (dv.tgt) dv.skip.set(dv.tgt, R.sim + 8); dv.tgt = null; }
    if (dv.escape > 0) { dv.escape -= DT; inp.fwd = dv.escape > 0.5 ? -1 : 1; inp.turn = dv.dir; dv.turn = 0; inp.boost = false; return inp; }
    if (dv.tgt && !dv.tgt.alive) dv.tgt = null;
    dv.chase = dv.tgt ? dv.chase + DT : 0;
    if (dv.tgt && dv.chase > 5) { dv.skip.set(dv.tgt, R.sim + 8); dv.tgt = null; }
    dv.scan -= DT;
    if (dv.scan <= 0) {
      dv.scan = 0.5;
      const score = o => {
        const d = Math.hypot(o.x - b.x, o.z - b.z), f = Math.max(0, Math.cos(wrap(Math.atan2(o.x - b.x, o.z - b.z) - b.heading)));
        return RL.gain(o, b.mass) / (d + 3) * (0.12 + f * f);
      };
      let best = null, bs = 0;
      if (w.boss && w.boss.alive && RL.canBreak(b.mass, w.boss.gate, 1)) { best = w.boss; bs = 1e12; }
      else {
        w.query(b.x, b.z, 30, o => {
          if (o.boss || !RL.canBreak(b.mass, o.gate, b.gateMul) || (dv.skip.get(o) || 0) > R.sim) return;
          if (Math.hypot(o.x - b.x, o.z - b.z) > 30) return;
          const s = score(o) * (o === dv.tgt ? 2.5 : 1);
          if (s > bs) { bs = s; best = o; }
        });
      }
      if (best !== dv.tgt) { dv.tgt = best; dv.chase = 0; }
      if (!dv.tgt && Math.hypot(dv.tx - b.x, dv.tz - b.z) < 6) {
        // Nothing to eat nearby: roam ahead, bending back towards the middle near the edge.
        let a = b.heading + (Math.random() - 0.5) * 0.9;
        if (Math.hypot(b.x, b.z) > 140) a = Math.atan2(-b.x, -b.z) + (Math.random() - 0.5) * 0.6;
        const r = 50 + Math.random() * 40;
        dv.tx = b.x + Math.sin(a) * r; dv.tz = b.z + Math.cos(a) * r;
      }
    }
    if (dv.tgt) { dv.tx = dv.tgt.x; dv.tz = dv.tgt.z; }
    const a = wrap(Math.atan2(dv.tx - b.x, dv.tz - b.z) - b.heading), d = Math.hypot(dv.tx - b.x, dv.tz - b.z);
    dv.turn += (Math.max(-1, Math.min(1, -a * 1.4)) - dv.turn) * Math.min(1, DT * 4);
    inp.turn = dv.turn;
    inp.fwd = Math.abs(a) > 1.4 ? (d < b.r * 4 + 4 ? 0.15 : 0.4) : 1;
    inp.boost = b.turbo > 0.8 && Math.abs(a) < 0.25;
    return inp;
  }

  // The video camera: the game's camera swung round the duck to a yaw that follows the duck's heading slower.
  const Q1 = new THREE.Quaternion(), cc = { yaw: 0, on: false, w: 1 };
  function calmCam() {
    const C = WD.camera, gy = Math.atan2(B.x - C.position.x, B.z - C.position.z);
    if (!cc.on) { cc.yaw = gy; cc.on = true; }
    cc.yaw += wrap(B.heading - cc.yaw) * Math.min(1, DT * CAM_TURN);
    // On the results view the game swings round to the duck's face: let it.
    cc.w = D.state === 'results' ? Math.max(0, cc.w - DT * 1.5) : 1;
    const d = wrap(cc.yaw - gy) * cc.w;
    if (Math.abs(d) < 1e-4) return;
    V.set(C.position.x - B.x, 0, C.position.z - B.z).applyAxisAngle(UP, d);
    C.position.x = B.x + V.x; C.position.z = B.z + V.z;
    C.quaternion.premultiply(Q1.setFromAxisAngle(UP, d));
    WD.occlude(C.position.x, C.position.y, C.position.z, B.x, B.r, B.z, B.r);
  }

  // ---------- The director ----------
  async function run() {
    try {
      R.status = 'setup';
      await setup();
      D.input = null;
      D.play();
      B.mass = startMass = 12;
      // A touch closer than the game's camera.
      for (let i = 0; i < 2; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
      R.status = 'recording';
      capturing = true;
      // Intro: the countdown, the camera swinging round from the duck's face.
      phase = 'intro'; phaseT = 0;
      // Rivals that spawned right next to the duck would crowd the title shot: send them elsewhere.
      MD.Bots.list.forEach(b => {
        if (Math.hypot(b.x - B.x, b.z - B.z) > 30) return;
        const a = Math.random() * Math.PI * 2, r = 110 + Math.random() * 80;
        b.x = Math.sin(a) * r; b.z = -Math.cos(a) * r;
      });
      stepSkipped(); stepSkipped();
      while (D.state === 'count') { const k = clamp01(phaseT / 2.4); await stepCaptured(() => introCam(k)); tickFx(DT); R.sim += DT; }
      phase = 'play'; phaseT = 0;
      D.input = (b, w) => {
        const inp = calmInput(b, w);
        // Brake hard until it's slow enough to stand up, then coast.
        if (ti > 0 && tierT < BRAKE && !b.boss) { inp.fwd = (b.speed || 0) > b.top * 0.15 ? -1 : 0; inp.boost = false; }
        return inp;
      };
      ti = RL.tierOf(B.mass); tierT = 0; cardPop = 99;
      let skipping = false, toppleT = -1;
      while (R.sim < 600 && R.frame < FPS * (MAX_S - 6)) {
        B.shield = 1e6; // a showcase run: no bursting, no bonk losses
        B.growMul = GROW[ti];
        const n = RL.TIERS.length;
        const lo = RL.TIERS[ti].gate, hi = ti + 1 < n ? RL.TIERS[ti + 1].gate : lo;
        const p = ti + 1 < n ? Math.log(Math.max(lo, B.mass) / lo) / Math.log(hi / lo) : 0;
        let want;
        if (D.state === 'results') want = true;
        else if (ti === n - 1) {
          // The giant duck: show the switch, skip the drive to the middle, show the topple.
          const bd = WD.boss ? Math.hypot(WD.boss.x - B.x, WD.boss.z - B.z) : 0;
          want = tierT < AFTER || bd < 40 + B.r * 3 || B.boss;
        } else want = tierT < AFTER || (p > RUNUP && runupT < BEFORE);
        if (want) {
          if (skipping) { skipping = false; cutFx = CUT_FX; R.cuts.push(R.frame); feed.length = 0; cc.on = false; }
          capturing = true;
          await stepCaptured(calmCam);
          if (p > RUNUP && tierT >= AFTER) runupT += DT;
          tickFx(DT);
        } else {
          skipping = true; capturing = false;
          stepSkipped();
          tierT += DT; cardPop += DT; flash = 0; banner = 0;
          shownMass = B.mass;
        }
        R.sim += DT;
        peakMass = Math.max(peakMass, B.mass);
        const nt = RL.tierOf(B.mass);
        if (nt > ti) {
          ti = nt; tierT = 0; runupT = 0; cardPop = 0; flash = 0.45; banner = 1.7;
          R.tiers.push({ tier: ti, frame: R.frame, sim: +R.sim.toFixed(1) });
        }
        // The topple: the outro titles start right away, the results view follows 1.2 s later.
        if (B.boss && phase !== 'outro') { phase = 'outro'; phaseT = 0; banner = 0; flash = 0.6; toppleT = 0; }
        if (toppleT >= 0) { toppleT += DT; if (toppleT > 1.2 && D.state === 'play') D.finish(); }
        if (phase === 'outro' && phaseT > 4.4) break;
      }
      R.status = 'audio';
      await Promise.all(pending); pending = [];
      const dur = R.frame / FPS;
      for (const [ctx, name] of [[offMusic, 'music'], [offSfx, 'sfx']]) {
        const buf = await ctx.startRendering();
        const len = Math.min(buf.length, Math.ceil(dur * SR)), L = buf.getChannelData(0), Rr = buf.getChannelData(1);
        const pcm = new Int16Array(len * 2);
        for (let i = 0; i < len; i++) {
          pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767;
          pcm[i * 2 + 1] = Math.max(-1, Math.min(1, Rr[i])) * 32767;
        }
        await post(name + '.pcm', pcm.buffer);
      }
      await post('meta.json', JSON.stringify({ fps: FPS, frames: R.frame, duration: dur, sampleRate: SR, cuts: R.cuts, tiers: R.tiers, sim: R.sim, peak: peakMass }));
      R.status = 'done';
    } catch (e) {
      R.status = 'error'; R.error = String(e && e.stack || e);
    }
    return R;
  }

  R.run = () => { run(); return 'started'; };
  return R;
})();
