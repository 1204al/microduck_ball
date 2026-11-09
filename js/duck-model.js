// Procedural Microduck model, modeled on the real robot's product photos:
// hood-shaped head with one camera eye, a flat beak that opens, a black servo neck with
// aluminium brackets, a small rounded torso, bent servo legs with colored thigh panels, chunky feet.
// Units: 1 = 10 cm, so the duck stands about 2.4 units (24 cm) tall.
window.MD = window.MD || {};

MD.COLORWAYS = {
  graphite: {
    name: 'Graphite', title: 'The Lab Unit',
    shell: 0x5d6066, face: 0x2b2c30, beak: 0xf5c518, eye: 0x8a6fd6, foot: 0xf5c518, sole: 0x8a6fd6, css: '#5d6066', cssEye: '#8a6fd6',
    bio: 'Came straight off the test bench. Has been dropped 4,812 times in simulation and remembers every one.',
    stats: { hp: 1.12, speed: 0.94, power: 1.1, weight: 1.25 }, voice: 0.82,
  },
  cream: {
    name: 'Cream', title: 'The Prototype',
    shell: 0xeee8dd, face: 0x34353a, beak: 0xf0631f, eye: 0xf5a623, foot: 0xf39a1e, sole: 0xe2551c, css: '#eee8dd', cssEye: '#f5a623',
    bio: 'Balanced in every way except emotionally. Will pick up your socks, then throw them at someone.',
    stats: { hp: 1.0, speed: 1.0, power: 1.0, weight: 1.0 }, voice: 1.0,
  },
  lavender: {
    name: 'Lavender', title: 'The Influencer',
    shell: 0xb8a5dd, face: 0x3a3542, beak: 0xf5c518, eye: 0x6fd0e6, foot: 0xf5c518, sole: 0xa08ccc, css: '#b8a5dd', cssEye: '#6fd0e6',
    bio: 'Has a launch video with more views than your entire codebase. Fast, fragile, and always filming.',
    stats: { hp: 0.9, speed: 1.14, power: 0.96, weight: 0.88 }, voice: 1.18,
  },
  sky: {
    name: 'Sky', title: 'The Skater',
    shell: 0x8cc4ea, face: 0x26303a, beak: 0xff8a3d, eye: 0xf3eee4, foot: 0xff8a3d, sole: 0x3f7fb3, css: '#8cc4ea', cssEye: '#f3eee4',
    bio: 'Was promised optional wheels and took that personally. Skate dash recharges almost twice as fast.',
    stats: { hp: 0.96, speed: 1.06, power: 0.95, weight: 0.95, dashCd: 0.55 }, voice: 1.08,
  },
};
MD.COLORWAY_KEYS = ['graphite', 'cream', 'lavender', 'sky'];
// drop: ankle pivot to the bottom of the sole (or the wheels), so feet land exactly on the surface.
MD.LEG = { L1: 0.38, L2: 0.38, drop: 0.215, dropSkates: 0.29, hipX: 0.25, splay: 0.1 };

