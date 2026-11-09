// Test helpers for the browser console (load with a <script> tag; not part of the game).
//   MD.Debug.manual = true;           stop the real-time loop
//   simRound(270)                     play a whole round with the bot and report growth over time
//   MD.Debug.input = botInput         drive the live game with the bot
//   snap()                            copy the canvas into the page so background-tab screenshots show the latest frame

// A decent player: heads for the best thing it can break nearby, backs off when stuck.
window.botInput = (function () {
  let stuck = 0, escape = 0, turnDir = 1, t = 0, tx = 0, tz = 0;
  return function (B, W) {
    const inp = MD.UI.input, dt = 1 / 30, RL = MD.Rules;
    t -= dt;
    stuck = (B.speed || 0) < 1.2 ? stuck + dt : 0;
    if (stuck > 0.9) { stuck = 0; escape = 1; turnDir = Math.random() < 0.5 ? 1 : -1; t = 0; }
    if (escape > 0) { escape -= dt; inp.fwd = escape > 0.5 ? -1 : 1; inp.turn = turnDir; inp.boost = false; return inp; }
    if (t <= 0) {
      t = 0.3;
      let best = null, bs = 0;
      if (W.boss && W.boss.alive && RL.canBreak(B.mass, W.boss.gate, 1)) { best = W.boss; bs = 1e9; }
      W.query(B.x, B.z, 26, o => {
        if (o.boss || !RL.canBreak(B.mass, o.gate, B.gateMul)) return;
        const d = Math.hypot(o.x - B.x, o.z - B.z);
        if (d > 26) return;
        const s = RL.gain(o, B.mass) / (d + 3);
        if (s > bs) { bs = s; best = o; }
      });
      if (best) { tx = best.x; tz = best.z; }
      else if (Math.hypot(tx - B.x, tz - B.z) < 4) { const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 130; tx = Math.sin(a) * r; tz = -Math.cos(a) * r; }
    }
    const want = Math.atan2(tx - B.x, tz - B.z), a = Math.atan2(Math.sin(want - B.heading), Math.cos(want - B.heading));
    inp.fwd = Math.abs(a) > 1.3 ? 0.3 : 1;
    inp.turn = Math.max(-1, Math.min(1, -a * 2));
    inp.boost = B.turbo > 0.8 && Math.abs(a) < 0.3;
    return inp;
  };
})();

window.simRound = function (secs) {
  const D = MD.Debug; D.manual = true; D.input = window.botInput; D.noRender = true;
  D.play(); D.step(1 / 30, 75);
  const log = [];
  for (let s = 0; s < secs; s += 15) {
    D.step(1 / 30, 450);
    const all = D.balls().slice().sort((a, b) => b.mass - a.mass);
    log.push(`${s + 15}s ${Math.round(MD.Ball.mass)}kg #${all.indexOf(MD.Ball) + 1} top:${Math.round(all[0].mass)}`);
    if (D.state !== 'play') break;
  }
  D.noRender = false;
  return log;
};

window.snap = function () {
  MD.World.render();
  const url = MD.World.renderer.domElement.toDataURL('image/jpeg', 0.85);
  let img = document.getElementById('snapimg');
  if (!img) { img = document.createElement('img'); img.id = 'snapimg'; img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;object-fit:cover'; document.getElementById('stage').after(img); }
  img.src = url;
  return 'snap';
};
