// The player: a microduck robot on roller skates. Everything it breaks sticks straight onto the robot (its
// head, body and legs). Fast enough (forwards or backwards, or in turbo) it curls up and tumbles head over heels,
// stuff and all; when it has almost stopped it pops back up onto its skates with a hop and glides on. Physics and
// the break/bonk rules live in roller.js and rules.js (shared with the bots); this file adds the duck, sticking
// things on, cosmetics and trails.
window.MD = window.MD || {};

// Extra colorways sold in the Parts Bin.
Object.assign(MD.COLORWAYS, {
  mint: { name: 'Mint', shell: 0x9fe0c4, face: 0x23302b, beak: 0xff8a3d, eye: 0xf3eee4, foot: 0xff8a3d, sole: 0x3f8f6f, css: '#9fe0c4', cssEye: '#f3eee4', stats: {}, voice: 1.04 },
  sunset: { name: 'Sunset', shell: 0xff9a5c, face: 0x2b1f2a, beak: 0xf5c518, eye: 0xd94fa0, foot: 0xd94fa0, sole: 0x7a2f6b, css: '#ff9a5c', cssEye: '#d94fa0', stats: {}, voice: 0.96 },
  gold: { name: 'Solid gold', shell: 0xf2b705, face: 0x2a2310, beak: 0xfff1b0, eye: 0xffffff, foot: 0xfff1b0, sole: 0xb88a00, css: '#f2b705', cssEye: '#ffffff', stats: {}, voice: 0.9 },
});