(function () {
  const geoCache = {};

  function rrShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.max(0.0005, Math.min(r, w / 2 - 0.0005, h / 2 - 0.0005));
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // Weld duplicate vertices so normals are smooth across bevels: reads as molded plastic.
  function smooth(geo) {
    const pos = geo.attributes.position, map = new Map(), verts = [], idx = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = Math.round(x * 1e4) + '_' + Math.round(y * 1e4) + '_' + Math.round(z * 1e4);
      let j = map.get(k);
      if (j === undefined) { j = verts.length / 3; verts.push(x, y, z); map.set(k, j); }
      idx.push(j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function extrude(shape, depth, bevel, segs) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, depth - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs || 3, curveSegments: 8 });
    g.translate(0, 0, -(depth - 2 * bevel) / 2);
    return smooth(g);
  }
  function rbox(w, h, d, r) {
    const key = [w, h, d, r].join('|');
    if (geoCache[key]) return geoCache[key];
    const b = Math.min(r * 0.7, w / 2.2, h / 2.2, d / 2.2);
    return (geoCache[key] = extrude(rrShape(w - 2 * b, h - 2 * b, Math.max(0.001, r - b)), d, b));
  }
  MD.rbox = rbox; MD.rrShape = rrShape; MD.extrude = extrude;

  const shared = {};
  // Hex colors are sRGB; r128 treats them as linear unless converted, which washes them out.
  const lin = c => (typeof c === 'number' ? new THREE.Color(c).convertSRGBToLinear() : c);
  MD.lin = lin;
  function mat(color, rough, metal, extra) {
    const x = Object.assign({}, extra || {});
    if (x.emissive != null) x.emissive = lin(x.emissive);
    return new THREE.MeshStandardMaterial(Object.assign({ color: lin(color), roughness: rough == null ? 0.5 : rough, metalness: metal || 0 }, x));
  }
  MD.mat = mat;
  function sharedMats() {
    if (shared.servo) return shared;
    shared.servo = mat(0x18191c, 0.42, 0.1);
    shared.alu = mat(0xb9bec6, 0.32, 0.75);
    shared.screw = mat(0x7d828a, 0.3, 0.8);
    shared.lens = mat(0x07080b, 0.06, 0.3);
    shared.glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
    shared.rubber = mat(0x222222, 0.9, 0);
    shared.hub = mat(0xf3eee4, 0.4, 0);
    return shared;
  }

  function mesh(geo, m, parent, x, y, z) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x || 0, y || 0, z || 0);
    o.castShadow = true; o.receiveShadow = true;
    if (parent) parent.add(o);
    return o;
  }
  const hornGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16);
  // A smart servo: black body, aluminium horn disc on the side, two screws.
  function servo(parent, w, h, d, x, y, z, side) {
    const S = sharedMats();
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    mesh(rbox(w, h, d, 0.03), S.servo, g);
    const horn = mesh(hornGeo, S.alu, g, (w / 2 + 0.006) * (side || 1), 0, 0);
    horn.rotation.z = Math.PI / 2;
    return g;
  }
  function bracket(parent, x, y, z, h, w, d) {
    return mesh(rbox(w || 0.022, h, d || 0.09, 0.008), sharedMats().alu, parent, x, y, z);
  }

  function headShellGeo() {
    if (geoCache.head) return geoCache.head;
    const s = new THREE.Shape();
    s.moveTo(0.42, 0.0); s.lineTo(-0.26, 0.0);
    s.quadraticCurveTo(-0.38, 0.0, -0.38, 0.14);
    s.lineTo(-0.36, 0.27);
    s.quadraticCurveTo(-0.33, 0.43, -0.14, 0.43);
    s.lineTo(0.3, 0.42);
    s.quadraticCurveTo(0.42, 0.42, 0.42, 0.31);
    s.lineTo(0.42, 0.0);
    const g = extrude(s, 0.6, 0.045, 4);
    g.rotateY(-Math.PI / 2);
    return (geoCache.head = g);
  }
  function beakGeo(w, len, t, rf, key) {
    if (geoCache[key]) return geoCache[key];
    const s = new THREE.Shape(), x = -w / 2, rb = 0.05;
    s.moveTo(x + rb, 0); s.lineTo(x + w - rb, 0); s.quadraticCurveTo(x + w, 0, x + w, rb);
    s.lineTo(x + w, len - rf); s.quadraticCurveTo(x + w, len, x + w - rf, len);
    s.lineTo(x + rf, len); s.quadraticCurveTo(x, len, x, len - rf);
    s.lineTo(x, rb); s.quadraticCurveTo(x, 0, x + rb, 0);
    const g = extrude(s, t, 0.018, 2);
    g.rotateX(Math.PI / 2);
    return (geoCache[key] = g);
  }
  function panelGeo() {
    if (geoCache.panel) return geoCache.panel;
    const s = new THREE.Shape();
    s.moveTo(0.16, 0.06); s.quadraticCurveTo(0.2, 0.08, 0.17, 0.0);
    s.lineTo(0.02, -0.27); s.quadraticCurveTo(-0.02, -0.32, -0.06, -0.26);
    s.lineTo(-0.2, 0.0); s.quadraticCurveTo(-0.22, 0.07, -0.14, 0.08);
    s.lineTo(0.16, 0.06);
    const g = extrude(s, 0.06, 0.02, 2);
    g.rotateY(Math.PI / 2);
    return (geoCache.panel = g);
  }

  // A rounded-rectangle ring: the lip of the hood around the face.
  function hoodRimGeo() {
    if (geoCache.rim) return geoCache.rim;
    const s = rrShape(0.6, 0.39, 0.12), hole = rrShape(0.5, 0.3, 0.08);
    s.holes.push(new THREE.Path(hole.getPoints(12)));
    return (geoCache.rim = extrude(s, 0.05, 0.012, 2));
  }

  MD.buildDuck = function (cwKey) {
    const cw = MD.COLORWAYS[cwKey] || MD.COLORWAYS.cream;
    const S = sharedMats();
    const M = {
      shell: mat(cw.shell, 0.48, 0, { emissive: 0x000000 }),
      // The real robot's face inside the hood is light grey plastic, not dark.
      face: mat(cw.inner || 0xd4d5d8, 0.55),
      gap: mat(0x1c1d21, 0.7),
      beak: mat(cw.beak, 0.42),
      eye: mat(cw.eye, 0.38, 0, { emissive: cw.eye, emissiveIntensity: 0.15 }),
      iris: mat(0x1a2a3a, 0.1, 0.2, { emissive: cw.eye, emissiveIntensity: 0.35 }),
      foot: mat(cw.foot, 0.5),
      sole: mat(cw.sole, 0.75),
      led: new THREE.MeshBasicMaterial({ color: 0x441111 }),
    };
    const d = { cw, cwKey, mats: M, legs: [] };
    d.root = new THREE.Group();
    d.tilt = new THREE.Group(); d.root.add(d.tilt);
    d.spin = new THREE.Group(); d.spin.position.y = 1.1; d.tilt.add(d.spin);
    d.rig = new THREE.Group(); d.rig.position.y = -1.1; d.spin.add(d.rig);
    d.pelvis = new THREE.Group(); d.pelvis.position.y = 0.8; d.rig.add(d.pelvis);

    // Pelvis servos and the cross bracket between them.
    servo(d.pelvis, 0.2, 0.18, 0.24, 0.13, 0.04, 0, 1);
    servo(d.pelvis, 0.2, 0.18, 0.24, -0.13, 0.04, 0, -1);
    bracket(d.pelvis, 0, 0.04, 0.135, 0.12, 0.42, 0.02);
    // Torso shell.
    d.torso = mesh(rbox(0.5, 0.3, 0.42, 0.12), M.shell, d.pelvis, 0, 0.29, -0.02);
    mesh(rbox(0.44, 0.02, 0.36, 0.01), S.servo, d.pelvis, 0, 0.14, -0.02);

    // Neck: two servo segments with aluminium side plates.
    d.neck1 = new THREE.Group(); d.neck1.position.set(0, 0.46, 0.1); d.pelvis.add(d.neck1);
    servo(d.neck1, 0.18, 0.2, 0.2, 0, 0.1, 0, 1);
    bracket(d.neck1, 0.1, 0.2, 0, 0.26, 0.03, 0.13); bracket(d.neck1, -0.1, 0.2, 0, 0.26, 0.03, 0.13);
    d.neck2 = new THREE.Group(); d.neck2.position.set(0, 0.3, 0); d.neck1.add(d.neck2);
    servo(d.neck2, 0.18, 0.2, 0.2, 0, 0.1, 0, -1);
    bracket(d.neck2, 0.1, 0.2, 0, 0.24, 0.03, 0.13); bracket(d.neck2, -0.1, 0.2, 0, 0.24, 0.03, 0.13);
    d.headPivot = new THREE.Group(); d.headPivot.position.set(0, 0.28, 0); d.neck2.add(d.headPivot);
    servo(d.headPivot, 0.16, 0.12, 0.18, 0, 0.04, 0, 1);

    // Head: hood shell, recessed dark face, one camera eye, recording LED.
    d.head = new THREE.Group(); d.head.position.set(0, 0.2, 0.08); d.head.scale.setScalar(1.32); d.headPivot.add(d.head); // the real duck's head is big next to its body
    mesh(headShellGeo(), M.shell, d.head);
    // The hood is an open shell: a rim lip stands proud of the recessed light-grey face.
    mesh(hoodRimGeo(), M.shell, d.head, 0, 0.205, 0.49);
    mesh(rbox(0.52, 0.32, 0.03, 0.08), M.face, d.head, 0, 0.2, 0.462);
    // One big camera eye left of centre (as you look at it): thick coloured ring, dark glass lens, glint.
    d.eyeRing = mesh(new THREE.TorusGeometry(0.098, 0.042, 14, 32), M.eye, d.head, -0.07, 0.2, 0.495);
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 28), M.eye, d.head, -0.07, 0.2, 0.485).rotation.x = Math.PI / 2;
    d.iris = mesh(new THREE.SphereGeometry(0.068, 24, 16), M.iris, d.head, -0.07, 0.2, 0.49);
    d.iris.scale.z = 0.55;
    d.lens = mesh(new THREE.SphereGeometry(0.04, 20, 14), S.lens, d.head, -0.07, 0.2, 0.515);
    d.lens.scale.z = 0.5;
    mesh(new THREE.SphereGeometry(0.012, 8, 6), S.glint, d.head, -0.05, 0.222, 0.537).castShadow = false;
    d.nose = new THREE.Object3D(); d.nose.position.set(0, 0.2, 0.3); d.head.add(d.nose);
    // Small dark sensor window to the right of the eye, with the camera-in-use LED.
    mesh(rbox(0.05, 0.05, 0.02, 0.02), M.gap, d.head, 0.1, 0.205, 0.48);
    d.led = mesh(new THREE.SphereGeometry(0.012, 8, 6), M.led, d.head, 0.1, 0.205, 0.49);
    // Beak: fixed upper plate under the hood, hinged lower jaw.
    mesh(beakGeo(0.62, 0.9, 0.075, 0.2, 'beakU'), M.beak, d.head, 0, -0.04, -0.33);
    d.beakLow = new THREE.Group(); d.beakLow.position.set(0, -0.104, -0.26); d.head.add(d.beakLow);
    mesh(beakGeo(0.56, 0.8, 0.06, 0.18, 'beakL'), M.beak, d.beakLow, 0, 0, 0);
    mesh(rbox(0.5, 0.012, 0.7, 0.005), M.gap, d.beakLow, 0, 0.031, 0.38);
    [1, -1].forEach(sx => { const h = mesh(hornGeo, S.screw, d.head, 0.3 * sx, -0.07, -0.2); h.rotation.z = Math.PI / 2; h.scale.set(0.6, 1, 0.6); });
    d.beakTip = new THREE.Object3D(); d.beakTip.position.set(0, -0.06, 0.74); d.beakLow.add(d.beakTip);

    // Legs.
    const wheelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.06, 18);
    const hubGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.065, 12);
    [1, -1].forEach(side => {
      const L = { side };
      L.splay = new THREE.Group(); L.splay.position.set(0.25 * side, -0.02, 0); d.pelvis.add(L.splay);
      L.splay.rotation.z = 0.1 * side;
      L.hip = new THREE.Group(); L.splay.add(L.hip);
      servo(L.hip, 0.17, 0.2, 0.24, 0.02 * side, -0.03, 0, side);
      const p = mesh(panelGeo(), M.shell, L.hip, 0.12 * side, -0.03, 0.0);
      p.scale.set(side, 1.0, 1.08);
      bracket(L.hip, 0.085, -0.2, 0, 0.3, 0.03, 0.13); bracket(L.hip, -0.085, -0.2, 0, 0.3, 0.03, 0.13);
      L.knee = new THREE.Group(); L.knee.position.y = -MD.LEG.L1; L.hip.add(L.knee);
      servo(L.knee, 0.16, 0.2, 0.22, 0, 0, 0, side);
      bracket(L.knee, 0.08, -0.2, 0.0, 0.28, 0.03, 0.13); bracket(L.knee, -0.08, -0.2, 0.0, 0.28, 0.03, 0.13);
      servo(L.knee, 0.14, 0.14, 0.18, 0, -0.2, -0.02, -side);
      L.ankle = new THREE.Group(); L.ankle.position.y = -MD.LEG.L2; L.knee.add(L.ankle);
      servo(L.ankle, 0.15, 0.13, 0.2, 0, 0.0, 0, side);
      L.foot = new THREE.Group(); L.ankle.add(L.foot);
      mesh(rbox(0.31, 0.15, 0.5, 0.07), M.foot, L.foot, 0, -0.095, 0.05);
      mesh(rbox(0.27, 0.1, 0.16, 0.05), M.foot, L.foot, 0, -0.07, 0.25);
      mesh(rbox(0.33, 0.055, 0.54, 0.026), M.sole, L.foot, 0, -0.1875, 0.06);
      L.wheels = [];
      [[0.1, 0.22], [-0.1, 0.22], [0.1, -0.1], [-0.1, -0.1]].forEach(([wx, wz]) => {
        const w = new THREE.Group(); w.position.set(wx, -0.22, wz); L.foot.add(w);
        mesh(wheelGeo, S.rubber, w).rotation.z = Math.PI / 2;
        mesh(hubGeo, S.hub, w).rotation.z = Math.PI / 2;
        w.visible = false; L.wheels.push(w);
      });
      d.legs.push(L);
    });
    return d;
  };

  // Hats sit on top of the hood and fly off when the duck falls over.
  const HAT = {
    propeller(g) {
      const red = mat(0xe8443a, 0.6), yel = mat(0xf5c518, 0.5), blu = mat(0x3f7fb3, 0.5);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), red); cap.scale.y = 0.75; g.add(cap);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24), yel); band.rotation.x = Math.PI / 2; g.add(band);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8), S().alu); stem.position.y = 0.19; g.add(stem);
      const prop = new THREE.Group(); prop.position.y = 0.24; g.add(prop);
      [[yel, 0], [blu, Math.PI]].forEach(([m, r]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.05), m); b.position.x = 0.1; const p = new THREE.Group(); p.rotation.y = r; p.add(b); prop.add(p); });
      g.userData.prop = prop;
    },
    party(g) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 20), mat(0xd94fa0, 0.5)); c.position.y = 0.18; g.add(c);
      [0.06, 0.16].forEach(y => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.13 - y * 0.36, 0.014, 6, 20), mat(0xf5c518, 0.5)); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); });
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0xf5c518, 0.8)); pom.position.y = 0.37; g.add(pom);
      g.rotation.z = 0.18;
    },
    chef(g) {
      const w = mat(0xf7f5f0, 0.85);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 20), w); b.position.y = 0.08; g.add(b);
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), w); top.scale.y = 0.6; top.position.y = 0.2; g.add(top);
    },
    grad(g) {
      const k = mat(0x1d1b22, 0.6);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 20), k); b.position.y = 0.05; g.add(b);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.025, 0.44), k); board.position.y = 0.11; board.rotation.y = Math.PI / 4; g.add(board);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), mat(0xf5c518, 0.5)); t.position.set(0.2, 0.03, 0); g.add(t);
    },
    santa(g) {
      const r = mat(0xd8322c, 0.7), w = mat(0xf7f5f0, 0.95);
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.34, 20), r); c.position.y = 0.17; c.rotation.z = -0.35; c.position.x = 0.05; g.add(c);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 24), w); band.rotation.x = Math.PI / 2; band.position.y = 0.02; g.add(band);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), w); pom.position.set(0.17, 0.3, 0); g.add(pom);
    },
    crown(g) {
      const gold = mat(0xf2b705, 0.25, 0.8);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 24, 1, true), gold); b.position.y = 0.05; g.add(b);
      for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 8), gold); const a = i / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.16, 0.14, Math.sin(a) * 0.16); g.add(sp); }
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(0xd8322c, 0.2)); gem.position.set(0, 0.06, 0.17); g.add(gem);
    },
  };
  const S = () => sharedMats();
  MD.HAT_KEYS = Object.keys(HAT);
  MD.putHat = function (d, key) {
    if (d.hat) { d.hat.parent && d.hat.parent.remove(d.hat); d.hat = null; }
    if (!key || !HAT[key]) return;
    const g = new THREE.Group(); HAT[key](g);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    g.position.set(0, 0.47, 0.04); d.head.add(g); d.hat = g;
  };

  MD.setDuckColorway = function (d, cwKey) {
    const cw = MD.COLORWAYS[cwKey];
    d.cw = cw; d.cwKey = cwKey;
    const M = d.mats;
    const set = (c, h) => c.setHex(h).convertSRGBToLinear();
    set(M.shell.color, cw.shell); set(M.face.color, cw.inner || 0xd4d5d8); set(M.beak.color, cw.beak);
    set(M.eye.color, cw.eye); set(M.eye.emissive, cw.eye); set(M.iris.emissive, cw.eye);
    set(M.foot.color, cw.foot); set(M.sole.color, cw.sole);
  };
})();
