// Rival duck balls. They roll the same world with the same rules as the player (roller.js): break what
// they outweigh, chase smaller balls, run from bigger ones, burst and come back with 40% of their mass.
window.MD = window.MD || {};
MD.Bots = (function () {
  const RL = MD.Rules, RO = MD.Roller, W = MD.World, P = MD.Props;
  const NAMES = ['Graphite #4812', 'Lavender', 'Sky the Skater', 'Overfit Cream', 'Intern duck', 'Sim duck v0.3', 'Episode 0', 'Quackers', 'Servo Sam', 'Mint Condition', 'Bit Flipper', 'Ducktor Who', 'Waddles', 'Rubber Ron', 'Captain Beak', 'Pato', 'Kachka', 'Ente', 'Canard', 'Ankka'];
  const CW = ['graphite', 'lavender', 'sky', 'cream', 'mint', 'sunset'];
  const X = { list: [] };
  let nextId = 0, botLevel = 0;
  const geoCache = {};

  // Each rival is a microduck robot like the player: on roller skates with what it breaks stuck onto it,
  // curled up and tumbling when it goes fast. Two low-poly meshes per colourway: standing on skates, and curled.
  function duckGeo(cwKey, curled) {
    const k = (curled ? 'curl:' : 'duck:') + cwKey;
    if (geoCache[k]) return geoCache[k];
    const cw = MD.COLORWAYS[cwKey], b = P.B();
    if (curled) { P.curledDuck(b, cw.shell, cw.eye, cw.beak, cw.foot, cw.sole); return (geoCache[k] = b.geo(true)); }
    P.miniDuck(b, cw.shell, cw.eye, cw.beak, cw.foot, 1, cw.sole, true);
    return (geoCache[k] = b.geo());
  }
  const ROLL_ON = 0.45, ROLL_OFF = 0.22, HOP = 0.42, UPV = new THREE.Vector3(0, 1, 0), QT = new THREE.Quaternion(), QU = new THREE.Quaternion(), AX = new THREE.Vector3();
  // Sizes in radii, as for the player: standing about 3 radii tall, curled about a radius across each way.
  // CURL_C / CURL_A: middle and half-size of the curled mesh (measured).
  const DS_STAND = 1.1, DS_CURL = 1.3, CURL_C = new THREE.Vector3(0, 0, 0.22), CURL_A = new THREE.Vector3(0.53, 0.6, 0.7), UB = new THREE.Vector3(), QI = new THREE.Quaternion();

  function make(i, rival, level) {
    const cwKey = CW[i % CW.length];
    const bot = { id: 'bot' + (nextId++), slot: i, bot: true, name: NAMES[(i + Math.floor(Math.random() * NAMES.length)) % NAMES.length], cwKey, rival, attached: [], lockout: {} };
    const grit = Math.random();
    const startMass = rival ? Math.round([0, 40, 60, 75][rival] * (0.6 + 0.8 * grit)) : Math.round(12 + Math.random() * 30);
    // Bots play like an average player, not a perfect one: they get less out of what they break.
    // Rivals are better, and get +5/8/10% on top as the level rises.
    bot.growMul = rival ? (0.55 + 0.07 * level) * (1 + [0, 0.05, 0.08, 0.1][rival] * (0.5 + 0.5 * grit)) : 0.32 + Math.random() * 0.12;
    bot.speedMul = rival ? 1 + [0, 0, 0.02, 0.04][rival] * (0.5 + 0.5 * grit) : 0.9 + Math.random() * 0.08;
    bot.turboMul = MD.Save.shift().mod.key === 'overtime' ? 1.5 : 1; // the Overtime shift is for everyone
    bot.sloppy = rival ? 0.15 : 0.45; // chance to settle for a so-so target instead of the best one
    // Ordinary bots mostly roll for props; only rivals hunt, more so at higher levels.
    bot.aggro = rival ? [0.15, 0.35, 0.55, 0.7][Math.min(3, level)] : 0.04 + Math.random() * 0.08;
    // group (scaled by the radius): the whole rival; duck: its mesh, with what it breaks stuck onto it.
    bot.group = new THREE.Group();
    bot.duck = new THREE.Mesh(duckGeo(cwKey), P.material('base'));
    bot.duck.castShadow = true; bot.group.add(bot.duck);
    bot.step = Math.random() * 6; bot.curl = 0; bot.rolling = false; bot.skating = true; bot.hopT = 0;
    bot.q = new THREE.Quaternion();
    W.scene.add(bot.group);
    const sp = spawnPoint();
    RO.init(bot, startMass, sp.x, sp.z, sp.heading);
    bot.ai = { t: 0, tx: sp.x, tz: sp.z, mode: 'eat', stuck: 0, escape: 0 };
    // Each bot goes home after 2–9 minutes and someone new rolls in, so with no clock the rivals don't just
    // keep growing.
    bot.stayT = 120 + Math.random() * 420;
    bot.onBreak = (o, gain) => attachTo(bot, o);
    bot.onChunk = g => { bot.mass += g * bot.growMul; };
    bot.onBurst = (att, taken) => { clearPile(bot); X.onBurst && X.onBurst(bot, att, taken); };
    bot.onKill = (vic, taken) => { X.onKill && X.onKill(bot, vic, taken); };
    return bot;
  }
  function spawnPoint() {
    const sp = W.spawns[Math.floor(Math.random() * W.spawns.length)];
    // Spread out around the gate a little, or anywhere in the outer rings.
    if (Math.random() < 0.5) return { x: sp.x + (Math.random() - 0.5) * 16, z: sp.z + (Math.random() - 0.5) * 16, heading: sp.heading };
    const a = Math.random() * Math.PI * 2, r = 95 + Math.random() * 100;
    return { x: Math.sin(a) * r, z: -Math.cos(a) * r, heading: Math.random() * Math.PI * 2 };
  }
  function clearPile(bot) { bot.attached.forEach(a => bot.duck.remove(a.mesh)); bot.attached.length = 0; }
  // Stick a copy of the broken thing onto the rival: a ray from the side it came from finds the surface of both
  // meshes (standing and curled), so it stays on the same side whichever one is showing.
  const rc = new THREE.Raycaster(), probe = {}, TV = new THREE.Vector3(), TD = new THREE.Vector3(), TN = new THREE.Vector3();
  function surface(geo, centre, dir) {
    const m = probe[geo.uuid] || (probe[geo.uuid] = new THREE.Mesh(geo));
    rc.set(TV.copy(centre).addScaledVector(dir, 4), TD.copy(dir).negate()); rc.far = 8;
    const hit = rc.intersectObject(m, false)[0];
    if (!hit) return null;
    TN.copy(hit.face.normal); if (TN.dot(TD) > 0) TN.negate();
    return { p: hit.point.clone(), n: TN.clone() };
  }
  function attachTo(bot, o) {
    const size = o.size || o.foot, h = o.h || size;
    if (size < bot.r * 0.2) return;
    bot.group.updateMatrixWorld(true);
    // Which way it came from, in the duck mesh's frame; aim mostly at the back, top and sides, not the face.
    const dir = bot.duck.worldToLocal(new THREE.Vector3(o.x, Math.min(h * 0.4, bot.r), o.z)).normalize();
    dir.x += (Math.random() - 0.5) * 1.6; dir.y += Math.random() * 1.2; dir.z += (Math.random() - 0.5) * 1.6;
    dir.normalize(); if (dir.z > 0.35) dir.z = -dir.z;
    const head = Math.random() < 0.55;
    const sStand = surface(duckGeo(bot.cwKey, false), new THREE.Vector3(0, head ? 2.45 : 1.47, head ? 0 : -0.18), dir);
    const sCurl = surface(duckGeo(bot.cwKey, true), CURL_C, dir);
    if (!sStand || !sCurl) return;
    const spin = Math.random() * Math.PI * 2;
    const mesh = new THREE.Mesh(o.type.geo, o.type.glow ? P.material('glow') : P.material('base'));
    mesh.castShadow = size > bot.r * 0.3;
    bot.duck.add(mesh);
    const at = (sf) => { const st = P.stick(mesh, o.scale, sf.n, spin); return { p: sf.p, off: st.off, q: st.q }; };
    bot.attached.push({ mesh, s0: o.scale, size, stand: at(sStand), curl: at(sCurl) });
    if (bot.attached.length > 10) bot.duck.remove(bot.attached.shift().mesh);
  }

  X.spawnAll = function (count, level) {
    X.clear();
    botLevel = level || 0;
    for (let i = 0; i < count; i++) X.list.push(make(i, i < 3 ? i + 1 : 0, level || 0));
  };
  // This rival leaves and a new one takes its slot (same kind of rival, new name and start).
  X.replace = function (bot) {
    const i = X.list.indexOf(bot);
    if (i < 0) return null;
    clearPile(bot); W.scene.remove(bot.group);
    const nb = make(Math.floor(Math.random() * 1000), bot.rival, botLevel);
    nb.slot = bot.slot;
    X.list[i] = nb;
    return nb;
  };
  X.clear = function () { X.list.forEach(b => { clearPile(b); W.scene.remove(b.group); }); X.list.length = 0; };

  // ---------- Brain ----------
  function think(bot, balls, dt) {
    const ai = bot.ai;
    ai.t -= dt;
    if (ai.escape > 0) { ai.escape -= dt; return { fwd: ai.escape > 0.5 ? -1 : 1, turn: ai.escapeTurn, boost: false }; }
    if (ai.t <= 0) {
      ai.t = 0.35 + Math.random() * 0.3;
      ai.mode = 'eat'; ai.boost = false;
      let threat = null, prey = null, td = 1e9, pd = 1e9;
      for (const o of balls) {
        if (o === bot || !o.alive) continue;
        const d = Math.hypot(o.x - bot.x, o.z - bot.z);
        if (o.mass > bot.mass * 1.4 && d < 10 + o.r * 2 && d < td) { threat = o; td = d; }
        if (o.mass * 1.6 < bot.mass && o.mass > bot.mass * 0.12 && d < 18 && d < pd && o.shield <= 0) { prey = o; pd = d; }
      }
      if (threat) { ai.mode = 'flee'; ai.tx = bot.x - (threat.x - bot.x); ai.tz = bot.z - (threat.z - bot.z); ai.boost = td < 7; }
      else if (prey && Math.random() < bot.aggro) { ai.mode = 'chase'; ai.tx = prey.x + prey.vx * 0.4; ai.tz = prey.z + prey.vz * 0.4; ai.boost = pd < 14 && bot.turbo > 0.4; }
      else {
        // The best meal nearby: what gives the most for the distance.
        let best = null, bs = 0, alt = null;
        W.query(bot.x, bot.z, 26, o => {
          if (o.boss || !RL.canBreak(bot.mass, o.gate, 1)) return;
          const d = Math.hypot(o.x - bot.x, o.z - bot.z);
          if (d > 26) return;
          const s = RL.gain(o, bot.mass) / (d + 3);
          if (s > bs) { alt = best; bs = s; best = o; }
        });
        if (best && alt && Math.random() < bot.sloppy) best = alt;
        if (best) { ai.tx = best.x; ai.tz = best.z; }
        else if (Math.hypot(ai.tx - bot.x, ai.tz - bot.z) < 4) { const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 130; ai.tx = Math.sin(a) * r; ai.tz = -Math.cos(a) * r; }
      }
    }
    return steer(bot, ai, dt);
  }
  function steer(bot, ai, dt) {
    if (Math.hypot(ai.tx, ai.tz) > RL.MAP_R - 6) { const k = (RL.MAP_R - 8) / Math.hypot(ai.tx, ai.tz); ai.tx *= k; ai.tz *= k; }
    const want = Math.atan2(ai.tx - bot.x, ai.tz - bot.z);
    const a = Math.atan2(Math.sin(want - bot.heading), Math.cos(want - bot.heading));
    // Stuck against something it can't break: back off and turn.
    ai.stuck = (bot.speed || 0) < 1.2 ? ai.stuck + dt : 0;
    if (ai.stuck > 0.9) { ai.stuck = 0; ai.escape = 1; ai.escapeTurn = Math.random() < 0.5 ? 1 : -1; ai.t = 0; }
    return { fwd: Math.abs(a) > 1.3 ? 0.3 : 1, turn: Math.max(-1, Math.min(1, -a * 2)), boost: ai.boost };
  }

  X.update = function (dt, balls, live) {
    for (const bot of X.list) {
      if (!bot.alive) {
        bot.dead -= dt; bot.group.visible = false;
        if (bot.dead <= 0) { RO.respawnAt(bot, spawnPoint()); bot.group.visible = true; }
        continue;
      }
      // Nearly as heavy as the giant duck: it heads home soon, so the giant duck stays the biggest thing around.
      if (bot.mass > RL.BOSS_GATE * 0.8) bot.stayT = Math.min(bot.stayT, 15);
      if (live && (bot.stayT -= dt) <= 0) {
        // Leave when nobody is watching: far from the player (balls[0]) or after a minute more.
        const you = balls[0], far = !you || Math.hypot(you.x - bot.x, you.z - bot.z) > 30 + you.r * 6;
        if (far || bot.stayT < -60) { const nb = X.replace(bot); if (nb) X.onLeave && X.onLeave(bot, nb); continue; }
      }
      const input = live ? think(bot, balls, dt) : { fwd: 0, turn: 0 };
      RO.step(bot, input, dt, live);
      if (live) RO.contact(bot);
      bot.r = RL.radius(bot.mass);
      // Skate or tumble, the same way as the player.
      const sp = bot.speed || 0;
      if (!bot.rolling && (sp > bot.top * ROLL_ON || bot.boosting)) bot.rolling = true;
      else if (bot.rolling && sp < bot.top * ROLL_OFF && !bot.boosting) { bot.rolling = false; bot.hopT = HOP; }
      bot.skating = !bot.rolling;
      bot.curl += ((bot.rolling ? 1 : 0) - bot.curl) * Math.min(1, dt * (bot.rolling ? 10 : 7));
      const curled = bot.curl > 0.5;
      if (curled) { if (sp > 1e-3) { AX.set(bot.vz, 0, -bot.vx).normalize(); bot.q.premultiply(QT.setFromAxisAngle(AX, sp * dt / bot.r)); } }
      else { QU.setFromAxisAngle(UPV, bot.heading); bot.q.slerp(QU, 1 - Math.exp(-dt * 14)); }
      bot.hopT = Math.max(0, bot.hopT - dt);
      const hop = bot.hopT > 0 ? Math.sin(Math.PI * (1 - bot.hopT / HOP)) * 0.4 : 0;
      // Curled, it rides on the lowest side of its lumpy ball; skating, on its wheels.
      UB.copy(UPV).applyQuaternion(QI.copy(bot.q).invert());
      const low = Math.hypot(CURL_A.x * UB.x, CURL_A.y * UB.y, CURL_A.z * UB.z) * DS_CURL;
      bot.group.position.set(bot.x, bot.r * (curled ? low : hop), bot.z);
      bot.group.quaternion.copy(bot.q);
      bot.group.scale.setScalar(bot.r);
      const flash = bot.shield > 0 && Math.floor(W.time * 8) % 2;
      bot.duck.material = flash ? P.material('gold') : P.material('base');
      const g = duckGeo(bot.cwKey, curled);
      if (bot.duck.geometry !== g) bot.duck.geometry = g;
      if (curled) { bot.duck.position.copy(CURL_C).multiplyScalar(-DS_CURL); bot.duck.scale.setScalar(DS_CURL); bot.duck.rotation.set(0, 0, 0); }
      else {
        // Skating: a push-and-glide sway with each stride, leaning a little forward.
        bot.step += Math.min(4, sp / bot.r) * 3 * dt;
        const push = Math.min(1, sp / (bot.r * 2));
        bot.duck.position.set(0, 0, 0); bot.duck.scale.setScalar(DS_STAND);
        bot.duck.rotation.set(0.1 * push, Math.sin(bot.step) * 0.12 * push, Math.sin(bot.step) * 0.08 * push);
      }
      // Stuck things keep their real size on whichever mesh is showing (up to a fifth of the duck's height).
      const ps = bot.r * bot.duck.scale.x;
      for (const a of bot.attached) {
        const sp2 = curled ? a.curl : a.stand, f = Math.min(1, bot.r * 0.3 / a.size);
        a.mesh.scale.setScalar(a.s0 * f / ps);
        a.mesh.position.copy(sp2.off).multiplyScalar(f / ps).add(sp2.p);
        a.mesh.quaternion.copy(sp2.q);
      }
    }
  };
  return X;
})();
