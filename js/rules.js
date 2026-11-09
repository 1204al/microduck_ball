// Growth and collision rules. A world unit counts as a metre for the maths; the duck world is drawn at toy scale.
window.MD = window.MD || {};
MD.Rules = (function () {
  const R = {};
  R.START = 12;          // kg
  R.BOSS_GATE = 12000;   // kg
  R.MAP_R = 204;         // playable radius

  R.radius = m => 0.8 * Math.cbrt(Math.max(1, m) / 12);
  R.topSpeed = r => 7.6 + 2 * Math.min(r, 4) + 1.2 * Math.max(0, Math.min(r, 9) - 4);
  R.accel = r => Math.max(11, 32 / Math.pow(r / 0.8, 0.3));
  R.TURBO = { speed: 1.5, accel: 1.8, drain: 1 / 4.8, refill: 1 / 6 };

  // Tiers: you can break a thing once your mass is at least 98% of its gate.
  R.TIERS = [
    { gate: 12, name: 'Gadgets & batteries', line: 'Small enough for chargers and batteries. Not yet for the power strips.' },
    { gate: 30, name: 'Switches, screens & routers', line: 'Heavy enough for power strips, keyboards, monitors and routers. Not yet for the robots.' },
    { gate: 150, name: 'GPUs, PCs & small robots', line: 'Graphics cards, gaming PCs, 3D printers, robot vacuums and little robot dogs give way. The humanoids do not.' },
    { gate: 300, name: 'Humanoid robots', line: 'The humanoids topple. The big robot dogs stand firm.' },
    { gate: 600, name: 'Robot dogs & robot arms', line: 'The big robot dogs, robot arms and delivery bots roll over. Not yet the AI machines.' },
    { gate: 1500, name: 'AI workstations', line: 'The AI workstations tremble. The supercomputer racks do not.' },
    { gate: 4000, name: 'Supercomputer racks', line: 'The racks go dark before you. The giant duck waits.' },
    { gate: 12000, name: 'The giant duck', line: 'Nothing stands between you and the giant duck.' },
  ];
  R.canBreak = (mass, gate, gateMul) => mass >= 0.98 * gate * (gateMul || 1);

  // How much mass a broken thing gives: the meal is whatever you can only just break.
  const S = { appetiteMass: 600, relevanceExp: 0.6, relevanceFloor: 0.05, bulkMass: 1500, bulkEarlyExp: 1.2, bulkExp: 0.8, sateMass: 12000, sateExp: 0.25 };
  const appetite = m => 1 + Math.max(0, m) / S.appetiteMass;
  R.gain = function (t, mass) {
    if (t.gain <= 0) return 0;
    if (t.fades) return Math.max(1, Math.round(t.gain * Math.pow(Math.min(1, t.gate / Math.max(1, mass)), S.relevanceExp)));
    const n = mass / Math.max(S.bulkMass, t.gate);
    let g;
    if (n < 1) {
      const rel = Math.max(S.relevanceFloor, Math.pow(Math.max(1, mass / t.gate), -S.relevanceExp));
      g = Math.max(t.gain * appetite(mass) / appetite(t.gate) * rel, t.gain * Math.pow(n, S.bulkEarlyExp));
    } else {
      g = t.gain * Math.pow(n, S.bulkExp) * Math.pow(Math.max(1, mass / S.sateMass), S.sateExp - S.bulkExp);
    }
    return Math.max(1, Math.round(g));
  };
  // Speed lost when you break something: near your limit it almost stops you.
  R.slowdown = (t, mass) => Math.min(0.5, (t.gate / Math.max(1, mass)) * (t.light ? 0.12 : 1) * 0.4 + (t.tier >= 6 ? 0.12 : t.tier >= 4 ? 0.04 : 0));
  // Crashing into something you can't break above 5 u/s costs mass.
  R.bonkLoss = (mass, speed, wall) => speed < 5 ? 0 : mass * Math.min(0.1, 0.009 * (speed - 5)) * (wall ? 0.5 : 1);
  // Broken things grow back.
  const REGROW = { 1: 50, 2: 62, 3: 80, 4: 95, 5: 100, 6: 130, 7: 150 };
  R.regrow = tier => REGROW[tier] ? REGROW[tier] / 5 * (0.75 + Math.random() * 0.5) : Infinity;

  // Ball against ball (players and bots alike).
  R.BALL = { restitution: 0.45, knockback: 0.75, freeBelow: 0.22, burstAt: 0.78, keep: 0.4, respawn: 2.6, shield: 3, lockout: 0.55 };
  // Who was charging: share of the blame for the attacker.
  R.chargeShare = (va, vb, top) => { const r = 0.18 * top; return Math.min(0.85, Math.max(0.15, (Math.max(0, va) + r) / (Math.max(0, va) + Math.max(0, vb) + 2 * r))); };
  // Mass the victim loses.
  R.ballLoss = function (victim, other, speed, top, share) {
    const a = speed / Math.max(4, top);
    if (a <= R.BALL.freeBelow || !(victim > 0) || !(other > 0)) return 0;
    const o = (a - R.BALL.freeBelow) / (1 - R.BALL.freeBelow);
    const s = Math.min(0.55, 0.3 * Math.pow(o, 1.2));
    const c = other / victim, l = Math.min(1.7, Math.max(0.55, Math.pow(c, 0.3)));
    const d = Math.min(1, 2 * share) * Math.min(1, c);
    return victim * Math.min(0.95, s * l * 1.65 * share * Math.max(0.12, d));
  };
  // Instant crush: a much bigger ball running into you fast.
  R.crush = (victim, other, speed, top) => other >= 150 && other > victim * 3.2 && speed > top * 0.3;
  R.keepAfterBurst = m => Math.max(12, m * R.BALL.keep);

  // Next run starts with part of the last run's mass.
  R.carry = m => m <= 12 ? 12 : 12 * Math.pow(m / 12, 0.45);
  // Screws for a run: place bonus + mass bonus + boss.
  R.PLACE = [120, 80, 55, 30];
  R.score = (place, mass, boss) => (R.PLACE[place - 1] || 0) + Math.round(Math.sqrt(Math.max(0, mass - 12)) * 1.2 + Math.max(0, mass - R.BOSS_GATE) / 100) + (boss ? 150 : 0);

  R.tierOf = mass => { let i = 0; while (i + 1 < R.TIERS.length && mass >= R.TIERS[i + 1].gate * 0.98) i++; return i; };
  return R;
})();
