// renderer.js - Visual systems: rain, parallax mountains, particles, coins

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // Rain
    this.raindrops = [];
    this.initRain();

    // Parallax layers
    this.bgLayers = [];
    this.initBGLayers();

    // Particles
    this.particles = [];

    // Fog
    this.fogOffset = 0;

    // Lightning
    this.lightning = null;
    this.lightningTimer = 0;
    this.nextLightning = 3000 + Math.random() * 8000;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.initRain();
    this.initBGLayers();
  }

  initRain() {
    this.raindrops = [];
    const count = Math.floor((this.width * this.height) / 3000);
    for (let i = 0; i < count; i++) {
      this.raindrops.push(this.makeRaindrop(true));
    }
  }

  makeRaindrop(randomY = false) {
    return {
      x: Math.random() * this.width,
      y: randomY ? Math.random() * this.height : -10,
      length: 8 + Math.random() * 18,
      speed: 14 + Math.random() * 12,
      opacity: 0.15 + Math.random() * 0.35,
      width: 0.5 + Math.random() * 1,
    };
  }

  initBGLayers() {
    this.bgLayers = [
      { // Furthest - faint sky mountains
        color: 'rgba(60, 80, 110, 0.25)',
        peaks: this.generatePeaks(6, 0.25, 0.65),
        speed: 0.05,
      },
      { // Mid mountains
        color: 'rgba(50, 70, 100, 0.4)',
        peaks: this.generatePeaks(5, 0.35, 0.75),
        speed: 0.12,
      },
      { // Near mountains
        color: 'rgba(40, 58, 85, 0.55)',
        peaks: this.generatePeaks(4, 0.5, 0.85),
        speed: 0.22,
      },
    ];
  }

  generatePeaks(count, minH, maxH) {
    const peaks = [];
    for (let i = 0; i <= count + 1; i++) {
      peaks.push({
        x: (i / count) * 1.2 - 0.1,
        y: minH + Math.random() * (maxH - minH),
      });
    }
    return peaks;
  }

  spawnParticle(x, y, type = 'spark') {
    const configs = {
      spark: {
        vx: (Math.random() - 0.5) * 6,
        vy: -2 - Math.random() * 4,
        life: 40 + Math.random() * 30,
        size: 2 + Math.random() * 3,
        color: `hsl(${40 + Math.random() * 30}, 90%, 70%)`,
        gravity: 0.2,
      },
      coinPop: {
        vx: (Math.random() - 0.5) * 8,
        vy: -3 - Math.random() * 5,
        life: 30 + Math.random() * 20,
        size: 3 + Math.random() * 4,
        color: `hsl(${45 + Math.random() * 20}, 100%, 65%)`,
        gravity: 0.3,
      },
      fog: {
        vx: 0.5 + Math.random() * 0.5,
        vy: -0.1,
        life: 120 + Math.random() * 60,
        size: 30 + Math.random() * 50,
        color: 'rgba(180, 200, 230, 0.04)',
        gravity: 0,
      }
    };
    const cfg = configs[type] || configs.spark;
    this.particles.push({ x, y, ...cfg, maxLife: cfg.life });
  }

  spawnCoinParticles(x, y) {
    for (let i = 0; i < 8; i++) this.spawnParticle(x, y, 'coinPop');
  }

  update(dt, cameraY) {
    // Rain
    for (const drop of this.raindrops) {
      drop.x -= 2.5;
      drop.y += drop.speed;
      if (drop.y > this.height + 20 || drop.x < -10) {
        drop.x = Math.random() * this.width + this.width * 0.2;
        drop.y = -20;
      }
    }

    // Lightning
    this.lightningTimer += dt;
    if (this.lightningTimer > this.nextLightning) {
      this.lightning = {
        x: 0.2 + Math.random() * 0.6,
        segments: this.buildLightning(),
        life: 200,
        maxLife: 200,
      };
      this.lightningTimer = 0;
      this.nextLightning = 4000 + Math.random() * 10000;
    }
    if (this.lightning) {
      this.lightning.life -= dt;
      if (this.lightning.life <= 0) this.lightning = null;
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life -= dt * 0.06;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Occasional fog particles
    if (Math.random() < 0.02) {
      this.spawnParticle(Math.random() * this.width, this.height * 0.3 + Math.random() * this.height * 0.5, 'fog');
    }

    this.fogOffset += 0.2;
  }

  buildLightning() {
    const segs = [];
    let cx = 0, cy = 0;
    for (let i = 0; i < 12; i++) {
      const nx = cx + (Math.random() - 0.5) * 0.15;
      const ny = cy + 0.08 + Math.random() * 0.06;
      segs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
      cx = nx; cy = ny;
    }
    return segs;
  }

  drawBackground(cameraY) {
    const ctx = this.ctx;
    const W = this.width, H = this.height;

    // Sky gradient - deep moody blues/purples
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a0e1a');
    sky.addColorStop(0.4, '#0f1729');
    sky.addColorStop(0.7, '#16243d');
    sky.addColorStop(1, '#1e3050');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Stars
    ctx.save();
    const starSeed = Math.floor(cameraY / 500);
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 137 + starSeed * 17) % 1000) / 1000 * W;
      const sy = ((i * 53 + starSeed * 31) % 700) / 700 * H * 0.6;
      const size = ((i % 3) + 0.5) * 0.7;
      const twinkle = Math.sin(Date.now() * 0.001 + i) * 0.3 + 0.7;
      ctx.globalAlpha = twinkle * 0.6;
      ctx.fillStyle = '#cce0ff';
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Parallax mountain layers
    for (const layer of this.bgLayers) {
      const offset = (cameraY * layer.speed) % W;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(-offset, H);
      for (const p of layer.peaks) {
        ctx.lineTo(p.x * W - offset, p.y * H);
      }
      ctx.lineTo(W + W - offset, H);
      ctx.closePath();
      ctx.fill();
      // Draw again offset for seamless tiling
      ctx.beginPath();
      ctx.moveTo(W - offset, H);
      for (const p of layer.peaks) {
        ctx.lineTo(p.x * W + W - offset, p.y * H);
      }
      ctx.lineTo(W * 2 - offset + W, H);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Lightning flash
    if (this.lightning) {
      const t = this.lightning.life / this.lightning.maxLife;
      const flash = t > 0.8 ? (t - 0.8) / 0.2 : 0;
      if (flash > 0) {
        ctx.save();
        ctx.globalAlpha = flash * 0.15;
        ctx.fillStyle = '#88aaff';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      // Draw bolt
      ctx.save();
      ctx.globalAlpha = t * 0.9;
      ctx.strokeStyle = '#aaccff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#6699ff';
      ctx.shadowBlur = 12;
      for (const seg of this.lightning.segments) {
        ctx.beginPath();
        ctx.moveTo(this.lightning.x * W + seg.x1 * W * 0.3, seg.y1 * H * 0.5);
        ctx.lineTo(this.lightning.x * W + seg.x2 * W * 0.3, seg.y2 * H * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawRain(windX = 0) {
    const ctx = this.ctx;
    ctx.save();
    for (const drop of this.raindrops) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(160, 200, 255, ${drop.opacity})`;
      ctx.lineWidth = drop.width;
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - drop.length * 0.18 + windX, drop.y + drop.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFog(cameraY) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;

    // Atmospheric fog bands
    for (let i = 0; i < 3; i++) {
      const y = (H * 0.5 + i * H * 0.15 + (this.fogOffset * (0.3 + i * 0.1)) % H) % H;
      const fog = ctx.createLinearGradient(0, y - 30, 0, y + 60);
      fog.addColorStop(0, 'rgba(100, 140, 200, 0)');
      fog.addColorStop(0.5, `rgba(80, 120, 180, ${0.04 + i * 0.015})`);
      fog.addColorStop(1, 'rgba(100, 140, 200, 0)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, y - 30, W, 90);
    }
  }

  drawParticles() {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      const alpha = Math.min(1, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCoin(ctx, x, y, radius, collected = false, animTime = 0) {
    if (collected) return;
    ctx.save();
    const bob = Math.sin(animTime * 0.003 + x * 0.1) * 3;
    const scaleX = Math.abs(Math.cos(animTime * 0.002 + x * 0.05));

    ctx.translate(x, y + bob);
    ctx.scale(scaleX, 1);

    // Coin glow
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 2);
    glow.addColorStop(0, 'rgba(255, 220, 50, 0.3)');
    glow.addColorStop(1, 'rgba(255, 180, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Main coin
    const coinGrad = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, 0, 0, 0, radius);
    coinGrad.addColorStop(0, '#FFE566');
    coinGrad.addColorStop(0.6, '#FFC107');
    coinGrad.addColorStop(1, '#E6A000');
    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-radius * 0.25, -radius * 0.25, radius * 0.3, radius * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawRope(ctx, playerX, playerY, anchorX, anchorY, ropeLen, segments = 20) {
    // Catenary rope with sag
    ctx.save();
    ctx.strokeStyle = '#c8a96e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(200, 169, 110, 0.4)';
    ctx.shadowBlur = 4;

    const dx = anchorX - playerX;
    const dy = anchorY - playerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const sag = Math.max(0, ropeLen - dist) * 0.3;

    ctx.beginPath();
    ctx.moveTo(playerX, playerY);

    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const x = playerX + dx * t;
      const sineY = Math.sin(t * Math.PI) * sag;
      const y = playerY + dy * t + sineY;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Hook at anchor
    ctx.strokeStyle = '#8899bb';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#aabbdd';
    ctx.beginPath();
    ctx.arc(anchorX, anchorY, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  drawPlayer(ctx, x, y, vel, isSwinging, ropeAngle) {
    ctx.save();
    ctx.translate(x, y);

    // Lean based on horizontal velocity
    const lean = Math.atan2(vel.x, 10) * 0.3;
    ctx.rotate(lean);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body - cozy parka
    const bodyGrad = ctx.createRadialGradient(-3, -5, 0, 0, 0, 18);
    bodyGrad.addColorStop(0, '#e8734a');
    bodyGrad.addColorStop(1, '#c45a30');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-10, -8, 20, 22, 6);
    ctx.fill();

    // Fur trim
    ctx.fillStyle = '#f5e6c8';
    ctx.beginPath();
    ctx.roundRect(-10, -10, 20, 6, [4, 4, 0, 0]);
    ctx.fill();

    // Backpack
    ctx.fillStyle = '#4a7a5a';
    ctx.beginPath();
    ctx.roundRect(6, -5, 8, 14, 3);
    ctx.fill();

    // Head
    const headGrad = ctx.createRadialGradient(-1, -18, 0, 0, -16, 10);
    headGrad.addColorStop(0, '#f5c896');
    headGrad.addColorStop(1, '#e0a870');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, -16, 8, 0, Math.PI * 2);
    ctx.fill();

    // Hat
    ctx.fillStyle = '#c45a30';
    ctx.beginPath();
    ctx.ellipse(0, -22, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-6, -34, 12, 14, [6, 6, 0, 0]);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath();
    ctx.arc(-3, -17, 1.5, 0, Math.PI * 2);
    ctx.arc(3, -17, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Scarf
    ctx.fillStyle = '#8899dd';
    ctx.beginPath();
    ctx.roundRect(-11, -12, 22, 5, 2);
    ctx.fill();

    // Arm reaching up when swinging
    if (isSwinging) {
      const armAngle = ropeAngle - Math.PI / 2;
      ctx.strokeStyle = '#e8734a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(Math.cos(armAngle) * 18, -4 + Math.sin(armAngle) * 18);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawCheckpoint(ctx, x, y, reached, pulseTime) {
    ctx.save();
    ctx.translate(x, y);

    const pulse = reached ? 1 : 0.85 + Math.sin(pulseTime * 0.003) * 0.15;
    ctx.scale(pulse, pulse);

    if (!reached) {
      // Glow ring
      const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 40);
      glow.addColorStop(0, 'rgba(100, 220, 180, 0.2)');
      glow.addColorStop(1, 'rgba(100, 220, 180, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flag pole
    ctx.strokeStyle = reached ? '#888' : '#aabbcc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(0, -20);
    ctx.stroke();

    // Flag
    const flagColor = reached ? '#44cc88' : '#ff9944';
    ctx.fillStyle = flagColor;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(22, -12);
    ctx.lineTo(0, -4);
    ctx.closePath();
    ctx.fill();

    if (reached) {
      ctx.fillStyle = 'rgba(100, 255, 180, 0.3)';
      ctx.beginPath();
      ctx.arc(0, 5, 25, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawTerrain(ctx, points, camera) {
    if (points.length < 2) return;
    ctx.save();

    // Rock face gradient
    const terrainGrad = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
    terrainGrad.addColorStop(0, '#2a3545');
    terrainGrad.addColorStop(0.5, '#354558');
    terrainGrad.addColorStop(1, '#2a3545');

    ctx.beginPath();
    ctx.moveTo(points[0].x - camera.x, points[0].y - camera.y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x - camera.x, points[i].y - camera.y);
    }
    // Close path down and across
    const last = points[points.length - 1];
    const first = points[0];
    ctx.lineTo(last.x - camera.x, last.y - camera.y + 200);
    ctx.lineTo(first.x - camera.x, first.y - camera.y + 200);
    ctx.closePath();

    ctx.fillStyle = terrainGrad;
    ctx.fill();

    // Edge highlight / snow
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Snow caps - lightest points
    ctx.strokeStyle = 'rgba(230, 240, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let onSnow = false;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;
      if (i === 0) { ctx.moveTo(sx, sy); onSnow = true; continue; }
      if (onSnow) ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    ctx.restore();
  }
}