MD.Ball = (function () {
  const PI = Math.PI, W = MD.World, P = MD.Props;
  const B = { x: 0, z: 0, r: 0.8, vx: 0, vz: 0, heading: 0, attached: [], mass: 12, items: 0, golden: 0, boss: false, lockout: {} };
  const q = new THREE.Quaternion(), qi = new THREE.Quaternion(), tq = new THREE.Quaternion(), qUp = new THREE.Quaternion(), QY = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), axis = new THREE.Vector3();
  let group, finishes = {}, duck, fake, stats, trailAcc = 0, stickTo, noStick, ray;
  const ROLL_ON = 0.45, ROLL_OFF = 0.22, HOP = 0.42; // tumble above 45% of top speed, skate again below 22%
  // Duck size in ball radii: standing it is about 3 radii tall; curled up it is a lumpy ball about a radius
  // across each way. CURL_C / CURL_A: middle and half-size of the curled duck in duck units (measured).
  const DS_STAND = 1.1, DS_CURL = 1.35;
  // Biggest drawn size of a stuck thing (bounding radius, in radii) and how many stay drawn. Kept small so the
  // stuff reads as bits stuck on a duck, not as armour plates that turn it into some other robot.
  const STUCK_MAX = 0.3, STUCK_DRAWN = 50;
  const CURL_C = new THREE.Vector3(0, 0.47, 0.52), CURL_A = new THREE.Vector3(0.44, 0.57, 0.69);

  // ---------- Shell finishes (the 'shell' cosmetic slot) ----------
  // Painted onto the duck's shell parts, mapped from three sides so it doesn't matter how the parts are UV'd.
  function canvasTex(draw, w, h) {
    const c = document.createElement('canvas'); c.width = w || 256; c.height = h || 256;
    draw(c.getContext('2d'), c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function finish(key) {
    if (finishes[key]) return finishes[key];
    let f;
    if (key === 'bubble') f = { map: canvasTex((g, w, h) => { g.fillStyle = '#dfeff7'; g.fillRect(0, 0, w, h); for (let y = 8; y < h; y += 16) for (let x = (y / 16 % 2) * 8 + 8; x < w; x += 16) { g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,160,190,.5)'; g.stroke(); } }), rough: 0.25, metal: 0 };
    else if (key === 'lab') f = { map: canvasTex((g, w, h) => { g.fillStyle = '#2a4f7a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8cc4ea'; g.lineWidth = 2; for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }), rough: 0.5, metal: 0 };
    else if (key === 'disco') f = { map: canvasTex((g, w, h) => { for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { const l = 55 + Math.random() * 40; g.fillStyle = `hsl(${Math.random() * 360},60%,${l}%)`; g.fillRect(x, y, 15, 15); } }), rough: 0.15, metal: 0.6 };
    else if (key === 'lava') f = { map: canvasTex((g, w, h) => { g.fillStyle = '#3a0d05'; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.fillStyle = `hsl(${15 + Math.random() * 30},100%,${45 + Math.random() * 20}%)`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 12, 0, 7); g.fill(); } }), rough: 0.7, metal: 0, glow: 0.9 };
    else if (key === 'galaxy') f = { map: canvasTex((g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1b0f3a'); gr.addColorStop(0.5, '#3a1b6a'); gr.addColorStop(1, '#0c1a3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } }), rough: 0.3, metal: 0, glow: 0.6 };
    return (finishes[key] = f || null);
  }
  // Triplanar map (and emissive map) for the shell material, in each part's own coordinates.
  function triplanar(m) {
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vTpP;\nvarying vec3 vTpN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTpP = position * 2.4; vTpN = normal;');
      sh.fragmentShader = 'varying vec3 vTpP;\nvarying vec3 vTpN;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec3 tpw = pow(abs(normalize(vTpN)), vec3(4.0)); tpw /= tpw.x + tpw.y + tpw.z;
          vec4 tpc = mapTexelToLinear(texture2D(map, vTpP.zy)) * tpw.x + mapTexelToLinear(texture2D(map, vTpP.xz + 0.37)) * tpw.y + mapTexelToLinear(texture2D(map, vTpP.xy + 0.71)) * tpw.z;
          diffuseColor *= tpc;
        #endif`)
        .replace('#include <emissivemap_fragment>', `#if defined(USE_EMISSIVEMAP) && defined(USE_MAP)
          totalEmissiveRadiance *= tpc.rgb;
        #endif`);
    };
    m.customProgramCacheKey = () => 'duck-shell-tp';
  }
  function applyFinish(key) {
    const m = duck.mats.shell, f = key && key !== 'tape' ? finish(key) : null;
    m.map = f ? f.map : null;
    m.emissiveMap = f && f.glow ? f.map : null;
    if (f && f.glow) m.emissive.setRGB(1, 1, 1); else m.emissive.setRGB(0, 0, 0);
    m.emissiveIntensity = f && f.glow ? f.glow : 1;
    m.roughness = f ? f.rough : 0.48; m.metalness = f ? f.metal : 0;
    m.needsUpdate = true;
  }

  // ---------- Setup ----------
  B.init = function () {
    // group: the whole player, upright while skating and turning over while tumbling. The duck (and all that
    // sticks to it) is inside it.
    group = new THREE.Group(); W.scene.add(group);
    duck = MD.buildDuck('cream'); group.add(duck.root);
    duck.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    triplanar(duck.mats.shell);
    // Things stick to the head, neck, body and legs (and ride along as they move), never over the face or
    // on the skates.
    stickTo = new Set([duck.head, duck.headPivot, duck.neck2, duck.neck1, duck.pelvis]);
    for (const L of duck.legs) { stickTo.add(L.hip); stickTo.add(L.knee); }
    noStick = new Set([duck.mats.face, duck.mats.eye, duck.mats.iris, duck.mats.gap, duck.mats.led, duck.lens.material]);
    for (const L of duck.legs) noStick.add(L.ankle);
    ray = new THREE.Raycaster();
    fake = { id: 0, state: 'idle', stateT: 0, actionDur: 0, vx: 0, vz: 0, x: 0, y: 0, z: 0, onGround: true, skatesT: 0, stunT: 0, blindT: 0, pumpT: 0, flashT: 0, fallDir: { x: 0, z: 0 }, singing: false };
    MD.initAnim(fake);
    B.group = group; B.duck = duck;
  };

  B.dress = function (equip) {
    MD.setDuckColorway(duck, MD.COLORWAYS[equip.cw] ? equip.cw : 'cream');
    // Rebuild the hat only when it changed, and free the old one's GPU memory.
    const hat = equip.hat === 'none' ? null : equip.hat;
    if (hat !== B.hatKey) {
      if (duck.hat) duck.hat.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      MD.putHat(duck, hat);
      B.hatKey = hat;
      if (duck.hat) duck.hat.traverse(o => { if (o.isMesh) o.castShadow = true; });
    }
    applyFinish(equip.shell || 'tape');
    B.trail = equip.trail;
  };

  B.reset = function (s, x, z, heading, mass) {
    stats = s;
    for (const a of B.attached) a.mesh.parent && a.mesh.parent.remove(a.mesh);
    B.attached.length = 0;
    B.id = 'you'; B.name = MD.Save.S.name || 'You';
    B.speedMul = s.speed || 1; B.gateMul = s.gateMul || 1; B.growMul = 1; B.turboMul = s.turbo || 1; B.refillMul = s.refill || 1;
    MD.Roller.init(B, mass || MD.Rules.START, x || 0, z || 0, heading || 0);
    B.items = 0; B.golden = 0; B.boss = false; B.best = null; B.peak = B.mass;
    q.setFromAxisAngle(UP, B.heading); trailAcc = 0; lastHeading = B.heading; lean = 0;
    B.rolling = false; B.skating = true; B.curl = 0; B.hopT = 0;
    sync(0);
  };

  B.duckScale = () => B.r * (DS_STAND + (DS_CURL - DS_STAND) * ease(B.curl || 0));
  const ease = c => c * c * (3 - 2 * c);
  B.camDist = r => 3.6 + 4.2 * (r || B.r);
  B.diameterM = () => B.r * 2 / 10;
  B.dashReady = () => B.turbo > 0.15;

  // ---------- Per frame ----------
  B.update = function (dt, input, live) {
    if (!B.alive) { sync(dt); return; }
    MD.Roller.step(B, input, dt, live);
    if (B.justBoosted) {
      const dx = Math.sin(B.heading), dz = Math.cos(B.heading);
      MD.Audio.noise(0.4, 0.3, 500, 0.6, 0, 'lowpass'); MD.Audio.quack(duck.cw.voice * 1.1, 0.14);
      W.burst({ x: B.x - dx * B.r, y: 0.1, z: B.z - dz * B.r }, 0xe9dcc4, 14, B.r * 3, { life: 0.5 });
    }
    if (B.boosting && Math.random() < dt * 20) W.burst({ x: B.x - Math.sin(B.heading) * B.r, y: B.r * 0.2, z: B.z - Math.cos(B.heading) * B.r }, 0xfff3a0, 2, B.r, { life: 0.4 });
    if (live) MD.Roller.contact(B);
    B.r = MD.Rules.radius(B.mass);
    B.peak = Math.max(B.peak, B.mass);
    // Skate or tumble, with a gap between the two speeds so it doesn't flicker between them.
    const sp = B.speed || 0;
    if (!B.rolling && (sp > B.top * ROLL_ON || B.boosting)) {
      B.rolling = true; MD.Audio.servo(); MD.Audio.noise(0.3, 0.22, 700, 0.7, 0, 'bandpass');
    } else if (B.rolling && sp < B.top * ROLL_OFF && !B.boosting) {
      B.rolling = false; B.hopT = HOP; MD.Audio.servo(); MD.Audio.clack();
      if (Math.random() < 0.5) MD.Audio.quack(duck.cw.voice || 1, 0.1);
    }
    B.skating = !B.rolling;
    B.curl += ((B.rolling ? 1 : 0) - B.curl) * Math.min(1, dt * (B.rolling ? 10 : 7));
    if (B.curl > 0.4) {
      // Tumbling: turn over with the ground speed, forwards or backwards.
      if (sp > 1e-4) { axis.set(B.vz, 0, -B.vx).normalize(); tq.setFromAxisAngle(axis, sp * dt / B.r); q.premultiply(tq); }
    } else {
      // Skating: swing back upright (that is the flip back onto the skates) and face where it's heading.
      qUp.setFromAxisAngle(UP, B.heading);
      q.slerp(qUp, 1 - Math.exp(-dt * 14));
    }
    if (B.trail && B.trail !== 'none' && sp > 0.3) {
      trailAcc += sp * dt;
      const step = B.r * 0.35;
      while (trailAcc > step) { trailAcc -= step; emitTrail(); }
    }
    sync(dt);
  };

  function emitTrail() {
    const p = { x: B.x - Math.sin(B.heading) * B.r * 0.2 + (Math.random() - 0.5) * B.r, y: B.r * 0.15, z: B.z - Math.cos(B.heading) * B.r * 0.2 + (Math.random() - 0.5) * B.r };
    const s = B.r;
    switch (B.trail) {
      case 'dust': W.burst(p, 0xd8c7a6, 2, s * 1.2, { life: 0.6, up: 0.6 }); break;
      case 'sparkle': p.y = B.r * (0.4 + Math.random()); W.burst(p, Math.random() < 0.5 ? 0xfff3a0 : 0xffffff, 2, s * 0.8, { life: 0.8, up: 1.2, g: s * 0.5 }); break;
      case 'bubbles': W.burst(p, 0x9fe3ff, 2, s * 0.6, { life: 1.4, up: 1.5, g: -s * 0.4 }); break;
      case 'confetti': p.y = B.r; W.burst(p, 0xffffff, 3, s * 2, { life: 1.0, rainbow: true }); break;
      case 'rainbow': p.y = B.r * (0.3 + Math.random() * 0.8); W.burst(p, 0xffffff, 3, s * 0.7, { life: 1.1, up: 0.8, g: s * 0.2, rainbow: true }); break;
      case 'notes': p.y = B.r * 1.5; W.burst(p, Math.random() < 0.5 ? 0xb7a4dc : 0xf5c518, 1, s * 0.5, { life: 1.2, up: 2, g: 0 }); break;
    }
  }

  // ---------- Breaking things and sticking them on ----------
  B.onBreak = function (o, gain) {
    B.items++;
    if (o.golden) B.golden++;
    if (o.boss) B.boss = true;
    if (o.type.key === 'battery') { B.turbo = Math.min(1, B.turbo + 0.35); B.onTurbo && B.onTurbo(); }
    if (!B.best || o.gate > B.best.gate || (o.gate === B.best.gate && gain > B.best.gain)) B.best = { name: o.name, gate: o.gate, gain };
    attach(o);
    const rel = Math.min(1, o.gate / Math.max(1, B.mass));
    const wp = new THREE.Vector3(o.x, Math.min(o.h * 0.5, B.r), o.z);
    W.burst(wp, o.golden ? 0xf2b705 : 0xffffff, o.golden ? 24 : 5 + Math.floor(rel * 12), B.r * 1.5, { life: 0.5 });
    B.pulse = Math.max(B.pulse || 0, 0.3 + rel * 0.7);
    if (o.boss) { MD.Audio.power(); MD.Audio.wilhelm(0.8); W.burst(wp, 0xffffff, 120, B.r * 3, { rainbow: true, life: 1.4 }); }
    else if (o.golden) MD.Audio.coin();
    else if (o.type.quack && Math.random() < 0.6) MD.Audio.quack(1.5 - rel * 0.5 + Math.random() * 0.2, 0.1, 0, 0.25);
    else if (o.type.meow) MD.Audio.meow();
    else MD.Audio.tone(Math.max(220, 1400 - rel * 1100) * (0.9 + Math.random() * 0.2), 0.07, 'triangle', 0.13);
    B.onAbsorb && B.onAbsorb(o, gain);
  };
  B.onChunk = function (g) { B.mass += g * B.growMul; B.r = MD.Rules.radius(B.mass); if (Math.random() < 0.3) MD.Audio.tone(1500 + Math.random() * 300, 0.04, 'triangle', 0.06); };

  // The broken thing (or a copy of it) sticks onto the robot, on the side it came from: a ray from that side
  // finds the surface (head, neck, body or legs), and the thing is glued there flat. It keeps its real size,
  // so as the duck grows the old stuff gets relatively small and is dropped.
  const TARGETS = [['head', 0.45, 0, 0.22, 0.05], ['torso', 0.35, 0, 0, 0], ['hip0', 0.1, 0, -0.15, 0], ['hip1', 0.1, 0, -0.15, 0]];
  const wp = new THREE.Vector3(), wd = new THREE.Vector3(), wn = new THREE.Vector3(), tv = new THREE.Vector3(), MI = new THREE.Matrix4();
  function partOf(k) { return k === 'head' ? duck.head : k === 'torso' ? duck.torso : duck.legs[+k[3]].hip; }
  function findSpot(from) {
    for (let tries = 0; tries < 10; tries++) {
      let u = Math.random(), t = TARGETS[0];
      for (const c of TARGETS) { if ((u -= c[1]) <= 0) { t = c; break; } }
      const part = partOf(t[0]);
      part.localToWorld(wp.set(t[2], t[3], t[4]));
      // From where the thing was, spread out more on every try.
      wd.copy(from).sub(wp); if (wd.lengthSq() < 1e-8) wd.set(0, 1, 0);
      wd.normalize();
      const j = 0.7 + tries * 0.12;
      wd.x += (Math.random() - 0.5) * 2 * j; wd.y += (Math.random() - 0.5) * 2 * j; wd.z += (Math.random() - 0.5) * 2 * j;
      // The body and legs are under the big head: reach them from the side, not from above.
      if (t !== TARGETS[0]) { group.worldToLocal(wd.add(group.position)); wd.y *= 0.25; wd.applyQuaternion(group.quaternion); }
      wd.normalize();
      const reach = duck.root.scale.x * 4;
      ray.set(tv.copy(wp).addScaledVector(wd, reach), wd.clone().negate()); ray.far = reach * 1.5;
      const hit = ray.intersectObject(duck.root, true).find(h => h.object.visible && !h.object.userData.stuck && !(h.object.material && h.object.material.isShaderMaterial));
      if (!hit || noStick.has(hit.object.material)) continue;
      let p = hit.object, ok = true;
      while (p && !stickTo.has(p)) { if (noStick.has(p)) ok = false; p = p.parent; }
      if (!ok || !p) continue;
      wn.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (wn.dot(ray.ray.direction) > 0) wn.negate();
      return { parent: p, point: hit.point.clone(), normal: wn.clone() };
    }
    return null;
  }
  function attach(o) {
    let mesh;
    if (o.boss || o.dynamic) mesh = o.mesh;
    else { mesh = new THREE.Mesh(o.type.geo, o.type.glow ? P.material('glow') : P.material('base')); mesh.scale.setScalar(o.scale); }
    const s0 = o.boss ? 1 : mesh.scale.x;
    const size = o.size || o.foot, h = o.h || size;
    group.updateMatrixWorld(true);
    const spot = findSpot(tv.set(o.x, Math.min(h * 0.4, B.r), o.z)) ||
      { parent: duck.head, point: duck.head.localToWorld(new THREE.Vector3(0, 0.5, -0.1)), normal: new THREE.Vector3(0, 1, 0).applyQuaternion(duck.head.getWorldQuaternion(new THREE.Quaternion())) };
    const par = spot.parent;
    MI.copy(par.matrixWorld).invert();
    const pl = par.worldToLocal(spot.point.clone());
    const nl = spot.normal.clone().transformDirection(MI);
    // How much bigger one unit of the parent is than one unit of the duck (the head is scaled up).
    const k = par.getWorldScale(v3).x / duck.root.getWorldScale(v4).x;
    const st = P.stick(mesh, s0, nl, Math.random() * PI * 2), off = st.off;
    mesh.quaternion.copy(st.q);
    mesh.visible = true; mesh.castShadow = size > B.r * 0.3 || !!o.boss;
    par.add(mesh);
    mesh.traverse(m => { m.userData.stuck = true; });
    const a = { mesh, size, boss: !!o.boss, p: pl, off, s0, k };
    B.attached.push(a);
    place(a, B.duckScale());
    // Keep the drawn stuff in check: things tiny next to the duck fall off.
    if (B.attached.length > STUCK_DRAWN || B.items % 10 === 0) {
      const cut = B.r * 0.1, over = B.attached.length - STUCK_DRAWN;
      for (let j = B.attached.length - 1; j >= 0; j--) {
        const a = B.attached[j];
        if (a.boss) continue;
        if (a.size < cut || j < over) { a.mesh.parent && a.mesh.parent.remove(a.mesh); B.attached.splice(j, 1); }
      }
    }
  }
  // Real size and position on its part for the duck's current scale. Anything bigger than about a fifth of
  // the duck's height is drawn at that size, so the robot always shows under its stuff.
  function place(a, ds) {
    const ps = ds * a.k, f = Math.min(1, B.r * STUCK_MAX / a.size);
    a.mesh.scale.setScalar(a.s0 * f / ps);
    a.mesh.position.copy(a.off).multiplyScalar(f / ps).add(a.p);
  }

  // ---------- Visual sync: the duck and the stuff on it ----------
  let lastHeading = 0, lean = 0;
  const upB = new THREE.Vector3();
  function sync(dt) {
    const r = B.r;
    group.visible = B.alive !== false;
    // A hop when it pops back up onto its skates.
    B.hopT = Math.max(0, (B.hopT || 0) - dt);
    const hop = B.hopT > 0 ? Math.sin(PI * (1 - B.hopT / HOP)) * r * 0.4 : 0;
    const c = B.curl || 0, e = ease(c), ds = B.duckScale();
    // Skating, the wheels are on the ground. Curled, the duck turns about the middle of its lumpy ball and
    // rides on whichever side is lowest, so it bobs as it tumbles.
    upB.copy(UP).applyQuaternion(qi.copy(q).invert());
    const low = Math.hypot(CURL_A.x * upB.x, CURL_A.y * upB.y, CURL_A.z * upB.z) * ds;
    group.position.set(B.x, hop * (1 - e) + low * e, B.z);
    group.quaternion.copy(q);
    // A little squash-and-stretch pop every time something sticks.
    B.pulse = Math.max(0, (B.pulse || 0) - dt * 4);
    group.scale.setScalar(1 + Math.sin(B.pulse * Math.PI) * 0.05);
    duck.root.scale.setScalar(ds);
    duck.root.position.copy(CURL_C).multiplyScalar(-ds * e);
    for (const a of B.attached) place(a, ds);
    if (dt > 0) {
      const turn = Math.atan2(Math.sin(B.heading - lastHeading), Math.cos(B.heading - lastHeading)) / dt;
      lean += (Math.max(-0.4, Math.min(0.4, -turn * 0.14)) - lean) * Math.min(1, dt * 6);
    }
    lastHeading = B.heading;
    duck.root.rotation.set(0, 0, lean * (1 - e));
    if (dt > 0) {
      // Skating stride follows the ground speed in duck units.
      const sp = B.speed || 0, glide = Math.min(4, sp / ds);
      const st = B.party && e < 0.5 ? 'win' : e > 0.3 ? 'curl' : B.hopT > 0 ? 'air' : (B.bonkCd || 0) > 0.15 ? 'hit' : 'idle';
      if (st !== fake.state) { fake.state = st; fake.stateT = 0; fake.actionDur = st === 'hit' ? 0.4 : 0; }
      fake.stateT += dt;
      fake.onGround = !(B.hopT > 0); fake.vy = 0;
      fake.vx = Math.sin(B.heading) * glide; fake.vz = Math.cos(B.heading) * glide;
      fake.skatesT = 1;
      MD.animateDuck(duck, fake, dt, W.time);
    }
  }
  B.celebrate = function (on) { B.party = !!on; fake.singing = !!on; };
  B.animateOnly = function (dt) { sync(dt); };

  return B;
})();
