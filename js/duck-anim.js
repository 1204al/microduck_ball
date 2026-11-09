// Procedural animation: every frame the fighter's state picks a target pose,
// the rig eases toward it (like a 50 Hz servo loop chasing setpoints), and the
// pelvis height is solved from leg forward kinematics so a foot stays on the ground.
window.MD = window.MD || {};
(function () {
  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const KEYS = ['h0', 'k0', 'h1', 'k1', 'roll', 'pitch', 'n1', 'n2', 'hp', 'hy', 'hr', 'beak', 'lift'];

  function basePose() {
    return { h0: -0.55, k0: 1.1, h1: -0.55, k1: 1.1, roll: 0, pitch: 0, n1: 0.18, n2: -0.12, hp: -0.06, hy: 0, hr: 0, beak: 0, lift: 0 };
  }

  MD.initAnim = function (f) {
    f.anim = { cur: basePose(), phase: 0, tiltX: 0, tiltZ: 0, tvx: 0, tvz: 0, spin: 0, clackT: 1 + Math.random() * 2, lookT: 0, lookY: 0 };
  };

  function target(f, t) {
    const P = basePose(), A = f.anim, st = f.state, p = f.actionDur ? clamp(f.stateT / f.actionDur, 0, 1) : 0;
    const spd = Math.hypot(f.vx, f.vz);
    let rate = 16;

    // Breathing and idle look-around.
    P.n1 += Math.sin(t * 2.1 + f.id) * 0.03;
    P.hp += Math.sin(t * 1.3 + f.id * 2) * 0.04;
    P.hy = A.lookY;

    const walkAmp = (st === 'idle' || st === 'chase' || st === 'block' || st === 'holdwalk') ? clamp(spd / 3.2, 0, 1) : 0;
    if (walkAmp > 0.02 && f.onGround) {
      // Phase rate matched to stride length so planted feet do not skate over the ground.
      A.phase += spd * 4.3 * (A.dt || 1 / 60);
      const s0 = Math.sin(A.phase), s1 = Math.sin(A.phase + PI);
      const sk = f.skatesT > 0 ? 0.45 : 1;
      P.h0 += s0 * 0.5 * walkAmp * sk; P.h1 += s1 * 0.5 * walkAmp * sk;
      P.k0 += Math.max(0, Math.cos(A.phase)) * 0.7 * walkAmp * sk;
      P.k1 += Math.max(0, Math.cos(A.phase + PI)) * 0.7 * walkAmp * sk;
      P.roll = Math.sin(A.phase) * 0.13 * walkAmp;
      P.hr = -P.roll * 0.6;
      P.pitch = 0.08 * walkAmp;
      P.n1 += 0.1 * walkAmp + Math.abs(Math.sin(A.phase)) * 0.06;
    }

    switch (st) {
      case 'chase': P.n1 += 0.25; P.hp -= 0.15; P.beak = 0.25 + Math.abs(Math.sin(t * 14)) * 0.2; break;
      case 'peck': case 'throw': {
        rate = 32;
        if (p < 0.35) { const w = smoothstep(0, 0.35, p); P.n1 -= 0.35 * w; P.n2 -= 0.2 * w; P.hp -= 0.2 * w; P.beak = 0.55 * w; }
        else if (p < 0.6) { P.n1 = 0.95; P.n2 = -0.35; P.hp = 0.15; P.pitch = 0.18; P.beak = p < 0.47 ? 0.6 : 0.0; P.h0 -= 0.25; P.k1 += 0.2; }
        else { const r = 1 - smoothstep(0.6, 1, p); P.n1 += 0.7 * r; P.beak = st === 'throw' ? 0.5 * r : 0; }
        break;
      }
      case 'headbutt': {
        rate = 26;
        if (p < 0.4) { const w = smoothstep(0, 0.4, p); P.pitch = -0.28 * w; P.n1 = -0.45 * w; P.n2 = -0.2 * w; P.hp = -0.35 * w; P.h0 -= 0.3 * w; P.h1 += 0.25 * w; P.k1 += 0.35 * w; }
        else if (p < 0.72) { P.pitch = 0.42; P.n1 = 1.05; P.n2 = 0.15; P.hp = 0.45; P.h0 = -1.05; P.k0 = 1.5; P.h1 = 0.15; P.k1 = 0.5; P.beak = 0.15; }
        else { const r = 1 - smoothstep(0.72, 1, p); P.pitch = 0.42 * r; P.n1 += 0.8 * r; P.hp += 0.4 * r; }
        break;
      }
      case 'block':
        P.h0 = P.h1 = -1.05; P.k0 = P.k1 = 1.95; P.n1 = -0.15; P.n2 = 0.5; P.hp = 0.25; P.pitch = 0.1;
        break;
      case 'air': case 'flip':
        P.h0 = -0.95; P.k0 = 1.7; P.h1 = -0.75; P.k1 = 1.5; P.n1 = 0.0; P.n2 = -0.2; P.hp = -0.2; rate = 20;
        if (f.vy > 2) { P.h0 = P.h1 = -0.3; P.k0 = P.k1 = 0.6; }
        break;
      case 'dash': {
        rate = 22;
        const pu = Math.sin(t * 22);
        P.pitch = 0.38; P.h0 = -0.45 + pu * 0.35; P.h1 = -0.45 - pu * 0.35; P.k0 = P.k1 = 0.8;
        P.n1 = 0.75; P.n2 = -0.55; P.hp = -0.3; P.beak = 0.3;
        break;
      }
      case 'hit': {
        rate = 30;
        const r = 1 - p;
        P.pitch = -0.35 * r; P.n1 = -0.6 * r; P.n2 = -0.2 * r; P.hp = -0.5 * r; P.beak = 0.6 * r; P.hr = (f.id ? 0.3 : -0.3) * r;
        break;
      }
      case 'down': case 'ko': case 'fall': {
        rate = 12;
        const kick = st === 'ko' ? 0 : Math.sin(t * (st === 'fall' ? 26 : 9));
        P.h0 = -0.6 + kick * 0.5; P.h1 = -0.6 - kick * 0.5; P.k0 = 1.2 + kick * 0.3; P.k1 = 1.2 - kick * 0.3;
        P.n1 = st === 'ko' ? 0.9 : 0.4; P.n2 = st === 'ko' ? 0.8 : 0.2; P.hp = 0.3; P.beak = st === 'ko' ? 0.35 : 0.2 + Math.abs(kick) * 0.4;
        break;
      }
      case 'getup': {
        rate = 14;
        P.h0 = P.h1 = -0.95; P.k0 = P.k1 = 1.8; P.n1 = 0.4 - p * 0.3; P.n2 = 0.2; P.hp = Math.sin(p * PI * 3) * 0.3;
        P.hy = Math.sin(t * 9) * 0.4 * (1 - p);
        break;
      }
      case 'sleep':
        rate = 5;
        P.h0 = P.h1 = -1.35; P.k0 = P.k1 = 2.35; P.n1 = 0.7; P.n2 = 0.55; P.hp = 0.45; P.pitch = 0.05; P.beak = 0.08 + Math.sin(t * 1.4) * 0.06;
        break;
      case 'win': {
        rate = 18;
        const beat = Math.sin(t * 7.5);
        P.hy = Math.sin(t * 3.7) * 0.35; P.hr = beat * 0.15; P.roll = beat * 0.1;
        P.n1 = -0.1; P.n2 = -0.25; P.hp = -0.45; P.beak = f.singing ? 0.55 : 0.05;
        P.k0 = 1.1 + Math.max(0, beat) * 0.35; P.k1 = 1.1 + Math.max(0, -beat) * 0.35;
        break;
      }
      case 'lose':
        rate = 6; P.n1 = 0.75; P.n2 = 0.6; P.hp = 0.5; P.hy = Math.sin(t * 0.8) * 0.15;
        break;
      case 'curl':
        // Microduck Ball: tucked into a ball, legs folded up, head down on the chest.
        rate = 22;
        P.h0 = P.h1 = -1.5; P.k0 = P.k1 = 2.55; P.n1 = 1.15; P.n2 = 0.95; P.hp = 0.7; P.pitch = 0.35; P.beak = 0; P.hy = 0; P.hr = 0; P.roll = 0;
        break;
      case 'teeter':
        P.n1 = -0.3 + Math.sin(t * 16) * 0.3; P.hy = Math.sin(t * 11) * 0.5; P.beak = 0.5; P.roll = Math.sin(t * 13) * 0.15;
        break;
    }
    if (f.stunT > 0 && st !== 'down' && st !== 'ko') { P.hy = Math.sin(t * 13) * 0.5; P.hr = Math.sin(t * 9) * 0.25; }
    if (f.blindT > 0) { P.hy = Math.sin(t * 5) * 0.6; P.n1 -= 0.1; }
    return { P, rate };
  }

  MD.animateDuck = function (d, f, dt, t) {
    const A = f.anim, cur = A.cur;
    // Occasional idle beak clack and glance.
    A.clackT -= dt; A.lookT -= dt;
    if (A.lookT <= 0) { A.lookT = 1.5 + Math.random() * 2.5; A.lookY = (Math.random() - 0.5) * 0.7; }
    A.dt = dt;
    const { P, rate } = target(f, t);
    if (A.clackT <= 0 && f.state === 'idle') { A.clackT = 2 + Math.random() * 4; A.clackPulse = 0.14; }
    if (A.clackPulse > 0) { A.clackPulse -= dt; P.beak = Math.max(P.beak, 0.3); }
    const k = 1 - Math.exp(-dt * rate);
    for (const key of KEYS) cur[key] += (P[key] - cur[key]) * k;

    // Apply joints.
    const legs = d.legs;
    const hs = [cur.h0, cur.h1], ks = [cur.k0, cur.k1];
    let ext = -9;
    const drop = f.skatesT > 0 ? MD.LEG.dropSkates : MD.LEG.drop;
    const sr = Math.sin(cur.roll), cs = Math.cos(MD.LEG.splay);
    for (let i = 0; i < 2; i++) {
      const L = legs[i];
      L.hip.rotation.x = hs[i] - cur.pitch;
      L.knee.rotation.x = ks[i];
      L.ankle.rotation.x = -(hs[i] + ks[i]);
      // Keep the sole flat on the ground despite the bow-legged splay and the waddle roll.
      L.foot.rotation.z = -(MD.LEG.splay * L.side) - cur.roll;
      // Height this leg needs: leg length (shortened by splay) plus the hip being raised or lowered by the roll.
      const e = (MD.LEG.L1 * Math.cos(hs[i]) + MD.LEG.L2 * Math.cos(hs[i] + ks[i])) * cs + drop - L.side * MD.LEG.hipX * sr;
      if (e > ext) ext = e;
      const showW = f.skatesT > 0 || f.state === 'dash';
      for (const w of L.wheels) { w.visible = showW; if (showW) w.rotation.x += dt * (Math.hypot(f.vx, f.vz) * 9 + 2); }
    }
    d.pelvis.position.y = ext + 0.02;
    d.pelvis.rotation.x = cur.pitch;
    d.pelvis.rotation.z = cur.roll;
    d.neck1.rotation.x = cur.n1;
    d.neck2.rotation.x = cur.n2;
    d.headPivot.rotation.set(cur.hp, cur.hy, cur.hr);
    d.beakLow.rotation.x = Math.max(0, cur.beak) * 0.6;

    if (d.hat && d.hat.userData.prop) d.hat.userData.prop.rotation.y += dt * (5 + Math.hypot(f.vx, f.vz) * 9 + (f.onGround ? 0 : 20));

    // Whole-body tilt for falls (spring), and flips.
    let tx = 0, tz = 0;
    if (f.state === 'down' || f.state === 'ko') { tx = f.fallDir.x; tz = f.fallDir.z; }
    else if (f.state === 'fall') { tx = f.fallDir.x * Math.min(1, f.stateT * 1.5) * 1.6; tz = f.fallDir.z * Math.min(1, f.stateT * 1.5) * 1.6; }
    else if (f.state === 'sleep') { tx = 0.05; }
    const sk = f.state === 'getup' ? 90 : 160, damp = f.state === 'getup' ? 9 : 14;
    A.tvx += ((tx - A.tiltX) * sk - A.tvx * damp) * dt; A.tiltX += A.tvx * dt;
    A.tvz += ((tz - A.tiltZ) * sk - A.tvz * damp) * dt; A.tiltZ += A.tvz * dt;
    d.tilt.rotation.x = A.tiltX; d.tilt.rotation.z = A.tiltZ;
    d.spin.rotation.x = f.state === 'flip' ? -PI * 2 * smoothstep(0.05, 0.9, f.stateT / f.actionDur) : 0;

    // Eye, LED and hit flash.
    const M = d.mats;
    const off = f.state === 'ko' || f.state === 'sleep' || f.blindT > 0;
    M.iris.emissiveIntensity = off ? 0.0 : (f.state === 'chase' ? 0.9 : 0.35 + Math.sin(t * 3) * 0.05);
    M.eye.emissiveIntensity = f.state === 'ko' ? 0 : 0.15 + (f.pumpT > 0 ? 0.6 + Math.sin(t * 20) * 0.3 : 0);
    const rec = f.state === 'peck' || f.state === 'headbutt' || f.state === 'dash' || f.state === 'throw';
    M.led.color.setHex(rec ? 0xff2a2a : (Math.sin(t * 2 + f.id) > 0.6 && !off ? 0xaa2222 : 0x3a1010));
    const fl = Math.max(0, f.flashT || 0) * 4;
    M.shell.emissive.setRGB(fl * 0.9, fl * 0.15, fl * 0.1);

    updateContact(d, f);
  };

  // Soft contact shadows: one blob under the body and one under each foot, drawn on the surface.
  // They fade as a foot lifts and spread as the duck jumps, which is what makes it read as standing.
  const FW = new THREE.Vector3();
  // Soft round falloff computed in the shader: dark in the middle, fading to nothing at the edge.
  function blobMat(op, inner) {
    return new THREE.ShaderMaterial({
      uniforms: { opacity: { value: op }, inner: { value: inner } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float opacity; uniform float inner; varying vec2 vUv; void main() { float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(inner, 1.0, d)); gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * opacity); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
  }
  function makeContact(d) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mk = (op, inner) => { const m = new THREE.Mesh(geo, blobMat(op, inner)); m.renderOrder = 2; d.root.add(m); return m; };
    d.contact = { body: mk(0.55, 0.0), feet: [mk(0.85, 0.3), mk(0.85, 0.3)] };
  }
  function updateContact(d, f) {
    if (!d.contact) makeContact(d);
    const C = d.contact, A = MD.Arena;
    const show = f.state !== 'fall' && A.inside(f.x, f.z);
    C.body.visible = show; C.feet.forEach(m => { m.visible = show; });
    if (!show) return;
    d.root.updateMatrixWorld(true);
    const gy = A.groundAt(f.x, f.z), localY = gy - f.y + 0.006;
    const lying = f.state === 'down' || f.state === 'ko';
    // Body blob follows the torso, so a duck lying on the mat gets a long shadow under its body.
    d.torso.getWorldPosition(FW); d.root.worldToLocal(FW);
    const lift = Math.max(0, f.y - gy), spread = 1 + lift * 0.25;
    C.body.position.set(FW.x * (lying ? 1 : 0.4), localY, FW.z * (lying ? 1 : 0.4));
    C.body.scale.set((lying ? 2.2 : 1.7) * spread, 1, (lying ? 2.6 : 1.7) * spread);
    C.body.material.uniforms.opacity.value = 0.55 / (spread * spread);
    d.legs.forEach((L, i) => {
      L.foot.getWorldPosition(FW);
      const h = Math.max(0, FW.y - (f.skatesT > 0 ? MD.LEG.dropSkates : MD.LEG.drop) - gy);
      d.root.worldToLocal(FW);
      const m = C.feet[i];
      m.position.set(FW.x, localY + 0.001, FW.z + 0.06);
      m.scale.set(0.82 + h * 0.6, 1, 1.18 + h * 0.6);
      m.material.uniforms.opacity.value = lying ? 0 : 0.92 * Math.max(0, 1 - h / 0.35);
    });
  }
})();
