// Realistic articulated farm rat entity with 360° cylindrical wrapping
// and strict spatiotemporal consistency (no popping in/out in open space).

export function wrapX(x, worldWidth) {
  return ((x % worldWidth) + worldWidth) % worldWidth;
}

export function wrappedDeltaX(fromX, toX, worldWidth) {
  let dx = toX - fromX;
  if (dx > worldWidth * 0.5) dx -= worldWidth;
  if (dx < -worldWidth * 0.5) dx += worldWidth;
  return dx;
}

export class Rat {
  constructor(lane, spawnX, id, worldWidth) {
    this.id = id;
    this.lane = lane;
    this.worldWidth = worldWidth;
    this.x = wrapX(spawnX, worldWidth);
    this.y = lane.y + (Math.random() - 0.5) * 14;
    this.distance = lane.distance;

    const roll = Math.random();
    if (roll < 0.22) {
      this.archetype = "juvenile";
      this.sizeMult = 0.82;
      this.speedMult = 1.22;
      this.maxHp = 1;
    } else if (roll < 0.82) {
      this.archetype = "adult";
      this.sizeMult = 1.0;
      this.speedMult = 1.0;
      this.maxHp = 1;
    } else {
      this.archetype = "alpha";
      this.sizeMult = 1.22;
      this.speedMult = 0.88;
      this.maxHp = 2;
    }

    this.hp = this.maxHp;
    this.scale = lane.scale * this.sizeMult;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.state = "PEEKING";
    this.stateTimer = 0.9 + Math.random() * 1.3;
    this.peekAmount = 0.05; // Emerges smoothly from burrow
    this.targetX = this.pickTargetX();
    this.vx = 0;
    this.gaitPhase = Math.random() * Math.PI * 2;
    this.sniffPhase = Math.random() * Math.PI * 2;
    this.lookAtCamera = 0.85;
    this.alive = true;
    this.deadTimer = 0;
    this.deathRoll = 0;
    this.deathVelX = 0;
    this.deathVelY = 0;
    this.removed = false;
    this.earTwitch = 0;
  }

  pickTargetX() {
    // Pick a nearby feed spot or burrow within ~650px on the 360° ring
    const candidates =
      Math.random() < 0.72 && this.lane.feedSpots.length > 0
        ? this.lane.feedSpots
        : this.lane.burrows;
    const nearby = candidates.filter(
      (cx) => Math.abs(wrappedDeltaX(this.x, cx, this.worldWidth)) < 900
    );
    const pool = nearby.length > 0 ? nearby : candidates;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return wrapX(chosen + (Math.random() - 0.5) * 90, this.worldWidth);
  }

  nearestBurrowX() {
    let best = this.lane.burrows[0];
    let bestD = Infinity;
    for (const bx of this.lane.burrows) {
      const d = Math.abs(wrappedDeltaX(this.x, bx, this.worldWidth));
      if (d < bestD) {
        bestD = d;
        best = bx;
      }
    }
    return best;
  }

  alertFrom(soundX, soundY, radius = 380) {
    if (!this.alive || this.state === "ENTERING_BURROW") return;
    const dx = wrappedDeltaX(soundX, this.x, this.worldWidth);
    const dist = Math.hypot(dx, this.y - soundY);
    if (dist > radius) return;
    if (this.state === "FLEEING") return;

    this.state = "ALERT";
    this.stateTimer = 0.45 + Math.random() * 0.45;
    this.vx = 0;
    this.lookAtCamera = 1.0;
  }

  checkHit(wx, wy) {
    if (!this.alive || this.peekAmount < 0.25) return { hit: false, headshot: false };
    const s = this.scale;
    const dxToRat = wrappedDeltaX(this.x, wx, this.worldWidth);

    const headRelX = this.dir * 26 * s;
    const headY = this.y - 16 * s;
    const headR = 13.5 * s;

    if (Math.hypot(dxToRat - headRelX, wy - headY) <= headR) {
      return { hit: true, headshot: true };
    }

    const bodyRelX = -this.dir * 4 * s;
    const bodyY = this.y - 13 * s;
    const rx = 28 * s;
    const ry = 16 * s;
    const norm = ((dxToRat - bodyRelX) / rx) ** 2 + ((wy - bodyY) / ry) ** 2;
    if (norm <= 1.0) {
      return { hit: true, headshot: false };
    }
    return { hit: false, headshot: false };
  }

