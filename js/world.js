// The world: renderer, sky, scale-aware ground with roads, lights, the two themes, the fixed map
// (thousands of instanced props that break and grow back), walkers, chunks, the boss, particles.
window.MD = window.MD || {};
// duck-anim.js asks the arena about the ground; here the ground is flat and endless.
// The player duck lives inside a rolling ball, so its foot-shadow blobs are switched off (inside() is false).
MD.Arena = { inside: () => false, groundAt: () => 0 };

MD.World = (function () {
  const PI = Math.PI, P = MD.Props, lin = P.lin;
  const W = { R: 204, theme: null, time: 0 };
  let renderer, scene, camera, sun, hemi, sky, ground, stars, moon, fireflies;
  const groundU = { uScale: { value: 1 }, uGrid: { value: new THREE.Color() }, uPatch: { value: new THREE.Color() }, uRoad: { value: new THREE.Color() } };

  const THEMES = {
    w: {
      key: 'w', name: 'Robot Lab', tag: 'Day shift',
      skyTop: 0x6fa8de, skyBot: 0xeedcb8, fog: 0xe4d3b2, ground: 0xc7b28c, grid: 0xa38a62, patch: 0xb9a37c, road: 0x7a6a56, wall: 0xcbb994,
      sun: 0xfff1d6, sunI: 2.5, hemiSky: 0xcfe6ff, hemiGround: 0x7d6a50, hemiI: 0.55, glow: 0.6, exposure: 0.92, night: false,
      boss: { name: 'The Mega Microduck' },
    },
    p: {
      key: 'p', name: 'Night Lab', tag: 'Night shift',
      skyTop: 0x070b1c, skyBot: 0x1a2245, fog: 0x141a35, ground: 0x2a3142, grid: 0x3e7fa8, patch: 0x232a3a, road: 0x1d2433, wall: 0x141a2a,
      sun: 0xb8c8ff, sunI: 1.7, hemiSky: 0x8090d0, hemiGround: 0x2a3a3a, hemiI: 1.1, glow: 1.4, exposure: 1.3, night: true,
      boss: { name: 'The Great Rubber Duck' },
    },
  };
  W.THEMES = THEMES;

  // ---------- Seeded random ----------
  let seed = 1;
  const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  W.rand = rand;

  // ---------- Setup ----------
  // Points are sized in world units, so one that drifts right up to the camera turns into a huge blurry disc.
  // Cap their size on screen.
  function capPoints(m) {
    m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n gl_PointSize = min(gl_PointSize, 56.0);'); };
    return m;
  }

  W.init = function (host) {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 4000);
    scene.fog = new THREE.Fog(0xffffff, 10, 100);

    hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    // Sky dome with a vertical gradient; it follows the camera.
    sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(h, 0.7)), 1.0); }',
    }));
    sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

    // Stars and moon for the night theme (positions are on a unit sphere, scaled with the sky).
    const sp = [];
    for (let i = 0; i < 700; i++) { const u = Math.random() * 2 - 1, a = Math.random() * PI * 2, y = Math.abs(u) * 0.9 + 0.08, rr = Math.sqrt(1 - y * y); sp.push(Math.cos(a) * rr, y, Math.sin(a) * rr); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, depthWrite: false }));
    stars.frustumCulled = false; scene.add(stars);
    moon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false }));
    moon.frustumCulled = false; scene.add(moon);

    // Ground: one big plane. Its grid lines are drawn in the shader at two powers of ten picked from the
    // ball size, so the floor always reads as "tiles" whether the ball is 10 cm or 10 m across.
    // Pushed back a little in depth, so thin props lying on the floor (SD cards, chips, phones) never z-fight it.
    const gm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 });
    gm.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, groundU);
      sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWp; uniform float uScale; uniform vec3 uGrid; uniform vec3 uPatch; uniform vec3 uRoad;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float lv = log(uScale) / log(10.0); float fr = fract(lv); float s1 = pow(10.0, floor(lv)); float s2 = s1 * 10.0;
        // Grid lines, checker and noise fade out once their cells are only a few pixels wide: that is what
        // made the floor shimmer and crawl in the distance.
        vec2 a1 = vWp.xz / s1; vec2 w1 = max(fwidth(a1), vec2(1e-4)); vec2 g1 = abs(fract(a1 - 0.5) - 0.5) / w1;
        float l1 = (1.0 - min(min(g1.x, g1.y), 1.0)) * (1.0 - smoothstep(0.06, 0.3, max(w1.x, w1.y)));
        vec2 a2 = vWp.xz / s2; vec2 w2 = max(fwidth(a2), vec2(1e-4)); vec2 g2 = abs(fract(a2 - 0.5) - 0.5) / w2;
        float l2 = (1.0 - min(min(g2.x, g2.y), 1.0)) * (1.0 - smoothstep(0.06, 0.3, max(w2.x, w2.y)));
        vec2 c2 = floor(a2); float chk = mix(0.5, mod(c2.x + c2.y, 2.0), 1.0 - smoothstep(0.08, 0.4, max(w2.x, w2.y)));
        diffuseColor.rgb = mix(diffuseColor.rgb, uPatch, chk * 0.55);
        float nf = 1.0 - smoothstep(0.15, 0.6, max(w1.x, w1.y) * 0.43);
        float nz = vn(vWp.xz / (s2 * 1.7)) * 0.6 + mix(0.5, vn(vWp.xz / (s1 * 2.3)), nf) * 0.4;
        diffuseColor.rgb *= 0.9 + nz * 0.2;
        diffuseColor.rgb = mix(diffuseColor.rgb, uGrid, max(l1 * (1.0 - fr) * 0.7, l2 * 0.85));
        // Roads with edges anti-aliased to one pixel.
        float dc = length(vWp.xz), road = 0.0;
        float rd = min(abs(vWp.x), abs(vWp.z)), frd = fwidth(rd) + 0.02;
        if (dc > 15.0 && dc < 206.0) road = 1.0 - smoothstep(1.6 - frd, 1.6 + frd, rd);
        float r1 = abs(dc - 88.0), r2 = abs(dc - 142.0), fdc = fwidth(dc) + 0.02;
        road = max(road, 1.0 - smoothstep(1.4 - fdc, 1.4 + fdc, r1));
        road = max(road, 1.0 - smoothstep(1.4 - fdc, 1.4 + fdc, r2));
        diffuseColor.rgb = mix(diffuseColor.rgb, uRoad, road * 0.55);`);
    };
    ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gm);
    ground.rotation.x = -PI / 2; ground.scale.set(3000, 3000, 1); ground.receiveShadow = true;
    scene.add(ground);
    // The edge of the map: a low wall all the way round.
    W.wall = new THREE.Mesh(new THREE.CylinderGeometry(W.R + 4, W.R + 4, 5, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.BackSide }));
    W.wall.position.y = 2.5; W.wall.receiveShadow = true; scene.add(W.wall);

    // Fireflies: a points cloud that hovers around the ball at night.
    const fp = new Float32Array(120 * 3);
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fireflies = new THREE.Points(fg, capPoints(new THREE.PointsMaterial({ color: 0xfff08a, size: 0.2, map: dotTex(), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
    fireflies.frustumCulled = false; fireflies.userData.seeds = Array.from({ length: 120 }, () => [Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1, Math.random() * 6]);
    scene.add(fireflies);

    initParticles();
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    W.scene = scene; W.camera = camera; W.renderer = renderer;
  };

  W.setQuality = function (s) {
    W.setQualityLimits(s);
    renderer.shadowMap.enabled = s.shadows !== false;
    sun.castShadow = s.shadows !== false;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  };

  // ---------- Themes ----------
  W.setTheme = function (key) {
    const T = THEMES[key] || THEMES.w;
    W.theme = T;
    sky.material.uniforms.top.value.copy(lin(T.skyTop)); sky.material.uniforms.bot.value.copy(lin(T.skyBot));
    scene.fog.color.copy(lin(T.fog));
    ground.material.color.copy(lin(T.ground));
    groundU.uGrid.value.copy(lin(T.grid)); groundU.uPatch.value.copy(lin(T.patch)); groundU.uRoad.value.copy(lin(T.road));
    W.wall.material.color.copy(lin(T.wall));
    sun.color.copy(lin(T.sun)); sun.intensity = T.sunI;
    hemi.color.copy(lin(T.hemiSky)); hemi.groundColor.copy(lin(T.hemiGround)); hemi.intensity = T.hemiI;
    renderer.toneMappingExposure = T.exposure;
    P.material('glow').emissiveIntensity = T.glow;
    stars.visible = moon.visible = fireflies.visible = T.night;
  };


  // ---------- Objects: a fixed map laid out in rings ----------
  // Static props are drawn with InstancedMesh (one per prop type per 100-unit cell, so off-screen cells are
  // culled). Broken props hide and grow back. Walkers, circlers, event props and the boss are plain meshes.
  const RL = MD.Rules, ROLES = P.ROLES;
  const CELL = 16;
  const M4 = new THREE.Matrix4(), QQ = new THREE.Quaternion(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), UPY = new THREE.Vector3(0, 1, 0);
  const layouts = {}; // per theme, built once
  let L = null;       // current layout
  W.dynamic = [];

  const v = (r, deg) => { const a = deg * PI / 180; return { x: r * Math.sin(a), z: -r * Math.cos(a) }; };
  const faceIn = (x, z) => Math.atan2(-x, -z);
  const onRoad = (x, z, pad) => {
    const d = Math.hypot(x, z);
    if (Math.min(Math.abs(x), Math.abs(z)) < 2.8 + pad && d > 13) return true;
    return Math.abs(d - 88) < 2.2 + pad || Math.abs(d - 142) < 2.2 + pad;
  };

  function makeObj(roleKey, typeKey, x, z, ry, sMul) {
    const role = ROLES[roleKey], t = P.BY[typeKey];
    const s = Math.min(role.h / t.h, role.r / Math.max(0.05, t.foot)) * (sMul || 1);
    return {
      role: roleKey, type: t, x, z, ry, scale: s, y: 0,
      h: t.h * s, foot: t.foot * s, hx: t.hx * s, hz: t.hz * s, size: t.size * s,
      gate: role.gate, gain: role.gain, tier: role.tier, fades: !!role.fades, light: !!role.light,
      chunks: role.chunks, chunkGain: role.chunkGain, name: t.name, alive: true, grow: 1, regrowAt: 0,
    };
  }

  function buildLayout(key) {
    seed = (key === 'w' ? 1031 : 2063) >>> 0;
    const objs = [], occ = [];
    const free = (x, z, r) => occ.every(o => Math.hypot(o.x - x, o.z - z) >= o.r + r);
    const pick = role => { const list = ROLES[role][key]; return list[Math.floor(rand() * list.length)]; };
    const put = (role, x, z, ry, s, reserve) => { const o = makeObj(role, pick(role), x, z, ry, s); objs.push(o); if (reserve) occ.push({ x, z, r: reserve }); return o; };

    occ.push({ x: 0, z: -2, r: 16 }); // the boss sits in the middle
    for (let i = 0; i < 8; i++) { const p = v(64, 22.5 + 45 * i); put('house', p.x, p.z, faceIn(p.x, p.z), 1, 9.5); }
    for (let i = 0; i < 4; i++) {
      const a = v(36, 45 + 90 * i); put('arm', a.x, a.z, faceIn(a.x, a.z), 1, 3.5);
      const b = v(76, 45 + 90 * i + (rand() - 0.5) * 6); put('arm', b.x, b.z, faceIn(b.x, b.z), 0.95, 3.5);
    }
    [0, 90, 180, 270].forEach(dir => [26, 44, 70, 104, 124, 158, 176, 187].forEach((r, n) => {
      const p = v(r, dir), o = v(4.2, dir + 90 * (n % 2 ? -1 : 1));
      put('lamp', p.x + o.x, p.z + o.z, faceIn(-o.x, -o.z), 1, 1.4);
    }));
    [[142, 16], [88, 10]].forEach(([ring, n]) => { for (let i = 0; i < n; i++) { const p = v(ring + 3.5 * (i % 2 ? -1 : 1), 360 / n * (i + 0.5)); put('lamp', p.x, p.z, faceIn(p.x, p.z), 1, 1.4); } });
    const towers = [[105, 101], [225, 96], [345, 134]];
    towers.forEach(([deg, r]) => { const p = v(r, deg); put('tower', p.x, p.z, faceIn(p.x, p.z), 1, ROLES.tower.r + 5); });
    const scatter = (role, n, r0, r1, rad, s0, s1) => {
      for (let k = 0, made = 0; made < n && k < n * 60; k++) {
        const p = v(r0 + rand() * (r1 - r0), rand() * 360);
        if (onRoad(p.x, p.z, rad * 0.6 + 0.8) || !free(p.x, p.z, rad)) continue;
        put(role, p.x, p.z, rand() * PI * 2, s0 + rand() * (s1 - s0), rad); made++;
      }
    };
    scatter('plant', 30, 95, 136, 6.5, 0.85, 1.25); scatter('box', 34, 93, 136, 3.2, 0.85, 1.2); scatter('arm', 3, 95, 134, 3.5, 0.9, 1.05);
    scatter('plant', 12, 148, 204, 6, 0.9, 1.3); scatter('plant', 6, 64, 89, 6, 0.9, 1.2); scatter('box', 6, 148, 200, 3, 0.85, 1.05);
    // Yards: a fenced square with a few small things inside.
    for (let made = 0, k = 0; made < 22 && k < 400; k++) {
      const c = v(97 + rand() * 35, rand() * 360);
      if (onRoad(c.x, c.z, 5) || !free(c.x, c.z, 5.5)) continue;
      made++; occ.push({ x: c.x, z: c.z, r: 5.5 });
      const ry = faceIn(c.x, c.z), cs = Math.cos(ry), sn = Math.sin(ry);
      const at = (a, b) => ({ x: c.x + cs * a + sn * b, z: c.z - sn * a + cs * b });
      const fence = (a, b, side) => { const p = at(a, b); put('fence', p.x, p.z, ry + (side ? PI / 2 : 0), 1); };
      [-1.8, 0, 1.8].forEach(a => fence(a * 0.8 * 1.6, -2.2 * 1.6, false));
      [-1.1, 1.1].forEach(b => { fence(-3 * 1.6, b * 1.6, true); fence(3 * 1.6, b * 1.6, true); });
      fence(-1.9 * 1.6, 2.2 * 1.6, false); fence(1.9 * 1.6, 2.2 * 1.6, false);
      const g = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < g; i++) { const p = at(-2.6 + i * (5.2 / Math.max(1, g - 1)), -0.8 + rand() * 0.6); put(rand() < 0.7 ? 'small' : 'small2', p.x, p.z, ry, 0.9 + rand() * 0.3); }
    }
    // Rows of small things: the outer "fresh" ring and the older inner ring.
    const row = (t, spacing, skip, mix) => {
      const n = Math.floor(2 * PI * t / spacing);
      for (let i = 0; i < n; i++) {
        if (rand() < skip) continue;
        const p = v(t + (rand() - 0.5) * 1.6, 360 / n * (i + (rand() - 0.5) * 0.4));
        if (onRoad(p.x, p.z, 1.2) || !free(p.x, p.z, 0.9)) continue;
        put(rand() < mix ? 'small' : 'small2', p.x, p.z, faceIn(p.x, p.z) + (rand() - 0.5) * 0.4, 0.85 + rand() * 0.4);
      }
    };
    const rows = Math.floor((200 - 148 - 6) / 3.3) + 1;
    for (let e = 0; e < rows; e++) row(151 + e * 3.3 + (rand() - 0.5) * 1.2, 4.6, 0.03, 0.62);
    for (let e = 0; e < 8; e++) row(96 + e * 5 + rand() * 3, 4.6, 0.15, 0.55);
    for (let i = 0; i < 60; i++) { const p = v(52 + rand() * 26, rand() * 360); if (!onRoad(p.x, p.z, 1.2) && free(p.x, p.z, 1)) put(rand() < 0.5 ? 'small' : 'small2', p.x, p.z, faceIn(p.x, p.z), 0.95 + rand() * 0.4); }
    // Spawn points at the four gates, each with a cluster of small things to start on.
    const spawns = [0, 90, 180, 270].map(b => { const p = v(194, b); return { x: p.x, z: p.z, heading: Math.atan2(-p.x, -p.z) }; });
    spawns.forEach(sp => {
      for (let k = 0, made = 0; made < 48 && k < 3000; k++) {
        const rr = Math.sqrt(2.5 * 2.5 + rand() * (11 * 11 - 2.5 * 2.5)), a = rand() * PI * 2;
        const x = sp.x + Math.sin(a) * rr, z = sp.z - Math.cos(a) * rr;
        if (Math.hypot(x, z) > 203 || objs.some(o => Math.hypot(o.x - x, o.z - z) < 1.4)) continue;
        put(rand() < 0.6 ? 'small' : 'small2', x, z, faceIn(sp.x - x, sp.z - z), 0.95 + rand() * 0.3); made++;
      }
    });
    // One InstancedMesh per prop type for the whole map. Each frame only the instances that are near the camera
    // and not behind it are packed into the front of the buffer (see refreshInstances), so a type costs one
    // draw call however many of it there are.
    const groups = new Map();
    objs.forEach(o => { (groups.get(o.type.key) || groups.set(o.type.key, []).get(o.type.key)).push(o); });
    const meshes = [];
    groups.forEach(list => {
      // Small stuff (thousands of them) always uses the low-poly version; big things keep full detail.
      const t = list[0].type, src = list[0].tier <= 2 || list.length > 12 ? t.geoLo : t.geo;
      const im = new THREE.InstancedMesh(src, t.glow ? P.material('glow') : P.material('base'), list.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0;
      // Everything casts a shadow (small things too, or they look like they float) and is shaded by bigger things.
      im.castShadow = true; im.receiveShadow = true;
      im.userData.list = list; im.userData.dirty = true;
      list.forEach(o => { o.im = im; o.vis = 1; });
      meshes.push(im);
    });
    // Collision grid.
    const grid = new Map(), wide = [];
    objs.forEach(o => { if (o.foot > CELL / 2) wide.push(o); else { const k = cellKey(o.x, o.z); (grid.get(k) || grid.set(k, []).get(k)).push(o); } });
    const walkSeeds = [];
    for (let i = 0; i < 10; i++) { const p = v(95 + 6 + rand() * 34, rand() * 360); walkSeeds.push({ role: 'walker', x: p.x, z: p.z }); }
    [[115, 40, 16], [107, 160, 15], [120, 250, 17], [166, 300, 18]].forEach(([r, deg, rad]) => { const c = v(r, deg); for (let i = 0; i < 3; i++) walkSeeds.push({ role: 'circler', cx: c.x, cz: c.z, rad, a: i / 3 * PI * 2 }); });
    seed = (Date.now() & 0xffffffff) >>> 0;
    return { key, objs, meshes, grid, wide, spawns, walkSeeds };
  }
  const cellKey = (x, z) => (Math.floor(x / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512);

  // How big an instance is drawn (0 = not drawn); the buffers are rebuilt from this in refreshInstances.
  function setInst(o, s) { if (o.vis !== s) { o.vis = s; o.im.userData.dirty = true; } }
  const FWD = new THREE.Vector3();
  let refreshT = 0, refreshX = 1e9, refreshZ = 1e9, refreshYaw = 0;
  const CAMD = new THREE.Vector3();
  function refreshInstances(all) {
    if (!L) return;
    const cx = camera.position.x, cz = camera.position.z, far = camera.far, far2 = far * far;
    camera.getWorldDirection(FWD); const fl = Math.hypot(FWD.x, FWD.z) || 1, fx = FWD.x / fl, fz = FWD.z / fl;
    for (const im of L.meshes) {
      if (!all && !im.userData.dirty) continue;
      let n = 0;
      for (const o of im.userData.list) {
        if (!(o.vis > 0)) continue;
        const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz, rr = far + o.size;
        if (d2 > rr * rr) continue;
        // Behind the camera: keep only what is close (it can still cast shadows into view).
        if (d2 > 900 && dx * fx + dz * fz < -o.size) continue;
        QQ.setFromAxisAngle(UPY, o.ry);
        M4.compose(V1.set(o.x, 0, o.z), QQ, V2.setScalar(o.scale * o.vis));
        im.setMatrixAt(n++, M4);
      }
      im.count = n; im.instanceMatrix.needsUpdate = true; im.userData.dirty = false;
    }
  }

  // (Re)build the world for a theme: the layout is made once per theme, then just reset.
  W.build = function (key) {
    if (L && L.key !== key) L.meshes.forEach(m => scene.remove(m));
    if (!layouts[key]) layouts[key] = buildLayout(key);
    L = layouts[key];
    L.meshes.forEach(m => { if (!m.parent) scene.add(m); });
    L.objs.forEach(o => { o.alive = true; o.grow = 1; o.camHidden = false; o.vis = 1; });
    L.meshes.forEach(m => { m.userData.dirty = true; });
    refreshX = 1e9;
    W.spawns = L.spawns;
    W.clearDynamic();
    L.walkSeeds.forEach(s => {
      const o = W.addDynamic(s.role, s.role === 'circler' ? s.cx + Math.cos(s.a) * s.rad : s.x, s.role === 'circler' ? s.cz + Math.sin(s.a) * s.rad : s.z);
      o.mobile = s.role; o.cx = s.cx; o.cz = s.cz; o.orbit = s.rad; o.ang = s.a;
    });
    placeBoss(key);
    clearChunks();
    W.objectsCount = L.objs.length;
  };

  // Plain-mesh props: walkers, circlers, event spawns, golden things.
  W.addDynamic = function (roleKey, x, z, opts) {
    opts = opts || {};
    const list = ROLES[roleKey][W.theme.key];
    const o = makeObj(roleKey, opts.type || list[Math.floor(rand() * list.length)], x, z, rand() * PI * 2, opts.s || 1);
    o.dynamic = true; o.golden = !!opts.golden;
    if (o.golden) { o.gain = 10; o.name = 'Golden ' + o.name.toLowerCase(); }
    o.mesh = new THREE.Mesh(o.type.geo, o.golden ? P.material('gold') : o.type.glow ? P.material('glow') : P.material('base'));
    o.mesh.scale.setScalar(o.scale); o.mesh.position.set(x, 0, z); o.mesh.rotation.y = o.ry; o.mesh.castShadow = true;
    o.walkDir = rand() * PI * 2; o.walkT = rand() * 3; o.phase = rand() * 6;
    o.mobile = opts.mobile || null;
    if (opts.grow) { o.grow = 0; o.mesh.scale.setScalar(0.001); }
    scene.add(o.mesh); W.dynamic.push(o);
    return o;
  };
  W.clearDynamic = function () { W.dynamic.forEach(o => { if (o.mesh.parent) o.mesh.parent.remove(o.mesh); }); W.dynamic.length = 0; };

  // ---------- The boss: built once per theme and reused ----------
  const bossCache = {};
  function placeBoss(key) {
    if (W.boss && W.boss.mesh.parent) W.boss.mesh.parent.remove(W.boss.mesh);
    const T = THEMES[key];
    if (!bossCache[key]) bossCache[key] = makeBoss(key);
    const { g, foot } = bossCache[key];
    g.position.set(0, 0, -2); g.rotation.set(0, PI, 0); g.scale.setScalar(1);
    scene.add(g);
    W.boss = { boss: true, mesh: g, x: 0, z: -2, ry: PI, foot, hx: foot * 0.75, hz: foot * 0.75, h: 23, size: 14, gate: RL.BOSS_GATE, gain: 0, tier: 8, name: T.boss.name, alive: true, type: { key: 'boss', name: T.boss.name, quack: true } };
  }
  // Bake a static model made of many meshes into one vertex-coloured mesh: one draw call instead of ~100.
  function bake(root) {
    const g0 = new THREE.Group(); g0.add(root); g0.updateMatrixWorld(true);
    const pos = [], nor = [], col = [], m = new THREE.Matrix4();
    root.traverse(o => {
      if (!o.isMesh || !o.visible || !o.material || !o.material.color) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(m.copy(o.matrixWorld));
      const c = o.material.color, Pp = g.attributes.position, Nn = g.attributes.normal;
      for (let i = 0; i < Pp.count; i++) { pos.push(Pp.getX(i), Pp.getY(i), Pp.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); col.push(c.r, c.g, c.b); }
      g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  function makeBoss(key) {
    const g = new THREE.Group();
    if (key === 'w') {
      const d = MD.buildDuck('graphite');
      d.legs.forEach(Lg => { Lg.hip.rotation.x = -0.5; Lg.knee.rotation.x = 1.0; Lg.ankle.rotation.x = -0.5; });
      d.pelvis.position.y = 0.76; d.neck1.rotation.x = 0.2; d.headPivot.rotation.x = -0.15;
      MD.putHat(d, 'crown');
      d.root.scale.setScalar(9.5);
      g.add(new THREE.Mesh(bake(d.root), P.material('base')));
    } else {
      const b = P.B(); P.rubberDuck(b, 0xf5c518, 34);
      g.add(new THREE.Mesh(b.geo(), P.material('base')));
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { g, foot: 11 };
  }

  // ---------- Queries ----------
  W.query = function (x, z, rad, fn) {
    if (!L) return;
    for (const o of L.wide) if (o.alive) fn(o);
    const n = Math.ceil(rad / CELL) + 1, cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const list = L.grid.get((cx + i + 512) * 1024 + (cz + j + 512));
      if (list) for (const o of list) if (o.alive) fn(o);
    }
    for (const o of W.dynamic) if (o.alive) fn(o);
    if (W.boss && W.boss.alive) fn(W.boss);
  };

  // A ball broke this: hide it, schedule regrowth, throw chunks.
  W.breakObj = function (o, ball) {
    o.alive = false;
    if (o.dynamic) { if (o.mesh.parent) o.mesh.parent.remove(o.mesh); const i = W.dynamic.indexOf(o); if (i >= 0) W.dynamic.splice(i, 1); }
    else if (o.boss) { /* the mesh is moved onto the ball by the caller */ }
    else { setInst(o, 0); o.regrowAt = W.time + RL.regrow(o.tier); }
    if (o.chunks && o.chunkGain) throwChunks(o, ball);
  };

  // ---------- Chunks: pieces that fly off a broken thing; any ball can pick them up ----------
  const CH_MAX = 170, chunks = [];
  let chMesh = null;
  const chColors = [0xf5c518, 0xeee8dd, 0xe8443a, 0x8cc4ea, 0x5bd66f, 0xb8a5dd, 0xc89b62];
  function initChunks() {
    chMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), CH_MAX);
    chMesh.frustumCulled = false; chMesh.castShadow = true;
    for (let i = 0; i < CH_MAX; i++) { chunks.push({ life: 0 }); M4.makeScale(0.0001, 0.0001, 0.0001); chMesh.setMatrixAt(i, M4); chMesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    scene.add(chMesh);
  }
  let chNext = 0;
  function throwChunks(o, ball) {
    if (!chMesh) initChunks();
    const s = Math.min(1.2, 0.18 + Math.cbrt(o.chunkGain) * 0.22);
    for (let k = 0; k < o.chunks; k++) {
      const c = chunks[chNext]; c.i = chNext; chNext = (chNext + 1) % CH_MAX;
      const a = rand() * PI * 2, sp = 3 + rand() * 4;
      c.x = o.x; c.z = o.z; c.y = Math.min(o.h * 0.6, 3);
      c.vx = Math.cos(a) * sp + (ball ? ball.vx * 0.4 : 0); c.vz = Math.sin(a) * sp + (ball ? ball.vz * 0.4 : 0); c.vy = 3 + rand() * 4;
      c.life = 24; c.age = 0; c.gain = o.chunkGain; c.s = s; c.rot = rand() * 6;
      chMesh.setColorAt(c.i, lin(chColors[Math.floor(rand() * chColors.length)]));
    }
    chMesh.instanceColor.needsUpdate = true;
  }
  function clearChunks() { chunks.forEach(c => { c.life = 0; }); if (chMesh) { for (let i = 0; i < CH_MAX; i++) { M4.makeScale(0.0001, 0.0001, 0.0001); chMesh.setMatrixAt(i, M4); } chMesh.instanceMatrix.needsUpdate = true; } }
  function updateChunks(dt, balls) {
    if (!chMesh) return;
    let dirty = false;
    for (const c of chunks) {
      if (c.life <= 0) continue;
      c.life -= dt; c.age += dt; dirty = true;
      if (c.y > 0 || c.vy > 0) { c.vy -= 18 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y = Math.max(0, c.y + c.vy * dt); if (c.y <= 0) { c.vy = 0; c.vx *= 0.3; c.vz *= 0.3; } }
      if (c.age > 0.45) for (const b of balls) {
        if (!b.alive || b.dead) continue;
        if (Math.abs(b.x - c.x) < b.r + c.s && Math.abs(b.z - c.z) < b.r + c.s && Math.hypot(b.x - c.x, b.z - c.z) < b.r + c.s * 0.8) { b.onChunk && b.onChunk(c.gain); c.life = 0; break; }
      }
      const sc = c.life > 0 ? c.s * Math.min(1, c.life) : 0.0001;
      QQ.setFromAxisAngle(UPY, c.rot);
      M4.compose(V1.set(c.x, c.y + sc * 0.5, c.z), QQ, V2.setScalar(sc));
      chMesh.setMatrixAt(c.i, M4);
    }
    if (dirty) chMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Per-frame updates ----------
  const tmp = new THREE.Vector3();
  // Light direction and the two ground axes of the light's view (for snapping shadows to texels).
  const SUN_D = new THREE.Vector3(0.9, 2.2, 0.6).normalize();
  const SUN_R = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_D).normalize();
  const SUN_U = new THREE.Vector3().crossVectors(SUN_D, SUN_R).setY(0).normalize();
  W.update = function (dt, balls, focus, D) {
    W.time += dt;
    // Regrowth: broken props come back when no ball is sitting on them, with a quick grow animation.
    if (L) {
      for (const o of L.objs) {
        if (!o.alive && o.regrowAt && W.time >= o.regrowAt) {
          if (balls.some(b => Math.hypot(b.x - o.x, b.z - o.z) < b.r + o.foot + 1)) { o.regrowAt = W.time + 2; continue; }
          o.alive = true; o.grow = 0.01; o.regrowAt = 0;
        }
        if (o.alive && o.grow < 1) { o.grow = Math.min(1, o.grow + dt * 2.5); if (!o.camHidden) setInst(o, o.grow * (2 - o.grow)); }
      }
    }
    for (const o of W.dynamic) {
      if (o.grow < 1) { o.grow = Math.min(1, o.grow + dt * 3); o.mesh.scale.setScalar(o.scale * (o.grow * (2 - o.grow))); }
      if (o.mobile) move(o, dt, balls);
    }
    updateChunks(dt, balls);
    const camP = camera.position;
    refreshT -= dt;
    // Rebuild the instance lists when the camera has moved or turned enough, so things at the edge of the
    // view are already drawn when they come into it (a fast turn used to pop them in).
    camera.getWorldDirection(CAMD);
    const yaw = Math.atan2(CAMD.x, CAMD.z), turned = Math.abs(Math.atan2(Math.sin(yaw - refreshYaw), Math.cos(yaw - refreshYaw))) > 0.15;
    const moved = Math.hypot(camP.x - refreshX, camP.z - refreshZ) > 4;
    if (refreshT <= 0 || moved || turned) { refreshT = 0.25; refreshX = camP.x; refreshZ = camP.z; refreshYaw = yaw; refreshInstances(true); } else refreshInstances(false);
    const far = camera.far * 0.9;
    sky.position.copy(camP); sky.scale.setScalar(far);
    stars.position.copy(camP); stars.scale.setScalar(far * 0.98);
    moon.position.copy(camP).add(tmp.set(-0.45, 0.42, -0.78).multiplyScalar(far * 0.95)); moon.scale.setScalar(far);
    if (W.theme.night) updateFireflies(focus, dt);
    // Sun shadows follow the camera focus. To stop them shimmering as you move, the shadow area grows in fixed
    // steps and its centre snaps to whole shadow-map texels in the light's own frame.
    const span = 30 * Math.pow(1.25, Math.max(0, Math.ceil(Math.log(Math.max(30, D * 2.2) / 30) / Math.log(1.25))));
    const texel = (2 * span) / sun.shadow.mapSize.x;
    const u = focus.x * SUN_R.x + focus.z * SUN_R.z, w = focus.x * SUN_U.x + focus.z * SUN_U.z;
    const du = Math.round(u / texel) * texel - u, dw = Math.round(w / texel) * texel - w;
    const fx = focus.x + SUN_R.x * du + SUN_U.x * dw, fz = focus.z + SUN_R.z * du + SUN_U.z * dw;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + SUN_D.x * span * 2.5, SUN_D.y * span * 2.5, fz + SUN_D.z * span * 2.5);
    const sc = sun.shadow.camera;
    if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 0.5; sc.far = span * 6; sc.updateProjectionMatrix(); sun.shadow.normalBias = texel * 1.2; }
    groundU.uScale.value = Math.max(0.5, focus.r * 3);
    scene.fog.near = 30 + D * 2; scene.fog.far = W.fogFar(D);
    updateParticles(dt);
  };

  // Walkers amble around their band and shy away from balls; circlers drive or hop in loops.
  function move(o, dt, balls) {
    o.phase += dt * 10;
    if (o.mobile === 'circler') {
      o.ang += dt * 0.35;
      const nx = o.cx + Math.cos(o.ang) * o.orbit, nz = o.cz + Math.sin(o.ang) * o.orbit;
      o.ry = Math.atan2(nx - o.x, nz - o.z); o.x = nx; o.z = nz;
      // Drones hover and bob; anything else that circles stays on the ground.
      const hop = o.type.walk === 'fly' ? 1.4 + Math.sin(o.phase * 0.25) * 0.35 : o.type.walk === 'hop' ? Math.abs(Math.sin(o.phase * 0.5)) * 0.5 : 0;
      o.mesh.position.set(o.x, hop, o.z); o.mesh.rotation.set(0, o.ry, 0);
      return;
    }
    o.walkT -= dt;
    let near = null, nd = 1e9;
    for (const b of balls) { if (!b.alive) continue; const d = Math.hypot(b.x - o.x, b.z - o.z) - b.r; if (d < nd) { nd = d; near = b; } }
    if (near && nd < 6) o.walkDir = Math.atan2(o.x - near.x, o.z - near.z);
    else if (o.walkT <= 0) { o.walkT = 1.5 + rand() * 3; o.walkDir += (rand() - 0.5) * 2.4; }
    const d0 = Math.hypot(o.x, o.z);
    if (o.mobile === 'walker' && (d0 < 95 || d0 > 140)) o.walkDir = Math.atan2(d0 < 95 ? o.x : -o.x, d0 < 95 ? o.z : -o.z);
    const sp = 1.3 * (near && nd < 6 ? 2 : 1);
    o.x += Math.sin(o.walkDir) * sp * dt; o.z += Math.cos(o.walkDir) * sp * dt;
    const ed = Math.hypot(o.x, o.z); if (ed > RL.MAP_R - 3) { o.x *= (RL.MAP_R - 3) / ed; o.z *= (RL.MAP_R - 3) / ed; o.walkDir += PI; }
    o.ry += ((o.walkDir - o.ry + PI * 3) % (PI * 2) - PI) * Math.min(1, dt * 6);
    o.mesh.position.set(o.x, Math.abs(Math.sin(o.phase)) * 0.08, o.z);
    o.mesh.rotation.set(0, o.ry, Math.sin(o.phase) * 0.12);
  }

  function updateFireflies(ball, dt) {
    const p = fireflies.geometry.attributes.position, s = fireflies.userData.seeds, R = Math.max(3, ball.r * 10);
    fireflies.material.size = Math.max(0.06, ball.r * 0.09);
    for (let i = 0; i < s.length; i++) {
      const q = s[i], t = W.time * 0.4 + q[3];
      p.setXYZ(i, ball.x + (q[0] + Math.sin(t * 1.3) * 0.1) * R, ball.r * (0.5 + q[1] * 4 + Math.sin(t * 2) * 0.4), ball.z + (q[2] + Math.cos(t) * 0.1) * R);
    }
    p.needsUpdate = true;
  }

  // A soft round dot shared by particles and fireflies.
  let dot = null;
  function dotTex() {
    if (dot) return dot;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (dot = new THREE.CanvasTexture(c));
  }

  // ---------- Particles: one pooled points cloud with per-particle colour ----------
  const PN = 900;
  let pts, pPos, pCol, pool = [];
  function initParticles() {
    pPos = new Float32Array(PN * 3); pCol = new Float32Array(PN * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    pts = new THREE.Points(g, capPoints(new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, depthWrite: false, map: dotTex() })));
    pts.frustumCulled = false; scene.add(pts);
    for (let i = 0; i < PN; i++) { pool.push({ life: 0 }); pPos[i * 3 + 1] = -9999; }
  }
  let pNext = 0;
  W.burst = function (pos, color, n, speed, opts) {
    opts = opts || {};
    const c = lin(color);
    for (let k = 0; k < n; k++) {
      const p = pool[pNext]; p.i = pNext; pNext = (pNext + 1) % PN;
      const a = Math.random() * PI * 2, up = opts.up != null ? opts.up : 0.6 + Math.random();
      p.x = pos.x; p.y = pos.y; p.z = pos.z;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = up * speed;
      p.g = opts.g != null ? opts.g : speed * 2.2; p.life = p.max = (opts.life || 0.7) * (0.6 + Math.random() * 0.6);
      const j = opts.rainbow ? new THREE.Color().setHSL(Math.random(), 0.8, 0.6).convertSRGBToLinear() : c;
      pCol[p.i * 3] = j.r; pCol[p.i * 3 + 1] = j.g; pCol[p.i * 3 + 2] = j.b;
    }
  };
  W.particleSize = s => { pts.material.size = s; };
  let pWasAlive = false;
  function updateParticles(dt) {
    let any = false;
    for (const p of pool) {
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      pPos[p.i * 3] = p.x; pPos[p.i * 3 + 1] = p.life > 0 ? p.y : -9999; pPos[p.i * 3 + 2] = p.z;
    }
    if (any || pWasAlive) { pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true; }
    pWasAlive = any;
  }

  W.fogFar = D => 110 + D * 5;

  // ---------- Props between the camera and the ball are hidden, so they never block the view ----------
  let occ = new Set();
  W.occlude = function (cx, cy, cz, bx, by, bz, br) {
    const next = new Set();
    const sx = bx - cx, sz = bz - cz, len2 = sx * sx + sz * sz;
    if (L && len2 > 1e-4) {
      const half = Math.sqrt(len2) / 2;
      W.query((cx + bx) / 2, (cz + bz) / 2, half + 8, o => {
        if (o.dynamic || o.boss) return;
        // Hysteresis: a prop already hidden needs to clear the line by a margin before it shows again, otherwise
        // props right on the edge blink on and off as the camera sways.
        const was = occ.has(o), k = was ? 1.25 : 1;
        const t = ((o.x - cx) * sx + (o.z - cz) * sz) / len2;
        if (t <= (was ? 0 : 0.02) || t >= (was ? 0.95 : 0.9)) return;
        const dist = Math.hypot(cx + sx * t - o.x, cz + sz * t - o.z);
        const lineY = cy + (by - cy) * t;
        if (dist < (o.foot * 0.85 + br * 0.3) * k && o.h > lineY * 0.85 / k) next.add(o);
      });
    }
    // And anything the camera itself is in or right next to: the near plane would cut it open and you'd see
    // into it (or straight through it, since back faces aren't drawn).
    if (L) W.query(cx, cz, 16, o => {
      if (o.dynamic || o.boss) return;
      const m = occ.has(o) ? 1.3 : 1.1;
      if (Math.hypot(o.x - cx, o.z - cz) < o.foot * m + camera.near * 2 && o.h > cy - camera.near * 2) next.add(o);
    });
    occ.forEach(o => { if (!next.has(o)) { o.camHidden = false; if (o.alive) setInst(o, o.grow < 1 ? o.grow * (2 - o.grow) : 1); } });
    next.forEach(o => { if (!occ.has(o)) { o.camHidden = true; setInst(o, 0); } });
    occ = next;
  };

  // ---------- Adaptive resolution: drop the pixel ratio when frames run long, raise it back when there is room ----------
  const ADAPT = { avg: 1 / 60, t: 0, pr: 1, min: 0.7, max: 2 };
  W.setQualityLimits = function (s) {
    const dpr = window.devicePixelRatio || 1;
    ADAPT.max = s.quality === 'low' ? Math.min(dpr, 1) : Math.min(dpr, 2);
    ADAPT.min = Math.min(0.7, ADAPT.max);
    ADAPT.pr = Math.min(ADAPT.max, 1.5);
    renderer.setPixelRatio(ADAPT.pr);
  };
  W.adapt = function (rawDt) {
    if (!(rawDt > 0) || rawDt > 0.25) return; // tab switches and pauses don't count
    ADAPT.avg += (rawDt - ADAPT.avg) * 0.05; ADAPT.t += rawDt;
    if (ADAPT.t < 2) return;
    ADAPT.t = 0;
    let pr = ADAPT.pr;
    if (ADAPT.avg > 1 / 50 && pr > ADAPT.min) pr = Math.max(ADAPT.min, pr - 0.15);
    else if (ADAPT.avg < 1 / 58 && pr < ADAPT.max) pr = Math.min(ADAPT.max, pr + 0.1);
    if (pr !== ADAPT.pr) { ADAPT.pr = pr; renderer.setPixelRatio(pr); }
  };
  W.pixelRatio = () => ADAPT.pr;

  W.render = function () { renderer.render(scene, camera); };
  return W;
})();
