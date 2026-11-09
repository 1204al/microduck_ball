// Everything the ball can pick up. Each prop type is built once from primitives and merged into a
// single vertex-coloured geometry, so every prop in the world is one mesh and one draw call.
// Units match the duck model: 1 unit = 10 cm. Every geometry stands on y = 0, centred in x/z.
window.MD = window.MD || {};
MD.Props = (function () {
  const PI = Math.PI;
  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();

  // Low-poly mode for the thousands of instanced props: fewer segments on round parts.
  let LOW = false;
  const sg = n => LOW ? Math.min(n, 7) : n, sg2 = n => LOW ? Math.min(n, 5) : n;

  // ---------- Tiny builder: collect coloured parts, then merge ----------
  function B() {
    const parts = [];
    const add = (geo, color, x, y, z, o) => {
      o = o || {};
      if (o.q) Q.copy(o.q); else { E.set(o.rx || 0, o.ry || 0, o.rz || 0); Q.setFromEuler(E); }
      M4.compose(V.set(x || 0, y || 0, z || 0), Q, S.set(o.sx || 1, o.sy || 1, o.sz || 1));
      parts.push({ geo, color, m: M4.clone() });
      return api;
    };
    const api = {
      box: (w, h, d, c, x, y, z, o) => add(new THREE.BoxGeometry(w, h, d), c, x, y, z, o),
      cyl: (rt, rb, h, c, x, y, z, o) => add(new THREE.CylinderGeometry(rt, rb, h, sg((o && o.seg) || 14)), c, x, y, z, o),
      sph: (r, c, x, y, z, o) => add(new THREE.SphereGeometry(r, sg((o && o.seg) || 14), sg2((o && o.seg2) || 10), 0, PI * 2, 0, (o && o.half) ? PI / 2 : PI), c, x, y, z, o),
      cone: (r, h, c, x, y, z, o) => add(new THREE.ConeGeometry(r, h, sg((o && o.seg) || 14)), c, x, y, z, o),
      tor: (r, t, c, x, y, z, o) => add(new THREE.TorusGeometry(r, t, LOW ? 4 : 8, sg((o && o.seg) || 18), (o && o.arc) || PI * 2), c, x, y, z, o),
      // A limb from point a to point b: a box (or a cylinder with round: true) of width w and depth d.
      seg: (a, b, w, d, c, o) => {
        o = o || {};
        const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = dir.length();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        const geo = o.round ? new THREE.CylinderGeometry(w / 2, (o.w2 || w) / 2, len, sg(o.seg || 10)) : new THREE.BoxGeometry(w, len, d);
        return add(geo, c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { q });
      },
      geo(keep) { return merge(parts, keep); }, // keep: leave it where it was built (no re-centring)
    };
    return api;
  }
  // A part in model space, optionally grown by `grow` units on every side (scaled about its own centre).
  function place(p, grow) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (grow > 0) {
      g.computeBoundingBox();
      const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()), d = bb.getSize(new THREE.Vector3()), e = p.m.elements;
      // Local axis lengths of the part's transform, so the growth is the same in model units on every axis.
      const f = (dim, i) => dim > 1e-6 ? 1 + 2 * grow / (Math.hypot(e[i], e[i + 1], e[i + 2]) * dim) : 1;
      g.translate(-c.x, -c.y, -c.z).scale(f(d.x, 0), f(d.y, 4), f(d.z, 8)).translate(c.x, c.y, c.z);
    }
    return g.applyMatrix4(p.m);
  }
  // Pairs of parts that share a face plane (a screen flush with its case, a band wrapped round a body) and differ
  // in colour. Both surfaces land on the same depth, so which one wins flips per pixel and per frame: z-fighting
  // that no depth range can fix. Triangles are bucketed by plane, so this stays near linear in triangle count.
  function flushPairs(gs, cols, tol, minOv) {
    let n = 0;
    gs.forEach(g => { n += g.attributes.position.count / 3; });
    // Per triangle: unit normal, plane offset, bounding box (10 floats), owning part, bucket class and offset key.
    const F = new Float64Array(n * 10), part = new Int32Array(n), cls = new Int8Array(n), dks = new Int32Array(n);
    const buckets = new Map();
    let m = 0;
    gs.forEach((g, pi) => {
      const A = g.attributes.position.array;
      for (let i = 0; i < A.length; i += 9) {
        const ux = A[i + 3] - A[i], uy = A[i + 4] - A[i + 1], uz = A[i + 5] - A[i + 2];
        const vx = A[i + 6] - A[i], vy = A[i + 7] - A[i + 1], vz = A[i + 8] - A[i + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); if (nl < 1e-12) continue;
        nx /= nl; ny /= nl; nz /= nl;
        const o = m * 10, d = nx * A[i] + ny * A[i + 1] + nz * A[i + 2];
        F[o] = nx; F[o + 1] = ny; F[o + 2] = nz; F[o + 3] = d;
        for (let a = 0; a < 3; a++) {
          F[o + 4 + a] = Math.min(A[i + a], A[i + 3 + a], A[i + 6 + a]);
          F[o + 7 + a] = Math.max(A[i + a], A[i + 3 + a], A[i + 6 + a]);
        }
        // Bucket: the normal's dominant axis and sign, plus the plane offset. A normal close to a tie between two
        // axes goes into both, so coplanar faces always meet in the bucket of the one doing the lookup.
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), mx = Math.max(ax, ay, az), dk = Math.floor(d / tol);
        cls[m] = mx === ax ? (nx > 0 ? 1 : 0) : mx === ay ? (ny > 0 ? 3 : 2) : (nz > 0 ? 5 : 4); part[m] = pi; dks[m] = dk;
        const put = c => { const k = dk * 6 + c; const l = buckets.get(k); if (l) l.push(m); else buckets.set(k, [m]); };
        if (ax > mx - 0.02) put(nx > 0 ? 1 : 0);
        if (ay > mx - 0.02) put(ny > 0 ? 3 : 2);
        if (az > mx - 0.02) put(nz > 0 ? 5 : 4);
        m++;
      }
    });
    const np = gs.length, seen = new Uint8Array(np * np), pairs = [];
    for (let s = 0; s < m; s++) {
      const ps = part[s], so = s * 10;
      for (let dk = dks[s] - 1; dk <= dks[s] + 1; dk++) {
        const list = buckets.get(dk * 6 + cls[s]); if (!list) continue;
        for (let li = 0; li < list.length; li++) {
          const t = list[li], pt = part[t];
          if (pt <= ps || seen[ps * np + pt] || cols[pt] === cols[ps]) continue;
          const to = t * 10;
          if (F[so] * F[to] + F[so + 1] * F[to + 1] + F[so + 2] * F[to + 2] < 0.999 || Math.abs(F[so + 3] - F[to + 3]) >= tol) continue;
          // The faces have to overlap in their plane, not just touch along an edge.
          const ox = Math.min(F[so + 7], F[to + 7]) - Math.max(F[so + 4], F[to + 4]);
          const oy = Math.min(F[so + 8], F[to + 8]) - Math.max(F[so + 5], F[to + 5]);
          const oz = Math.min(F[so + 9], F[to + 9]) - Math.max(F[so + 6], F[to + 6]);
          if (Math.min(ox, oy, oz) < -tol || ox + oy + oz - Math.max(ox, oy, oz) - Math.min(ox, oy, oz) < minOv) continue;
          seen[ps * np + pt] = 1; pairs.push([ps, pt]);
        }
      }
    }
    return pairs;
  }
  function merge(parts, keep) {
    // The smaller part of each flush pair (it is the detail) is grown out of the bigger one by a hair: 0.6% of
    // the model's size, invisible up close but enough depth separation at fog distance. Details stacked on
    // details step out in layers, so a few rounds.
    let gs = parts.map(p => place(p, 0));
    const all = new THREE.Box3(), sizes = gs.map(g => { g.computeBoundingBox(); all.union(g.boundingBox); return g.boundingBox.getSize(V).length(); });
    const R = all.getSize(V).length() / 2, step = R * 0.006, grow = parts.map(() => 0), cols = parts.map(p => p.color);
    for (let round = 0; round < 4; round++) {
      const bump = new Set();
      for (const [i, j] of flushPairs(gs, cols, step * 0.75, R * 1e-3)) bump.add(sizes[i] < sizes[j] ? i : j);
      if (!bump.size) break;
      bump.forEach(i => { grow[i] += step; gs[i] = place(parts[i], grow[i]); });
    }
    const pos = [], nor = [], col = [];
    parts.forEach((p, pi) => {
      const g = gs[pi];
      const c = lin(p.color), P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i));
        nor.push(N.getX(i), N.getY(i), N.getZ(i));
        col.push(c.r, c.g, c.b);
      }
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingBox();
    // Re-centre on x/z and stand on the ground.
    const bb = out.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    if (!keep) out.translate(-cx, -bb.min.y, -cz);
    out.computeBoundingBox(); out.computeBoundingSphere();
    return out;
  }

  // ---------- Palette ----------
  const C = {
    ink: 0x1d1b22, steel: 0xb9bec6, dark: 0x2b2c30, servo: 0x18191c, duck: 0xf5c518, orange: 0xf0631f, cream: 0xeee8dd,
    lav: 0xb8a5dd, sky: 0x8cc4ea, red: 0xe8443a, green: 0x5bd66f, leaf: 0x3f9b4a, blue: 0x3f7fb3, pink: 0xf28ab2,
    wood: 0xb07a46, woodD: 0x7a5230, card: 0xc89b62, white: 0xf7f5f0, gold: 0xf2b705, terracotta: 0xc8623a, grey: 0x8d8798,
  };

  // A low-poly Microduck for walkers, bots and boxes, built like the real robot: a hood-shaped head with a
  // light-grey face, one big camera eye left of centre and a sensor dot, a wide two-plate beak, a black servo
  // neck with aluminium brackets, a small rounded torso, black servo legs with shell-coloured thigh shields
  // and chunky shoes with coloured soles. Standing, about 2.7 units (27 cm) tall.
  function miniDuck(b, shell, eye, beak, foot, s, sole, skates) {
    s = s || 1;
    const k = v => v * s, AL = C.steel, SV = C.servo;
    sole = sole == null ? C.lav : sole;
    [1, -1].forEach(x => {
      const X = k(0.27 * x);
      b.box(k(0.31), k(0.15), k(0.5), foot, X, k(0.13), k(0.05)).box(k(0.33), k(0.055), k(0.54), sole, X, k(0.03), k(0.06));
      b.sph(k(0.14), foot, X, k(0.13), k(0.27), { sx: 1.05, sy: 0.55, sz: 0.7, seg: 8, seg2: 5 });   // toe cap
      b.box(k(0.15), k(0.13), k(0.2), SV, X, k(0.27), 0);                                          // ankle servo
      // Roller skates: four wheels under the shoe (the merge stands the duck on them).
      if (skates) [[0.1, 0.24], [-0.1, 0.24], [0.1, -0.12], [-0.1, -0.12]].forEach(([wx, wz]) => b.cyl(k(0.07), k(0.07), k(0.06), 0x222222, X + k(wx), k(-0.06), k(wz), { rz: PI / 2, seg: 10 }).cyl(k(0.035), k(0.035), k(0.065), 0xf3eee4, X + k(wx), k(-0.06), k(wz), { rz: PI / 2, seg: 8 }));
      b.box(k(0.15), k(0.36), k(0.2), SV, X, k(0.5), k(0.04), { rx: -0.25 });                     // shin
      b.box(k(0.025), k(0.34), k(0.12), AL, X + k(0.09), k(0.5), k(0.04), { rx: -0.25 }).box(k(0.025), k(0.34), k(0.12), AL, X - k(0.09), k(0.5), k(0.04), { rx: -0.25 });
      b.box(k(0.17), k(0.2), k(0.23), SV, X, k(0.72), k(0.09));                                    // knee
      b.box(k(0.17), k(0.36), k(0.24), SV, X, k(0.93), k(0.03), { rx: 0.3 });                     // thigh
      b.box(k(0.06), k(0.36), k(0.32), shell, k(0.38 * x), k(0.95), k(0.02), { rz: -0.12 * x, rx: 0.3 }); // thigh shield
    });
    b.box(k(0.44), k(0.18), k(0.24), SV, 0, k(1.13), 0).box(k(0.42), k(0.12), k(0.02), AL, 0, k(1.13), k(0.13)); // pelvis servos
    b.sph(k(0.3), shell, 0, k(1.34), k(-0.02), { sx: 0.88, sy: 0.55, sz: 0.74, seg: 12, seg2: 8 });     // torso
    [1.6, 1.86].forEach(y => {
      b.box(k(0.18), k(0.2), k(0.2), SV, 0, k(y), k(0.1));
      b.box(k(0.025), k(0.24), k(0.13), AL, k(0.1), k(y), k(0.1)).box(k(0.025), k(0.24), k(0.13), AL, k(-0.1), k(y), k(0.1));
    });
    // Head: hood with a rounded crown, light face, eye, sensor dot, beak.
    const hy = k(2.32), hz = k(0.16);
    b.box(k(0.8), k(0.46), k(1.0), shell, 0, hy, hz).sph(k(0.5), shell, 0, hy + k(0.22), hz, { sx: 0.8, sy: 0.32, sz: 1.0, half: true, seg: 12, seg2: 5 });
    b.box(k(0.66), k(0.38), k(0.02), 0xd4d5d8, 0, hy + k(0.01), hz + k(0.505));
    b.tor(k(0.12), k(0.05), eye, k(-0.09), hy + k(0.01), hz + k(0.53), { seg: 14 });
    b.sph(k(0.085), C.ink, k(-0.09), hy + k(0.01), hz + k(0.52), { sz: 0.45, seg: 10, seg2: 6 });
    b.box(k(0.06), k(0.06), k(0.02), C.dark, k(0.14), hy + k(0.02), hz + k(0.52));
    b.box(k(0.84), k(0.09), k(1.08), beak, 0, hy - k(0.27), hz + k(0.12));
    b.box(k(0.76), k(0.07), k(0.92), beak, 0, hy - k(0.36), hz + k(0.1));
  }
  // The same duck tucked into a ball (for rivals tumbling in their pile): head bowed onto the chest, legs
  // folded under, centred on the origin about 0.65 across, so the hood, beak and shoes poke out of the pile.
  function curledDuck(b, shell, eye, beak, foot, sole) {
    b.sph(0.5, C.servo, 0, 0, 0, { seg: 10, seg2: 8 });
    b.box(0.7, 0.42, 0.62, shell, 0, 0.22, 0.38, { rx: 0.7 }).box(0.58, 0.32, 0.03, 0xd4d5d8, 0, 0.13, 0.62, { rx: 0.7 });
    b.tor(0.1, 0.04, eye, -0.08, 0.13, 0.65, { rx: 0.7, seg: 12 });
    b.box(0.72, 0.08, 0.6, beak, 0, -0.18, 0.62, { rx: 0.35 });
    [1, -1].forEach(x => b.box(0.26, 0.14, 0.42, foot, 0.24 * x, -0.5, 0.3).box(0.28, 0.05, 0.44, sole, 0.24 * x, -0.58, 0.3).box(0.06, 0.3, 0.3, shell, 0.5 * x, -0.15, 0.1));
  }
  function rubberDuck(b, body, s) {
    s = s || 1;
    const k = v => v * s;
    b.sph(k(0.3), body, 0, k(0.24), 0, { sx: 1.25, sy: 0.85, sz: 1 });
    b.sph(k(0.18), body, 0, k(0.55), k(0.16));
    b.cone(k(0.07), k(0.16), C.orange, 0, k(0.52), k(0.36), { rx: PI / 2 });
    b.sph(k(0.025), C.ink, k(0.08), k(0.6), k(0.3)).sph(k(0.025), C.ink, k(-0.08), k(0.6), k(0.3));
    b.sph(k(0.12), body, 0, k(0.32), k(-0.33), { sx: 1.3, sy: 0.7 });
  }

  // ---------- Prop catalogue ----------
  // key: name, theme ('w' workshop, 'p' pond), density (mass multiplier), walk (moving prop kind).
  const T = [];
  const def = (key, name, theme, build, o) => T.push(Object.assign({ key, name, theme, build, dens: 1, weight: 1 }, o || {}));

  // Tiny
  def('screw', 'Screw', 'wp', () => B().cyl(0.018, 0.018, 0.14, C.steel, 0, 0.07, 0, { seg: 8 }).cyl(0.045, 0.045, 0.025, C.steel, 0, 0.152, 0).geo(), { dens: 4, weight: 2 });
  def('nut', 'Hex nut', 'w', () => B().cyl(0.05, 0.05, 0.04, C.steel, 0, 0.02, 0, { seg: 6 }).geo(), { dens: 4 });
  ['red', 'duck', 'blue', 'green'].forEach((c, i) => def('lego' + i, 'LEGO brick', 'w', () => {
    const b = B().box(0.16, 0.096, 0.08, C[c], 0, 0.048, 0);
    [[-0.04, -0.0], [0.04, 0]].forEach(([x]) => b.cyl(0.024, 0.024, 0.02, C[c], x, 0.106, 0, { seg: 10 }));
    return b.geo();
  }, { weight: 0.6 }));
  def('coin', 'Coin', 'wp', () => B().cyl(0.1, 0.1, 0.02, C.gold, 0, 0.01, 0, { seg: 18 }).geo(), { dens: 5 });
  def('candy', 'Candy', 'w', () => B().sph(0.07, C.pink, 0, 0.07, 0).cone(0.05, 0.08, C.pink, 0.1, 0.07, 0, { rz: PI / 2 }).cone(0.05, 0.08, C.pink, -0.1, 0.07, 0, { rz: -PI / 2 }).geo());
  def('sdcard', 'SD card', 'w', () => B().box(0.15, 0.012, 0.11, C.blue, 0, 0.006, 0).geo());
  def('dice', 'Die', 'wp', () => B().box(0.16, 0.16, 0.16, C.white, 0, 0.08, 0).box(0.04, 0.005, 0.04, C.red, 0, 0.162, 0).geo());
  def('eraser', 'Eraser', 'w', () => B().box(0.25, 0.08, 0.12, C.pink, 0, 0.04, 0).box(0.12, 0.081, 0.121, C.sky, 0.07, 0.04, 0).geo(), { dens: 1.2 });
  def('pebble', 'Pebble', 'p', () => B().sph(0.1, 0x9a96a0, 0, 0.05, 0, { sx: 1.4, sy: 0.6, seg: 8, seg2: 6 }).geo(), { dens: 2.5, weight: 2 });
  def('crumb', 'Bread crumb', 'p', () => B().box(0.12, 0.08, 0.1, 0xd8b070, 0, 0.04, 0, { ry: 0.4 }).geo(), { dens: 0.4 });
  def('shell', 'Snail shell', 'p', () => B().sph(0.1, 0xe2b98a, 0, 0.09, 0, { sz: 0.7 }).tor(0.05, 0.02, 0xa8784a, 0, 0.09, 0.05).geo());

  // Small
  [['duck', 'Rubber duck'], ['pink', 'Pink rubber duck'], ['sky', 'Blue rubber duck']].forEach(([c, n], i) =>
    def('rduck' + i, n, i ? 'wp' : 'wp', () => { const b = B(); rubberDuck(b, C[c]); return b.geo(); }, { dens: 0.3, weight: i ? 0.5 : 1.4, quack: true }));
  def('servo', 'Servo motor', 'w', () => B().box(0.4, 0.2, 0.22, C.servo, 0, 0.11, 0).cyl(0.06, 0.06, 0.02, C.steel, 0.12, 0.22, 0).geo(), { dens: 2 });
  def('duckfoot', 'Microduck foot', 'w', () => B().box(0.31, 0.15, 0.5, C.duck, 0, 0.13, 0).box(0.33, 0.055, 0.54, C.lav, 0, 0.03, 0.01).sph(0.14, C.duck, 0, 0.13, 0.22, { sx: 1.05, sy: 0.55, sz: 0.7, seg: 8, seg2: 5 }).box(0.15, 0.13, 0.2, C.servo, 0, 0.27, -0.05).geo());
  def('battery', 'AA battery', 'wp', () => B().cyl(0.07, 0.07, 0.42, 0x2b2c30, 0, 0.07, 0, { rz: PI / 2 }).cyl(0.071, 0.071, 0.1, C.orange, 0.17, 0.07, 0, { rz: PI / 2 }).cyl(0.03, 0.03, 0.03, C.steel, 0.235, 0.07, 0, { rz: PI / 2 }).geo(), { dens: 2.5 });
  def('sock', 'Sock', 'w', () => B().cyl(0.11, 0.11, 0.5, C.white, 0, 0.11, 0, { rz: PI / 2 }).box(0.2, 0.18, 0.3, C.white, 0.22, 0.09, 0.08).cyl(0.112, 0.112, 0.08, C.red, -0.17, 0.11, 0, { rz: PI / 2 }).geo(), { dens: 0.3 });
  def('cookie', 'Cookie', 'w', () => { const b = B().cyl(0.32, 0.32, 0.08, 0xc48a4a, 0, 0.04, 0); [[0.1, 0.05], [-0.12, 0.1], [0.02, -0.15], [-0.05, -0.02]].forEach(([x, z]) => b.sph(0.04, 0x4a2a18, x, 0.08, z, { seg: 6, seg2: 4 })); return b.geo(); }, { dens: 0.6 });
  def('donut', 'Donut', 'wp', () => B().tor(0.26, 0.12, 0xd7a35f, 0, 0.12, 0, { rx: PI / 2 }).tor(0.26, 0.1, C.pink, 0, 0.16, 0, { rx: PI / 2, sz: 0.6 }).geo(), { dens: 0.5 });
  def('tape', 'Tape roll', 'w', () => B().tor(0.26, 0.09, 0x9fa4ab, 0, 0.09, 0, { rx: PI / 2, sz: 1.4 }).geo());
  def('pen', 'Pen', 'w', () => B().cyl(0.04, 0.04, 1.3, C.blue, 0, 0.04, 0, { rz: PI / 2, seg: 8 }).cone(0.04, 0.12, C.steel, 0.71, 0.04, 0, { rz: -PI / 2, seg: 8 }).geo());
  def('notes', 'Sticky notes', 'w', () => B().box(0.76, 0.15, 0.76, C.duck, 0, 0.075, 0).geo(), { dens: 0.6 });
  def('lilypad', 'Lily pad', 'p', () => B().cyl(0.6, 0.6, 0.03, C.leaf, 0, 0.015, 0, { seg: 16 }).sph(0.1, C.pink, 0.2, 0.06, 0.1, { seg: 8, seg2: 6 }).geo(), { dens: 0.2, weight: 1.6 });
  def('mushroom', 'Mushroom', 'p', () => B().cyl(0.08, 0.1, 0.3, C.white, 0, 0.15, 0).sph(0.25, C.red, 0, 0.28, 0, { half: true, sy: 0.7 }).sph(0.04, C.white, 0.1, 0.42, 0.05, { seg: 6, seg2: 4 }).geo(), { dens: 0.5 });
  def('candle', 'Candle', 'p', () => B().cyl(0.12, 0.12, 0.4, C.cream, 0, 0.2, 0).cone(0.04, 0.12, C.duck, 0, 0.47, 0).geo(), { dens: 0.9 });
  def('frog', 'Frog', 'p', () => B().sph(0.25, 0x6cc04a, 0, 0.18, 0, { sx: 1.1, sy: 0.7, sz: 1.3 }).sph(0.07, 0x6cc04a, 0.12, 0.33, 0.2).sph(0.07, 0x6cc04a, -0.12, 0.33, 0.2).sph(0.035, C.ink, 0.12, 0.36, 0.25).sph(0.035, C.ink, -0.12, 0.36, 0.25).geo(), { walk: 'hop', weight: 1.2 });
  def('cattail', 'Cattail', 'p', () => B().cyl(0.02, 0.02, 1.4, C.leaf, 0, 0.7, 0, { seg: 6 }).cyl(0.06, 0.06, 0.35, 0x6b4426, 0, 1.2, 0, { seg: 8 }).geo(), { dens: 0.3 });

  // Medium
  [[C.white, 'Mug'], [C.orange, 'Orange mug'], [C.lav, 'Lab mug']].forEach(([c, n], i) =>
    def('mug' + i, n, i === 1 ? 'w' : 'wp', () => B().cyl(0.42, 0.4, 0.95, c, 0, 0.475, 0, { seg: 18 }).cyl(0.36, 0.36, 0.02, 0x4a2a18, 0, 0.9, 0).tor(0.22, 0.06, c, 0.46, 0.5, 0, { arc: PI, rz: -PI / 2 }).geo(), { weight: i ? 0.6 : 1 }));
  def('duckhead', 'Microduck head', 'w', () => {
    const b = B().box(0.8, 0.46, 1.0, C.cream, 0, 0.42, 0).sph(0.5, C.cream, 0, 0.64, 0, { sx: 0.8, sy: 0.32, sz: 1.0, half: true, seg: 12, seg2: 5 });
    b.box(0.66, 0.38, 0.02, 0xd4d5d8, 0, 0.43, 0.505).tor(0.12, 0.05, 0xf5a623, -0.09, 0.43, 0.53, { seg: 14 }).sph(0.085, C.ink, -0.09, 0.43, 0.52, { sz: 0.45 }).box(0.06, 0.06, 0.02, C.dark, 0.14, 0.44, 0.52);
    return b.box(0.84, 0.09, 1.08, C.orange, 0, 0.15, 0.12).box(0.76, 0.07, 0.92, C.orange, 0, 0.05, 0.1).geo();
  }, { dens: 0.8 });
  [[C.cream, 0xf5a623, C.orange, 0xf39a1e, 0xe2551c], [0x5d6066, 0x8a6fd6, C.duck, C.duck, 0x8a6fd6], [C.lav, 0x6fd0e6, C.duck, C.duck, 0xa08ccc], [C.sky, C.white, 0xff8a3d, 0xff8a3d, 0x3f7fb3]].forEach((cw, i) =>
    def('mduck' + i, 'Microduck', 'wp', () => { const b = B(); miniDuck(b, cw[0], cw[1], cw[2], cw[3], 1, cw[4]); return b.geo(); }, { walk: 'waddle', weight: 1.5, quack: true, dens: 1.5 }));
  [[C.red, 'Red book'], [C.blue, 'Blue book'], [C.green, 'Green book']].forEach(([c, n], i) =>
    def('book' + i, n, 'w', () => B().box(1.6, 0.35, 2.2, c, 0, 0.175, 0).box(1.5, 0.3, 2.1, C.white, 0.06, 0.175, 0).geo(), { weight: 0.5 }));
  def('phone', 'Phone', 'w', () => B().box(0.75, 0.08, 1.5, C.ink, 0, 0.04, 0).box(0.66, 0.01, 1.36, 0x3a5a8a, 0, 0.085, 0).geo(), { dens: 2 });
  def('soda', 'Soda can', 'w', () => B().cyl(0.33, 0.33, 1.2, C.red, 0, 0.6, 0, { seg: 16 }).cyl(0.3, 0.33, 0.06, C.steel, 0, 1.22, 0).geo());
  def('cube', 'Puzzle cube', 'w', () => B().box(0.57, 0.19, 0.57, C.red, 0, 0.095, 0).box(0.57, 0.19, 0.57, C.white, 0, 0.285, 0).box(0.57, 0.19, 0.57, C.green, 0, 0.475, 0).geo());
  def('pot', 'Small plant', 'wp', () => B().cyl(0.4, 0.3, 0.6, C.terracotta, 0, 0.3, 0).sph(0.45, C.leaf, 0, 0.85, 0, { seg: 8, seg2: 6 }).geo());
  def('toycar', 'Toy car', 'w', () => B().box(0.6, 0.25, 1.1, C.red, 0, 0.22, 0).box(0.5, 0.22, 0.55, C.sky, 0, 0.44, -0.05).cyl(0.11, 0.11, 0.68, C.ink, 0, 0.11, 0.35, { rz: PI / 2 }).cyl(0.11, 0.11, 0.68, C.ink, 0, 0.11, -0.35, { rz: PI / 2 }).geo(), { dens: 1.3 });
  def('lantern', 'Lantern', 'p', () => B().box(0.5, 0.1, 0.5, C.ink, 0, 0.05, 0).box(0.4, 0.6, 0.4, 0xffd36b, 0, 0.4, 0).cone(0.4, 0.3, C.ink, 0, 0.85, 0, { seg: 4, ry: PI / 4 }).tor(0.1, 0.02, C.ink, 0, 1.05, 0).geo(), { glow: true, weight: 1.4 });
  def('bucket', 'Bucket', 'p', () => B().cyl(0.5, 0.38, 0.9, C.blue, 0, 0.45, 0).tor(0.48, 0.02, C.steel, 0, 0.95, 0, { arc: PI }).geo());
  def('boot', 'Rubber boot', 'p', () => B().box(0.45, 1.1, 0.5, 0x2f7a3a, 0, 0.55, 0).box(0.45, 0.35, 0.5, 0x2f7a3a, 0, 0.175, 0.4).geo());
  def('toyboat', 'Toy boat', 'p', () => B().box(0.6, 0.3, 1.4, C.red, 0, 0.15, 0).cyl(0.03, 0.03, 1.1, C.woodD, 0, 0.8, 0, { seg: 6 }).cone(0.45, 0.8, C.white, 0, 0.8, 0.15, { seg: 3, sz: 0.1 }).geo(), { dens: 0.5 });
  def('bobber', 'Fishing float', 'p', () => B().sph(0.25, C.red, 0, 0.35, 0, { half: true }).sph(0.25, C.white, 0, 0.35, 0, { half: true, rx: PI }).cyl(0.03, 0.03, 0.4, C.ink, 0, 0.75, 0, { seg: 6 }).geo(), { dens: 0.3 });

  // Large
  def('keyboard', 'Keyboard', 'w', () => {
    const b = B().box(4.4, 0.3, 1.5, C.ink, 0, 0.15, 0);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) b.box(0.28, 0.12, 0.28, r === 3 && c > 2 && c < 9 ? C.grey : C.dark, -1.9 + c * 0.345, 0.36, -0.5 + r * 0.33);
    return b.geo();
  }, { dens: 0.8 });
  def('duckbox', 'Boxed microduck', 'wp', () => B().box(2.6, 3, 2.6, C.card, 0, 1.5, 0).box(1.4, 1.4, 0.02, C.duck, 0, 1.6, 1.31).box(0.5, 0.25, 0.02, C.orange, 0, 1.3, 1.32).box(2.62, 0.3, 0.4, 0xd8c8a0, 0, 3.0, 0).geo(), { dens: 0.4 });
  def('cat', 'Cat', 'w', () => B().sph(1, 0xf0a050, 0, 1.2, 0, { sx: 0.9, sy: 0.8, sz: 1.6 }).sph(0.7, 0xf0a050, 0, 2.0, 1.4).cone(0.22, 0.45, 0xf0a050, 0.38, 2.6, 1.4).cone(0.22, 0.45, 0xf0a050, -0.38, 2.6, 1.4).sph(0.1, C.ink, 0.25, 2.1, 2.0).sph(0.1, C.ink, -0.25, 2.1, 2.0).cyl(0.15, 0.12, 1.8, 0xf0a050, 0, 1.6, -1.8, { rx: -0.6 }).box(0.3, 0.6, 0.3, 0xf0a050, 0.5, 0.3, 0.9).box(0.3, 0.6, 0.3, 0xf0a050, -0.5, 0.3, 0.9).box(0.3, 0.6, 0.3, 0xf0a050, 0.5, 0.3, -0.9).box(0.3, 0.6, 0.3, 0xf0a050, -0.5, 0.3, -0.9).geo(), { walk: 'waddle', weight: 0.8, meow: true });
  def('backpack', 'Backpack', 'w', () => B().box(2.6, 3.6, 1.4, C.blue, 0, 1.8, 0).sph(1.3, C.blue, 0, 3.6, 0, { half: true, sz: 0.54 }).box(1.8, 1.2, 0.4, 0x2d5f8a, 0, 1.2, 0.8).geo(), { dens: 0.4 });
  def('tcone', 'Traffic cone', 'w', () => B().box(3.4, 0.3, 3.4, C.orange, 0, 0.15, 0).cone(1.3, 6.6, C.orange, 0, 3.6, 0).cyl(0.88, 1.0, 0.8, C.white, 0, 3.2, 0).geo(), { dens: 0.3 });
  def('laptop', 'Laptop', 'w', () => B().box(3.3, 0.2, 2.3, 0x9aa0a8, 0, 0.1, 0).box(3.3, 2.2, 0.12, 0x9aa0a8, 0, 1.2, -1.15, { rx: -0.25 }).box(3.0, 1.9, 0.02, 0x2a3f5f, 0, 1.2, -1.07, { rx: -0.25 }).geo(), { dens: 1.5 });
  def('chair', 'Chair', 'w', () => {
    const b = B().box(4.5, 0.4, 4.5, C.wood, 0, 4.5, 0).box(4.5, 4.5, 0.35, C.wood, 0, 7, -2.1);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => b.box(0.35, 4.5, 0.35, C.woodD, x * 2, 2.25, z * 2));
    return b.geo();
  }, { dens: 0.5, clear: 4.3 });
  def('lamp', 'Desk lamp', 'w', () => B().cyl(1.2, 1.3, 0.3, C.ink, 0, 0.15, 0).cyl(0.12, 0.12, 4, C.steel, 0, 2.1, 0, { rz: 0.25 }).cone(1, 1.4, C.duck, 0.9, 4.2, 0, { rz: 2.2 }).geo(), { dens: 0.8 });
  def('bin', 'Trash bin', 'w', () => B().cyl(1.5, 1.3, 6, C.grey, 0, 3, 0, { seg: 16 }).cyl(1.6, 1.6, 0.3, C.dark, 0, 6.1, 0).geo(), { dens: 0.4 });
  def('bigplant', 'Potted plant', 'wp', () => B().cyl(1.6, 1.2, 3, C.terracotta, 0, 1.5, 0).sph(1.8, C.leaf, 0, 4.6, 0, { seg: 8, seg2: 6 }).sph(1.4, 0x4caf5a, 0.9, 6.4, 0.3, { seg: 8, seg2: 6 }).sph(1.2, C.leaf, -0.7, 7.6, -0.2, { seg: 8, seg2: 6 }).geo(), { dens: 0.6 });
  def('arm', 'Robot arm', 'w', () => B().cyl(1.4, 1.6, 1, C.dark, 0, 0.5, 0).box(0.8, 4, 0.8, C.orange, 0, 3, 0).cyl(0.6, 0.6, 1.2, C.servo, 0, 5, 0, { rz: PI / 2 }).box(0.7, 3.5, 0.7, C.orange, 1.2, 6.2, 0, { rz: -0.8 }).box(0.9, 0.5, 0.9, C.steel, 2.6, 7.4, 0).geo(), { dens: 1.5 });
  def('gnome', 'Garden gnome', 'p', () => B().cone(1.4, 3, C.blue, 0, 1.5, 0).sph(0.8, 0xf2c9a0, 0, 3.4, 0).cone(0.9, 2.2, C.red, 0, 4.9, 0).cone(0.7, 1.4, C.white, 0, 2.9, 0.5, { rx: PI }).geo(), { dens: 0.9 });
  def('campfire', 'Campfire', 'p', () => {
    const b = B();
    for (let i = 0; i < 5; i++) b.cyl(0.3, 0.3, 4, C.woodD, Math.cos(i * 1.26) * 0.8, 0.5, Math.sin(i * 1.26) * 0.8, { rz: PI / 2 - 0.3, ry: i * 1.26 });
    return b.cone(1.2, 2.6, C.orange, 0, 1.6, 0).cone(0.7, 1.8, C.duck, 0, 1.6, 0).geo();
  }, { glow: true, dens: 0.5 });
  def('buoy', 'Buoy', 'p', () => B().cyl(1.4, 1.6, 2, C.red, 0, 1, 0).cyl(1.0, 1.4, 2, C.white, 0, 3, 0).cyl(0.2, 0.2, 2, C.ink, 0, 5, 0).sph(0.4, C.duck, 0, 6.2, 0).geo(), { glow: true, dens: 0.5 });

  // Huge
  def('desk', 'Desk', 'w', () => {
    const b = B().box(14, 0.5, 7, C.cream, 0, 7.2, 0);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => b.box(0.5, 7, 0.5, C.dark, x * 6.5, 3.5, z * 3));
    return b.box(4, 3, 6, C.cream, 4.5, 5.2, 0).geo();
  }, { dens: 0.4, clear: 3.6 });
  def('sofa', 'Sofa', 'w', () => B().box(20, 4, 8, 0x6a5acd, 0, 2.5, 0).box(20, 6, 2.5, 0x6a5acd, 0, 6, -2.8).box(2.5, 5, 8, 0x5a4abd, 10, 3.5, 0).box(2.5, 5, 8, 0x5a4abd, -10, 3.5, 0).geo(), { dens: 0.25 });
  def('fridge', 'Fridge', 'w', () => B().box(7, 18, 7, C.white, 0, 9, 0).box(0.3, 4, 0.4, C.steel, 2.8, 12, 3.6).box(0.3, 3, 0.4, C.steel, 2.8, 5, 3.6).box(7.02, 0.1, 7.02, C.grey, 0, 8, 0).geo(), { dens: 0.5 });
  def('vending', 'Duck vending machine', 'w', () => {
    const b = B().box(9, 18, 7, C.red, 0, 9, 0).box(6, 11, 0.2, 0x1d2a3a, -0.8, 11, 3.5);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) b.box(0.9, 0.9, 0.3, C.duck, -3 + c * 1.45, 7 + r * 2.4, 3.55);
    return b.geo();
  }, { dens: 0.6 });
  def('bike', 'Bicycle', 'w', () => B().tor(3.3, 0.25, C.ink, 5.5, 3.5, 0, { ry: PI / 2 }).tor(3.3, 0.25, C.ink, -5.5, 3.5, 0, { ry: PI / 2 }).box(10, 0.4, 0.4, C.sky, 0, 5, 0, { rz: 0.15 }).box(0.4, 4, 0.4, C.sky, -1, 5.5, 0).box(2.5, 0.5, 1, C.ink, -1, 7.6, 0).box(0.4, 0.4, 4, C.ink, 4.5, 8, 0).geo(), { dens: 0.2 });
  def('bigduck', 'Inflatable duck', 'wp', () => { const b = B(); rubberDuck(b, C.duck, 18); return b.geo(); }, { dens: 0.04, quack: true });
  def('rack', 'Server rack', 'w', () => {
    const b = B().box(7, 20, 9, C.ink, 0, 10, 0);
    for (let r = 0; r < 9; r++) b.box(6, 1.6, 0.2, C.dark, 0, 2 + r * 2, 4.5).box(0.25, 0.25, 0.2, r % 3 ? C.green : C.orange, 2.4, 2 + r * 2, 4.65);
    return b.geo();
  }, { dens: 0.8 });
  def('car', 'Car', 'w', () => {
    const b = B().box(17, 6, 40, C.sky, 0, 5, 0).box(15, 6, 20, 0x6fa8d6, 0, 10.5, -2).box(15.2, 4.5, 18, 0x22313f, 0, 10.6, -2);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => b.cyl(3.4, 3.4, 2.4, C.ink, x * 8, 3.4, z * 13, { rz: PI / 2 }));
    return b.box(4, 1.2, 0.3, C.duck, 5, 5, 20).box(4, 1.2, 0.3, C.duck, -5, 5, 20).geo();
  }, { walk: 'drive', dens: 0.25 });
  def('tree', 'Tree', 'wp', () => B().cyl(1.4, 2, 18, C.woodD, 0, 9, 0).sph(10, C.leaf, 0, 24, 0, { seg: 9, seg2: 7 }).sph(7, 0x4caf5a, 5, 30, 2, { seg: 8, seg2: 6 }).sph(6, C.leaf, -5, 31, -2, { seg: 8, seg2: 6 }).geo(), { dens: 0.12, hit: [2, 2] });
  def('bench', 'Bench', 'wp', () => B().box(18, 0.8, 5, C.wood, 0, 5, 0).box(18, 4, 0.6, C.wood, 0, 8, -2.4).box(0.8, 5, 5, C.ink, 7.5, 2.5, 0).box(0.8, 5, 5, C.ink, -7.5, 2.5, 0).geo(), { dens: 0.35, clear: 4.4 });
  def('streetlamp', 'Street lamp', 'wp', () => B().cyl(0.6, 0.9, 40, C.ink, 0, 20, 0).box(6, 0.8, 1.6, C.ink, 2.6, 40, 0).box(4, 0.4, 1.4, 0xffe9a0, 3.2, 39.5, 0).geo(), { glow: true, dens: 0.15, hit: [0.9, 0.9] });
  def('shed', 'Shed', 'w', () => B().box(26, 18, 20, 0xb36a45, 0, 9, 0).cone(20, 9, 0x5d3a2a, 0, 22.5, 0, { seg: 4, ry: PI / 4, sx: 0.95, sz: 0.75 }).box(6, 12, 0.4, 0x6b3f2a, 0, 6, 10).geo(), { dens: 0.18 });
  def('house', 'House', 'wp', () => B().box(60, 36, 46, C.cream, 0, 18, 0).cone(47, 24, C.red, 0, 48, 0, { seg: 4, ry: PI / 4, sx: 1, sz: 0.75 }).box(9, 18, 0.6, C.woodD, -10, 9, 23).box(10, 9, 0.6, C.sky, 14, 22, 23).box(10, 9, 0.6, C.sky, -14, 26, 23).box(4, 12, 4, C.terracotta, 15, 58, -6).geo(), { dens: 0.12 });
  def('rowboat', 'Rowboat', 'p', () => B().box(14, 5, 38, C.wood, 0, 2.5, 0).cone(7, 10, C.wood, 0, 2.5, 23.5, { rx: PI / 2, seg: 4, ry: PI / 4, sy: 0.7 }).box(12, 0.6, 3, C.woodD, 0, 4.5, 4).geo(), { dens: 0.2 });
  def('willow', 'Willow tree', 'p', () => B().cyl(1.6, 2.4, 22, C.woodD, 0, 11, 0).cone(14, 26, 0x6aa84f, 0, 23, 0, { seg: 10 }).sph(8, 0x7cbf5f, 0, 34, 0, { seg: 8, seg2: 6 }).geo(), { dens: 0.12, hit: [2.4, 2.4] });
  def('dock', 'Dock', 'p', () => { const b = B(); for (let i = 0; i < 8; i++) b.box(4, 1, 30, i % 2 ? C.wood : 0xa06e3e, -14 + i * 4, 4, 0); [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => b.cyl(1, 1, 5, C.woodD, x * 15, 2.5, z * 13)); return b.geo(); }, { dens: 0.2 });
  def('tent', 'Tent', 'p', () => B().cone(14, 16, C.orange, 0, 8, 0, { seg: 4, ry: PI / 4 }).box(5, 8, 0.4, 0x8a3a10, 0, 4, 9.5).geo(), { dens: 0.08 });

  // Late game: things only a 50 m ball can take on.
  def('watertower', 'Water tower', 'wp', () => { const b = B(); [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => b.box(2, 60, 2, C.grey, x * 14, 30, z * 14)); return b.cyl(24, 24, 30, C.sky, 0, 75, 0, { seg: 18 }).cone(26, 14, C.blue, 0, 97, 0, { seg: 18 }).box(30, 8, 0.6, C.duck, 0, 75, 24).geo(); }, { dens: 0.08, hit: [16, 16] });
  def('apartments', 'Apartment block', 'wp', () => { const b = B().box(90, 140, 70, 0xd9c8b0, 0, 70, 0); for (let f = 0; f < 9; f++) for (let w = 0; w < 6; w++) b.box(9, 9, 0.6, f % 3 === 1 && w === 2 ? C.duck : 0x5a7a9a, -36 + w * 14.4, 14 + f * 14, 35.2); return b.box(94, 4, 74, C.ink, 0, 141, 0).geo(); }, { dens: 0.1 });
  def('office', 'Office tower', 'w', () => { const b = B().box(70, 260, 70, 0x6f8fae, 0, 130, 0); for (let f = 0; f < 20; f++) b.box(70.6, 1.5, 70.6, 0xd8e4ee, 0, 10 + f * 12.5, 0); return b.box(24, 30, 24, C.ink, 0, 275, 0).cyl(1, 1, 30, C.red, 0, 305, 0, { seg: 6 }).geo(); }, { dens: 0.08 });
  def('lighthouse', 'Lighthouse', 'p', () => B().cyl(18, 26, 150, C.white, 0, 75, 0).cyl(18.5, 22.5, 20, C.red, 0, 50, 0).cyl(18.2, 19.5, 20, C.red, 0, 110, 0).cyl(14, 14, 18, 0xffe9a0, 0, 159, 0).cone(18, 18, C.red, 0, 177, 0).geo(), { glow: true, dens: 0.1, hit: [20, 20] });
  def('ferris', 'Ferris wheel', 'p', () => { const b = B().tor(70, 3, C.lav, 0, 85, 0, { seg: 28 }).box(6, 90, 6, C.ink, 30, 42, 0, { rz: 0.35 }).box(6, 90, 6, C.ink, -30, 42, 0, { rz: -0.35 }); for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; b.box(10, 10, 10, [C.duck, C.pink, C.sky][i % 3], Math.cos(a) * 70, 85 + Math.sin(a) * 70, 0); } return b.geo(); }, { glow: true, dens: 0.05, hit: [40, 8] });

  // ---------- Smart home and robot lab ----------
  // Shapes are modelled on real gadgets and robots (no logos, generic names). Units: 1 = 10 cm.
  const NV = 0x76b900, WH = 0xf4f4f2, BK = 0x16171a, SV = 0xc8ccd2, GOLD = 0xc9a227, GOLDD = 0x9c7a14;
  // Home devices
  def('battery9', '9V battery', 'w', () => B().box(0.26, 0.48, 0.17, BK, 0, 0.24, 0).box(0.262, 0.16, 0.172, C.orange, 0, 0.4, 0).cyl(0.04, 0.04, 0.05, SV, -0.06, 0.505, 0, { seg: 8 }).cyl(0.05, 0.05, 0.05, SV, 0.06, 0.505, 0, { seg: 6 }).geo(), { dens: 2.5 });
  def('socket', 'Wall socket', 'w', () => B().box(0.86, 0.86, 0.14, WH, 0, 0.53, 0).cyl(0.3, 0.3, 0.06, 0xe2e2de, 0, 0.53, 0.08, { rx: PI / 2, seg: 20 }).cyl(0.045, 0.045, 0.08, BK, -0.1, 0.53, 0.1, { rx: PI / 2, seg: 8 }).cyl(0.045, 0.045, 0.08, BK, 0.1, 0.53, 0.1, { rx: PI / 2, seg: 8 }).box(0.06, 0.12, 0.04, SV, 0, 0.78, 0.1).box(0.06, 0.12, 0.04, SV, 0, 0.28, 0.1).box(0.7, 0.1, 0.45, WH, 0, 0.05, 0).geo());
  def('plug', 'Power plug', 'w', () => B().cyl(0.18, 0.22, 0.36, WH, 0, 0.18, 0).cyl(0.022, 0.022, 0.2, SV, -0.09, 0.46, 0, { seg: 6 }).cyl(0.022, 0.022, 0.2, SV, 0.09, 0.46, 0, { seg: 6 }).tor(0.28, 0.035, WH, 0.32, 0.04, 0, { rx: PI / 2 }).geo());
  def('charger', 'Phone charger', 'w', () => B().box(0.45, 0.45, 0.45, WH, 0, 0.225, 0).box(0.14, 0.05, 0.02, BK, 0, 0.3, 0.226).tor(0.3, 0.03, WH, 0.58, 0.03, 0, { rx: PI / 2 }).geo());
  def('bulb', 'Smart bulb', 'w', () => B().cyl(0.11, 0.11, 0.24, SV, 0, 0.12, 0, { seg: 12 }).tor(0.112, 0.016, 0x9aa0a8, 0, 0.06, 0, { rx: PI / 2 }).tor(0.112, 0.016, 0x9aa0a8, 0, 0.15, 0, { rx: PI / 2 }).cyl(0.2, 0.12, 0.18, WH, 0, 0.33, 0).sph(0.3, 0xfff3c8, 0, 0.62, 0).geo(), { glow: true });
  def('earbuds', 'AirPods case', 'w', () => B().sph(0.3, WH, 0, 0.2, 0, { sy: 0.7, sz: 0.55 }).box(0.6, 0.01, 0.34, 0xd6d6d6, 0, 0.26, 0).box(0.06, 0.04, 0.01, 0x2bd66f, 0, 0.18, 0.168).geo());
  def('pad', 'Xbox controller', 'w', () => {
    const G = 0x2b2d33, b = B().box(0.95, 0.22, 0.48, G, 0, 0.15, 0.03);
    [1, -1].forEach(s => b.sph(0.27, G, 0.42 * s, 0.14, -0.17, { sx: 0.95, sy: 0.6, sz: 1.4, seg: 12, seg2: 8 }));
    // Offset sticks: left stick high, d-pad and right stick low; Y/B/A/X in their colours; the white home button.
    b.cyl(0.075, 0.075, 0.1, 0x16171a, -0.3, 0.3, 0.08, { seg: 12 }).cyl(0.085, 0.085, 0.02, 0x3a3d42, -0.3, 0.36, 0.08, { seg: 12 });
    b.cyl(0.075, 0.075, 0.1, 0x16171a, 0.14, 0.3, -0.1, { seg: 12 }).cyl(0.085, 0.085, 0.02, 0x3a3d42, 0.14, 0.36, -0.1, { seg: 12 });
    b.box(0.05, 0.03, 0.15, 0x16171a, -0.14, 0.27, -0.1).box(0.15, 0.03, 0.05, 0x16171a, -0.14, 0.27, -0.1);
    [[0.33, 0.14, C.duck], [0.4, 0.07, C.red], [0.26, 0.07, C.blue], [0.33, 0.0, C.green]].forEach(([x, z, c]) => b.sph(0.04, c, x, 0.27, z, { seg: 8, seg2: 6 }));
    b.cyl(0.06, 0.06, 0.02, WH, 0, 0.27, 0.16, { seg: 12 });
    return b.box(0.26, 0.1, 0.1, G, 0.34, 0.18, 0.29).box(0.26, 0.1, 0.1, G, -0.34, 0.18, 0.29).geo();
  }, { glow: true });
  def('remote', 'TV remote', 'w', () => { const b = B().box(0.4, 0.12, 1.6, 0x222326, 0, 0.06, 0).cyl(0.06, 0.06, 0.02, C.red, 0, 0.13, 0.62); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) b.box(0.08, 0.02, 0.08, 0x5a5c62, -0.1 + j * 0.1, 0.13, -0.1 - i * 0.14); return b.geo(); });
  def('dot', 'Echo Dot', 'w', () => B().sph(0.5, 0x3c3f46, 0, 0.5, 0, { seg: 16 }).tor(0.36, 0.04, 0x2ec7ff, 0, 0.12, 0, { rx: PI / 2 }).geo(), { glow: true });
  def('strip', 'Power strip', 'w', () => { const b = B().box(2.7, 0.35, 0.55, WH, 0, 0.175, 0); for (let i = 0; i < 5; i++) { const x = -1.0 + i * 0.45; b.cyl(0.18, 0.18, 0.03, 0xe2e2de, x, 0.36, 0, { seg: 16 }).cyl(0.035, 0.035, 0.04, BK, x - 0.07, 0.37, 0, { seg: 6 }).cyl(0.035, 0.035, 0.04, BK, x + 0.07, 0.37, 0, { seg: 6 }); } b.box(0.22, 0.1, 0.3, C.red, 1.2, 0.39, 0); b.cyl(0.04, 0.04, 0.8, WH, 1.75, 0.15, 0, { rz: PI / 2, seg: 6 }); return b.geo(); }, { dens: 0.8 });
  def('router', 'Wi-Fi router', 'w', () => { const b = B().box(1.6, 0.3, 1.1, 0x1f2024, 0, 0.15, 0).box(1.5, 0.02, 1.0, 0x2b2d31, 0, 0.31, 0); for (let i = 0; i < 4; i++) b.seg([-0.6 + i * 0.4, 0.25, -0.5], [-0.75 + i * 0.5, 1.75, -0.75], 0.09, 0.09, 0x1f2024, { round: true }); for (let i = 0; i < 5; i++) b.box(0.05, 0.03, 0.02, 0x5bd66f, -0.4 + i * 0.2, 0.2, 0.551); return b.geo(); }, { glow: true });
  def('speaker', 'Echo speaker', 'w', () => B().cyl(0.5, 0.5, 1.5, 0x3a3d44, 0, 0.75, 0, { seg: 20 }).cyl(0.5, 0.5, 0.06, 0x22252a, 0, 1.52, 0, { seg: 20 }).tor(0.42, 0.04, 0x2ec7ff, 0, 1.56, 0, { rx: PI / 2, seg: 24 }).geo(), { glow: true });

  // Robot vacuums: a flat disc with the laser turret on top and a bumper round the front.
  const vacuum = (body, top) => () => B().cyl(1.75, 1.75, 0.85, body, 0, 0.45, 0, { seg: 28 }).cyl(1.62, 1.62, 0.03, top, 0, 0.88, 0, { seg: 28 }).cyl(0.48, 0.48, 0.38, top, 0, 1.07, 0.55, { seg: 20 }).cyl(0.5, 0.5, 0.04, 0x2a2c30, 0, 1.27, 0.55, { seg: 20 }).box(0.5, 0.05, 0.18, 0x8a8d93, 0, 0.91, -0.6).tor(1.76, 0.13, 0x2a2c30, 0, 0.42, 0, { rx: PI / 2, arc: PI, seg: 24 }).sph(0.07, 0x5bd66f, 0.3, 0.91, -0.6, { seg: 6, seg2: 4 }).geo();
  def('vacuumW', 'Robot vacuum', 'w', vacuum(WH, 0xe6e7ea), { dens: 1.2 });
  def('vacuumB', 'Robot vacuum (black)', 'w', vacuum(0x1d1e22, 0x2c2e33), { dens: 1.2 });

  // Robot dogs. Knees bend backwards on all four legs.
  function legs(b, hips, L1, L2, a, upW, loW, upC, loC, footR, footC, hubC) {
    hips.forEach(([x, y, z]) => {
      const kz = z - L1 * Math.sin(a), ky = y - L1 * Math.cos(a);
      const sb = Math.min(0.95, (L1 * Math.sin(a)) / L2), cb = Math.sqrt(1 - sb * sb);
      const fz = kz + L2 * sb, fy = Math.max(footR, ky - L2 * cb);
      b.seg([x, y, z], [x, ky, kz], upW, upW * 1.2, upC);
      b.seg([x, ky, kz], [x, fy, fz], loW, loW, loC, { round: true });
      b.sph(footR, footC, x, footR, fz, { seg: 8, seg2: 6 });
      if (hubC != null) { b.cyl(upW * 0.75, upW * 0.75, upW * 1.4, hubC, x, y, z, { rz: PI / 2, seg: 12 }); b.cyl(loW * 0.9, loW * 0.9, upW * 1.2, hubC, x, ky, kz, { rz: PI / 2, seg: 10 }); }
    });
  }
  def('spot', 'Spot', 'wp', () => {
    const Y = 0xf2c200, b = B();
    b.box(3.4, 1.8, 8.6, 0x1b1c1f, 0, 6.2, 0);                         // body
    b.box(3.5, 0.55, 7.6, Y, 0, 7.35, 0);                               // yellow top shell
    b.box(0.2, 1.4, 6.8, Y, 1.8, 6.4, 0).box(0.2, 1.4, 6.8, Y, -1.8, 6.4, 0); // yellow side panels
    b.box(3.0, 1.7, 1.2, 0x1b1c1f, 0, 6.3, 4.6, { rx: -0.25 });          // front sensor head
    b.box(0.5, 0.35, 0.1, 0x6a6e75, -0.7, 6.5, 5.25, { rx: -0.25 }).box(0.5, 0.35, 0.1, 0x6a6e75, 0.7, 6.5, 5.25, { rx: -0.25 });
    b.box(3.0, 1.6, 1.0, 0x1b1c1f, 0, 6.3, -4.6, { rx: 0.25 });          // rear block
    legs(b, [[2.0, 5.7, 3.3], [-2.0, 5.7, 3.3], [2.0, 5.7, -3.3], [-2.0, 5.7, -3.3]], 3.2, 3.5, 0.55, 0.9, 0.45, Y, 0x1b1c1f, 0.38, 0x111214, 0x1b1c1f);
    return b.geo();
  }, { dens: 1.4 });
  def('go2', 'Unitree Go2', 'wp', () => {
    const G = 0x3a3d42, b = B();
    b.box(2.4, 1.3, 5.4, G, 0, 3.1, 0).box(2.2, 0.25, 4.6, 0x4c5057, 0, 3.85, -0.2);
    b.box(1.8, 1.1, 1.1, G, 0, 3.15, 3.0).box(1.5, 0.6, 0.1, 0x101114, 0, 3.25, 3.56);
    b.box(0.5, 0.08, 0.05, 0xeaeaea, -0.45, 3.45, 3.6).box(0.5, 0.08, 0.05, 0xeaeaea, 0.45, 3.45, 3.6);
    b.cyl(0.45, 0.45, 0.35, 0x111214, 0, 2.45, 3.1, { seg: 16 });       // lidar under the chin
    legs(b, [[1.45, 2.8, 2.0], [-1.45, 2.8, 2.0], [1.45, 2.8, -2.0], [-1.45, 2.8, -2.0]], 1.9, 2.0, 0.6, 0.55, 0.28, 0x4c5057, 0x16171a, 0.24, 0x111214, 0xb0b5bc);
    return b.geo();
  }, { dens: 1.4 });

  // Humanoid robots: one skeleton, four looks.
  function humanoid(b, k) {
    const sh = k.shell, jt = k.joint;
    [1, -1].forEach(s => {
      const x = 0.85 * s;
      b.box(0.95, 0.45, 2.2, k.foot || jt, x, 0.23, 0.35);
      b.seg([x, 0.6, 0], [x, 4.8, 0.08], 1.1, 1.1, k.shin || sh, { round: true, w2: 0.72, seg: 12 });
      b.sph(0.55, jt, x, 4.85, 0.1, { seg: 10, seg2: 8 });
      b.seg([x, 4.9, 0.08], [x * 1.05, 8.7, 0], 1.5, 1.5, k.thigh || sh, { round: true, w2: 1.0, seg: 12 });
      b.sph(0.6, jt, 1.85 * s, 13.9, 0, { seg: 10, seg2: 8 });
      b.seg([1.95 * s, 13.7, 0], [2.15 * s, 11.0, 0.12], 0.62, 0.62, sh, { round: true, w2: 0.78, seg: 10 });
      b.sph(0.4, jt, 2.15 * s, 11.0, 0.12, { seg: 8, seg2: 6 });
      b.seg([2.15 * s, 11.0, 0.12], [2.25 * s, 8.8, 0.3], 0.5, 0.5, k.fore || sh, { round: true, w2: 0.6, seg: 10 });
      b.box(0.36, 0.9, 0.6, jt, 2.27 * s, 8.3, 0.33);
    });
    b.sph(1, jt, 0, 9.0, 0, { sx: 1.35, sy: 0.75, sz: 0.85 });           // pelvis
    b.cyl(0.85, 0.95, 1.4, k.waist || jt, 0, 10.2, 0, { seg: 14 });      // waist
    // Chest: a tapered torso (wide shoulders, narrower ribs) with a rounded front plate.
    b.cyl(1.55, 1.05, 3.4, sh, 0, 12.4, 0, { seg: 16, sz: 0.62 });
    b.sph(1, sh, 0, 13.9, 0, { sx: 1.55, sy: 0.5, sz: 0.62, seg: 14, seg2: 8 });
    if (k.chest) b.sph(1, k.chest, 0, 12.7, 0.35, { sx: 1.05, sy: 1.2, sz: 0.45, seg: 14, seg2: 10 });
    b.cyl(0.36, 0.42, 0.9, jt, 0, 14.6, 0, { seg: 10 });                // neck
    k.head(b);
  }
  def('optimus', 'Tesla Optimus', 'wp', () => { const b = B(); humanoid(b, { shell: 0xf1f1ef, joint: 0x15161a, waist: 0x15161a, chest: 0xf7f7f5, head: b => { b.sph(1.25, 0xf1f1ef, 0, 16.2, -0.05, { sx: 0.88, sy: 1.0, sz: 1.0 }); b.sph(1.1, 0x08090b, 0, 16.1, 0.5, { sx: 0.86, sy: 0.82, sz: 0.72 }); } }); return b.geo(); });
  def('figure', 'Figure 02', 'wp', () => { const b = B(); humanoid(b, { shell: 0x34363b, joint: 0x1b1c1f, thigh: 0x3d4045, chest: 0x2a2c30, head: b => { b.sph(1.2, 0x34363b, 0, 16.2, 0, { sx: 0.9, sy: 1.05, sz: 1.0 }); b.sph(1.0, 0x07080a, 0, 16.15, 0.5, { sx: 0.85, sy: 0.85, sz: 0.55 }); b.box(0.9, 0.07, 0.05, 0xdfe6ff, 0, 16.35, 1.06); } }); return b.geo(); });
  def('atlas', 'Atlas', 'wp', () => { const b = B(); humanoid(b, { shell: 0xd8dbde, joint: 0x3a3d42, foot: 0x2a2c30, head: b => { b.cyl(1.25, 1.25, 0.6, 0x3a3d42, 0, 16.3, 0.1, { rx: PI / 2, seg: 24 }); b.tor(1.02, 0.15, 0xffffff, 0, 16.3, 0.43, { seg: 28 }); b.cyl(0.84, 0.84, 0.06, 0x0c0d10, 0, 16.3, 0.41, { rx: PI / 2, seg: 20 }); } }); return b.geo(); }, { glow: true });
  def('h1', 'Unitree H1', 'wp', () => { const b = B(); humanoid(b, { shell: 0x1b1c1f, joint: 0x2a2c30, thigh: 0x9ea3aa, fore: 0x9ea3aa, head: b => { b.sph(1.15, 0x1b1c1f, 0, 16.2, 0, { sy: 1.05 }); b.cyl(0.6, 0.6, 0.55, 0x5a5e66, 0, 17.5, 0, { seg: 16 }); b.box(1.3, 0.28, 0.1, 0x3fa9ff, 0, 16.3, 1.1); } }); return b.geo(); }, { glow: true });

  // GPUs and AI machines. The gold "metal foam" fronts are bumpy gold plates.
  def('gpu', 'RTX graphics card', 'w', () => {
    const b = B().box(3.1, 1.25, 0.5, 0x1b1c20, 0, 0.72, 0).box(3.12, 0.12, 0.52, 0x9aa0a8, 0, 1.3, 0).box(3.1, 1.2, 0.04, 0x3a3d42, 0, 0.72, -0.27);
    [-1.0, 0, 1.0].forEach(x => {
      b.cyl(0.47, 0.47, 0.04, 0x0e0f11, x, 0.72, 0.27, { rx: PI / 2, seg: 20 }).tor(0.47, 0.03, 0x9aa0a8, x, 0.72, 0.29, { seg: 20 });
      for (let k = 0; k < 7; k++) b.box(0.08, 0.36, 0.02, 0x30333a, x + Math.cos(k * 0.9) * 0.22, 0.72 + Math.sin(k * 0.9) * 0.22, 0.3, { rz: k * 0.9 + 0.5 });
      b.cyl(0.13, 0.13, 0.05, 0x9aa0a8, x, 0.72, 0.31, { rx: PI / 2, seg: 12 });
    });
    return b.box(0.06, 1.5, 0.62, 0xc0c4ca, -1.6, 0.75, 0).box(2.0, 0.08, 0.06, 0xd4a63a, 0.1, 0.06, 0).box(2.8, 0.05, 0.02, NV, 0, 1.2, 0.27).box(0.3, 0.14, 0.22, 0x111111, 1.1, 1.4, 0).geo();
  }, { dens: 2 });
  // Dense bumpy gold "metal foam": a jittered grid of little bumps, some darker (the holes).
  const hsh = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
  const foam = (b, w, h, x0, y0, z, step) => { for (let i = 0; i * step <= w; i++) for (let j = 0; j * step <= h; j++) { const r = hsh(i, j); b.sph(step * (0.38 + r * 0.3), r < 0.35 ? 0x6e5410 : r < 0.7 ? GOLDD : 0xe0bb45, x0 + i * step + (hsh(j, i) - 0.5) * step * 0.6, y0 + j * step + (r - 0.5) * step * 0.6, z, { seg: 5, seg2: 3, sz: 0.45 }); } };
  def('dgxstation', 'DGX Station', 'w', () => {
    // A deskside tower: black chassis, gold metal-foam front, a carry bar on top, small feet.
    const b = B().box(2.6, 6.4, 5.2, 0x1a1b1e, 0, 3.4, 0).box(2.5, 6.2, 0.12, GOLD, 0, 3.4, 2.62);
    foam(b, 2.2, 5.6, -1.1, 0.7, 2.69, 0.32);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => b.box(0.4, 0.2, 0.5, 0x111214, 1.0 * x, 0.1, 2.1 * z));
    return b.box(2.2, 0.2, 0.3, 0x2a2b2f, 0, 6.75, 2.2).box(2.2, 0.2, 0.3, 0x2a2b2f, 0, 6.75, -2.2).box(2.2, 0.15, 4.7, 0x2a2b2f, 0, 6.9, 0).box(0.6, 0.08, 0.02, NV, 0, 6.3, 2.72).geo();
  }, { dens: 1.2 });
  def('dgxserver', 'DGX H100', 'w', () => { const b = B().box(4.8, 3.5, 8, 0x1a1b1e, 0, 1.75, 0).box(4.6, 3.2, 0.12, GOLD, 0, 1.75, 4.02); foam(b, 4.2, 2.9, -2.1, 0.3, 4.09, 0.34); return b.box(0.8, 0.1, 0.02, NV, -1.7, 3.25, 4.12).geo(); }, { dens: 1.2 });
  def('superpod', 'DGX SuperPOD rack', 'w', () => {
    const b = B().box(6, 20, 10, 0x111214, 0, 10, 0).box(6.2, 0.4, 10.2, 0x2a2b2f, 0, 20.1, 0);
    for (let k = 0; k < 5; k++) { const y = 1.6 + k * 3.6; b.box(5.4, 3.0, 0.15, GOLD, 0, y + 1.2, 5.0); foam(b, 4.6, 2.4, -2.3, y + 0.1, 5.1, 0.45); b.box(5.4, 0.5, 0.15, 0x23252a, 0, y + 2.95, 5.0); for (let j = 0; j < 8; j++) b.box(0.15, 0.12, 0.05, NV, -2.2 + j * 0.6, y + 2.95, 5.1); }
    return b.geo();
  }, { dens: 1.5 });

  // ---------- More tech: computer bits, screens, cameras, drones, delivery and service robots ----------
  def('mouse', 'Computer mouse', 'w', () => B().sph(0.3, 0x2a2c31, 0, 0.12, 0, { sx: 0.62, sy: 0.42, sz: 1 }).box(0.02, 0.06, 0.3, 0x16171a, 0, 0.24, 0.14).cyl(0.04, 0.04, 0.08, 0x8a8d93, 0, 0.25, 0.12, { rz: PI / 2, seg: 8 }).box(0.05, 0.02, 0.05, 0x3fa9ff, 0, 0.2, -0.26).geo(), { glow: true });
  def('chip', 'AI chip', 'w', () => { const b = B().box(1.0, 0.06, 1.0, 0x1f6b3a, 0, 0.03, 0).box(0.62, 0.08, 0.62, 0xc4c8ce, 0, 0.1, 0).box(0.34, 0.02, 0.34, 0x8a8d93, 0, 0.15, 0).box(0.16, 0.022, 0.05, NV, 0, 0.16, 0.2); for (let i = 0; i < 8; i++) b.box(0.04, 0.02, 0.08, 0xd4a63a, -0.42 + i * 0.12, 0.065, 0.47).box(0.04, 0.02, 0.08, 0xd4a63a, -0.42 + i * 0.12, 0.065, -0.47); return b.geo(); }, { dens: 3 });
  def('rpi', 'Raspberry Pi 5', 'w', () => {
    const b = B().box(0.85, 0.04, 0.56, 0x1f7a3a, 0, 0.02, 0);
    b.box(0.2, 0.035, 0.2, SV, -0.08, 0.057, -0.02).box(0.09, 0.03, 0.09, BK, 0.14, 0.055, 0.02).box(0.11, 0.025, 0.06, BK, -0.08, 0.052, 0.17); // SoC lid, RP1, RAM
    [-0.17, 0.0].forEach(z => b.box(0.17, 0.16, 0.14, SV, 0.36, 0.12, z).box(0.02, 0.05, 0.1, z ? 0x2f6fd6 : BK, 0.445, 0.12, z)); // USB 3 (blue) and USB 2
    b.box(0.19, 0.14, 0.17, SV, 0.36, 0.11, 0.18);                                                        // Ethernet
    b.box(0.52, 0.09, 0.055, BK, -0.1, 0.085, -0.245).box(0.5, 0.02, 0.035, 0xd4a63a, -0.1, 0.14, -0.245);  // 40-pin header
    [-0.32, -0.2, -0.08].forEach((x, i) => b.box(i ? 0.07 : 0.09, 0.035, 0.07, SV, x, 0.057, 0.25));        // USB-C, 2x micro HDMI
    b.box(0.05, 0.04, 0.16, 0xe6e7ea, -0.4, 0.06, 0.02).box(0.08, 0.05, 0.05, 0xe6e7ea, 0.12, 0.06, -0.15); // PCIe and fan connectors
    return b.box(0.03, 0.015, 0.03, 0xff3b30, -0.4, 0.05, -0.17).box(0.03, 0.015, 0.03, 0x5bd66f, -0.4, 0.05, -0.12).geo();
  }, { glow: true, dens: 2 });
  def('vr', 'Meta Quest 3', 'w', () => {
    const b = B().box(0.95, 0.5, 0.36, WH, 0, 0.3, 0.05);
    [1, -1].forEach(s => b.sph(0.25, WH, 0.47 * s, 0.3, 0.05, { sx: 0.3, sz: 0.72, seg: 10, seg2: 8 }));
    [-0.28, 0, 0.28].forEach(x => b.box(0.09, 0.22, 0.03, 0x16171a, x, 0.3, 0.24));                    // the three camera pills
    return b.box(0.85, 0.42, 0.14, 0x3a3d42, 0, 0.3, -0.2).tor(0.42, 0.05, 0x5a5e66, 0, 0.32, -0.62, { rx: PI / 2 }).box(0.08, 0.06, 0.4, 0x5a5e66, 0, 0.6, -0.4).geo();
  });
  def('watch', 'Smartwatch', 'w', () => B().box(0.3, 0.04, 1.4, 0x2a2c31, 0, 0.02, 0).box(0.44, 0.13, 0.52, 0x1b1c1f, 0, 0.1, 0).box(0.38, 0.012, 0.45, 0x2a6fd6, 0, 0.17, 0).cyl(0.045, 0.045, 0.07, 0x8a8d93, 0.25, 0.11, 0.1, { rz: PI / 2, seg: 8 }).geo(), { glow: true });
  def('drone', 'DJI drone', 'w', () => {
    const b = B().sph(0.42, 0xd9dbde, 0, 0.72, 0, { sx: 0.9, sy: 0.45, sz: 1.3 })      // rounded body
      .box(0.36, 0.1, 0.5, 0x2a2c31, 0, 0.92, -0.1)                                     // battery on top
      .sph(0.12, 0x16171a, 0, 0.52, 0.48, { seg: 10 }).cyl(0.05, 0.05, 0.02, 0x3fa9ff, 0, 0.52, 0.6, { rx: PI / 2, seg: 8 }) // camera gimbal
      .box(0.06, 0.04, 0.02, 0x5bd66f, 0, 0.72, -0.56);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => {
      b.seg([0.25 * x, 0.74, 0.32 * z], [0.95 * x, 0.8, 0.95 * z], 0.09, 0.09, 0xc4c8ce);
      b.cyl(0.09, 0.09, 0.16, 0x2a2c31, 0.95 * x, 0.86, 0.95 * z, { seg: 8 }).cyl(0.34, 0.34, 0.012, 0x8a8d93, 0.95 * x, 0.95, 0.95 * z, { seg: 16 });
    });
    [1, -1].forEach(x => { b.seg([0.22 * x, 0.6, 0], [0.32 * x, 0.15, 0], 0.05, 0.05, 0x5a5e66, { round: true }); b.box(0.06, 0.05, 0.9, 0x5a5e66, 0.33 * x, 0.15, 0); });
    return b.geo();
  }, { glow: true, walk: 'fly' });
  def('monitor', 'PC monitor', 'w', () => { const b = B().box(1.4, 0.08, 0.8, 0x2a2c31, 0, 0.04, 0).box(0.25, 1.3, 0.12, 0x2a2c31, 0, 0.7, -0.15).box(4.4, 2.6, 0.16, 0x16171a, 0, 2.2, 0).box(4.2, 2.4, 0.02, 0x163a6e, 0, 2.2, 0.09); [0.8, 0.5, 0.2, -0.1, -0.4].forEach((y, i) => b.box(1.2 + (i * 0.7) % 1.6, 0.08, 0.01, i % 2 ? 0x5bd66f : 0x3fa9ff, -1.2 + ((i * 0.35) % 0.6), 2.2 + y, 0.105)); return b.box(0.6, 0.06, 0.02, NV, 0, 1.05, 0.09).geo(); }, { glow: true });
  def('cctv', 'Security camera', 'w', () => B().cyl(0.5, 0.6, 0.15, 0x2a2c31, 0, 0.075, 0, { seg: 14 }).cyl(0.09, 0.09, 2.4, 0x5a5e66, 0, 1.3, 0, { seg: 8 }).box(0.5, 0.45, 1.1, WH, 0, 2.6, 0.25, { rx: 0.25 }).box(0.56, 0.08, 1.2, WH, 0, 2.88, 0.28, { rx: 0.25 }).cyl(0.17, 0.17, 0.06, BK, 0, 2.47, 0.83, { rx: PI / 2 - 0.25, seg: 14 }).sph(0.045, 0xff3b30, 0.16, 2.7, 0.76).geo(), { glow: true });
  def('ethswitch', 'Network switch', 'w', () => { const b = B().box(2.7, 0.35, 0.9, 0x2a2c31, 0, 0.175, 0); for (let i = 0; i < 12; i++) b.box(0.14, 0.12, 0.04, BK, -1.15 + i * 0.2, 0.18, 0.45).box(0.04, 0.03, 0.02, i % 3 ? 0x5bd66f : 0xffb640, -1.15 + i * 0.2, 0.28, 0.46); return b.box(0.3, 0.08, 0.02, 0x9aa0a8, 1.2, 0.25, 0.46).geo(); }, { glow: true });
  def('pc', 'Gaming PC', 'w', () => {
    const b = B().box(2.0, 4.4, 4.4, 0x16171a, 0, 2.2, 0).box(0.04, 3.9, 3.9, 0x23324a, 1.01, 2.25, 0);
    [[1.1, 0x26e0ff], [2.2, 0xb44dff], [3.3, 0xff3fa0]].forEach(([y, c]) => { b.cyl(0.55, 0.55, 0.04, 0x0e0f11, 0, y, 2.21, { rx: PI / 2, seg: 18 }).tor(0.55, 0.07, c, 0, y, 2.24, { seg: 20 }).cyl(0.14, 0.14, 0.05, 0x3a3d42, 0, y, 2.24, { rx: PI / 2, seg: 10 }); });
    return b.box(0.02, 0.5, 2.6, NV, 1.04, 2.0, -0.2).box(0.02, 0.9, 0.15, 0xff3fa0, 1.04, 3.2, 0.9).box(0.02, 0.9, 0.15, 0x26e0ff, 1.04, 3.2, 1.15).geo();
  }, { glow: true, dens: 1.4 });
  def('printer3d', '3D printer', 'w', () => {
    const b = B().box(3.2, 0.5, 3.2, 0x2a2c31, 0, 0.25, 0).box(2.6, 0.06, 2.6, 0x1b1c1f, 0, 0.53, 0);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => b.box(0.2, 3.5, 0.2, 0x3a3d42, 1.45 * x, 2.25, 1.45 * z));
    b.box(3.1, 0.15, 0.15, 0x3a3d42, 0, 4.0, 1.45).box(3.1, 0.15, 0.15, 0x3a3d42, 0, 4.0, -1.45).box(0.15, 0.15, 3.1, 0x3a3d42, 1.45, 4.0, 0).box(0.15, 0.15, 3.1, 0x3a3d42, -1.45, 4.0, 0);
    b.box(3.0, 0.1, 0.12, SV, 0, 2.6, 0.2).box(0.55, 0.5, 0.5, 0x2a2c31, 0.3, 2.35, 0.2).cone(0.08, 0.2, SV, 0.3, 2.0, 0.2, { rx: PI });
    b.cyl(0.55, 0.55, 0.45, C.orange, -2.0, 3.0, 0, { rz: PI / 2 }).cyl(0.2, 0.2, 0.5, 0x2a2c31, -2.0, 3.0, 0, { rz: PI / 2, seg: 10 });
    return b.sph(0.32, C.duck, 0, 0.85, -0.2).sph(0.2, C.duck, 0, 1.25, -0.04).cone(0.07, 0.16, C.orange, 0, 1.22, 0.16, { rx: PI / 2 }).geo(); // a printed rubber duck on the bed
  }, { dens: 1.2 });
  def('pepper', 'Pepper', 'w', () => {
    const b = B(), P2 = 0xf6f6f4;
    b.cone(1.6, 4.6, P2, 0, 2.3, 0, { seg: 18 }).cyl(1.62, 1.62, 0.25, 0x2a2c31, 0, 0.12, 0, { seg: 18 });
    b.sph(1.0, P2, 0, 5.6, 0, { sx: 1.1, sy: 1.2, sz: 0.9 });
    b.box(1.0, 0.75, 0.08, 0x1b1c1f, 0, 5.7, 0.86).box(0.9, 0.65, 0.02, 0x3fa9ff, 0, 5.7, 0.91);
    b.cyl(0.25, 0.3, 0.45, P2, 0, 6.95, 0, { seg: 10 });
    b.sph(0.95, P2, 0, 7.75, 0, { sy: 0.95, sz: 0.95 });
    [-1, 1].forEach(s => {
      b.sph(0.2, BK, 0.33 * s, 7.8, 0.8, { sz: 0.6 }).tor(0.19, 0.04, 0x3fa9ff, 0.33 * s, 7.8, 0.84, { seg: 14 });
      b.sph(0.28, 0x2a2c31, 1.05 * s, 6.3, 0, { seg: 8, seg2: 6 });
      b.seg([1.1 * s, 6.2, 0], [1.35 * s, 5.0, 0.25], 0.42, 0.42, P2, { round: true });
      b.seg([1.35 * s, 5.0, 0.25], [1.4 * s, 3.9, 0.45], 0.36, 0.36, P2, { round: true });
      b.sph(0.22, 0x2a2c31, 1.42 * s, 3.75, 0.48, { seg: 8, seg2: 6 });
    });
    return b.geo();
  }, { glow: true });
  def('starship', 'Starship delivery robot', 'w', () => {
    const b = B().box(2.6, 1.6, 3.4, WH, 0, 1.75, 0).box(2.62, 0.22, 3.42, BK, 0, 1.15, 0).box(2.4, 0.4, 3.2, WH, 0, 2.7, 0).box(2.0, 0.06, 2.8, 0xe2e3e6, 0, 2.92, 0);
    [-1.2, 0, 1.2].forEach(z => [-1, 1].forEach(x => { b.cyl(0.5, 0.5, 0.32, 0x1b1c1f, 1.38 * x, 0.5, z, { rz: PI / 2, seg: 14 }).cyl(0.22, 0.22, 0.34, 0x9aa0a8, 1.38 * x, 0.5, z, { rz: PI / 2, seg: 10 }); }));
    b.box(1.8, 0.12, 0.03, 0x9fe0ff, 0, 2.2, 1.71).sph(0.09, BK, -0.5, 1.9, 1.71).sph(0.09, BK, 0.5, 1.9, 1.71);
    return b.seg([0.9, 2.9, -1.4], [0.9, 6.0, -1.4], 0.06, 0.06, 0x8a8d93, { round: true }).box(0.04, 0.6, 0.9, C.orange, 0.9, 5.7, -0.95).geo();
  }, { glow: true, dens: 0.8 });


  // ---------- Consoles, controllers, joysticks, boards and desktop robots ----------
  def('ps5', 'PlayStation 5', 'w', () => {
    // Standing: glossy black core between two white panels that flare out towards the top, on a round stand.
    const b = B().cyl(0.62, 0.62, 0.08, BK, 0, 0.04, 0, { seg: 20 }).box(0.62, 3.7, 2.45, 0x101114, 0, 1.97, 0);
    [1, -1].forEach(s => {
      b.box(0.12, 1.9, 2.5, WH, 0.37 * s, 1.07, 0, { rz: 0.025 * s }).box(0.12, 2.0, 2.62, WH, 0.42 * s, 2.95, 0, { rz: 0.04 * s });
      b.box(0.02, 3.5, 0.03, 0x3fa9ff, 0.295 * s, 1.95, 1.235);                                   // blue light strips
    });
    return b.box(0.04, 0.7, 0.02, 0x2a2c31, 0, 1.1, 1.235).box(0.08, 0.08, 0.02, 0x8a8d93, 0.12, 0.4, 1.235).box(0.12, 0.05, 0.02, 0x8a8d93, -0.12, 0.4, 1.235).geo();
  }, { glow: true, dens: 1.1 });
  def('xsx', 'Xbox Series X', 'w', () => {
    // A matte black tower with the big round vent on top (green inside), disc slot and power button in front.
    const b = B().box(1.51, 3.01, 1.51, 0x1a1b1e, 0, 1.525, 0).box(1.3, 0.04, 1.3, 0x0d0e10, 0, 0.02, 0);
    b.cyl(0.6, 0.6, 0.04, 0x0d0e10, 0, 3.04, 0, { seg: 24 }).cyl(0.5, 0.5, 0.03, 0x2f6b2f, 0, 3.05, 0, { seg: 24 });
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const x = -0.66 + i * 0.22, z = -0.66 + j * 0.22; if (Math.hypot(x, z) > 0.68) b.cyl(0.035, 0.035, 0.02, 0x0d0e10, x, 3.035, z, { seg: 6 }); }
    return b.box(0.9, 0.03, 0.02, 0x0d0e10, -0.1, 2.3, 0.765).cyl(0.07, 0.07, 0.03, WH, 0.52, 2.75, 0.77, { rx: PI / 2, seg: 12 }).box(0.09, 0.05, 0.02, 0x0d0e10, -0.5, 0.5, 0.765).box(0.06, 0.06, 0.02, 0x3a3d42, 0.55, 0.5, 0.765).geo();
  }, { glow: true, dens: 1.3 });
  def('ds5', 'DualSense controller', 'w', () => {
    const b = B().box(1.0, 0.2, 0.5, WH, 0, 0.16, 0.02);
    [1, -1].forEach(s => b.sph(0.27, WH, 0.44 * s, 0.15, -0.18, { sx: 0.9, sy: 0.55, sz: 1.45, seg: 12, seg2: 8 }));
    b.box(0.7, 0.04, 0.42, 0x1b1c1f, 0, 0.27, 0.0).box(0.42, 0.03, 0.24, 0x1b1c1f, 0, 0.3, 0.12).box(0.44, 0.012, 0.02, 0x3fa9ff, 0, 0.3, 0.25); // black face, touchpad, light bar
    [1, -1].forEach(s => b.cyl(0.075, 0.075, 0.08, 0x2a2c31, 0.15 * s, 0.32, -0.12, { seg: 12 }).cyl(0.085, 0.085, 0.02, 0x3a3d42, 0.15 * s, 0.37, -0.12, { seg: 12 }));
    [[0, 0.07], [0.07, 0], [-0.07, 0], [0, -0.07]].forEach(([x, z]) => b.cyl(0.03, 0.03, 0.03, 0xc4c8ce, 0.36 + x, 0.3, 0.02 + z, { seg: 8 }));
    b.box(0.05, 0.03, 0.14, 0x3a3d42, -0.36, 0.3, 0.02).box(0.14, 0.03, 0.05, 0x3a3d42, -0.36, 0.3, 0.02);
    return b.box(0.24, 0.1, 0.1, WH, 0.35, 0.18, 0.28).box(0.24, 0.1, 0.1, WH, -0.35, 0.18, 0.28).geo();
  }, { glow: true, dens: 1.2 });
  def('atari', 'Classic joystick', 'w', () => B().box(0.9, 0.3, 0.9, 0x16171a, 0, 0.15, 0).box(0.7, 0.02, 0.7, 0x2a2c31, 0, 0.31, 0).cyl(0.12, 0.17, 0.12, 0x16171a, 0, 0.37, 0, { seg: 12 }).cyl(0.06, 0.06, 0.75, 0x16171a, 0, 0.78, 0, { seg: 10 }).sph(0.08, 0x16171a, 0, 1.15, 0, { seg: 10, seg2: 6 }).cyl(0.1, 0.1, 0.08, C.orange, -0.3, 0.34, 0.3, { seg: 12 }).box(0.06, 0.06, 0.6, 0x16171a, 0, 0.05, -0.7).geo(), { dens: 1.2 });
  def('arcadestick', 'Arcade joystick', 'w', () => {
    const b = B().box(2.2, 0.4, 1.2, 0x16171a, 0, 0.2, 0).box(2.1, 0.02, 1.1, 0x3f4bb8, 0, 0.41, 0);
    b.cyl(0.17, 0.17, 0.04, 0x16171a, -0.65, 0.43, 0, { seg: 12 }).cyl(0.04, 0.04, 0.45, SV, -0.65, 0.64, 0, { seg: 8 }).sph(0.17, C.red, -0.65, 0.92, 0, { seg: 12, seg2: 8 });
    [[0, 0.18], [0.3, 0.24], [0.6, 0.24], [0.9, 0.18]].forEach(([x, z], i) => b.cyl(0.11, 0.11, 0.06, [C.red, C.duck, C.green, C.blue][i], 0.05 + x, 0.44, z, { seg: 14 }).cyl(0.11, 0.11, 0.06, [C.pink, C.orange, C.sky, C.white][i], 0.05 + x, 0.44, z - 0.34, { seg: 14 }));
    return b.geo();
  }, { glow: true, dens: 1.1 });
  def('hotas', 'Flight joystick', 'w', () => {
    const b = B().box(1.1, 0.25, 1.2, 0x2a2c31, 0, 0.125, 0).cyl(0.38, 0.45, 0.25, 0x16171a, 0, 0.375, 0, { seg: 16 }).cyl(0.22, 0.32, 0.2, 0x2a2c31, 0, 0.6, 0, { seg: 14 });
    b.seg([0, 0.65, 0], [0, 1.7, 0.12], 0.32, 0.32, 0x1b1c1f, { round: true, w2: 0.26, seg: 12 }).sph(0.2, 0x1b1c1f, 0, 1.75, 0.16, { sy: 0.7, sz: 1.2, seg: 12, seg2: 8 });
    b.box(0.08, 0.2, 0.08, C.red, 0, 1.4, 0.32, { rx: 0.3 }).cyl(0.05, 0.05, 0.06, 0x8a8d93, 0.08, 1.88, 0.18, { seg: 8 }).cyl(0.05, 0.05, 0.06, C.red, -0.08, 1.88, 0.2, { seg: 8 });
    return b.cyl(0.06, 0.06, 0.04, C.red, -0.35, 0.27, 0.4, { seg: 10 }).cyl(0.06, 0.06, 0.04, 0x3fa9ff, -0.2, 0.27, 0.45, { seg: 10 }).geo();
  }, { glow: true, dens: 1.1 });
  def('nswitch', 'Nintendo Switch', 'w', () => {
    const b = B().box(1.72, 0.14, 1.02, 0x1b1c1f, 0, 0.07, 0).box(1.55, 0.01, 0.88, 0x2a4f7a, 0, 0.145, 0);
    [[1, 0xe8443a], [-1, 0x1fb4e8]].forEach(([s, c]) => {
      b.box(0.36, 0.15, 1.02, c, 1.04 * s, 0.075, 0).cyl(0.51, 0.51, 0.15, c, 1.2 * s, 0.075, 0, { sx: 0.36, seg: 16 });
      b.cyl(0.08, 0.08, 0.06, 0x16171a, 1.07 * s, 0.17, s > 0 ? -0.18 : 0.22, { seg: 12 });
      [[0, 0.09], [0.09, 0], [-0.09, 0], [0, -0.09]].forEach(([x, z]) => b.cyl(0.035, 0.035, 0.03, 0x16171a, 1.07 * s + x, 0.16, (s > 0 ? 0.2 : -0.2) + z, { seg: 8 }));
    });
    return b.geo();
  }, { glow: true, dens: 1.3 });
  def('deck', 'Steam Deck', 'w', () => {
    const D2 = 0x23252a, b = B().box(1.55, 0.2, 0.8, D2, 0, 0.12, 0);
    [1, -1].forEach(s => b.sph(0.42, D2, 0.82 * s, 0.12, -0.05, { sx: 0.75, sy: 0.3, sz: 1.15, seg: 12, seg2: 8 }));
    b.box(0.98, 0.012, 0.6, 0x0b0c0e, 0, 0.225, 0.04).box(0.9, 0.006, 0.52, 0x3a5a8a, 0, 0.234, 0.04);
    [1, -1].forEach(s => { b.cyl(0.08, 0.08, 0.06, 0x111214, 0.68 * s, 0.25, 0.2, { seg: 12 }).box(0.24, 0.01, 0.24, 0x2f3136, 0.68 * s, 0.226, -0.2); });
    [[0, 0.06], [0.06, 0], [-0.06, 0], [0, -0.06]].forEach(([x, z]) => b.cyl(0.03, 0.03, 0.03, 0x3a3d42, 0.84 + x, 0.23, 0.12 + z, { seg: 8 }).box(0.04, 0.03, 0.04, 0x3a3d42, -0.84 + x, 0.23, 0.12 + z));
    return b.geo();
  }, { glow: true, dens: 1.3 });
  def('gameboy', 'Game Boy', 'w', () => {
    const b = B().box(0.9, 0.16, 1.48, 0xc9c6bd, 0, 0.08, 0).box(0.76, 0.01, 0.62, 0x55565e, 0, 0.165, 0.36).box(0.5, 0.012, 0.45, 0x8bac0f, 0, 0.17, 0.36);
    b.box(0.06, 0.03, 0.2, 0x16171a, -0.22, 0.17, -0.25).box(0.2, 0.03, 0.06, 0x16171a, -0.22, 0.17, -0.25);
    b.cyl(0.07, 0.07, 0.04, 0x9b1b5a, 0.2, 0.17, -0.2, { seg: 12 }).cyl(0.07, 0.07, 0.04, 0x9b1b5a, 0.34, 0.17, -0.12, { seg: 12 });
    b.box(0.12, 0.02, 0.04, 0x8d8798, -0.06, 0.165, -0.5).box(0.12, 0.02, 0.04, 0x8d8798, 0.1, 0.165, -0.5);
    for (let i = 0; i < 5; i++) b.box(0.02, 0.012, 0.16, 0x8d8798, 0.2 + i * 0.05, 0.165, -0.6, { ry: -0.5 });
    return b.geo();
  }, { glow: true, dens: 1.3 });
  def('arduino', 'Arduino Uno', 'w', () => B().box(0.69, 0.035, 0.53, 0x00878f, 0, 0.018, 0).box(0.16, 0.11, 0.12, SV, -0.29, 0.09, 0.14).box(0.14, 0.11, 0.09, BK, -0.3, 0.09, -0.18).box(0.36, 0.08, 0.025, BK, 0.05, 0.075, 0.245).box(0.4, 0.08, 0.025, BK, 0.08, 0.075, -0.245).box(0.35, 0.05, 0.09, 0x16171a, 0.12, 0.06, -0.05).box(0.06, 0.04, 0.06, 0xc8ccd2, -0.18, 0.05, 0.0).box(0.025, 0.012, 0.025, 0x5bd66f, -0.05, 0.04, 0.15).geo(), { glow: true, dens: 2 });
  def('jetson', 'Jetson Orin Nano', 'w', () => {
    const b = B().box(1.0, 0.05, 0.9, 0x1b1c1f, 0, 0.025, 0).box(0.7, 0.04, 0.45, 0x2e8b3d, 0, 0.07, 0.1);
    for (let i = 0; i < 9; i++) b.box(0.025, 0.22, 0.42, 0x3a3d42, -0.28 + i * 0.07, 0.2, 0.1);  // heatsink fins
    b.cyl(0.19, 0.19, 0.05, 0x111214, 0, 0.34, 0.1, { seg: 16 }).cyl(0.06, 0.06, 0.06, NV, 0, 0.35, 0.1, { seg: 10 });
    [-0.3, -0.1, 0.1].forEach(x => b.box(0.15, 0.14, 0.13, SV, x, 0.12, -0.38));
    return b.box(0.2, 0.13, 0.15, SV, 0.33, 0.115, -0.37).geo();
  }, { glow: true, dens: 2 });
  def('macmini', 'Mac mini', 'w', () => {
    const A = 0xd3d5d8, b = B().box(1.27, 0.5, 1.07, A, 0, 0.27, 0).box(1.07, 0.5, 1.27, A, 0, 0.27, 0);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => b.cyl(0.1, 0.1, 0.5, A, 0.535 * x, 0.27, 0.535 * z, { seg: 8 }));
    return b.cyl(0.5, 0.5, 0.02, 0x2a2c31, 0, 0.01, 0, { seg: 20 }).box(0.06, 0.03, 0.02, 0x2a2c31, -0.2, 0.2, 0.64).box(0.06, 0.03, 0.02, 0x2a2c31, -0.08, 0.2, 0.64).cyl(0.02, 0.02, 0.02, 0xf7f5f0, 0.45, 0.12, 0.64, { rx: PI / 2, seg: 8 }).geo();
  }, { glow: true, dens: 2 });
  def('dgxspark', 'DGX Spark', 'w', () => {
    // The little gold AI box: gold body, metal-foam front.
    const b = B().box(1.5, 0.5, 1.5, GOLD, 0, 0.25, 0).box(1.44, 0.44, 0.04, GOLDD, 0, 0.25, 0.75);
    foam(b, 1.3, 0.32, -0.65, 0.09, 0.79, 0.09);
    return b.box(0.4, 0.025, 0.02, NV, 0, 0.47, 0.79).geo();
  }, { dens: 2.2 });
  def('reachy', 'Reachy Mini', 'w', () => {
    // Hugging Face's desktop robot: a white bell of a body, a six-rod neck, a wide head with two big round
    // camera eyes and two antennas.
    const b = B().cyl(0.95, 1.25, 1.6, WH, 0, 0.85, 0, { seg: 24 }).cyl(1.27, 1.27, 0.1, 0x8a8d93, 0, 0.05, 0, { seg: 24 }).cyl(0.55, 0.7, 0.35, 0x2a2c31, 0, 1.8, 0, { seg: 16 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; b.seg([Math.cos(a) * 0.55, 1.9, Math.sin(a) * 0.55], [Math.cos(a + 0.5) * 0.42, 2.3, Math.sin(a + 0.5) * 0.42], 0.05, 0.05, SV, { round: true, seg: 6 }); }
    b.sph(1.0, WH, 0, 2.85, 0, { sx: 1.25, sy: 0.72, sz: 0.85, seg: 18, seg2: 12 });
    [1, -1].forEach(s => {
      b.cyl(0.32, 0.32, 0.12, 0x0b0c0e, 0.48 * s, 2.9, 0.8, { rx: PI / 2, seg: 18 }).tor(0.32, 0.05, 0x3a3d42, 0.48 * s, 2.9, 0.86, { seg: 18 }).sph(0.07, 0x2ec7ff, 0.48 * s + 0.08, 2.96, 0.88, { seg: 6, seg2: 4 });
      b.seg([0.45 * s, 3.4, -0.1], [0.75 * s, 4.4, -0.2], 0.05, 0.05, BK, { round: true, seg: 6 }).sph(0.09, BK, 0.75 * s, 4.45, -0.2, { seg: 8, seg2: 6 });
    });
    return b.geo();
  }, { glow: true, dens: 0.8 });
  def('aibo', 'Sony aibo', 'w', () => {
    const IV = 0xf3efe6, GR = 0x8d8798, b = B().sph(1, IV, 0, 1.55, 0, { sx: 0.62, sy: 0.55, sz: 1.2, seg: 16, seg2: 10 });
    [[0.38, 0.75], [-0.38, 0.75], [0.38, -0.75], [-0.38, -0.75]].forEach(([x, z]) => {
      b.sph(0.3, IV, x, 1.3, z, { seg: 10, seg2: 8 });
      b.seg([x, 1.3, z], [x, 0.7, z - 0.12], 0.3, 0.3, IV, { round: true, w2: 0.24, seg: 10 }).seg([x, 0.7, z - 0.12], [x, 0.12, z + 0.05], 0.22, 0.22, IV, { round: true, w2: 0.18, seg: 10 });
      b.sph(0.14, GR, x, 0.1, z + 0.08, { sz: 1.3, seg: 8, seg2: 6 });
    });
    b.seg([0, 1.75, 0.9], [0, 2.35, 1.2], 0.36, 0.36, IV, { round: true, seg: 10 }).sph(0.55, IV, 0, 2.6, 1.35, { sx: 0.95, sy: 0.85, seg: 14, seg2: 10 }).sph(0.3, IV, 0, 2.45, 1.82, { sx: 0.8, sy: 0.7, seg: 10, seg2: 8 });
    [1, -1].forEach(s => { b.sph(0.11, 0x2ec7ff, 0.2 * s, 2.7, 1.83, { sz: 0.5, seg: 10, seg2: 6 }); b.box(0.1, 0.45, 0.3, GR, 0.5 * s, 2.78, 1.25, { rz: 0.5 * s }); });
    return b.sph(0.05, 0x16171a, 0, 2.5, 2.12, { seg: 6, seg2: 4 }).seg([0, 1.7, -1.15], [0, 2.2, -1.45], 0.1, 0.1, GR, { round: true, seg: 6 }).geo();
  }, { glow: true, dens: 1.2 });
  def('digit', 'Agility Digit', 'w', () => {
    // A warehouse humanoid on bird legs: knees bend backwards, flat feet, boxy torso, LED eyes.
    const S2 = 0x5d6066, D2 = 0x2a2c31, b = B();
    [1, -1].forEach(s => {
      const x = 0.7 * s;
      b.box(0.6, 0.25, 1.5, D2, x, 0.125, 0.25);
      b.seg([x, 6.4, 0], [x, 3.6, -0.9], 0.8, 0.8, S2, { round: true, w2: 0.6, seg: 10 }).sph(0.4, D2, x, 3.6, -0.9, { seg: 10, seg2: 8 });
      b.seg([x, 3.6, -0.9], [x, 0.3, 0.15], 0.42, 0.42, D2, { round: true, seg: 10 });
      b.seg([1.15 * s, 8.6, 0], [1.3 * s, 7.2, 0.4], 0.45, 0.45, S2, { round: true, seg: 10 }).seg([1.3 * s, 7.2, 0.4], [1.3 * s, 6.2, 1.0], 0.38, 0.38, D2, { round: true, seg: 10 });
    });
    b.box(1.8, 0.8, 1.0, D2, 0, 6.5, 0).box(2.0, 2.4, 1.4, S2, 0, 7.9, 0).box(1.6, 1.6, 0.05, 0x8a8d93, 0, 8.0, 0.72);
    b.box(1.1, 0.7, 0.9, D2, 0, 9.5, 0.1).box(0.95, 0.32, 0.04, 0x0b0c0e, 0, 9.55, 0.57);
    return b.box(0.25, 0.08, 0.02, 0x9fe0ff, -0.22, 9.55, 0.6).box(0.25, 0.08, 0.02, 0x9fe0ff, 0.22, 9.55, 0.6).geo();
  }, { glow: true });
  def('g1', 'Unitree G1', 'w', () => {
    const b = B();
    humanoid(b, { shell: 0x3e4146, joint: 0xa9aeb5, thigh: 0x4a4d52, waist: 0x2a2c30, chest: 0x34373c, head: h => { h.sph(1.1, 0x2a2c30, 0, 16.2, 0, { sx: 0.95, sy: 1.0, sz: 0.95 }); h.sph(0.95, 0x08090b, 0, 16.2, 0.45, { sx: 0.85, sy: 0.6, sz: 0.6 }); h.tor(0.62, 0.06, 0x2ec7ff, 0, 16.2, 0.95, { seg: 20, sy: 0.6 }); } });
    return b.geo();
  }, { glow: true });

  // Fences for the yards: a row of pencils (workshop) and a little picket fence (pond).
  def('pencils', 'Pencil fence', 'w', () => { const b = B(); const cols = [C.red, C.duck, C.blue, C.green, C.orange, C.lav]; for (let i = 0; i < 9; i++) b.cyl(0.13, 0.13, 1.25, cols[i % 6], -1.2 + i * 0.3, 0.625, 0, { seg: 6 }).cone(0.13, 0.25, 0xf2c9a0, -1.2 + i * 0.3, 1.37, 0, { seg: 6 }); return b.box(2.7, 0.12, 0.08, C.wood, 0, 0.5, 0.12).geo(); }, { dens: 0.5 });
  def('picket', 'Picket fence', 'p', () => { const b = B(); for (let i = 0; i < 7; i++) b.box(0.24, 1.2, 0.08, C.white, -1.15 + i * 0.38, 0.6, 0).cone(0.17, 0.25, C.white, -1.15 + i * 0.38, 1.32, 0, { seg: 4, ry: PI / 4 }); return b.box(2.7, 0.12, 0.1, C.white, 0, 0.35, -0.08).box(2.7, 0.12, 0.1, C.white, 0, 0.9, -0.08).geo(); }, { dens: 0.5 });

  const BY = {};
  T.forEach(t => { BY[t.key] = t; });

  // ---------- Materials ----------
  const mats = {};
  function material(kind) {
    if (mats[kind]) return mats[kind];
    if (kind === 'gold') mats.gold = new THREE.MeshStandardMaterial({ color: lin(0xf2b705), roughness: 0.25, metalness: 0.85, emissive: lin(0x5a3a00), emissiveIntensity: 0.6 });
    else if (kind === 'glow') {
      // Only the LED-like parts glow: saturated colours (screens, status lights, RGB fans) and pure white lamps.
      // Plastic bodies (greys, off-white, black) stay unlit. Strength comes from the theme (brighter at night).
      mats.glow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.0 });
      mats.glow.onBeforeCompile = sh => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float ledMx = max(vColor.r, max(vColor.g, vColor.b)), ledMn = min(vColor.r, min(vColor.g, vColor.b));
          float led = max(smoothstep(0.25, 0.55, ledMx - ledMn) * smoothstep(0.15, 0.4, ledMx), smoothstep(0.93, 0.99, ledMn));
          totalEmissiveRadiance *= vColor * led;`);
      };
    }
    else mats.base = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
    return mats[kind];
  }

  // Build every geometry once and measure it.
  function prepare(t) {
    if (t.geo) return t;
    t.geo = t.build();
    LOW = true; t.geoLo = t.build(); LOW = false;
    const bb = t.geo.boundingBox;
    t.h = bb.max.y;
    t.size = t.geo.boundingSphere.radius;
    t.foot = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
    // Collision footprint: an oriented box, or a custom core (tree trunk, lamp pole).
    t.hx = t.hit ? t.hit[0] : (bb.max.x - bb.min.x) / 2;
    t.hz = t.hit ? t.hit[1] : (bb.max.z - bb.min.z) / 2;
    return t;
  }
  T.forEach(prepare);
  T.sort((a, b) => a.size - b.size);

  // A prop instance: one Mesh plus the numbers the game needs.
  function spawn(t, scale, golden) {
    const m = new THREE.Mesh(t.geo, golden ? material('gold') : t.glow ? material('glow') : material('base'));
    m.scale.setScalar(scale);
    m.castShadow = t.size * scale > 1.2; m.receiveShadow = false;
    const size = t.size * scale;
    return {
      type: t, mesh: m, scale, golden: !!golden,
      size, h: t.h * scale, foot: t.foot * scale, hx: t.hx * scale, hz: t.hz * scale, clear: (t.clear || 0) * scale,
      mass: 0.2 * Math.pow(size, 3) * t.dens * (golden ? 3 : 1),
      name: golden ? 'Golden ' + t.name.toLowerCase() : t.name,
    };
  }

  // Which prop plays which role in the map layout, per world. h/r: target height and footprint radius.
  // gate/gain: the mass needed to break it and what it gives; fades = small stuff whose value drops as you grow; light = barely slows you.
  const ROLES = {
    small: { tier: 1, gate: 12, gain: 4, fades: true, light: true, h: 1.0, r: 0.42, chunks: 4, chunkGain: 0.25, w: ['bulb', 'charger', 'earbuds', 'pad', 'remote', 'dot', 'mouse', 'vr', 'watch', 'phone', 'rduck0', 'duckhead', 'ds5', 'atari', 'hotas', 'nswitch', 'gameboy', 'deck', 'arcadestick'], p: ['phone', 'vr', 'watch', 'mouse', 'earbuds', 'pad', 'dot', 'bulb', 'rduck0', 'rduck2', 'duckhead', 'ds5', 'atari', 'nswitch', 'gameboy', 'deck'] },
    small2: { tier: 1, gate: 12, gain: 3.3, fades: true, light: true, h: 1.35, r: 0.36, chunks: 3, chunkGain: 0.25, w: ['battery', 'battery9', 'socket', 'battery', 'plug', 'chip', 'rpi', 'arduino', 'jetson', 'macmini', 'dgxspark'], p: ['battery', 'chip', 'rpi', 'battery', 'servo', 'sdcard', 'battery9', 'arduino', 'macmini', 'dgxspark', 'jetson'] },
    walker: { tier: 1, gate: 12, gain: 14, h: 1.7, r: 0.4, chunks: 6, chunkGain: 0.6, w: ['mduck0', 'mduck1', 'mduck2', 'mduck3'], p: ['mduck0', 'mduck1', 'mduck2', 'mduck3'] },
    circler: { tier: 1, gate: 12, gain: 9, light: true, h: 2.2, r: 0.7, chunks: 0, chunkGain: 0, w: ['drone'], p: ['drone'] },
    fence: { tier: 2, gate: 30, gain: 8, h: 1.4, r: 1.35, chunks: 4, chunkGain: 0.6, w: ['strip', 'strip', 'keyboard', 'ethswitch'], p: ['ethswitch', 'ethswitch', 'keyboard', 'strip'] },
    lamp: { tier: 2, gate: 30, gain: 10, h: 3.2, r: 0.9, chunks: 3, chunkGain: 0.6, w: ['router', 'speaker', 'monitor', 'cctv', 'ps5', 'xsx', 'reachy'], p: ['monitor', 'cctv', 'router', 'speaker', 'ps5', 'xsx', 'reachy'] },
    box: { tier: 3, gate: 150, gain: 40, h: 4.6, r: 1.6, chunks: 5, chunkGain: 2.5, w: ['gpu', 'vacuumW', 'vacuumB', 'go2', 'pc', 'printer3d', 'duckbox', 'aibo'], p: ['pc', 'gpu', 'go2', 'vacuumB', 'printer3d', 'duckbox', 'aibo'] },
    plant: { tier: 4, gate: 300, gain: 60, h: 8, r: 3.5, chunks: 5, chunkGain: 3.5, w: ['optimus', 'figure', 'atlas', 'h1', 'pepper', 'g1', 'digit'], p: ['optimus', 'figure', 'atlas', 'h1', 'pepper', 'g1', 'digit'] },
    arm: { tier: 5, gate: 600, gain: 90, h: 4.2, r: 2.2, chunks: 5, chunkGain: 6, w: ['spot', 'spot', 'arm', 'starship'], p: ['spot', 'starship', 'arm', 'spot'] },
    house: { tier: 6, gate: 1500, gain: 120, h: 8, r: 4.6, chunks: 10, chunkGain: 9, w: ['dgxstation', 'dgxserver'], p: ['dgxserver', 'dgxstation'] },
    tower: { tier: 7, gate: 4000, gain: 420, h: 17, r: 3.4, chunks: 6, chunkGain: 24, w: ['superpod', 'rack'], p: ['superpod', 'rack'] },
  };

  // How a broken thing sticks onto a duck: flat against the surface (its thinnest side down, either way up),
  // turned by spin about the normal n, with about two thirds of its thickness showing. obj is the thing's mesh
  // or group, s its scale. Returns its rotation and where its origin goes from the touch point, in world units.
  const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)], boxCache = new WeakMap();
  function localBox(obj) {
    if (obj.geometry) { if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox(); return obj.geometry.boundingBox; }
    if (boxCache.has(obj)) return boxCache.get(obj);
    const p = obj.position.clone(), q = obj.quaternion.clone(), sc = obj.scale.clone(), par = obj.parent;
    if (par) par.remove(obj);
    obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.set(1, 1, 1); obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    obj.position.copy(p); obj.quaternion.copy(q); obj.scale.copy(sc);
    if (par) par.add(obj);
    boxCache.set(obj, bb); return bb;
  }
  function stick(obj, s, n, spin) {
    const bb = localBox(obj), d = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const ax = d.x <= d.y && d.x <= d.z ? 0 : d.y <= d.z ? 1 : 2, thin = [d.x, d.y, d.z][ax];
    const a = AXES[ax].clone(); if (Math.random() < 0.5) a.negate();
    const q = new THREE.Quaternion().setFromUnitVectors(a, n);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(n, spin));
    const off = c.multiplyScalar(-s).applyQuaternion(q).addScaledVector(n, thin * s * 0.2);
    return { q, off };
  }

  return { T, BY, spawn, material, B, lin, C, miniDuck, curledDuck, rubberDuck, ROLES, stick };
})();
