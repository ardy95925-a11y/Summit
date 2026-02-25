// game.js - Core game engine: physics, rope swinging, terrain, coins, checkpoints

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;

    this.reset();
    this.running = false;
    this.paused = false;

    // Callbacks
    this.onCheckpoint = null;
    this.onCoinCollect = null;
    this.onGameOver = null;
    this.onHeightRecord = null;
  }

  reset() {
    // Player state
    this.player = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 14,
      onGround: false,
      grounded: false,
    };

    // Rope
    this.rope = {
      attached: false,
      anchorX: 0,
      anchorY: 0,
      length: 0,
      maxLength: 200,
      throwing: false,
      throwX: 0,
      throwY: 0,
      throwProgress: 0,
      targetX: 0,
      targetY: 0,
    };

    // Upgraded stats
    this.playerStats = {
      maxRopeLength: 200,
      swingPower: 1.0,
      coinMagnetRadius: 40,
      coinMultiplier: 1,
      airControl: 1.0,
      fallResistance: 1.0,
      hookRange: 1.0,
      ghostRope: false,
      speedMultiplier: 1.0,
      checkpointBonus: 0,
    };

    // Terrain
    this.terrain = [];
    this.terrainSeed = Math.random() * 10000;
    this.terrainGenY = 0;
    this.worldBottom = 600;

    // Camera
    this.camera = { x: 0, y: 0 };
    this.targetCameraY = 0;

    // Coins
    this.coins = [];

    // Checkpoints
    this.checkpoints = [];
    this.nextCheckpointY = -800;
    this.checkpointInterval = 600;

    // Progress
    this.highestY = 0;
    this.coinsCollected = 0;
    this.checkpointsReached = 0;
    this.sessionUpgrades = [];

    // Touch / input
    this.touchStart = null;
    this.touchCurrent = null;
    this.isHolding = false;
    this.holdTime = 0;
    this.aimTarget = null;

    // Animation
    this.time = 0;
    this.deathAnim = 0;
    this.isDead = false;

    // Init world
    this.initWorld();
  }

  initWorld() {
    // Start player on a platform
    this.player.x = this.W / 2;
    this.player.y = this.worldBottom - 100;
    this.player.vx = 0;
    this.player.vy = 0;

    // Generate starting terrain
    this.generateTerrain(this.worldBottom + 100, this.worldBottom - 2000);
    this.generateCoins();
    this.generateCheckpoints();
  }

  generateTerrain(fromY, toY) {
    const W = this.W;
    const noise = (x, y) => {
      // Simple seeded noise
      const s = this.terrainSeed;
      return Math.sin(x * 0.8 + s) * Math.cos(y * 0.3 + s * 0.7) * 0.5 +
             Math.sin(x * 2.1 + s * 1.3) * 0.3 +
             Math.cos(x * 0.4 + y * 0.1 + s * 2) * 0.2;
    };

    const step = 30;
    for (let y = fromY; y >= toY; y -= step) {
      const t = Math.abs(y) / 5000; // Gets narrower higher up

      // Left wall
      const leftNoise = noise(y * 0.01, 0);
      const leftBase = W * (0.05 + t * 0.05);
      const leftX = leftBase + leftNoise * W * 0.12 + Math.sin(y * 0.008) * W * 0.08;

      // Right wall
      const rightNoise = noise(y * 0.01, 1);
      const rightBase = W * (0.95 - t * 0.05);
      const rightX = rightBase + rightNoise * W * 0.12 + Math.sin(y * 0.007 + 1) * W * 0.08;

      // Ledges
      const lx = Math.max(10, Math.min(leftX, W * 0.35));
      const rx = Math.min(W - 10, Math.max(rightX, W * 0.65));

      this.terrain.push(
        { x: lx, y, type: 'left', hookable: true },
        { x: rx, y, type: 'right', hookable: true }
      );

      // Occasional middle ledge
      if (Math.abs(noise(y * 0.02, 2)) > 0.4) {
        const midX = W * 0.3 + noise(y * 0.015, 3) * W * 0.4;
        const ledgeW = 60 + Math.abs(noise(y * 0.03, 4)) * 80;
        this.terrain.push(
          { x: midX, y, type: 'ledge', ledgeEnd: midX + ledgeW, hookable: true }
        );
      }
    }

    this.terrainGenY = toY;
  }

  generateCoins() {
    const W = this.W;
    const startY = this.worldBottom - 200;
    const endY = this.terrainGenY;

    for (let y = startY; y >= endY; y -= 120) {
      // Cluster of 3-5 coins along a rough path
      const baseX = W * 0.25 + Math.random() * W * 0.5;
      const count = 2 + Math.floor(Math.random() * 4);
      for (let j = 0; j < count; j++) {
        this.coins.push({
          x: baseX + (Math.random() - 0.5) * 120,
          y: y + j * 40,
          radius: 10,
          collected: false,
          value: 1,
          animOffset: Math.random() * 1000,
        });
      }
    }
  }

  generateCheckpoints() {
    let y = this.nextCheckpointY;
    while (y > this.terrainGenY + 200) {
      this.checkpoints.push({
        x: this.W / 2 + (Math.random() - 0.5) * this.W * 0.3,
        y: y,
        reached: false,
        animTime: Math.random() * 1000,
        radius: 30,
      });
      y -= this.checkpointInterval;
      // Increase interval slightly every few checkpoints
      this.checkpointInterval = Math.min(1200, this.checkpointInterval + 20);
    }
    this.nextCheckpointY = y;
  }

  applyUpgrade(upgrade) {
    upgrade.effect(this.playerStats);
    this.sessionUpgrades.push({ icon: upgrade.icon, name: upgrade.name });
  }

  // Input handlers
  onTouchStart(x, y) {
    this.touchStart = { x, y };
    this.touchCurrent = { x, y };
    this.isHolding = true;
    this.holdTime = 0;
  }

  onTouchMove(x, y) {
    this.touchCurrent = { x, y };
  }

  onTouchEnd(x, y) {
    if (this.isHolding && this.touchStart) {
      // Calculate rope throw direction
      const wx = x + this.camera.x;
      const wy = y + this.camera.y;
      this.throwRope(wx, wy);
    }
    this.isHolding = false;
    this.touchStart = null;

    // Release rope if tapping while attached
    if (this.rope.attached) {
      this.rope.attached = false;
    }
  }

  throwRope(targetWorldX, targetWorldY) {
    // Find nearest hookable surface near target
    const anchor = this.findHookPoint(targetWorldX, targetWorldY);
    if (anchor) {
      this.rope.throwing = true;
      this.rope.throwProgress = 0;
      this.rope.targetX = anchor.x;
      this.rope.targetY = anchor.y;
      this.rope.throwX = this.player.x;
      this.rope.throwY = this.player.y;
    }
  }

  findHookPoint(tx, ty) {
    let best = null;
    let bestDist = 300 * this.playerStats.hookRange;

    for (const pt of this.terrain) {
      const dx = pt.x - tx;
      const dy = pt.y - ty;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist && pt.y < this.player.y) { // Only hook upward
        bestDist = dist;
        best = pt;
      }
    }
    return best;
  }

  getTerrainEdgesAt(y) {
    // Get left and right edges at a given world Y
    let leftX = 0;
    let rightX = this.W;

    for (const pt of this.terrain) {
      if (Math.abs(pt.y - y) < 30) {
        if (pt.type === 'left') leftX = Math.max(leftX, pt.x);
        if (pt.type === 'right') rightX = Math.min(rightX, pt.x);
      }
    }
    return { leftX, rightX };
  }

  isOnSurface(px, py) {
    for (const pt of this.terrain) {
      const dx = pt.x - px;
      const dy = pt.y - py;
      if (Math.abs(dy) < 20 && Math.abs(dx) < 40) {
        return true;
      }
    }
    return false;
  }

  checkPlayerOnLedge() {
    const p = this.player;
    for (const pt of this.terrain) {
      if (pt.type === 'ledge') {
        if (p.x >= pt.x - 5 && p.x <= pt.ledgeEnd + 5) {
          const dy = pt.y - p.y;
          if (dy > -5 && dy < 25 && p.vy >= 0) {
            return { grounded: true, groundY: pt.y };
          }
        }
      } else {
        const dx = Math.abs(pt.x - p.x);
        const dy = pt.y - p.y;
        if (dx < 30 && dy > -5 && dy < 25 && p.vy >= 0) {
          return { grounded: true, groundY: pt.y };
        }
      }
    }
    return null;
  }

  update(dt) {
    if (!this.running || this.paused) return;
    this.time += dt;

    const p = this.player;
    const r = this.rope;
    const stats = this.playerStats;

    // Gravity
    p.vy += 0.5 * dt * 0.06;

    // Rope throwing animation
    if (r.throwing) {
      r.throwProgress += dt * 0.008;
      if (r.throwProgress >= 1) {
        r.throwing = false;
        r.attached = true;
        r.anchorX = r.targetX;
        r.anchorY = r.targetY;
        const dx = r.anchorX - p.x;
        const dy = r.anchorY - p.y;
        r.length = Math.sqrt(dx * dx + dy * dy);
        r.maxLength = Math.min(r.length, stats.maxRopeLength);
      }
    }

    // Rope physics
    if (r.attached) {
      const dx = p.x - r.anchorX;
      const dy = p.y - r.anchorY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > r.maxLength) {
        // Constrain to rope length
        const nx = dx / dist;
        const ny = dy / dist;
        p.x = r.anchorX + nx * r.maxLength;
        p.y = r.anchorY + ny * r.maxLength;

        // Project velocity perpendicular to rope
        const dot = p.vx * nx + p.vy * ny;
        p.vx -= dot * nx * 1.0;
        p.vy -= dot * ny * 1.0;

        // Swing force - centripetal
        const perpX = -ny;
        const perpY = nx;
        const swingVel = p.vx * perpX + p.vy * perpY;
        p.vx = perpX * swingVel;
        p.vy = perpY * swingVel;
      }

      // Air control while swinging
      if (this.isHolding && this.touchCurrent) {
        const aimDx = (this.touchCurrent.x + this.camera.x) - p.x;
        p.vx += aimDx * 0.002 * stats.airControl * stats.swingPower;
      }

      // Cap rope velocity
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const maxSpeed = 25 * stats.speedMultiplier;
      if (speed > maxSpeed) {
        p.vx = p.vx / speed * maxSpeed;
        p.vy = p.vy / speed * maxSpeed;
      }

      // Check if rope anchor is above - if player reaches anchor area, detach
      if (p.y < r.anchorY + 30) {
        r.attached = false;
      }
    } else {
      // Free fall air control
      if (this.isHolding && this.touchCurrent) {
        const aimDx = (this.touchCurrent.x + this.camera.x) - p.x;
        p.vx += aimDx * 0.001 * stats.airControl;
      }
    }

    // Apply velocity
    p.x += p.vx;
    p.y += p.vy;

    // Ground / ledge collision
    const ledgeCheck = this.checkPlayerOnLedge();
    if (ledgeCheck && p.vy > 0) {
      p.y = ledgeCheck.groundY;
      p.vy *= -0.15 * stats.fallResistance;
      if (Math.abs(p.vy) < 1) p.vy = 0;
      p.grounded = true;
    } else {
      p.grounded = false;
    }

    // Wall collision
    const { leftX, rightX } = this.getTerrainEdgesAt(p.y);
    if (p.x < leftX + p.radius) {
      p.x = leftX + p.radius;
      p.vx *= -0.3;
    }
    if (p.x > rightX - p.radius) {
      p.x = rightX - p.radius;
      p.vx *= -0.3;
    }

    // Friction
    if (p.grounded) {
      p.vx *= 0.85;
    } else {
      p.vx *= 0.99;
    }

    // Cap vertical speed
    if (p.vy > 30) p.vy = 30;

    // Update highest point
    const worldHeight = this.worldBottom - p.y;
    if (worldHeight > this.highestY) {
      this.highestY = worldHeight;
      if (this.onHeightRecord) this.onHeightRecord(this.highestY);
    }

    // Death check - fall off bottom
    if (p.y > this.worldBottom + 300) {
      this.triggerDeath();
      return;
    }

    // Camera follow
    const targetCamY = p.y - this.H * 0.55;
    this.camera.y += (targetCamY - this.camera.y) * 0.08;
    this.camera.x = 0; // No horizontal camera movement

    // Generate more terrain if needed
    if (p.y < this.terrainGenY + this.H * 2) {
      this.generateTerrain(this.terrainGenY, this.terrainGenY - 2000);
      this.generateCoins();
      this.generateCheckpoints();
    }

    // Collect coins
    const magnet = stats.coinMagnetRadius;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const dx = coin.x - p.x;
      const dy = coin.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < coin.radius + p.radius + magnet) {
        if (dist < coin.radius + p.radius) {
          coin.collected = true;
          const worth = coin.value * stats.coinMultiplier;
          this.coinsCollected += worth;
          if (this.onCoinCollect) this.onCoinCollect(coin.x, coin.y, worth);
        } else if (magnet > 0) {
          // Magnet pull
          const nx = dx / dist;
          const ny = dy / dist;
          coin.x -= nx * 4;
          coin.y -= ny * 4;
        }
      }
    }

    // Check checkpoints
    for (const cp of this.checkpoints) {
      if (cp.reached) continue;
      const dx = cp.x - p.x;
      const dy = cp.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < cp.radius + p.radius + 20) {
        cp.reached = true;
        this.checkpointsReached++;
        const bonus = 5 + stats.checkpointBonus;
        this.coinsCollected += bonus;
        if (this.onCheckpoint) this.onCheckpoint(cp.x, cp.y, bonus);
      }
      cp.animTime += dt;
    }

    // Auto-detach rope when swinging backwards/stuck
    if (r.attached) {
      const dy = p.y - r.anchorY;
      if (dy > 80 && p.vy > 5) {
        r.attached = false;
      }
    }
  }

  triggerDeath() {
    this.isDead = true;
    this.running = false;
    if (this.onGameOver) {
      setTimeout(() => this.onGameOver(), 1500);
    }
  }

  getRopeThrowPoint() {
    const r = this.rope;
    if (!r.throwing) return null;
    const t = r.throwProgress;
    return {
      x: r.throwX + (r.targetX - r.throwX) * t,
      y: r.throwY + (r.targetY - r.throwY) * t - Math.sin(t * Math.PI) * 50,
    };
  }

  getAimLine() {
    if (!this.isHolding || !this.touchCurrent) return null;
    return {
      fromX: this.player.x - this.camera.x,
      fromY: this.player.y - this.camera.y,
      toX: this.touchCurrent.x,
      toY: this.touchCurrent.y,
    };
  }

  getVisibleTerrain() {
    const minY = this.camera.y - 100;
    const maxY = this.camera.y + this.H + 100;
    return this.terrain.filter(pt => pt.y >= minY && pt.y <= maxY);
  }

  getVisibleCoins() {
    const minY = this.camera.y - 100;
    const maxY = this.camera.y + this.H + 100;
    return this.coins.filter(c => c.y >= minY && c.y <= maxY);
  }

  getVisibleCheckpoints() {
    const minY = this.camera.y - 100;
    const maxY = this.camera.y + this.H + 100;
    return this.checkpoints.filter(cp => cp.y >= minY && cp.y <= maxY);
  }

  drawTerrainPoints(ctx, points) {
    if (!points.length) return;
    const cam = this.camera;

    // Draw filled rock walls
    ctx.save();

    // Group left and right points
    const leftPts = points.filter(p => p.type === 'left').sort((a, b) => a.y - b.y);
    const rightPts = points.filter(p => p.type === 'right').sort((a, b) => a.y - b.y);
    const ledgePts = points.filter(p => p.type === 'ledge');

    const terrainGrad = ctx.createLinearGradient(0, 0, this.W, 0);
    terrainGrad.addColorStop(0, '#1e2d40');
    terrainGrad.addColorStop(0.5, '#2a3d55');
    terrainGrad.addColorStop(1, '#1e2d40');

    // Left wall
    if (leftPts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(0, leftPts[0].y - cam.y);
      for (const p of leftPts) ctx.lineTo(p.x - cam.x, p.y - cam.y);
      ctx.lineTo(0, leftPts[leftPts.length - 1].y - cam.y);
      ctx.closePath();
      ctx.fillStyle = terrainGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 140, 200, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Right wall
    if (rightPts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.W, rightPts[0].y - cam.y);
      for (const p of rightPts) ctx.lineTo(p.x - cam.x, p.y - cam.y);
      ctx.lineTo(this.W, rightPts[rightPts.length - 1].y - cam.y);
      ctx.closePath();
      ctx.fillStyle = terrainGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(100, 140, 200, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Ledges
    for (const ledge of ledgePts) {
      const sx = ledge.x - cam.x;
      const ex = ledge.ledgeEnd - cam.x;
      const sy = ledge.y - cam.y;

      ctx.fillStyle = '#2a3d55';
      ctx.beginPath();
      ctx.roundRect(sx, sy - 5, ex - sx, 14, 4);
      ctx.fill();

      // Snow on top
      ctx.fillStyle = 'rgba(200, 220, 255, 0.3)';
      ctx.beginPath();
      ctx.roundRect(sx, sy - 5, ex - sx, 5, [4, 4, 0, 0]);
      ctx.fill();

      ctx.strokeStyle = 'rgba(100, 140, 200, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Hook points highlight
    for (const pt of points) {
      if (!pt.hookable) continue;
      ctx.fillStyle = 'rgba(150, 180, 220, 0.15)';
      ctx.beginPath();
      ctx.arc(pt.x - cam.x, pt.y - cam.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawAimLine(ctx) {
    const aim = this.getAimLine();
    if (!aim) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(aim.fromX, aim.fromY);
    ctx.lineTo(aim.toX, aim.toY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair at target
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(aim.toX, aim.toY, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
