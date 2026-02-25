// game.js — Physics engine, rope mechanics, terrain, coins, combos, wall-jump

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.running = false;
    this.paused  = false;

    // Callbacks
    this.onCheckpoint  = null;
    this.onCoinCollect = null;
    this.onGameOver    = null;
    this.onHeightRecord= null;
    this.onCombo       = null;

    this.reset();
  }

  reset() {
    this.player = {
      x: 0, y: 0,
      vx: 0, vy: 0,
      radius: 14,
      grounded: false,
      wallTouching: 0,   // -1 left, 0 none, 1 right
      coyoteTime: 0,     // frames since left ground
      wasSwinging: false,
    };

    this.rope = {
      attached: false,
      anchorX: 0, anchorY: 0,
      length: 0, targetLength: 0,
      throwing: false,
      throwT: 0,
      fromX: 0, fromY: 0,
      toX: 0, toY: 0,
      taut: false,
      justAttached: false,
    };

    this.playerStats = {
      maxRopeLength:   220,
      swingPower:      1.0,
      coinMagnetRadius:50,
      coinMultiplier:  1,
      airControl:      1.0,
      fallResistance:  1.0,
      hookRange:       1.0,
      ghostRope:       false,
      speedMultiplier: 1.0,
      checkpointBonus: 0,
      cloudStep:       false,
      elasticRope:     false,
      stormCloak:      false,
      comboStart:      1,
      playerScale:     1.0,
    };

    // Terrain
    this.terrain      = [];
    this.terrainGenY  = 0;
    this.worldBottom  = 500;
    this.seed         = Date.now() % 99999;

    // Camera — smooth with lag
    this.camera    = { x:0, y:0 };
    this.camTarget = { x:0, y:0 };
    this.camShake  = 0;

    // Objects
    this.coins       = [];
    this.checkpoints = [];
    this.nextCpY     = -700;
    this.cpInterval  = 600;
    this.hazards     = [];

    // Progress
    this.highestY         = 0;
    this.coinsCollected   = 0;
    this.checkpointsReached = 0;
    this.sessionUpgrades  = [];

    // Combo system
    this.comboCount   = 0;
    this.comboTimer   = 0;
    this.comboWindow  = 3000; // ms to keep combo

    // Input
    this.pointer      = { down:false, x:0, y:0, startX:0, startY:0, holdMs:0 };
    this.touchRelease = false;

    // Timers
    this.time = 0;

    // Weather
    this.currentWeather = 'rainy';
    this.weatherTimer   = 0;
    this.nextWeatherChange = 20000 + Math.random()*30000;

    this.initWorld();
  }

  // ─── World Gen ────────────────────────────────────────────────────────────
  rng(a, b=0) {
    // Seeded deterministic noise
    const s = this.seed;
    return Math.sin(a*127.1 + b*311.7 + s*0.01) * 0.5 + 0.5;
  }

  noiseVal(y, channel) {
    return Math.sin(y*0.013 + channel*17.3 + this.seed*0.007) * 0.5
         + Math.sin(y*0.031 + channel*5.1 + this.seed*0.013) * 0.3
         + Math.sin(y*0.007 + channel*31  + this.seed*0.003) * 0.2;
  }

  initWorld() {
    this.player.x = this.W * 0.5;
    this.player.y = this.worldBottom - 80;
    this.generateTerrain(this.worldBottom + 50, this.worldBottom - 2500);
    this.generateCoins();
    this.generateCheckpoints();
  }

  generateTerrain(fromY, toY) {
    const W = this.W;
    const step = 25;

    for (let y=fromY; y>=toY; y-=step) {
      const heightFrac = Math.max(0, Math.abs(y)/8000); // mountain narrows upward
      const narrowing  = heightFrac * 0.18;

      // ── Walls ──
      const lNoise = this.noiseVal(y, 0);
      const rNoise = this.noiseVal(y, 1);
      const lBase  = W*(0.04 + narrowing);
      const rBase  = W*(0.96 - narrowing);

      const lx = lBase + lNoise*W*0.13 + Math.sin(y*0.009)*W*0.07;
      const rx = rBase - rNoise*W*0.13 - Math.sin(y*0.008+1.2)*W*0.07;

      const clampedL = Math.max(8,  Math.min(lx, W*0.30));
      const clampedR = Math.min(W-8, Math.max(rx, W*0.70));

      this.terrain.push({ x:clampedL, y, type:'wallL', hookable:true });
      this.terrain.push({ x:clampedR, y, type:'wallR', hookable:true });

      // ── Floating ledges ──
      const ledgeDensity = 0.3 + heightFrac*0.1;
      if (this.rng(y*0.05, 2) < ledgeDensity) {
        const ledgeNoise = this.noiseVal(y, 3);
        const ledgeMid   = clampedL + (clampedR - clampedL) * (0.2 + ledgeNoise*0.6);
        const ledgeLen   = 50 + Math.abs(this.noiseVal(y, 4))*100;
        const lx2 = Math.max(clampedL+10, ledgeMid - ledgeLen/2);
        const rx2 = Math.min(clampedR-10, ledgeMid + ledgeLen/2);
        if (rx2 - lx2 > 30) {
          this.terrain.push({ x:lx2, y, type:'ledge', ledgeEnd:rx2, hookable:true,
            icy: this.rng(y*0.07, 5) > 0.85 }); // icy ledges are slippery
        }
      }

      // ── Overhang rocks (hookable ceiling protrusions) ──
      if (this.rng(y*0.03, 6) > 0.88) {
        const rx3 = clampedL + 30 + this.rng(y,7)*(clampedR-clampedL-60);
        this.terrain.push({ x:rx3, y, type:'rock', hookable:true });
      }
    }

    this.terrainGenY = toY;
  }

  generateCoins() {
    const W = this.W;
    const from = this.worldBottom - 150;
    const to   = this.terrainGenY;

    for (let y=from; y>=to; y-=100) {
      const isLine = this.rng(y*0.04, 8) > 0.5;
      if (isLine) {
        // Horizontal line of coins
        const baseX = W*0.2 + this.rng(y, 9)*W*0.6;
        const count = 3 + Math.floor(this.rng(y, 10)*4);
        for (let i=0;i<count;i++) {
          this.coins.push({
            x: baseX + i*30, y,
            radius:9, collected:false,
            value: this.rng(y*0.1+i,11) > 0.9 ? 5 : 1, // rare big coin
            anim: Math.random()*1000,
            rare: this.rng(y*0.1+i,11) > 0.9,
          });
        }
      } else {
        // Scattered cluster
        const cx = W*0.2 + this.rng(y,12)*W*0.6;
        const cy = y;
        const count = 2 + Math.floor(this.rng(y,13)*5);
        for (let i=0;i<count;i++) {
          this.coins.push({
            x: cx + (this.rng(y,14+i)-0.5)*150,
            y: cy + (this.rng(y,20+i)-0.5)*60,
            radius:9, collected:false,
            value: 1, anim: Math.random()*1000, rare:false,
          });
        }
      }
    }
  }

  generateCheckpoints() {
    let y = this.nextCpY;
    while (y > this.terrainGenY + 300) {
      // Find a good X (not inside walls)
      const wallLx = this._getWallAt(y, 'L');
      const wallRx = this._getWallAt(y, 'R');
      const safeX  = wallLx + 40 + Math.random()*(Math.max(0, wallRx-wallLx-80));
      this.checkpoints.push({
        x: safeX, y,
        reached:false, animT:Math.random()*2000, radius:35,
      });
      y -= this.cpInterval;
      this.cpInterval = Math.min(1400, this.cpInterval + 25);
    }
    this.nextCpY = y;
  }

  _getWallAt(y, side) {
    let best = side==='L' ? 0 : this.W;
    for (const pt of this.terrain) {
      if (Math.abs(pt.y - y) < 60) {
        if (side==='L' && pt.type==='wallL') best = Math.max(best, pt.x);
        if (side==='R' && pt.type==='wallR') best = Math.min(best, pt.x);
      }
    }
    return best;
  }

  // ─── Input ────────────────────────────────────────────────────────────────
  onTouchStart(sx, sy) {
    this.pointer.down   = true;
    this.pointer.startX = sx;
    this.pointer.startY = sy;
    this.pointer.x      = sx;
    this.pointer.y      = sy;
    this.pointer.holdMs = 0;
    this.touchRelease   = false;
  }

  onTouchMove(sx, sy) {
    this.pointer.x = sx;
    this.pointer.y = sy;
  }

  onTouchEnd(sx, sy) {
    if (!this.pointer.down) return;
    this.pointer.down = false;

    const dx = sx - this.pointer.startX;
    const dy = sy - this.pointer.startY;
    const moved = Math.sqrt(dx*dx+dy*dy);

    if (this.rope.attached) {
      // Tap while attached = release rope
      this.rope.attached = false;
      this.rope.justAttached = false;

      // Cloud Step boost
      if (this.playerStats.cloudStep) {
        this.player.vy = Math.min(this.player.vy, -8);
      }
      // Elastic rope slingshot
      if (this.playerStats.elasticRope && this.rope.taut) {
        const nx=(this.player.x - this.rope.anchorX), ny=(this.player.y - this.rope.anchorY);
        const len=Math.sqrt(nx*nx+ny*ny)||1;
        this.player.vx -= (nx/len)*4;
        this.player.vy -= (ny/len)*4;
      }
    } else {
      // Throw rope to tap location (adjusted to world coords)
      const wx = sx + this.camera.x;
      const wy = sy + this.camera.y;
      this._throwRope(wx, wy);
    }
    this.touchRelease = true;
  }

  _throwRope(tx, ty) {
    const anchor = this._findAnchor(tx, ty);
    if (!anchor) {
      // Visual "miss" shake
      this.camShake = Math.max(this.camShake, 2);
      return false;
    }
    this.rope.throwing    = true;
    this.rope.throwT      = 0;
    this.rope.fromX       = this.player.x;
    this.rope.fromY       = this.player.y;
    this.rope.toX         = anchor.x;
    this.rope.toY         = anchor.y;
    this.rope.attached    = false;
    return true;
  }

  _findAnchor(tx, ty) {
    const maxDist = 280 * this.playerStats.hookRange;
    let best=null, bestDist=maxDist;

    for (const pt of this.terrain) {
      if (!pt.hookable) continue;
      // Prefer surfaces above player (but allow some below for wall swings)
      if (pt.y > this.player.y + 60) continue;

      const px = pt.type==='ledge' ? (pt.x + (pt.ledgeEnd||pt.x))/2 : pt.x;
      const dx = px - tx, dy = pt.y - ty;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < bestDist) { bestDist=dist; best={x:px, y:pt.y}; }
    }
    return best;
  }

  applyUpgrade(upgrade) {
    upgrade.effect(this.playerStats);
    this.sessionUpgrades.push({ icon:upgrade.icon, name:upgrade.name, color:upgrade.color });
  }

  // ─── Physics Update ───────────────────────────────────────────────────────
  update(dt) {
    if (!this.running || this.paused) return;
    this.time += dt;
    this.pointer.holdMs += dt;

    const p = this.playerStats;
    const pl = this.player;
    const r  = this.rope;

    // Weather transitions
    this.weatherTimer += dt;
    if (this.weatherTimer > this.nextWeatherChange) {
      const weathers = Object.keys(WEATHER_PRESETS);
      this.currentWeather = weathers[Math.floor(Math.random()*weathers.length)];
      this.weatherTimer = 0;
      this.nextWeatherChange = 15000 + Math.random()*35000;
    }

    // Combo decay
    if (this.comboCount > 0) {
      this.comboTimer += dt;
      if (this.comboTimer > this.comboWindow) {
        this.comboCount = 0;
        this.comboTimer = 0;
      }
    }

    // ── Rope throw animation ──────────────────────────────────────────────
    if (r.throwing) {
      r.throwT += dt * 0.01;
      if (r.throwT >= 1) {
        r.throwing     = false;
        r.attached     = true;
        r.justAttached = true;
        r.anchorX      = r.toX;
        r.anchorY      = r.toY;
        const dx = r.anchorX - pl.x;
        const dy = r.anchorY - pl.y;
        r.length = Math.sqrt(dx*dx+dy*dy);
        r.targetLength = Math.min(r.length, p.maxRopeLength);
      }
    }

    // ── Gravity ────────────────────────────────────────────────────────────
    const gravity = 0.46 * (dt / 16.67);
    pl.vy += gravity;

    // ── Rope physics ───────────────────────────────────────────────────────
    if (r.attached) {
      const dx = pl.x - r.anchorX;
      const dy = pl.y - r.anchorY;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const maxLen = r.targetLength;

      r.taut = dist >= maxLen * 0.92;

      if (dist > maxLen) {
        // Constrain: project player back onto rope circle
        const nx = dx/dist, ny = dy/dist;
        pl.x = r.anchorX + nx*maxLen;
        pl.y = r.anchorY + ny*maxLen;

        // Remove radial velocity component
        const radialVel = pl.vx*nx + pl.vy*ny;
        pl.vx -= radialVel * nx;
        pl.vy -= radialVel * ny;

        // Tiny energy loss on snap (rope stretch)
        pl.vx *= 0.98;
        pl.vy *= 0.98;

        r.justAttached = false;
      }

      // Pendulum centripetal correction (keeps swing smooth)
      const perpX = -dy/Math.max(dist,1), perpY = dx/Math.max(dist,1);
      const perpVel = pl.vx*perpX + pl.vy*perpY;
      // Gentle correction toward perpendicular motion
      pl.vx += (perpX*perpVel - pl.vx) * 0.02;
      pl.vy += (perpY*perpVel - pl.vy) * 0.02;

      // Air control while swinging (hold pointer to steer)
      if (this.pointer.down && this.pointer.x !== undefined) {
        const targetX = this.pointer.x + this.camera.x;
        const pushDir = targetX - pl.x;
        pl.vx += pushDir * 0.0014 * p.airControl * p.swingPower;
      }

      // Auto-release if player swings past anchor upward
      if (pl.y < r.anchorY - 20) {
        r.attached = false;
      }
      // Auto-release if rope is pulling player down (backwards swing)
      if (dy > 120 && pl.vy > 8) {
        r.attached = false;
      }
    } else {
      // Free-fall air control
      if (this.pointer.down && this.pointer.x !== undefined) {
        const tx = this.pointer.x + this.camera.x;
        const push = (tx - pl.x) * 0.0006 * p.airControl;
        pl.vx += push;
      }
    }

    // ── Speed caps ─────────────────────────────────────────────────────────
    const maxV = 28 * p.speedMultiplier;
    const speed = Math.sqrt(pl.vx*pl.vx+pl.vy*pl.vy);
    if (speed > maxV) { pl.vx = pl.vx/speed*maxV; pl.vy = pl.vy/speed*maxV; }
    if (pl.vy > 32) pl.vy = 32;

    // ── Apply velocity ──────────────────────────────────────────────────────
    pl.x += pl.vx;
    pl.y += pl.vy;

    // ── Terrain collision ──────────────────────────────────────────────────
    pl.grounded     = false;
    pl.wallTouching = 0;
    pl.coyoteTime   = Math.max(0, pl.coyoteTime - dt);

    const nearTerrain = this.terrain.filter(pt =>
      Math.abs(pt.y - pl.y) < 80 &&
      pt.x > this.camera.x - 50 &&
      pt.x < this.camera.x + this.W + 50
    );

    for (const pt of nearTerrain) {
      // Ledge collision (top surface)
      if (pt.type === 'ledge') {
        const lx = pt.x, rx = pt.ledgeEnd || pt.x+60;
        if (pl.x > lx-8 && pl.x < rx+8) {
          const dy = pt.y - pl.y;
          if (dy > -8 && dy < 22 && pl.vy >= 0) {
            pl.y       = pt.y;
            pl.vy     *= -(0.12 * p.fallResistance);
            if (Math.abs(pl.vy) < 1) pl.vy=0;
            pl.grounded   = true;
            pl.coyoteTime = 200;
            // Icy ledge — less friction
            pl.vx *= pt.icy ? 0.97 : 0.84;
          }
        }
      }
      // Wall collision
      else if (pt.type==='wallL') {
        if (pl.x < pt.x + pl.radius && Math.abs(pt.y - pl.y) < 30) {
          pl.x          = pt.x + pl.radius;
          pl.vx         = Math.abs(pl.vx)*0.25;
          pl.wallTouching = -1;
        }
        // Ground at base of wall point
        if (Math.abs(pt.y - pl.y) < 20 && Math.abs(pt.x - pl.x) < 35 && pl.vy>=0) {
          pl.y = pt.y; pl.vy *= -(0.1*p.fallResistance);
          pl.grounded=true; pl.coyoteTime=200;
          pl.vx*=0.85;
        }
      }
      else if (pt.type==='wallR') {
        if (pl.x > pt.x - pl.radius && Math.abs(pt.y - pl.y) < 30) {
          pl.x          = pt.x - pl.radius;
          pl.vx         = -Math.abs(pl.vx)*0.25;
          pl.wallTouching = 1;
        }
        if (Math.abs(pt.y - pl.y) < 20 && Math.abs(pt.x - pl.x) < 35 && pl.vy>=0) {
          pl.y = pt.y; pl.vy *= -(0.1*p.fallResistance);
          pl.grounded=true; pl.coyoteTime=200;
          pl.vx*=0.85;
        }
      }
      else if (pt.type==='rock') {
        const dx=Math.abs(pt.x-pl.x), dy=Math.abs(pt.y-pl.y);
        if (dx<18 && dy<18) {
          const nx=(pl.x-pt.x)||1, ny=(pl.y-pt.y)||1;
          const len=Math.sqrt(nx*nx+ny*ny);
          pl.x += (nx/len)*2; pl.y += (ny/len)*2;
          pl.vx *= -0.3; pl.vy *= -0.3;
        }
      }
    }

    // Broad wall bounds
    const wL = this._getWallAt(pl.y, 'L') + pl.radius;
    const wR = this._getWallAt(pl.y, 'R') - pl.radius;
    if (pl.x < wL) { pl.x = wL; pl.vx = Math.abs(pl.vx)*0.2; }
    if (pl.x > wR) { pl.x = wR; pl.vx = -Math.abs(pl.vx)*0.2; }

    // Air drag
    if (!pl.grounded) pl.vx *= 0.988;

    // ── Height tracking ────────────────────────────────────────────────────
    const worldH = this.worldBottom - pl.y;
    if (worldH > this.highestY) {
      this.highestY = worldH;
      if (this.onHeightRecord) this.onHeightRecord(worldH);
    }

    // ── Camera ─────────────────────────────────────────────────────────────
    // Lead camera slightly in direction of movement
    const camLead = pl.vy * -0.8;
    this.camTarget.y = pl.y - this.H*0.52 + camLead;
    this.camTarget.x = 0;
    this.camera.y += (this.camTarget.y - this.camera.y) * (dt*0.006);
    this.camera.x += (this.camTarget.x - this.camera.x) * 0.08;

    // Camera shake
    if (this.camShake > 0) {
      this.camera.x += (Math.random()-0.5)*this.camShake*4;
      this.camera.y += (Math.random()-0.5)*this.camShake*2;
      this.camShake = Math.max(0, this.camShake - dt*0.01);
    }

    // ── Terrain gen ────────────────────────────────────────────────────────
    if (pl.y < this.terrainGenY + this.H*2.5) {
      this.generateTerrain(this.terrainGenY, this.terrainGenY - 2800);
      this.generateCoins();
      this.generateCheckpoints();
    }

    // ── Coins ──────────────────────────────────────────────────────────────
    const magnet = this.playerStats.coinMagnetRadius;
    for (const coin of this.coins) {
      if (coin.collected) continue;
      const dx=coin.x-pl.x, dy=coin.y-pl.y;
      const dist=Math.sqrt(dx*dx+dy*dy);

      if (dist < magnet && magnet > 60) {
        // Magnet pull
        const nx=dx/dist, ny=dy/dist;
        const pullStr = Math.min(6, (magnet-dist)/magnet*8);
        coin.x -= nx*pullStr; coin.y -= ny*pullStr;
      }

      if (dist < coin.radius + pl.radius * (this.playerStats.playerScale||1)) {
        coin.collected = true;
        this.comboCount++;
        this.comboTimer = 0;
        const comboMult = Math.min(8, Math.max(1, Math.floor(this.comboCount/3)) + (this.playerStats.comboStart||1) - 1);
        const worth = coin.value * this.playerStats.coinMultiplier * comboMult;
        this.coinsCollected += worth;
        if (this.onCoinCollect) this.onCoinCollect(coin.x, coin.y, worth, this.comboCount, comboMult);
      }
    }

    // ── Checkpoints ────────────────────────────────────────────────────────
    for (const cp of this.checkpoints) {
      cp.animT += dt;
      if (cp.reached) continue;
      const dx=cp.x-pl.x, dy=cp.y-pl.y;
      if (Math.sqrt(dx*dx+dy*dy) < cp.radius + pl.radius + 15) {
        cp.reached = true;
        this.checkpointsReached++;
        const bonus = 10 + this.playerStats.checkpointBonus;
        this.coinsCollected += bonus;
        this.camShake = 5;
        if (this.onCheckpoint) this.onCheckpoint(cp.x, cp.y, bonus);
      }
    }

    // ── Death check ────────────────────────────────────────────────────────
    if (pl.y > this.worldBottom + 400) {
      this.running = false;
      this.camShake = 8;
      setTimeout(() => { if (this.onGameOver) this.onGameOver(); }, 1200);
    }

    pl.wasSwinging = r.attached;
  }

  // ─── Rope tip for throw animation ─────────────────────────────────────────
  getRopeTip() {
    const r = this.rope;
    if (!r.throwing) return null;
    const t = r.throwT;
    const ease = 1-(1-t)*(1-t);
    return {
      x: r.fromX + (r.toX-r.fromX)*ease,
      y: r.fromY + (r.toY-r.fromY)*ease - Math.sin(t*Math.PI)*40,
    };
  }

  // ─── Aim indicator ────────────────────────────────────────────────────────
  getAimInfo() {
    if (!this.pointer.down) return null;
    const tx = this.pointer.x + this.camera.x;
    const ty = this.pointer.y + this.camera.y;
    const anchor = this._findAnchor(tx, ty);
    return {
      px: this.player.x - this.camera.x,
      py: this.player.y - this.camera.y,
      tx: this.pointer.x,
      ty: this.pointer.y,
      anchor: anchor ? { x:anchor.x-this.camera.x, y:anchor.y-this.camera.y } : null,
    };
  }

  // ─── Visibility queries ───────────────────────────────────────────────────
  getVisible(arr, margin=150) {
    const minY = this.camera.y - margin;
    const maxY = this.camera.y + this.H + margin;
    return arr.filter(o => o.y >= minY && o.y <= maxY);
  }

  // ─── Terrain drawing ──────────────────────────────────────────────────────
  drawTerrain(ctx) {
    const cam = this.camera;
    const W = this.W, H = this.H;
    const pts = this.getVisible(this.terrain, 200);
    if (!pts.length) return;

    ctx.save();

    const wallL = pts.filter(p=>p.type==='wallL').sort((a,b)=>a.y-b.y);
    const wallR = pts.filter(p=>p.type==='wallR').sort((a,b)=>a.y-b.y);
    const ledges= pts.filter(p=>p.type==='ledge');
    const rocks = pts.filter(p=>p.type==='rock');

    const drawWall = (wallPts, side) => {
      if (wallPts.length < 2) return;
      const edgeX = side==='L' ? 0 : W;
      const grad = ctx.createLinearGradient(side==='L'?0:W, 0, side==='L'?W*0.35:W*0.65, 0);
      if (side==='L') {
        grad.addColorStop(0,'#0f1a28'); grad.addColorStop(1,'#1e3348');
      } else {
        grad.addColorStop(0,'#1e3348'); grad.addColorStop(1,'#0f1a28');
      }

      ctx.beginPath();
      ctx.moveTo(edgeX, wallPts[0].y - cam.y - 20);
      for (const pt of wallPts) ctx.lineTo(pt.x - cam.x, pt.y - cam.y);
      ctx.lineTo(edgeX, wallPts[wallPts.length-1].y - cam.y + 20);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Rock texture — horizontal strata lines
      ctx.save();
      ctx.clip();
      ctx.strokeStyle='rgba(80,110,160,0.12)';
      ctx.lineWidth=1;
      for (let sy=wallPts[0].y-cam.y; sy<wallPts[wallPts.length-1].y-cam.y; sy+=22) {
        ctx.beginPath();
        ctx.moveTo(0,sy+Math.sin(sy*0.08)*3);
        ctx.lineTo(W,sy+Math.sin(sy*0.08+1)*3);
        ctx.stroke();
      }
      ctx.restore();

      // Edge glow
      ctx.strokeStyle=`rgba(100,150,220,0.25)`;
      ctx.lineWidth=2.5;
      ctx.shadowColor='rgba(100,160,255,0.3)';
      ctx.shadowBlur=12;
      ctx.beginPath();
      for (let i=0;i<wallPts.length;i++) {
        const pt=wallPts[i];
        if (i===0) ctx.moveTo(pt.x-cam.x, pt.y-cam.y);
        else ctx.lineTo(pt.x-cam.x, pt.y-cam.y);
      }
      ctx.stroke();
      ctx.shadowBlur=0;

      // Snow highlights on wall faces
      ctx.strokeStyle='rgba(200,225,255,0.18)';
      ctx.lineWidth=3;
      ctx.beginPath();
      for (let i=0;i<wallPts.length;i++) {
        const pt=wallPts[i];
        if (i===0) ctx.moveTo(pt.x-cam.x+(side==='L'?1:-1), pt.y-cam.y);
        else ctx.lineTo(pt.x-cam.x+(side==='L'?1:-1), pt.y-cam.y);
      }
      ctx.stroke();
    };

    drawWall(wallL,'L');
    drawWall(wallR,'R');

    // Ledges
    for (const ledge of ledges) {
      const sx=ledge.x-cam.x, ex=(ledge.ledgeEnd||ledge.x+60)-cam.x;
      const sy=ledge.y-cam.y;
      const lw=ex-sx;

      // Shadow below ledge
      ctx.fillStyle='rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.roundRect(sx+2, sy+4, lw, 10, 3); ctx.fill();

      // Ledge body
      const ledgeGrad=ctx.createLinearGradient(sx,sy-6,sx,sy+12);
      ledgeGrad.addColorStop(0,'#2a4060'); ledgeGrad.addColorStop(1,'#1a2d45');
      ctx.fillStyle=ledgeGrad;
      ctx.shadowColor='rgba(60,100,180,0.3)'; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.roundRect(sx,sy-6,lw,14,[4,4,3,3]); ctx.fill();
      ctx.shadowBlur=0;

      // Snow cap
      const snowH = ledge.icy ? 8 : 4;
      const snowGrad=ctx.createLinearGradient(sx,sy-8,sx,sy-8+snowH+4);
      snowGrad.addColorStop(0,'rgba(230,242,255,0.8)');
      snowGrad.addColorStop(1,'rgba(200,225,255,0)');
      ctx.fillStyle=snowGrad;
      ctx.beginPath(); ctx.roundRect(sx,sy-8,lw,snowH+4,[4,4,0,0]); ctx.fill();

      // Icy blue shimmer
      if (ledge.icy) {
        ctx.strokeStyle='rgba(150,220,255,0.5)';
        ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.roundRect(sx,sy-6,lw,14,[4,4,3,3]); ctx.stroke();
      }

      // Edge
      ctx.strokeStyle='rgba(80,130,200,0.35)';
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.roundRect(sx,sy-6,lw,14,[4,4,3,3]); ctx.stroke();
    }

    // Rocks
    for (const rock of rocks) {
      const rx=rock.x-cam.x, ry=rock.y-cam.y;
      ctx.fillStyle='#1e3040';
      ctx.shadowColor='rgba(80,130,200,0.4)';
      ctx.shadowBlur=10;
      ctx.beginPath();
      ctx.moveTo(rx-14,ry+8); ctx.lineTo(rx-8,ry-10);
      ctx.lineTo(rx+2,ry-14); ctx.lineTo(rx+12,ry-6);
      ctx.lineTo(rx+10,ry+8); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur=0;

      // Snow
      ctx.fillStyle='rgba(210,230,255,0.5)';
      ctx.beginPath(); ctx.ellipse(rx,ry-12,8,4,0,0,Math.PI*2); ctx.fill();
    }

    ctx.restore();
  }

  // ─── Aim line ─────────────────────────────────────────────────────────────
  drawAim(ctx) {
    const aim = this.getAimInfo();
    if (!aim) return;
    ctx.save();

    // Dashed trajectory line
    ctx.setLineDash([6,6]);
    ctx.strokeStyle='rgba(160,200,255,0.25)';
    ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(aim.px,aim.py); ctx.lineTo(aim.tx,aim.ty); ctx.stroke();
    ctx.setLineDash([]);

    if (aim.anchor) {
      // Highlight hookable point
      const ag = ctx.createRadialGradient(aim.anchor.x,aim.anchor.y,0, aim.anchor.x,aim.anchor.y,22);
      ag.addColorStop(0,'rgba(100,200,255,0.5)');
      ag.addColorStop(1,'rgba(100,200,255,0)');
      ctx.fillStyle=ag;
      ctx.beginPath(); ctx.arc(aim.anchor.x,aim.anchor.y,22,0,Math.PI*2); ctx.fill();

      // Hook indicator rings
      ctx.strokeStyle='rgba(150,220,255,0.7)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(aim.anchor.x,aim.anchor.y,10,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle='rgba(150,220,255,0.3)';
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(aim.anchor.x,aim.anchor.y,18,0,Math.PI*2); ctx.stroke();

      // Connection preview line
      ctx.strokeStyle='rgba(100,180,255,0.2)';
      ctx.lineWidth=1;
      ctx.setLineDash([4,8]);
      ctx.beginPath(); ctx.moveTo(aim.px,aim.py); ctx.lineTo(aim.anchor.x,aim.anchor.y); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // No hook found — red X
      ctx.strokeStyle='rgba(255,80,80,0.4)';
      ctx.lineWidth=2;
      const r=8, cx=aim.tx, cy=aim.ty;
      ctx.beginPath();
      ctx.moveTo(cx-r,cy-r); ctx.lineTo(cx+r,cy+r);
      ctx.moveTo(cx+r,cy-r); ctx.lineTo(cx-r,cy+r);
      ctx.stroke();
    }
    ctx.restore();
  }
}
