// Progress and economy: screws (the currency), upgrades, cosmetics, one-run boosts, the rotating
// Parts Bin deal, 20-minute shifts with a modifier and a boss, run history and the Duck League.
// Everything lives in localStorage; reads and writes are guarded so a blocked storage still plays.
window.MD = window.MD || {};
MD.Save = (function () {
  const KEY = 'mdball-save-v1';
  const fresh = () => ({
    screws: 150, name: 'You', world: 'w',
    owned: { cw: ['cream'], hat: ['none'], shell: ['tape'], trail: ['none'] },
    equip: { cw: 'cream', hat: 'none', shell: 'tape', trail: 'none' },
    up: { battery: 0, motor: 0, beak: 0, start: 0, sorter: 0 },
    boosts: { espresso: 0, battery: 0, glue: 0, lucky: 0 },
    runs: [], best: { w: 0, p: 0 }, bestD: { w: 0, p: 0 }, stars: { w: 0, p: 0 }, bosses: {}, carry: { w: 12, p: 12 }, botLevel: 0,
    invited: false, totalRuns: 0, totalItems: 0, daily: { last: '', step: 0 },
    settings: { sound: true, shadows: true, quality: 'high' },
  });
  let S = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) S = deepMerge(fresh(), JSON.parse(raw));
  } catch (e) { /* storage blocked: play with a fresh save */ }
  if (S.world !== 'w' && S.world !== 'p') S.world = 'w';
  function deepMerge(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  // Another tab saved: take its progress so the two tabs don't overwrite each other's screws.
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    try { S = deepMerge(fresh(), JSON.parse(e.newValue)); api.S = S; api.onExternal && api.onExternal(); } catch (err) { /* ignore */ }
  });

  // ---------- Upgrades ----------
  const UPGRADES = [
    { key: 'battery', name: 'Bigger battery', icon: '🔋', desc: lv => `Turbo lasts ${(4.8 * (1 + 0.15 * lv)).toFixed(1)} s`, step: '+15% turbo', max: 6, base: 120 },
    { key: 'motor', name: 'Faster servos', icon: '⚙️', desc: lv => `${100 + 4 * lv}% top speed`, step: '+4% speed', max: 6, base: 150 },
    { key: 'beak', name: 'Sticky beak', icon: '🧲', desc: lv => `Breaks things ${3 * lv}% heavier than you`, step: '+3% breaking reach', max: 6, base: 180 },
    { key: 'start', name: 'Starter chassis', icon: '🟡', desc: lv => `Start with at least ${12 + 10 * lv} kg`, step: '+10 kg at the start', max: 5, base: 140 },
    { key: 'sorter', name: 'Screw sorter', icon: '🔩', desc: lv => `${100 + 10 * lv}% screws per run`, step: '+10% screws', max: 6, base: 200 },
  ];
  const upCost = (u, lv) => Math.round(u.base * Math.pow(1.7, lv) / 10) * 10;

  // ---------- Cosmetics ----------
  const COSMETICS = {
    cw: [
      { key: 'cream', name: 'Cream', price: 0 }, { key: 'graphite', name: 'Graphite', price: 400 },
      { key: 'lavender', name: 'Lavender', price: 600 }, { key: 'sky', name: 'Sky', price: 600 },
      { key: 'mint', name: 'Mint', price: 900 }, { key: 'sunset', name: 'Sunset', price: 1200 }, { key: 'gold', name: 'Solid gold', price: 6000 },
    ],
    hat: [
      { key: 'none', name: 'No hat', price: 0 }, { key: 'propeller', name: 'Propeller', price: 300 }, { key: 'party', name: 'Party', price: 300 },
      { key: 'chef', name: 'Chef', price: 500 }, { key: 'grad', name: 'Graduate', price: 800 }, { key: 'santa', name: 'Santa', price: 800 }, { key: 'crown', name: 'Crown', price: 3500 },
    ],
    shell: [
      { key: 'tape', name: 'Factory plastic', price: 0 }, { key: 'bubble', name: 'Bubble wrap', price: 400 }, { key: 'lab', name: 'Lab grid', price: 600 },
      { key: 'disco', name: 'Disco', price: 1500 }, { key: 'lava', name: 'Lava', price: 2000 }, { key: 'galaxy', name: 'Galaxy', price: 3000 },
    ],
    trail: [
      { key: 'none', name: 'No trail', price: 0 }, { key: 'dust', name: 'Dust', price: 200 }, { key: 'sparkle', name: 'Sparkles', price: 600 },
      { key: 'bubbles', name: 'Bubbles', price: 800 }, { key: 'confetti', name: 'Confetti', price: 1200 }, { key: 'notes', name: 'Quack notes', price: 1800 },
      { key: 'rainbow', name: 'Rainbow', price: 0, exclusive: 'Day 7 of the daily crate' },
    ],
  };
  const SLOT_NAMES = { cw: 'Colorway', hat: 'Hat', shell: 'Shell finish', trail: 'Trail' };

  // ---------- One-run boosts ----------
  const BOOSTS = [
    { key: 'espresso', name: 'Espresso shot', icon: '☕', desc: '+25% speed for one run', price: 120 },
    { key: 'battery', name: 'Spare battery', icon: '🔋', desc: 'Turbo refills twice as fast for one run', price: 150 },
    { key: 'glue', name: 'Hot glue', icon: '🧴', desc: 'Break things 10% heavier for one run', price: 180 },
    { key: 'lucky', name: 'Lucky screw', icon: '✨', desc: '3× golden ducks for one run', price: 100 },
  ];

  // ---------- Shifts: a new modifier and a fresh boss every 20 minutes ----------
  const SHIFT_MS = 20 * 60 * 1000, EPOCH = Date.UTC(2026, 10, 1);
  const MODS = [
    { key: 'normal', name: 'Regular shift', desc: 'Nothing weird is happening. Suspicious.' },
    { key: 'butter', name: 'Butter on the floor', desc: 'Everything slides. Steering is a suggestion.' },
    { key: 'golden', name: 'Golden hour', desc: 'Golden ducks show up 3× as often.' },
    { key: 'rush', name: 'Rush hour', desc: 'Twice as many ducks waddling around.' },
    { key: 'overtime', name: 'Overtime', desc: 'Turbo lasts 50% longer for everyone.' },
    { key: 'payday', name: 'Payday', desc: '+50% screws from every run.' },
  ];
  const hash = n => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; };
  function shift(now) {
    now = now || Date.now();
    const n = Math.floor((now - EPOCH) / SHIFT_MS) + 1;
    return { n, mod: MODS[hash(n) % MODS.length], left: SHIFT_MS - ((now - EPOCH) % SHIFT_MS) };
  }
  const bossKey = (world, n) => world + ':' + n;

  // ---------- Parts Bin featured deal: one cosmetic at 40% off, rotating every 10 minutes ----------
  const DEAL_MS = 10 * 60 * 1000;
  function deal(now) {
    now = now || Date.now();
    const slot = Math.floor(now / DEAL_MS);
    const all = [];
    for (const slotKey in COSMETICS) COSMETICS[slotKey].forEach(c => { if (c.price > 0 && c.price < 5000) all.push({ slot: slotKey, item: c }); });
    // The pick is stored per 10-minute slot, so buying the deal can't roll a new one in the same window.
    if (!S.deal || S.deal.n !== slot) {
      const unowned = all.filter(a => !S.owned[a.slot].includes(a.item.key));
      const pool = unowned.length ? unowned : all;
      const p = pool[hash(slot) % pool.length];
      S.deal = { n: slot, slot: p.slot, key: p.item.key };
      persist();
    }
    const item = COSMETICS[S.deal.slot].find(c => c.key === S.deal.key) || all[0].item;
    return { n: slot, slot: S.deal.slot, item, price: Math.round(item.price * 0.6 / 10) * 10, left: DEAL_MS - (now % DEAL_MS) };
  }

  // ---------- Run stats from upgrades, boosts and the shift ----------
  function runStats() {
    const u = S.up, b = S.boosts, mod = shift().mod.key;
    const used = {};
    for (const k in b) if (b[k] > 0) used[k] = true;
    return {
      turbo: (1 + 0.15 * u.battery) * (mod === 'overtime' ? 1.5 : 1),
      refill: used.battery ? 2 : 1,
      speed: (1 + 0.04 * u.motor) * (used.espresso ? 1.25 : 1),
      gateMul: (1 - 0.03 * u.beak) * (used.glue ? 0.9 : 1),
      startMass: Math.max(12 + 10 * u.start, MD.Rules.carry(S.carry[S.world] || 12)),
      carried: MD.Rules.carry(S.carry[S.world] || 12) > 12 + 10 * u.start,
      payMul: (1 + 0.1 * u.sorter) * (mod === 'payday' ? 1.5 : 1),
      goldMul: (used.lucky ? 3 : 1) * (mod === 'golden' ? 3 : 1),
      grip: mod === 'butter' ? 0.35 : 1,
      walkers: mod === 'rush' ? 2 : 1,
      used, mod,
    };
  }
  function consumeBoosts(used) { for (const k in used) S.boosts[k] = Math.max(0, S.boosts[k] - 1); persist(); }

  // ---------- Payout ----------
  const STAR_KG = [150, 1500, 12000]; // stars: reach 150 kg, 1.5 t, then topple the giant duck
  const STAR_BONUS = [200, 400, 800];
  // What a run would pay right now (no stars, boss or record bonuses), for the HUD.
  function estimate(massKg, place, tierScrews, golden, payMul) {
    return Math.round((MD.Rules.score(place, massKg, false) + (tierScrews || 0) + (golden || 0) * 40) * (payMul || 1));
  }
  function settle(run) {
    // run: { world, massKg, diameterM, items, golden, boss, milestoneScrews, payMul }
    const lines = [];
    // A run quit during the countdown or without grabbing anything pays nothing (no screw farming).
    if (run.early || !run.items) {
      S.runs.unshift({ t: Date.now(), world: run.world, massKg: run.massKg, diameterM: run.diameterM, items: run.items, screws: 0, best: run.bestItem, boss: false });
      S.runs = S.runs.slice(0, 12); persist();
      return { lines: [['Run ended before it began', 0]], total: 0, record: false, stars: 0 };
    }
    if (run.place && MD.Rules.PLACE[run.place - 1]) lines.push([`Place #${run.place}`, MD.Rules.PLACE[run.place - 1]]);
    lines.push(['Duck weight', MD.Rules.score(0, run.massKg, false)]);
    if (run.milestoneScrews) lines.push(['New tiers', run.milestoneScrews]);
    if (run.golden) lines.push([`Golden ducks ×${run.golden}`, run.golden * 40]);
    const sh = shift();
    if (run.boss) {
      const k = bossKey(run.world, run.shiftN || sh.n), first = !S.bosses[k];
      S.bosses[k] = true;
      lines.push([first ? 'Boss, first this shift' : 'Boss again', first ? 1500 : 300]);
    }
    const stars = run.boss ? 3 : STAR_KG.filter(k => run.massKg >= k).length;
    for (let i = S.stars[run.world]; i < stars; i++) lines.push([`${i + 1}★ first time`, STAR_BONUS[i]]);
    S.stars[run.world] = Math.max(S.stars[run.world], stars);
    const record = run.massKg > S.best[run.world];
    if (record && S.best[run.world] > 0) lines.push(['New record', 100]);
    let sum = lines.reduce((s, l) => s + l[1], 0);
    const mul = run.payMul || 1;
    if (mul > 1.001) { const extra = Math.round(sum * (mul - 1)); lines.push([`Multiplier ×${mul.toFixed(2)}`, extra]); sum += extra; }
    S.screws += sum;
    if (record) S.best[run.world] = run.massKg;
    S.bestD[run.world] = Math.max(S.bestD[run.world], run.diameterM);
    S.totalRuns++; S.totalItems += run.items;
    S.runs.unshift({ t: Date.now(), world: run.world, massKg: run.massKg, diameterM: run.diameterM, items: run.items, screws: sum, best: run.bestItem, boss: !!run.boss, place: run.place });
    // Part of the mass carries into the next run (toppling the boss starts you over); bots adapt to how you did.
    S.carry[run.world] = run.boss ? 12 : run.massKg;
    if (run.place === 1) S.botLevel = Math.min(3, (S.botLevel || 0) + 1); else if (run.place > 3) S.botLevel = Math.max(0, (S.botLevel || 0) - 1);
    S.runs = S.runs.slice(0, 12);
    persist();
    return { lines, total: sum, record, stars };
  }

  // ---------- Daily crate: a 7-day streak, missing a day starts it over ----------
  const DAILY = [
    { screws: 200 }, { item: true }, { screws: 500 }, { item: true }, { screws: 1000 }, { item: true }, { exclusive: ['trail', 'rainbow'], screws: 2000 },
  ];
  const dayKey = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function dailyState() {
    const today = dayKey(), y = new Date(); y.setDate(y.getDate() - 1);
    const ready = S.daily.last !== today;
    const cont = S.daily.last === dayKey(y);
    const step = ready ? (cont ? S.daily.step % 7 : 0) : (S.daily.step - 1 + 7) % 7; // 0-based step shown
    return { ready, step, streak: ready ? (cont ? S.daily.step : 0) : S.daily.step };
  }
  // Random cosmetic for the crate: cheaper ones are more likely; a duplicate turns into screws.
  function rollItem() {
    const pool = [];
    for (const slot in COSMETICS) COSMETICS[slot].forEach(c => { if (c.price > 0 && !c.exclusive) pool.push({ slot, c, w: 1 / Math.sqrt(c.price) }); });
    let t = pool.reduce((s, p) => s + p.w, 0) * Math.random();
    for (const p of pool) { t -= p.w; if (t <= 0) return p; }
    return pool[0];
  }
  function claimDaily() {
    const st = dailyState();
    if (!st.ready) return null;
    const R = DAILY[st.step], out = { step: st.step, screws: 0 };
    if (R.item) {
      const p = rollItem();
      if (S.owned[p.slot].includes(p.c.key)) { out.screws += 400; out.dupe = p.c.name; }
      else { S.owned[p.slot].push(p.c.key); out.item = p.c.name; out.slot = p.slot; }
    }
    if (R.exclusive) {
      const [slot, key] = R.exclusive;
      if (!S.owned[slot].includes(key)) { S.owned[slot].push(key); out.item = 'Rainbow trail'; out.slot = slot; }
    }
    out.screws += R.screws || 0;
    S.screws += out.screws;
    S.daily = { last: dayKey(), step: st.step + 1 };
    persist();
    return out;
  }

  // ---------- Duck League: CPU rivals plus your best ----------
  const RIVALS = [
    { name: 'Graphite #4812', kg: 24310 }, { name: 'Lavender the Influencer', kg: 18120 }, { name: 'Sky the Skater', kg: 13480 },
    { name: 'Overfit Cream', kg: 6020 }, { name: 'Intern duck', kg: 2410 }, { name: 'Sim duck v0.3', kg: 880 }, { name: 'Episode 0', kg: 150 },
  ];
  function league() {
    const you = Math.max(S.best.w, S.best.p);
    const rows = RIVALS.map(r => ({ name: r.name, kg: r.kg }));
    if (you > 0) rows.push({ name: S.name || 'You', kg: you, you: true });
    rows.sort((a, b) => b.kg - a.kg);
    return rows;
  }

  // ---------- Spending ----------
  function buyUpgrade(key) {
    const u = UPGRADES.find(x => x.key === key), lv = S.up[key];
    if (!u || lv >= u.max) return false;
    const c = upCost(u, lv);
    if (S.screws < c) return false;
    S.screws -= c; S.up[key]++; persist(); return true;
  }
  // The price is worked out here from the catalogue and the live deal, never taken from the page.
  function priceOf(slot, key) {
    const c = (COSMETICS[slot] || []).find(x => x.key === key);
    if (!c) return Infinity;
    const d = deal();
    return d.slot === slot && d.item.key === key ? d.price : c.price;
  }
  function buyCosmetic(slot, key) {
    const price = priceOf(slot, key), c = (COSMETICS[slot] || []).find(x => x.key === key);
    if (!c || c.exclusive || S.owned[slot].includes(key)) return false;
    if (S.screws < price) return false;
    S.screws -= price; S.owned[slot].push(key); S.equip[slot] = key; persist(); return true;
  }
  function equip(slot, key) { if (!S.owned[slot].includes(key)) return false; S.equip[slot] = key; persist(); return true; }
  function buyBoost(key) {
    const b = BOOSTS.find(x => x.key === key);
    if (!b || S.screws < b.price) return false;
    S.screws -= b.price; S.boosts[key]++; persist(); return true;
  }
  function invite() {
    if (S.invited) return 0;
    S.invited = true; S.screws += 1000; persist(); return 1000;
  }
  function reset() { S = fresh(); persist(); api.S = S; }

  const api = {
    S, persist, estimate, DAILY, dailyState, claimDaily, UPGRADES, upCost, COSMETICS, SLOT_NAMES, BOOSTS, MODS, shift, deal, bossKey, runStats, consumeBoosts,
    settle, league, priceOf, buyUpgrade, buyCosmetic, equip, buyBoost, invite, reset, STAR_KG,
  };
  return api;
})();