  applyHit(headshot, hitFromX) {
    if (!this.alive) return { killed: false };
    if (headshot) {
      this.hp = 0;
    } else {
      this.hp -= 1;
    }

    if (this.hp <= 0) {
      this.alive = false;
      this.state = "DEAD";
      this.deadTimer = 0;
      this.deathRoll = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 0.6);
      const pushDir = wrappedDeltaX(hitFromX, this.x, this.worldWidth) >= 0 ? 1 : -1;
      this.deathVelX = pushDir * (45 + Math.random() * 35) * this.scale;
      this.deathVelY = -65 * this.scale;
      return { killed: true };
    }

    this.state = "FLEEING";
    this.targetX = this.nearestBurrowX();
    this.dir = wrappedDeltaX(this.x, this.targetX, this.worldWidth) >= 0 ? 1 : -1;
    return { killed: false };
  }

  update(dt) {
    this.sniffPhase += dt * 7.5;
    if (Math.random() < dt * 1.4) this.earTwitch = 1.0;
    this.earTwitch = Math.max(0, this.earTwitch - dt * 5);

    if (!this.alive) {
      this.deadTimer += dt;
      if (this.deadTimer < 0.45) {
        this.x = wrapX(this.x + this.deathVelX * dt, this.worldWidth);
        this.y += this.deathVelY * dt;
        this.deathVelY += 320 * dt;
        if (this.y > this.lane.y + 8) {
          this.y = this.lane.y + 8;
          this.deathVelY *= -0.25;
          this.deathVelX *= 0.45;
        }
      }
      // Downed rats remain persistently on the ground for spatiotemporal consistency!
      return;
    }

    this.stateTimer -= dt;

    if (this.state === "PEEKING") {
      this.peekAmount = Math.min(1, this.peekAmount + dt * 1.15);
      this.lookAtCamera = 0.9;
      if (this.stateTimer <= 0 && this.peekAmount >= 0.95) {
        this.state = "SCURRYING";
        this.targetX = this.pickTargetX();
        this.dir = wrappedDeltaX(this.x, this.targetX, this.worldWidth) >= 0 ? 1 : -1;
        this.stateTimer = 2.4 + Math.random() * 3.0;
      }
      return;
    }

    if (this.state === "ENTERING_BURROW") {
      // Smoothly ducks back into the burrow hole instead of popping out of existence
      this.vx = 0;
      this.peekAmount = Math.max(0, this.peekAmount - dt * 2.2);
      if (this.peekAmount <= 0.02) {
        this.removed = true;
      }
      return;
    }

    if (this.state === "SCURRYING") {
      this.peekAmount = 1;
      const baseSpeed = 128 * this.speedMult * this.scale;
      const dx = wrappedDeltaX(this.x, this.targetX, this.worldWidth);
      if (Math.abs(dx) < 18 || this.stateTimer <= 0) {
        this.vx = 0;
        if (Math.random() < 0.72) {
          this.state = "FEEDING";
          this.stateTimer = 2.4 + Math.random() * 3.6;
        } else {
          this.targetX = this.pickTargetX();
          this.dir = wrappedDeltaX(this.x, this.targetX, this.worldWidth) >= 0 ? 1 : -1;
          this.stateTimer = 2.2 + Math.random() * 2.6;
        }
      } else {
        this.dir = dx >= 0 ? 1 : -1;
        const burst = 0.75 + 0.35 * Math.sin(this.gaitPhase * 0.4);
        this.vx = this.dir * baseSpeed * burst;
        this.x = wrapX(this.x + this.vx * dt, this.worldWidth);
        this.gaitPhase += dt * 19 * this.speedMult;
        this.lookAtCamera += (0.18 - this.lookAtCamera) * Math.min(1, dt * 6);
      }
    } else if (this.state === "FEEDING") {
      this.vx = 0;
      const glance = Math.sin(this.sniffPhase * 0.28) > 0.65 ? 0.95 : 0.25;
      this.lookAtCamera += (glance - this.lookAtCamera) * Math.min(1, dt * 5);
      if (this.stateTimer <= 0) {
        if (Math.random() < 0.22) {
          this.state = "FLEEING";
          this.targetX = this.nearestBurrowX();
        } else {
          this.state = "SCURRYING";
          this.targetX = this.pickTargetX();
          this.stateTimer = 2.4 + Math.random() * 2.8;
        }
        this.dir = wrappedDeltaX(this.x, this.targetX, this.worldWidth) >= 0 ? 1 : -1;
      }
    } else if (this.state === "ALERT") {
      this.vx = 0;
      this.lookAtCamera += (1.0 - this.lookAtCamera) * Math.min(1, dt * 14);
      if (this.stateTimer <= 0) {
        this.state = "FLEEING";
        this.targetX = this.nearestBurrowX();
        this.dir = wrappedDeltaX(this.x, this.targetX, this.worldWidth) >= 0 ? 1 : -1;
      }
    } else if (this.state === "FLEEING") {
      const fleeSpeed = 245 * this.speedMult * this.scale;
      const dx = wrappedDeltaX(this.x, this.targetX, this.worldWidth);
      if (Math.abs(dx) < 20) {
        // Reached a real burrow -> duck inside smoothly!
        this.state = "ENTERING_BURROW";
        this.vx = 0;
        return;
      }
      this.dir = dx >= 0 ? 1 : -1;
      this.vx = this.dir * fleeSpeed;
      this.x = wrapX(this.x + this.vx * dt, this.worldWidth);
      this.gaitPhase += dt * 28 * this.speedMult;
      this.lookAtCamera += (0.12 - this.lookAtCamera) * Math.min(1, dt * 8);
    }
  }

  draw(ctx, irAimX, irAimY, irBoost = 1.0, xOffset = 0) {
    const drawX = this.x + xOffset;
    const s = this.scale;
    const distToBeam = Math.hypot(
      wrappedDeltaX(irAimX, this.x, this.worldWidth),
      this.y - irAimY
    );
    const beamFactor = Math.max(0.18, Math.min(1.0, 1.15 - distToBeam / (620 * irBoost)));

    ctx.save();
    ctx.translate(drawX, this.y);

    if (!this.alive) {
      ctx.scale(this.dir * s, s);
      ctx.fillStyle = "rgba(8, 10, 12, 0.55)";
      ctx.beginPath();
      ctx.ellipse(0, 2, 30, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(this.deathRoll * Math.min(1, this.deadTimer * 4));
      this._drawTail(ctx, 0.2);
      ctx.fillStyle = "#52565a";
      ctx.beginPath();
      ctx.ellipse(-4, -8, 25, 13, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#484c50";
      ctx.beginPath();
      ctx.ellipse(20, -6, 12, 8, 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Smooth emerge / duck-in scale when entering/leaving a burrow
    const vis = Math.max(0.05, this.peekAmount);
    ctx.globalAlpha = Math.min(1, vis * 1.4);
    ctx.scale(this.dir * s * (0.35 + 0.65 * vis), s * (0.45 + 0.55 * vis));

    const moving = Math.abs(this.vx) > 5;
    const bounce = moving ? Math.abs(Math.sin(this.gaitPhase)) * 3.2 : 0;
    const headBob =
      this.state === "FEEDING"
        ? Math.sin(this.sniffPhase) * 2.6 + 5
        : this.state === "ALERT"
          ? -4.5
          : 0;

    ctx.fillStyle = "rgba(6, 8, 10, 0.62)";
    ctx.beginPath();
    ctx.ellipse(-2, 2, 28 * vis, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (vis > 0.5) {
      this._drawTail(
        ctx,
        moving ? Math.sin(this.gaitPhase * 0.5) * 6 : Math.sin(this.sniffPhase * 0.2) * 2
      );
    }

    const legSwing = moving ? Math.sin(this.gaitPhase) * 7 : 0;
    ctx.strokeStyle = "#6c7074";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-14, -6 - bounce * 0.4);
    ctx.lineTo(-16 - legSwing, 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(11, -6 - bounce * 0.4);
    ctx.lineTo(13 + legSwing, 1);
    ctx.stroke();

    const bodyGrad = ctx.createLinearGradient(-12, -31 - bounce, 8, 0);
    bodyGrad.addColorStop(0, "#7c8185");
    bodyGrad.addColorStop(0.28, "#4c5054");
    bodyGrad.addColorStop(0.85, "#2b2e31");
    bodyGrad.addColorStop(1, "#1e2022");

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(-4, -14 - bounce, 24, 14.5, -0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(210, 216, 222, ${0.28 * beamFactor})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-4, -14 - bounce, 14, -Math.PI * 0.85, -Math.PI * 0.18);
    ctx.stroke();

    const hx = 21;
    const hy = -15 - bounce + headBob * 0.55;
    const headGrad = ctx.createRadialGradient(hx - 2, hy - 4, 2, hx, hy, 14);
    headGrad.addColorStop(0, "#686d71");
    headGrad.addColorStop(0.6, "#3e4246");
    headGrad.addColorStop(1, "#26292c");

    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.moveTo(hx - 10, hy - 9);
    ctx.quadraticCurveTo(hx + 6, hy - 10, hx + 15, hy + 1);
    ctx.quadraticCurveTo(hx + 16, hy + 5, hx + 9, hy + 6);
    ctx.quadraticCurveTo(hx - 4, hy + 7, hx - 11, hy + 3);
    ctx.closePath();
    ctx.fill();

    const earAngle = this.earTwitch * 0.25;
    ctx.fillStyle = "#5c6064";
    ctx.beginPath();
    ctx.ellipse(hx - 5, hy - 10, 5, 6.2, -0.35 + earAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(180, 185, 190, 0.35)";
    ctx.beginPath();
    ctx.ellipse(hx - 5, hy - 10, 2.8, 3.6, -0.35 + earAngle, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8a8f94";
    ctx.beginPath();
    ctx.arc(hx + 14.5, hy + 2, 1.8, 0, Math.PI * 2);
    ctx.fill();

    const eyeGlow = Math.max(0.25, beamFactor * (0.45 + 0.55 * this.lookAtCamera));
    const drawEye = (ex, ey, radius) => {
      const bloom = ctx.createRadialGradient(ex, ey, 0.5, ex, ey, radius * 4.2);
      bloom.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, eyeGlow * 1.1)})`);
      bloom.addColorStop(0.32, `rgba(240, 248, 255, ${eyeGlow * 0.55})`);
      bloom.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(ex, ey, radius * 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, eyeGlow + 0.18)})`;
      ctx.beginPath();
      ctx.arc(ex, ey, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    drawEye(hx + 4.5, hy - 2.2, 2.2);
    if (this.lookAtCamera > 0.52) {
      drawEye(hx + 10.2, hy - 1.5, 1.95 * this.lookAtCamera);
    }

    ctx.restore();
  }

  _drawTail(ctx, wag) {
    ctx.strokeStyle = "#8e9398";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-25, -7);
    ctx.bezierCurveTo(-42, -5 + wag * 0.4, -56, -2 - wag * 0.6, -74, 1 + wag);
    ctx.stroke();

    ctx.strokeStyle = "rgba(215, 220, 224, 0.3)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-26, -8);
    ctx.bezierCurveTo(-42, -6 + wag * 0.4, -56, -3 - wag * 0.6, -73, 0 + wag);
    ctx.stroke();
  }
}
