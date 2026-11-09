// Game flow: home screen with ducks rolling behind the menu, countdown, the round (no clock: it lasts until
// the giant duck falls or you end it from the pause menu) against rival ducks on the fixed map, tiers, bursts
// and respawns, the giant-duck finale, results and payout. Also the camera and the frame loop. Numbers come
// from rules.js.
(function () {
  const W = MD.World, B = MD.Ball, UI = MD.UI, Sv = MD.Save, RL = MD.Rules, RO = MD.Roller, BOTS = MD.Bots, $ = UI.$;
  const PI = Math.PI;
  let state = 'home', stats = null, elapsed = 0, countT = 0, tierIdx = 0, tierScrews = 0, kills = 0;
  let shake = 0, last = performance.now(), homeTick = 0, boardT = 0, demoT = 0, runId = 0, shiftN = 0;
  let luckT = 0, eventAt = 0, magnetT = 0, place = 1, zoom = 1, camDist = 7;
  const cam = { pos: new THREE.Vector3(0, 5, -8), look: new THREE.Vector3(), yaw: 0, init: false };
  const DEMO = { speed: 1, gateMul: 1, startMass: 12, goldMul: 1 };
  const TIER_SCREWS = [0, 5, 10, 15, 25, 40, 60, 100];
  // Timers belong to one run: anything scheduled for an old run is ignored.
  const later = (fn, ms) => { const id = runId; setTimeout(() => { if (id === runId) fn(); }, ms); };
  const balls = () => [B].concat(BOTS.list);

  function loadWorld(key, s, bots) {
    W.setTheme(key);
    W.build(key);
    const sp = W.spawns[Math.floor(Math.random() * W.spawns.length)];
    B.reset(s || DEMO, sp.x, sp.z, sp.heading, (s || DEMO).startMass);
    BOTS.spawnAll(bots, Sv.S.botLevel || 0);
    cam.init = false;
  }

  // ---------- Flow ----------
  function goHome() {
    runId++;
    state = 'home';
    $('results').hidden = true; $('pause').hidden = true; UI.showHud(false); UI.clearBig();
    $('home').hidden = false;
    B.celebrate(false);
    loadWorld(Sv.S.world, null, 6);
    UI.renderHome();
    MD.Music.setMode('menu'); MD.Music.duck(1); MD.Music.setIntensity(0);
  }
  function play() {
    runId++;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    MD.Audio.init();
    $('modal').hidden = true;
    stats = Sv.runStats();
    Sv.consumeBoosts(stats.used);
    loadWorld(Sv.S.world, stats, 11);
    shiftN = Sv.shift().n;
    tierIdx = RL.tierOf(B.mass); tierScrews = 0; kills = 0; place = 1;
    magnetT = 0;
    // Beginner's luck: the very first run grows 2.5x faster and can't be burst for 60 s.
    luckT = Sv.S.totalRuns === 0 ? 60 : 0;
    if (luckT > 0) { B.growMul = 2.5; B.shield = 60; later(() => UI.feed("Beginner's luck: 2.5x growth and no bursting for 60 s", 'gold'), 900); }
    elapsed = 0;
    eventAt = 100 + Math.random() * 60;
    $('home').hidden = true; $('results').hidden = true;
    UI.showHud(true);
    B.celebrate(false);
    state = 'count'; countT = 2.4;
    MD.Music.setMode(Sv.S.world === 'p' ? 'disco' : 'fight'); MD.Music.duck(1); MD.Music.setIntensity(0);
    UI.big('3', null, 0.7); MD.Audio.beep(660, 0.1);
    const used = Object.keys(stats.used);
    if (used.length) later(() => UI.feed('Boosts on: ' + used.map(k => Sv.BOOSTS.find(b => b.key === k).name).join(', '), 'gold'), 300);
    if (stats.carried) later(() => UI.feed(`Carried over from last round: ${UI.fmtMass(B.mass)}`, 'gold'), 450);
    if (stats.mod !== 'normal') later(() => UI.feed('Shift: ' + Sv.shift().mod.name, 'gold'), 600);
    later(() => UI.feed('No clock: roll as long as you like. Pause to end the run and collect your screws.', ''), 1500);
  }
  function finish(early) {
    if (state !== 'play') return;
    state = 'results';
    UI.showHud(false); UI.clearBig();
    B.celebrate(true);
    MD.Audio.sleep();
    MD.Music.setMode('menu'); MD.Music.duck(0.4);
    later(() => MD.Audio.song(B.duck.cw.voice || 1, 11), 400);
    const all = balls(), rank = all.slice().sort((a, b) => b.mass - a.mass).indexOf(B) + 1;
    const run = {
      world: Sv.S.world, massKg: B.mass, diameterM: B.diameterM(), items: B.items, golden: B.golden, boss: B.boss,
      milestoneScrews: tierScrews, payMul: stats.payMul, bestItem: B.best && B.best.name, place: rank, players: all.length, kills,
      shiftN, early: early || elapsed < 5,
    };
    const out = Sv.settle(run);
    UI.showResults(run, out);
  }
  function pause() {
    if (state === 'play' || state === 'count') { state = state === 'play' ? 'paused' : 'pausedCount'; $('pause').hidden = false; MD.Music.duck(0.3); }
    else if (state === 'paused' || state === 'pausedCount') resume();
  }
  function resume() { if (state === 'paused' || state === 'pausedCount') { state = state === 'paused' ? 'play' : 'count'; $('pause').hidden = true; last = performance.now(); MD.Music.duck(1); } }
  function endRun() {
    $('pause').hidden = true;
    const early = state === 'pausedCount';
    state = 'play';
    finish(early);
  }

  // ---------- Player events ----------
  const shoutWord = o => o.boss ? 'TOPPLED!' : o.golden ? 'SHINY!' : o.type.quack ? 'QUACK!' : o.type.meow ? 'MRROW!' : o.tier >= 6 ? 'CRASH!' : o.tier >= 4 ? 'TIMBER!' : o.type.dens >= 1.8 ? 'CLANK!' : 'THUNK!';
  let turboFeedT = 0;
  B.onTurbo = () => { if (state === 'play' && performance.now() - turboFeedT > 2500) { turboFeedT = performance.now(); UI.feed('+ Turbo charge', 'gold'); } };
  B.onAbsorb = (o, gain) => {
    if (state !== 'play') return;
    if (o.boss) { finale(); return; }
    if (o.tier >= 2 || gain >= 8) UI.shout(shoutWord(o));
    if (o.golden) UI.feed(`+ ${o.name} · +40 screws`, 'gold');
    else if (o.tier >= 3 || gain >= 10) UI.feed(`+ ${o.name} · +${Math.round(gain)} kg`, o.tier >= 5 ? 'big' : '');
    shake = Math.max(shake, o.tier >= 6 ? 0.5 : o.tier >= 3 ? 0.2 : 0);
  };
  B.onBonk = (loss, speed) => { shake = Math.max(shake, Math.min(0.8, speed * 0.05)); MD.Audio.thump(); if (loss >= 1 && state === 'play') UI.feed(`Bonk! −${Math.round(loss)} kg`, 'bad'); };
  B.onLoss = (loss, att) => { if (att && state === 'play' && loss >= 2) UI.feed(`${att.name} rammed you · −${Math.round(loss)} kg`, 'bad'); };
  B.onSteal = (g, vic) => { if (state === 'play' && g >= 2) UI.feed(`You rammed ${vic.name} · +${Math.round(g)} kg`, ''); };
  B.onBump = (other, speed) => { shake = Math.max(shake, Math.min(0.7, speed * 0.04)); if (speed > 3) MD.Audio.thump(); };
  B.onBurst = (att) => {
    UI.big('BURST!', `${att.name} rolled right over you`, 2.2); MD.Audio.clatter(); shake = 1;
    W.burst({ x: B.x, y: B.r, z: B.z }, 0xffffff, 60, B.r * 3, { rainbow: true, life: 1 });
    for (const a of B.attached) a.mesh.parent && a.mesh.parent.remove(a.mesh);
    B.attached.length = 0;
  };
  B.onKill = (vic) => { kills++; UI.big('POP!', `You burst ${vic.name}`, 1.4); MD.Audio.power(); shake = 0.8; };
  BOTS.onBurst = (bot, att) => { if (att !== B && state === 'play') UI.feed(`${att.name} burst ${bot.name}`, ''); };
  BOTS.onLeave = (bot, nb) => { if (state === 'play') UI.feed(`${bot.name} went home · ${nb.name} rolled in`, ''); };

  // The finale: you rolled up the giant duck. The round ends right away.
  function finale() {
    UI.big('THE GIANT DUCK FALLS!', 'You did it', 2.6); UI.shout('TOPPLED!'); shake = 1.2;
    later(() => finish(), 1800);
  }

  function tiers() {
    const ti = RL.tierOf(B.mass);
    while (tierIdx < ti) {
      tierIdx++;
      const s = TIER_SCREWS[tierIdx] || 0;
      tierScrews += s;
      UI.big(RL.TIERS[tierIdx].name.toUpperCase(), RL.TIERS[tierIdx].line, 2);
      if (s) UI.feed(`New tier · +${s} screws`, 'gold');
      MD.Audio.power();
      W.burst({ x: B.x, y: B.r * 2, z: B.z }, 0xffffff, 40, B.r * 2.5, { rainbow: true, life: 1 });
      // The last stretch (towers and the giant duck): the music picks up.
      if (tierIdx >= RL.TIERS.length - 2) MD.Music.setIntensity(1);
    }
  }

  function bossCompass() {
    const o = W.boss;
    if (!o || !o.alive || B.mass < 150) return null;
    const dx = o.x - B.x, dz = o.z - B.z, d = Math.hypot(dx, dz);
    const rel = Math.atan2(dx, dz) - B.heading;
    const text = RL.canBreak(B.mass, o.gate, 1) ? `${o.name} · ${Math.round(d)} m — topple it!` : `${o.name} · ${UI.fmtMass(o.gate)} to topple`;
    return { angle: -rel, text };
  }

  // ---------- A surprise every few minutes ----------
  function spawnAhead(role, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = PI / 2 - B.heading + (Math.random() - 0.5) * 1.6, d = 8 + B.r * 3 + Math.random() * 14;
      const x = B.x + Math.cos(a) * d, z = B.z + Math.sin(a) * d;
      if (Math.hypot(x, z) < RL.MAP_R - 3) W.addDynamic(role, x, z, Object.assign({ grow: true }, opts));
    }
  }
  const EVENTS = [
    { key: 'magnet', title: 'MAGNET STORM!', sub: 'Break things 15% heavier for 12 s', go: () => { magnetT = 12; B.gateMul *= 0.85; } },
    { key: 'gold', title: 'GOLDEN RAIN!', sub: 'Shiny things just landed ahead', go: () => spawnAhead('small', 10, { golden: true }) },
    { key: 'parade', title: 'DUCK PARADE!', sub: 'A herd of microducks wanders in', go: () => spawnAhead('walker', 12, { mobile: 'roam' }) },
  ];
  function runEvents(dt) {
    if (elapsed >= eventAt) {
      eventAt = elapsed + 150 + Math.random() * 60;
      const e = EVENTS[Math.floor(Math.random() * EVENTS.length)];
      e.go(); UI.big(e.title, e.sub, 1.8); MD.Audio.power();
    }
    if (magnetT > 0) { magnetT -= dt; if (magnetT <= 0) { B.gateMul /= 0.85; UI.feed('The magnet storm passes', ''); } }
  }

  // ---------- Demo duck on the home screen ----------
  const demoIn = { fwd: 0.7, turn: 0, boost: false };
  function demoInput(dt) {
    demoT += dt;
    demoIn.turn = Math.sin(demoT * 0.37) * 0.45 + Math.sin(demoT * 0.11) * 0.3;
    const d = Math.hypot(B.x, B.z);
    if (d > 196) { const want = Math.atan2(-B.x, -B.z); let df = want - B.heading; df = Math.atan2(Math.sin(df), Math.cos(df)); demoIn.turn = -Math.sign(df) * 0.8; }
    demoIn.fwd = demoT % 9 < 6.5 ? 0.7 : 0;
    return demoIn;
  }

  // ---------- Camera: distance (3.6 + 4.2 r) x zoom, aimed a little above and ahead of the duck ----------
  // That distance frames something 2 r tall. The standing duck is ~3.2 r tall, so in play the camera sits PLAY_K
  // further back: the duck then takes about a third of the screen's height and you see what's ahead. The camera follows growth with a lag (cam.r), so each grab visibly makes the duck bigger
  // before the view eases out.
  const PLAY_K = 1.6;
  window.addEventListener('wheel', e => { if (state === 'play' || state === 'count') zoom = Math.max(0.55, Math.min(2.2, zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: true });
  function updateCamera(dt) {
    cam.r = cam.init && cam.r ? cam.r + (B.r - cam.r) * Math.min(1, dt * (B.r > cam.r ? 1.4 : 4)) : B.r;
    const R = cam.r, D = B.camDist(R);
    const homeView = state === 'home', play = !homeView && state !== 'results';
    cam.yaw += (Math.atan2(Math.sin(B.heading - cam.yaw), Math.cos(B.heading - cam.yaw))) * Math.min(1, dt * (homeView ? 1.5 : 5));
    const yaw = cam.yaw + (homeView ? 0.5 : 0) + (state === 'results' ? PI * 0.85 : 0);
    const pitch = homeView ? 0.32 : state === 'results' ? 0.25 : 0.4;
    const asp = W.camera.aspect, tall = asp < 1 ? Math.min(1.35, Math.pow(1 / asp, 0.6)) : 1;
    const dist = D * (homeView ? 1.05 : state === 'results' ? 0.8 : zoom * PLAY_K) * tall;
    camDist = dist;
    const tx = B.x - Math.sin(yaw) * Math.cos(pitch) * dist, tz = B.z - Math.cos(yaw) * Math.cos(pitch) * dist, ty = R + Math.sin(pitch) * dist;
    const k = cam.init ? 1 - Math.exp(-dt * 6) : 1;
    cam.pos.x += (tx - cam.pos.x) * k; cam.pos.y += (ty - cam.pos.y) * k; cam.pos.z += (tz - cam.pos.z) * k;
    // In play the aim is ahead of the duck, so it sits in the lower middle of the screen.
    const ahead = homeView ? 0 : play ? R * 2.2 : R * 1.2;
    let lx = B.x + Math.sin(yaw) * ahead, lz = B.z + Math.cos(yaw) * ahead;
    if (homeView && window.innerWidth > 1100) { lx += Math.cos(yaw) * D * 0.42; lz -= Math.sin(yaw) * D * 0.42; }
    const lk = cam.init ? 1 - Math.exp(-dt * 8) : 1;
    cam.look.x += (lx - cam.look.x) * lk; cam.look.y += (R * 1.55 - cam.look.y) * lk; cam.look.z += (lz - cam.look.z) * lk;
    cam.init = true;
    const C = W.camera;
    C.position.copy(cam.pos);
    if (shake > 0) { shake = Math.max(0, Math.min(1.6, shake) - dt * 2.5); const a = shake * (0.3 + B.r * 0.25); C.position.x += (Math.random() - 0.5) * a; C.position.y += (Math.random() - 0.5) * a; }
    C.lookAt(cam.look);
    const sf = Math.min(1, B.speedFrac || 0), fov = 55 + 14 * sf * sf * (3 - 2 * sf) + (B.boosting ? 4 : 0);
    if (Math.abs(C.fov - fov) > 0.05) { C.fov += (fov - C.fov) * Math.min(1, dt * 6); C.updateProjectionMatrix(); }
    // A tight depth range: the near plane moves out with the camera and the far plane stops just past the fog.
    // That keeps the depth buffer precise (no z-fighting on far-off props) and culls everything hidden in fog.
    const near = Math.min(2, Math.max(0.12, dist * 0.04)), far = W.fogFar(dist) * 1.3 + 20;
    if (Math.abs(C.near - near) / near > 0.08 || Math.abs(C.far - far) / far > 0.05) { C.near = near; C.far = far; C.updateProjectionMatrix(); }
    W.occlude(C.position.x, C.position.y, C.position.z, B.x, B.r, B.z, B.r);
    W.particleSize(Math.max(0.12, B.r * 0.14));
  }

  // ---------- Frame loop ----------
  function frame(now) {
    requestAnimationFrame(frame);
    W.adapt((now - last) / 1000);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (DBG.manual) return;
    step(dt);
  }
  function step(dt) {
    if (state === 'paused' || state === 'pausedCount') { UI.poll(); W.render(); return; }
    const input = DBG.input ? DBG.input(B, W) : UI.poll();
    const live = state === 'play' || state === 'home';
    if (state === 'home') {
      B.update(dt, demoInput(dt), true);
      homeTick -= dt; if (homeTick <= 0) { homeTick = 0.5; UI.tickHome(); }
    } else if (state === 'count') {
      const before = countT; countT -= dt;
      if (before > 1.6 && countT <= 1.6) { UI.big('2', null, 0.7); MD.Audio.beep(660, 0.1); }
      if (before > 0.8 && countT <= 0.8) { UI.big('1', null, 0.7); MD.Audio.beep(660, 0.1); }
      if (countT <= 0) { state = 'play'; UI.big('ROLL!', null, 0.8); MD.Audio.boot(); MD.Audio.quack(B.duck.cw.voice || 1, 0.2); }
      B.update(dt, input, false);
    } else if (state === 'play') {
      elapsed += dt;
      if (!B.alive) {
        B.dead -= dt;
        if (B.dead <= 0) { RO.respawnAt(B, W.spawns[Math.floor(Math.random() * W.spawns.length)]); cam.init = false; UI.feed(`Back in with ${UI.fmtMass(B.mass)} · shielded for 3 s`, 'gold'); }
      }
      B.update(dt, input, true);
      tiers();
      runEvents(dt);
      if (luckT > 0) { luckT -= dt; if (luckT <= 0) { B.growMul = 1; UI.feed("Beginner's luck is over. You're on your own, duck.", ''); } }
      boardT -= dt;
      if (boardT <= 0) { boardT = 0.25; place = UI.updateBoard(balls(), B); }
      UI.earn = Sv.estimate(B.mass, place, tierScrews, B.golden, stats.payMul);
      UI.updateHud(B, bossCompass());
    } else {
      B.update(dt, { fwd: 0, turn: 0 }, false);
    }
    BOTS.update(dt, balls(), live);
    if (live) RO.collide(balls(), dt);
    W.update(dt, balls(), { x: B.x, z: B.z, r: B.r }, camDist);
    updateCamera(dt);
    if (!DBG.noRender) W.render();
  }

  // ---------- Test hook: step the game by hand (used by tools/ and for screenshots in background tabs) ----------
  const DBG = { manual: false, input: null };
  MD.Debug = Object.defineProperties(DBG, { state: { get: () => state }, elapsed: { get: () => elapsed } });
  Object.assign(DBG, { step(dt, n) { for (let i = 0; i < (n || 1); i++) step(dt || 1 / 30); }, play, finish: () => finish(), home: goHome, balls });

  // ---------- Start ----------
  function start() {
    W.init($('stage'));
    W.setQuality(Sv.S.settings);
    B.init();
    B.dress(Sv.S.equip);
    UI.init({
      play, resume, endRun, home: goHome,
      again: () => { $('results').hidden = true; play(); },
      world: k => { if (Sv.S.world === k) return; Sv.S.world = k; Sv.persist(); loadWorld(k, null, 6); UI.renderHome(); },
    });
    UI.onChange = () => { UI.renderHome(); B.dress(Sv.S.equip); };
    UI.onDress = () => B.dress(Sv.S.equip);
    UI.onPause = pause;
    UI.onReset = () => { W.setQuality(Sv.S.settings); B.dress(Sv.S.equip); if (state === 'home') goHome(); };
    Sv.onExternal = () => { B.dress(Sv.S.equip); if (state === 'home') UI.renderHome(); };
    UI.onConfirm = e => {
      if (!$('modal').hidden || e.repeat) return;
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== 'play' && a.id !== 'again') return;
      if (state === 'home') { e.preventDefault(); play(); }
      else if (state === 'results') { e.preventDefault(); $('results').hidden = true; play(); }
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden && !DBG.manual && (state === 'play' || state === 'count')) pause(); });
    goHome();
    requestAnimationFrame(t => { last = t; frame(t); });
  }
  start();
})();
