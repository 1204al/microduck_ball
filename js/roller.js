// Shared ball physics for the player and the bots: speed and acceleration from size, strong sideways grip,
// turbo, breaking things you outweigh, bonking off things you don't, and ball-against-ball hits.
window.MD = window.MD || {};
MD.Roller = (function () {
  const RL = MD.Rules, W = MD.World;
  const X = {};
  const TURN = 2.6;

  X.init = function (b, mass, x, z, heading) {
    Object.assign(b, {
      mass, x, z, heading: heading || 0, vx: 0, vz: 0, r: RL.radius(mass), turbo: 1, boosting: false,
      alive: true, dead: 0, shield: 0, bonkCd: 0, speedMul: b.speedMul || 1, gateMul: b.gateMul || 1, growMul: b.growMul || 1,
      turboMul: b.turboMul || 1, refillMul: b.refillMul || 1,
      top: RL.topSpeed(RL.radius(mass)), lockout: {},
    });
  };

  X.step = function (b, input, dt, live) {
    b.r = RL.radius(b.mass);
    b.bonkCd -= dt; b.shield = Math.max(0, b.shield - dt);
    // Turbo: x1.5 speed, x1.8 acceleration, 4.8 s to empty, 6 s to refill.
    const was = b.boosting;
    b.boosting = live && !!input.boost && b.turbo > 0.02 && (was || b.turbo > 0.15);
    if (b.boosting) b.turbo = Math.max(0, b.turbo - dt * RL.TURBO.drain / b.turboMul); else b.turbo = Math.min(1, b.turbo + dt * RL.TURBO.refill * b.refillMul);
    b.justBoosted = b.boosting && !was;
    const top = RL.topSpeed(b.r) * b.speedMul * (b.boosting ? RL.TURBO.speed : 1);
    const acc = RL.accel(b.r) * (b.boosting ? RL.TURBO.accel : 1);
    b.top = RL.topSpeed(b.r) * b.speedMul;
    b.heading -= (input.turn || 0) * TURN * dt;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading), sx = fz, sz = -fx;
    let f = live ? (input.fwd || 0) : 0;
    if (b.boosting) f = Math.max(f, 1);
    if (f < 0) f *= 0.6;
    f *= 1 - 0.35 * Math.min(1, Math.abs(input.turn || 0));
    // Split velocity into forward and sideways; sideways is killed fast (grippy rolling, little sliding).
    let vf = b.vx * fx + b.vz * fz, vs = b.vx * sx + b.vz * sz;
    vs *= Math.pow(0.4, dt * 60 * 0.35);
    // Coasting slows you down; on roller skates (not tumbling) you glide much further.
    const want = f * top, dv = want - vf, stepA = (Math.abs(f) > 0.02 ? acc : b.skating ? 1.8 : 6) * dt;
    vf += Math.abs(dv) <= stepA ? dv : Math.sign(dv) * stepA;
    b.vx = fx * vf + sx * vs; b.vz = fz * vf + sz * vs;
    b.x += b.vx * dt; b.z += b.vz * dt;
    // The wall round the map.
    const R = RL.MAP_R - b.r, d0 = Math.hypot(b.x, b.z);
    if (d0 > R) {
      const nx = b.x / d0, nz = b.z / d0, vn = b.vx * nx + b.vz * nz;
      b.x = nx * R; b.z = nz * R;
      if (vn > 0) { b.vx -= 1.45 * vn * nx; b.vz -= 1.45 * vn * nz; bonk(b, vn, true); }
    }
    b.speed = Math.hypot(b.vx, b.vz);
    b.speedFrac = Math.min(1.6, b.speed / Math.max(1, b.top));
  };

  function bonk(b, speed, wall) {
    if (b.bonkCd > 0 || b.shield > 0) return;
    const loss = RL.bonkLoss(b.mass, speed, wall);
    b.bonkCd = 0.4;
    if (speed > 2.5) b.onBonk && b.onBonk(loss, speed);
    if (loss > 0) { b.mass = Math.max(RL.START, b.mass - loss); b.onLoss && b.onLoss(loss); }
  }

  // Touch the world: break what you outweigh, bounce off the rest.
  X.contact = function (b) {
    W.query(b.x, b.z, b.r + 10, o => {
      const rx = b.x - o.x, rz = b.z - o.z, reach = b.r + Math.hypot(o.hx || o.foot, o.hz || o.foot);
      if (Math.abs(rx) > reach || Math.abs(rz) > reach) return;
      const c = Math.cos(o.ry), s = Math.sin(o.ry);
      const lx = rx * c - rz * s, lz = rx * s + rz * c;
      const hx = o.hx || o.foot * 0.5, hz = o.hz || o.foot * 0.5;
      const qx = Math.max(-hx, Math.min(hx, lx)), qz = Math.max(-hz, Math.min(hz, lz));
      let dlx = lx - qx, dlz = lz - qz, d = Math.hypot(dlx, dlz);
      if (d >= b.r) return;
      // The giant duck is the player's to topple: with no clock, rivals would otherwise take it every minute.
      if (!(o.boss && b.bot) && RL.canBreak(b.mass, o.gate, o.boss ? 1 : b.gateMul)) { breakIt(b, o); return; }
      if (d < 1e-4) { const px = hx - Math.abs(lx), pz = hz - Math.abs(lz); if (px < pz) { dlx = Math.sign(lx) || 1; dlz = 0; d = -px; } else { dlx = 0; dlz = Math.sign(lz) || 1; d = -pz; } }
      else { dlx /= d; dlz /= d; }
      const nx = dlx * c + dlz * s, nz = -dlx * s + dlz * c;
      b.x += nx * (b.r - d); b.z += nz * (b.r - d);
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) { b.vx -= 1.45 * vn * nx; b.vz -= 1.45 * vn * nz; bonk(b, -vn, false); b.onBlocked && b.onBlocked(o); }
    });
  };

  function breakIt(b, o) {
    const gain = o.boss ? 0 : RL.gain(o, b.mass) * b.growMul;
    const slow = o.boss ? 0 : RL.slowdown(o, b.mass);
    b.vx *= 1 - slow; b.vz *= 1 - slow;
    b.mass += gain;
    W.breakObj(o, b);
    b.onBreak && b.onBreak(o, gain);
  }

  // Ball against ball: same rules for everyone.
  X.collide = function (balls, dt) {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), min = a.r + b.r;
        if (dist >= min || dist < 1e-5) continue;
        const nx = dx / dist, nz = dz / dist;
        // Push apart by mass.
        const ta = b.mass / (a.mass + b.mass), over = min - dist;
        a.x -= nx * over * ta; a.z -= nz * over * ta; b.x += nx * over * (1 - ta); b.z += nz * over * (1 - ta);
        const va = a.vx * nx + a.vz * nz, vb = -(b.vx * nx + b.vz * nz), closing = va + vb;
        if (closing <= 0) continue;
        // Bounce.
        const e = RL.BALL.restitution, imp = (1 + e) * closing / (1 / a.mass + 1 / b.mass) * RL.BALL.knockback;
        a.vx -= imp / a.mass * nx; a.vz -= imp / a.mass * nz; b.vx += imp / b.mass * nx; b.vz += imp / b.mass * nz;
        const key = a.id + ':' + b.id, now = W.time;
        if (a.lockout[key] && now < a.lockout[key]) continue;
        a.lockout[key] = now + RL.BALL.lockout;
        const top = Math.max(a.top, b.top);
        const shareA = RL.chargeShare(va, vb, top), shareB = RL.chargeShare(vb, va, top);
        hit(a, b, closing, top, shareA);
        hit(b, a, closing, top, shareB);
        a.onBump && a.onBump(b, closing); b.onBump && b.onBump(a, closing);
      }
    }
  };
  // `att` rams `vic`.
  function hit(att, vic, speed, top, share) {
    if (!vic.alive || vic.shield > 0) return;
    const loss = RL.ballLoss(vic.mass, att.mass, speed, top, share);
    if (RL.crush(vic.mass, att.mass, speed, top) || loss >= vic.mass * RL.BALL.burstAt) { burst(att, vic); return; }
    if (loss < 0.5) return;
    vic.mass = Math.max(RL.START, vic.mass - loss);
    att.mass += loss * 0.5;
    vic.onLoss && vic.onLoss(loss, att);
    att.onSteal && att.onSteal(loss * 0.5, vic);
  }
  function burst(att, vic) {
    const keep = RL.keepAfterBurst(vic.mass), taken = Math.max(0, vic.mass - keep);
    att.mass += taken;
    vic.alive = false; vic.dead = RL.BALL.respawn; vic.respawnMass = keep;
    vic.vx = vic.vz = 0;
    vic.onBurst && vic.onBurst(att, taken);
    att.onKill && att.onKill(vic, taken);
  }
  X.respawnAt = function (b, sp) {
    X.init(b, b.respawnMass || RL.START, sp.x, sp.z, sp.heading);
    b.shield = RL.BALL.shield;
  };
  return X;
})();
