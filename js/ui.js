// Menus, the shop and wardrobe sheets, the in-run HUD, results, and input (keyboard, gamepad, touch).
window.MD = window.MD || {};
MD.UI = (function () {
  const $ = id => document.getElementById(id);
  const Sv = MD.Save;
  const U = { input: { fwd: 0, turn: 0, boost: false } };
  const SCREW = '<svg class="screw"><use href="#i-screw"/></svg>';
  const fmtN = n => Math.round(n).toLocaleString('en-US');
  const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
  U.fmtSizeCm = cm => cm < 10 ? cm.toFixed(1) + ' cm' : cm < 100 ? Math.round(cm) + ' cm' : (cm / 100).toFixed(cm < 1000 ? 2 : 1) + ' m';
  U.fmtMass = kg => kg < 100 ? kg.toFixed(1) + ' kg' : fmtN(kg) + ' kg';
  U.clock = clock;

  // ---------- Toast and big banner ----------
  let toastT = 0;
  U.toast = function (msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false; t.style.opacity = 1;
    clearTimeout(toastT); clearTimeout(U._toastHide);
    toastT = setTimeout(() => { t.style.opacity = 0; U._toastHide = setTimeout(() => { t.hidden = true; }, 300); }, 2200);
  };
  let bigT = 0;
  let shoutT = 0;
  U.shout = function (word) {
    const s = $('shout');
    s.textContent = word; s.classList.remove('go'); void s.offsetWidth; s.classList.add('go');
    clearTimeout(shoutT); shoutT = setTimeout(() => s.classList.remove('go'), 700);
  };
  U.clearBig = function () { clearTimeout(bigT); $('big').innerHTML = ''; };
  U.big = function (text, sub, dur) {
    const b = $('big');
    b.innerHTML = `<div><div class="t"></div>${sub ? '<div class="s"></div>' : ''}</div>`;
    b.querySelector('.t').textContent = text;
    if (sub) b.querySelector('.s').textContent = sub;
    clearTimeout(bigT); bigT = setTimeout(() => { b.innerHTML = ''; }, (dur || 1.4) * 1000);
  };

  // ---------- Home ----------
  U.renderHome = function () {
    const S = Sv.S, sh = Sv.shift(), T = MD.World.THEMES[S.world];
    $('wallet').textContent = fmtN(S.screws);
    $('pName').textContent = S.name || 'You';
    const best = Math.max(S.best.w, S.best.p);
    $('pSub').textContent = best > 0 ? 'Best duck ' + U.fmtMass(best) : 'Ready to roll';
    document.querySelectorAll('#worlds button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.w === S.world)));
    $('playSub').textContent = (S.world === 'w' ? 'Into the robot lab' : 'Into the night lab') + ' · no clock, roll as long as you like';
    const chips = [];
    Sv.BOOSTS.forEach(b => { if (S.boosts[b.key] > 0) chips.push(`<span class="chip">${b.icon} ${b.name}</span>`); });
    if (sh.mod.key !== 'normal') chips.push(`<span class="chip">⚡ ${sh.mod.name}</span>`);
    $('boostChips').innerHTML = chips.join('');
    $('invPlus').hidden = S.invited;
    const ds = Sv.dailyState();
    $('dailyLine').textContent = ds.ready ? `Day ${ds.step + 1} of 7 is ready to open` : `Streak: ${ds.streak} day${ds.streak === 1 ? '' : 's'} · next crate tomorrow`;
    $('openDaily').classList.toggle('hot', ds.ready);
    // Top five, plus your own row with its real rank when you are further down.
    const all = Sv.league().map((r, i) => Object.assign({ rank: i + 1 }, r));
    const rows = all.slice(0, 5);
    const me = all.find(r => r.you);
    if (me && me.rank > 5) rows.push(me); else if (all[5]) rows.push(all[5]);
    $('league').innerHTML = rows.map(r => `<div class="lr${r.you ? ' you' : ''}"><span class="n">${r.rank}</span><span class="nm"></span><span class="kg">${fmtN(r.kg)} kg</span></div>`).join('');
    $('league').querySelectorAll('.nm').forEach((el, i) => { el.textContent = rows[i].name; });
    U.tickHome();
  };
  U.tickHome = function () {
    const S = Sv.S, sh = Sv.shift(), T = MD.World.THEMES[S.world];
    $('shiftNo').textContent = 'SHIFT ' + sh.n;
    $('shiftWorld').textContent = T.tag;
    $('shiftClock').textContent = clock(sh.left);
    $('shiftBar').style.width = (100 - sh.left / (20 * 60 * 10)) + '%';
    $('modName').textContent = sh.mod.name;
    $('modDesc').textContent = sh.mod.desc;
    const down = S.bosses[Sv.bossKey(S.world, sh.n)];
    $('bossLine').textContent = down ? `${T.boss.name} fell this shift` : `${T.boss.name} still stands`;
    const d = Sv.deal();
    const dc = $('dealClock');
    if (dc && !$('modal').hidden) { if (U._dealN !== d.n) U.openShop(); else dc.textContent = clock(d.left); }
    $('dealLine').textContent = `Deal: ${d.item.name} −40% · ${clock(d.left)}`;
  };

  // ---------- Modal sheets ----------
  function sheet(title, body, after) {
    $('sheet').innerHTML = `<header><h2></h2><span class="wal">${SCREW}<span>${fmtN(Sv.S.screws)}</span></span><button class="close" aria-label="Close">×</button></header>${body}`;
    $('sheet').querySelector('h2').textContent = title;
    $('sheet').querySelector('.close').onclick = U.closeModal;
    $('modal').hidden = false;
    if (after) after($('sheet'));
  }
  U.closeModal = function () { $('modal').hidden = true; U.onChange && U.onChange(); };
  $('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) U.closeModal(); });

  function swatch(slot, key) {
    if (slot === 'cw') { const c = MD.COLORWAYS[key]; return `<span class="sw" style="background:${c.css}"><span class="eye" style="border-color:${c.cssEye}"></span></span>`; }
    const icons = {
      hat: { none: '🚫', propeller: '🧢', party: '🥳', chef: '👨‍🍳', grad: '🎓', santa: '🎅', crown: '👑' },
      shell: { tape: '🩶', bubble: '🫧', lab: '🟦', disco: '🪩', lava: '🌋', galaxy: '🌌' },
      trail: { none: '🚫', dust: '💨', sparkle: '✨', bubbles: '🫧', confetti: '🎊', notes: '🎵', rainbow: '🌈' },
    };
    return `<span class="sw" style="background:#fff">${icons[slot][key] || '?'}</span>`;
  }

  let tuneTab = 'cw';
  U.openTune = function () {
    const S = Sv.S, deal = Sv.deal();
    const tabs = Object.keys(Sv.COSMETICS).map(k => `<button data-tab="${k}" aria-pressed="${k === tuneTab}">${Sv.SLOT_NAMES[k]}</button>`).join('');
    const items = Sv.COSMETICS[tuneTab].map(c => {
      const own = S.owned[tuneTab].includes(c.key), on = S.equip[tuneTab] === c.key;
      const isDeal = deal.slot === tuneTab && deal.item.key === c.key && !own;
      const price = isDeal ? deal.price : c.price;
      const lbl = own ? (on ? 'Equipped' : 'Equip') : c.exclusive ? c.exclusive : `${SCREW} ${isDeal ? `<s>${fmtN(c.price)}</s> ` : ''}${fmtN(price)}`;
      return `<div class="item${on ? ' on' : ''}">${isDeal ? '<span class="tagx">−40%</span>' : ''}${swatch(tuneTab, c.key)}<span>${c.name}</span><button class="buy" data-k="${c.key}" data-p="${price}" ${own && on ? 'disabled' : (!own && (c.exclusive || S.screws < price) ? 'disabled' : '')}>${lbl}</button></div>`;
    }).join('');
    sheet('Tune your duck', `<div class="tabs">${tabs}</div><div class="items">${items}</div>`, el => {
      el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { tuneTab = b.dataset.tab; U.openTune(); }; });
      el.querySelectorAll('.buy').forEach(b => {
        b.onclick = () => {
          const k = b.dataset.k;
          if (S.owned[tuneTab].includes(k)) Sv.equip(tuneTab, k);
          else if (Sv.buyCosmetic(tuneTab, k)) { MD.Audio.coin(); U.toast('Unlocked ' + b.parentNode.querySelector('span:not(.sw):not(.tagx):not(.eye)').textContent); }
          U.onDress && U.onDress();
          U.openTune();
        };
      });
    });
  };

  let shopTab = 'up';
  U.openShop = function () {
    const S = Sv.S, d = Sv.deal();
    U._dealN = d.n;
    const dealOwned = S.owned[d.slot].includes(d.item.key);
    const dealHtml = `<div class="deal"><div style="font-size:30px">🏷️</div><div class="grow"><b>Today's deal: ${d.item.name}</b><small>${Sv.SLOT_NAMES[d.slot]} · 40% off for the next</small></div><div class="clock" id="dealClock">${clock(d.left)}</div>
      <button class="buy" id="dealBuy" ${dealOwned || S.screws < d.price ? 'disabled' : ''}>${dealOwned ? 'Owned' : `${SCREW} <s>${fmtN(d.item.price)}</s> ${fmtN(d.price)}`}</button></div>`;
    const tabs = `<div class="tabs"><button data-tab="up" aria-pressed="${shopTab === 'up'}">Upgrades</button><button data-tab="boost" aria-pressed="${shopTab === 'boost'}">Boosts</button></div>`;
    let body = '';
    if (shopTab === 'up') {
      body = '<div class="note">Permanent. They stay with your duck forever.</div><div class="ups">' + Sv.UPGRADES.map(u => {
        const lv = S.up[u.key], max = lv >= u.max, c = Sv.upCost(u, lv);
        const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'f' : ''}"></i>`).join('');
        return `<div class="up"><div class="ic">${u.icon}</div><div><b>${u.name}</b><small>${u.desc(lv)}${max ? '' : ' → ' + u.step}</small><div class="pips">${pips}</div></div>
          <button class="buy" data-up="${u.key}" ${max || S.screws < c ? 'disabled' : ''}>${max ? 'Maxed' : `${SCREW} ${fmtN(c)}`}</button></div>`;
      }).join('') + '</div>';
    } else {
      body = '<div class="note">One run each. Bought boosts are used automatically on your next run.</div><div class="ups">' + Sv.BOOSTS.map(b => `<div class="up"><div class="ic">${b.icon}</div><div><b>${b.name}</b><small>${b.desc}${S.boosts[b.key] ? ` · <b>${S.boosts[b.key]} ready</b>` : ''}</small></div>
          <button class="buy" data-boost="${b.key}" ${S.screws < b.price ? 'disabled' : ''}>${SCREW} ${fmtN(b.price)}</button></div>`).join('') + '</div>';
    }
    sheet('The Parts Bin', dealHtml + tabs + body, el => {
      el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { shopTab = b.dataset.tab; U.openShop(); }; });
      el.querySelectorAll('[data-up]').forEach(b => { b.onclick = () => { if (Sv.buyUpgrade(b.dataset.up)) { MD.Audio.power(); } U.openShop(); }; });
      el.querySelectorAll('[data-boost]').forEach(b => { b.onclick = () => { if (Sv.buyBoost(b.dataset.boost)) MD.Audio.coin(); U.openShop(); }; });
      const db = el.querySelector('#dealBuy');
      if (db) db.onclick = () => { if (Sv.deal().n === d.n && Sv.buyCosmetic(d.slot, d.item.key)) { MD.Audio.coin(); U.toast('Unlocked ' + d.item.name + ' and put it on'); U.onDress && U.onDress(); } U.openShop(); };
    });
  };

  U.openDaily = function () {
    const st = Sv.dailyState();
    const cells = Sv.DAILY.map((d, i) => {
      const done = i < st.step || (!st.ready && i === st.step), now = st.ready && i === st.step;
      const what = d.exclusive ? '🌈 Rainbow trail + ' + fmtN(d.screws) : d.item ? '🎁 Random item' : SCREW + ' ' + fmtN(d.screws);
      return `<div class="item${now ? ' on' : ''}" style="${done ? 'opacity:.5' : ''}"><span class="mono">DAY ${i + 1}</span><span>${what}</span><span class="small">${done ? 'Claimed' : now ? 'Ready!' : ''}</span></div>`;
    }).join('');
    sheet('Daily crate', `<div class="note">Come back every day. Skip a day and the streak starts over. Day 7 has a trail you can't buy.</div><div class="items">${cells}</div>
      <div style="margin-top:14px"><button class="btn go" id="claimD" ${st.ready ? '' : 'disabled'}>${st.ready ? 'Open crate' : 'Come back tomorrow'}</button></div>`, el => {
      el.querySelector('#claimD').onclick = () => {
        const r = Sv.claimDaily();
        if (!r) return;
        MD.Audio.power(); MD.Audio.coin();
        U.toast(r.item ? `Day ${r.step + 1}: ${r.item}!` + (r.screws ? ` +${fmtN(r.screws)} screws` : '') : r.dupe ? `Day ${r.step + 1}: ${r.dupe} again, turned into ${fmtN(r.screws)} screws` : `Day ${r.step + 1}: +${fmtN(r.screws)} screws`);
        U.openDaily(); U.renderHome();
      };
    });
  };

  U.openRuns = function () {
    const S = Sv.S;
    const W = MD.World.THEMES;
    const rows = S.runs.length ? S.runs.map(r => {
      const ago = Math.round((Date.now() - r.t) / 60000);
      return `<div class="run"><div><b>${W[r.world].name}</b> · ${U.fmtSizeCm(r.diameterM * 100)}${r.boss ? ' · 👑' : ''}<small>${r.items} things grabbed${r.best ? ', biggest: ' + r.best.toLowerCase() : ''} · ${ago < 1 ? 'just now' : ago < 60 ? ago + ' min ago' : Math.round(ago / 60) + ' h ago'}</small></div><span class="mono">${U.fmtMass(r.massKg)}</span><span class="price">${SCREW}${fmtN(r.screws)}</span></div>`;
    }).join('') : '<div class="note">No runs yet. The duck is stretching.</div>';
    const stars = k => '★'.repeat(S.stars[k]) + '☆'.repeat(3 - S.stars[k]);
    sheet('Last runs', `<div class="note">Robot Lab ${stars('w')} best ${U.fmtMass(S.best.w)} · Night Lab ${stars('p')} best ${U.fmtMass(S.best.p)}. Stars: reach 150 kg, reach 1,500 kg, topple the giant duck.</div><div class="runs">${rows}</div>`);
  };

  U.openSettings = function () {
    const S = Sv.S, st = S.settings;
    sheet('Settings', `<div class="set">
      <label>Duck name <input type="text" id="sName" maxlength="20"></label>
      <label>Sound <input type="checkbox" id="sSound" ${MD.Audio.muted ? '' : 'checked'}></label>
      <label>Music <input type="checkbox" id="sMusic" ${MD.Music.on ? 'checked' : ''}></label>
      <label>Shadows <input type="checkbox" id="sShadow" ${st.shadows !== false ? 'checked' : ''}></label>
      <label>Sharper graphics (uses more battery) <input type="checkbox" id="sQual" ${st.quality !== 'low' ? 'checked' : ''}></label>
      <button class="danger" id="sReset">Reset all progress</button>
      <div class="note">Progress is saved in this browser only.</div></div>`, el => {
      const nm = el.querySelector('#sName'); nm.value = S.name;
      nm.oninput = () => { S.name = nm.value.trim().slice(0, 20) || 'You'; Sv.persist(); };
      el.querySelector('#sSound').onchange = e => { if (MD.Audio.muted === e.target.checked) MD.Audio.toggleMute(); $('hMute').textContent = MD.Audio.muted ? '🔇' : '🔊'; };
      el.querySelector('#sMusic').onchange = () => { MD.Music.toggle(); };
      el.querySelector('#sShadow').onchange = e => { st.shadows = e.target.checked; Sv.persist(); MD.World.setQuality(st); };
      el.querySelector('#sQual').onchange = e => { st.quality = e.target.checked ? 'high' : 'low'; Sv.persist(); MD.World.setQuality(st); };
      el.querySelector('#sReset').onclick = () => { if (confirm('Reset all screws, upgrades and cosmetics?')) { Sv.reset(); U.closeModal(); U.onReset && U.onReset(); U.toast('Fresh duck, fresh start'); } };
    });
  };

  // ---------- HUD ----------
  const MILE = [15, 25, 50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000];
  const MILE_SCREWS = [5, 10, 15, 25, 40, 60, 90, 130, 180, 250, 350, 500];
  U.MILE = MILE; U.MILE_SCREWS = MILE_SCREWS;
  U.showHud = function (on) {
    $('hud').hidden = !on; $('touch').hidden = !(on && U.touch);
    resetStick();
    if (on) { $('feed').innerHTML = ''; }
  };
  // HUD writes only touch the DOM when a value actually changes (most frames nothing does), which keeps
  // style recalculation and layout out of the frame budget.
  const hudCache = {};
  const setT = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  const setH = (id, v) => { const k = 'h:' + id; if (hudCache[k] !== v) { hudCache[k] = v; $(id).innerHTML = v; } };
  const setA = (id, a, v) => { const k = id + '@' + a; if (hudCache[k] !== v) { hudCache[k] = v; $(id).setAttribute(a, v); } };
  const setS = (id, p, v) => { const k = id + '.' + p; if (hudCache[k] !== v) { hudCache[k] = v; $(id).style[p] = v; } };
  const setC = (id, c, on) => { const k = id + '+' + c; if (hudCache[k] !== on) { hudCache[k] = on; $(id).classList.toggle(c, on); } };
  const esc = t => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  U.updateHud = function (B, boss) {
    const cm = B.r * 20;
    setH('sizeV', cm < 100 ? `${cm < 10 ? cm.toFixed(1) : Math.round(cm)}<small>cm</small>` : `${(cm / 100).toFixed(cm < 1000 ? 2 : 1)}<small>m</small>`);
    setT('massV', U.fmtMass(B.mass));
    if (U.earn != null) setT('earnV', fmtN(U.earn));
    // Ring: progress (by mass, log scale) towards the next tier you can break.
    const TI = MD.Rules.TIERS, ti = MD.Rules.tierOf(B.mass);
    if (ti + 1 < TI.length) {
      const lo = TI[ti].gate * (ti ? 0.98 : 1), hi = TI[ti + 1].gate * 0.98;
      const p = Math.max(0, Math.min(1, Math.log(Math.max(lo, B.mass) / lo) / Math.log(hi / lo)));
      setA('ringArc', 'stroke-dashoffset', (276.5 * (1 - p)).toFixed(1));
      setT('nextV', `Next: ${TI[ti + 1].name} · ${fmtN(TI[ti + 1].gate)} kg`);
    } else { setA('ringArc', 'stroke-dashoffset', '0'); setT('nextV', 'Nothing can stop you'); }
    setC('dashB', 'ready', B.dashReady());
    setS('turboI', 'width', Math.round(B.turbo * 100) + '%');
    if (U.touch) { const t = Math.round(B.turbo * 100) + '%'; if (hudCache.tdash !== t) { hudCache.tdash = t; $('tdash').style.setProperty('--t', t); } }
    const hide = !boss;
    if (hudCache.compass !== hide) { hudCache.compass = hide; $('compass').hidden = hide; }
    if (boss) { setS('cArrow', 'transform', `rotate(${boss.angle.toFixed(2)}rad)`); setT('cText', boss.text); }
  };
  // Live ranking of every ball in the round.
  U.updateBoard = function (balls, you) {
    const rows = balls.slice().sort((a, b) => b.mass - a.mass);
    const rank = rows.indexOf(you) + 1;
    let show = rows.slice(0, 5);
    if (rank > 5) show = show.slice(0, 4).concat([you]);
    setH('lb', show.map(b => `<div class="r${b === you ? ' you' : ''}${b.alive ? '' : ' dead'}"><span>${rows.indexOf(b) + 1}</span><span class="nm">${esc(b === you ? (MD.Save.S.name || 'You') : b.name)}</span><span class="k">${U.fmtMass(b.mass)}</span></div>`).join(''));
    return rank;
  };
  U.feed = function (text, cls) {
    const f = $('feed');
    const el = document.createElement('div'); el.className = 'fi' + (cls ? ' ' + cls : ''); el.textContent = text;
    f.appendChild(el);
    while (f.children.length > 6) f.removeChild(f.firstChild);
    setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.remove(), 400); }, 2600);
  };

  // ---------- Results ----------
  U.showResults = function (run, out) {
    $('rTitle').textContent = run.boss ? 'You toppled the giant duck!' : run.place === 1 ? 'Biggest duck of the round!' : out.record ? 'New record!' : `Round over · #${run.place}`;
    $('rSize').textContent = U.fmtSizeCm(run.diameterM * 100);
    $('rMass').textContent = U.fmtMass(run.massKg);
    $('rStars').innerHTML = [0, 1, 2].map(i => `<span class="${i < out.stars ? 'on' : ''}">★</span>`).join('');
    $('rInfo').textContent = `Place #${run.place} of ${run.players} · ${run.items} things broken${run.bestItem ? ' · biggest: ' + run.bestItem.toLowerCase() : ''}${run.kills ? ' · ' + run.kills + ' ducks burst' : ''} · next run starts at ${U.fmtMass(run.boss ? 12 : MD.Rules.carry(run.massKg))}`;
    $('rLines').innerHTML = out.lines.map((l, i) => `<div class="ln" style="animation-delay:${i * 0.12}s"><span></span><span>${SCREW}${fmtN(l[1])}</span></div>`).join('');
    $('rLines').querySelectorAll('.ln span:first-child').forEach((el, i) => { el.textContent = out.lines[i][0]; });
    $('results').hidden = false;
    renderNudge();
    // Count the total up.
    const el = $('rTotal'), t0 = performance.now(), dur = 900;
    const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); el.textContent = fmtN(out.total * k * (2 - k)); if (k < 1) requestAnimationFrame(step); };
    step();
  };

  // After a run: the best thing you can buy right now, or what to save up for.
  function renderNudge() {
    const S = Sv.S, el = $('rNext');
    const opts = Sv.UPGRADES.filter(u => S.up[u.key] < u.max).map(u => ({ u, cost: Sv.upCost(u, S.up[u.key]) })).sort((a, b) => a.cost - b.cost);
    if (!opts.length) { el.innerHTML = ''; return; }
    const can = opts.find(o => o.cost <= S.screws), o = can || opts[0];
    el.innerHTML = `<div class="nudge"><span style="font-size:24px">${o.u.icon}</span><span class="grow"><b>${o.u.name}</b><small>${can ? o.u.step + ' · you can afford it' : `${fmtN(o.cost - S.screws)} more screws to go`}</small></span>${can ? `<button class="buy" id="nudgeBuy">${SCREW} ${fmtN(o.cost)}</button>` : ''}</div>`;
    const b = $('nudgeBuy');
    if (b) b.onclick = () => { if (Sv.buyUpgrade(o.u.key)) { MD.Audio.power(); U.toast(o.u.name + ' upgraded'); } renderNudge(); };
  }

  // ---------- Input ----------
  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (e.code === 'KeyP' || e.code === 'Escape') U.onPause && U.onPause();
    if (e.code === 'KeyM') { const m = MD.Audio.toggleMute(); $('hMute').textContent = m ? '🔇' : '🔊'; }
    if (e.code === 'KeyN') U.toast(MD.Music.toggle() ? 'Music on' : 'Music off');
    if (e.code === 'Enter' || e.code === 'Space') U.onConfirm && U.onConfirm(e);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    MD.Audio.init();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  window.addEventListener('pointerdown', () => MD.Audio.init(), { capture: true });

  // Touch stick: y = roll forward/back, x = steer.
  U.touch = matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('touch', U.touch);
  const stick = { id: null, x: 0, y: 0 };
  const st = $('stick'), knob = $('knob');
  st.addEventListener('pointerdown', e => { stick.id = e.pointerId; st.setPointerCapture(e.pointerId); moveStick(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === stick.id) moveStick(e); });
  function resetStick() { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; }
  const endStick = e => { if (e.pointerId === stick.id) resetStick(); };
  st.addEventListener('pointerup', endStick); st.addEventListener('pointercancel', endStick); st.addEventListener('lostpointercapture', endStick);
  function moveStick(e) {
    const r = st.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    stick.x = x; stick.y = y; knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
  }
  // Turbo button: held, like Shift.
  let touchBoost = false;
  $('tdash').addEventListener('pointerdown', e => { e.preventDefault(); touchBoost = true; $('tdash').setPointerCapture(e.pointerId); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => $('tdash').addEventListener(ev, () => { touchBoost = false; }));

  U.poll = function () {
    let fwd = 0, turn = 0;
    if (keys.KeyW || keys.ArrowUp) fwd += 1;
    if (keys.KeyS || keys.ArrowDown) fwd -= 1;
    if (keys.KeyA || keys.ArrowLeft) turn -= 1;
    if (keys.KeyD || keys.ArrowRight) turn += 1;
    if (stick.id != null) { fwd = -stick.y; turn = stick.x * Math.min(1, 0.4 + Math.abs(stick.x)); }
    let boost = !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyL) || touchBoost;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = Math.abs(p.axes[0]) > 0.15 ? p.axes[0] : 0, ay = Math.abs(p.axes[1]) > 0.15 ? p.axes[1] : 0;
      if (ax || ay) { fwd = -ay; turn = ax; }
      if (p.buttons[7] && p.buttons[7].value > 0.2) fwd = Math.max(fwd, p.buttons[7].value);
      if ((p.buttons[0] && p.buttons[0].pressed) || (p.buttons[5] && p.buttons[5].pressed)) boost = true;
      if (p.buttons[9] && p.buttons[9].pressed && !U._padStart) U.onPause && U.onPause();
      U._padStart = !!(p.buttons[9] && p.buttons[9].pressed);
    }
    U.input.fwd = fwd; U.input.turn = turn; U.input.boost = boost;
    return U.input;
  };

  // ---------- Wiring ----------
  U.init = function (h) {
    document.querySelectorAll('#worlds button').forEach(b => { b.onclick = () => { h.world(b.dataset.w); }; });
    $('play').onclick = h.play;
    $('openTune').onclick = U.openTune;
    $('openShop').onclick = U.openShop;
    $('openRuns').onclick = U.openRuns;
    $('openDaily').onclick = U.openDaily;
    $('openSet').onclick = U.openSettings;
    $('invite').onclick = async () => {
      const url = location.href.split('?')[0];
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { /* clipboard blocked */ }
      const got = Sv.invite();
      U.toast((copied ? 'Link copied. ' : 'Share this page: ' + url + '. ') + (got ? `+${fmtN(got)} screws for spreading the duck word` : 'Thanks for spreading the duck word'));
      if (got) MD.Audio.coin();
      U.renderHome();
    };
    $('hPause').onclick = e => { e.currentTarget.blur(); U.onPause && U.onPause(); };
    $('hMute').onclick = e => { e.currentTarget.blur(); const m = MD.Audio.toggleMute(); $('hMute').textContent = m ? '🔇' : '🔊'; };
    $('hMute').textContent = MD.Audio.muted ? '🔇' : '🔊';
    $('resume').onclick = h.resume;
    $('endRun').onclick = h.endRun;
    $('again').onclick = h.again;
    $('toHome').onclick = h.home;
    $('toShop').onclick = () => { h.home(); U.openShop(); };
  };
  U.$ = $;
  return U;
})();
