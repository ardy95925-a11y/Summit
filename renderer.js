// renderer.js — Visual systems: rain, snow, parallax, particles, lightning, rope, player

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;

    // Rain system
    this.raindrops   = [];
    this.splashes    = [];
    this.snowflakes  = [];

    // Parallax
    this.bgMountains = [];

    // Particles
    this.particles = [];

    // Lightning
    this.bolts       = [];
    this.flashAlpha  = 0;
    this.boltTimer   = 0;

    // Weather (live interpolated values)
    this.weather = { rainIntensity:1.0, windX:-1.5, fogDensity:0.5, lightningRate:0.0006 };
    this.targetWeather = { ...this.weather };

    // Scroll offsets
    this.fogTime = 0;
    this.starTime = 0;

    // Static star positions
    this.stars = Array.from({length:180}, (_,i) => ({
      x: Math.random(), y: Math.random(),
      size: 0.4 + Math.random()*1.8,
      twinkleSpeed: 0.5 + Math.random()*2,
      twinklePhase: Math.random()*Math.PI*2,
      layer: Math.floor(Math.random()*3), // parallax layer
    }));

    // Background mountain data (generated once per resize)
    this.mountainLayers = [];

    this.init();
  }

  init() {
    this.initRain();
    this.initMountains();
  }

  resize(w, h) {
    this.W = w; this.H = h;
    this.init();
  }

  setWeather(preset) {
    this.targetWeather = { ...preset };
  }

  // ─── Rain ─────────────────────────────────────────────────────────────────
  initRain() {
    this.raindrops  = [];
    this.snowflakes = [];
    const base = Math.floor((this.W * this.H) / 2200);
    for (let i=0; i<base*2; i++) this.raindrops.push(this._newDrop(true));
    for (let i=0; i<80; i++)  this.snowflakes.push(this._newFlake(true));
  }

  _newDrop(random=false) {
    const intense = this.weather.rainIntensity;
    return {
      x: Math.random() * (this.W + 200) - 100,
      y: random ? Math.random() * this.H : -20,
      len:   10 + Math.random()*22,
      speed: (13 + Math.random()*14) * Math.max(0.6, intense),
      op:    0.1 + Math.random()*0.3,
      w:     0.4 + Math.random()*0.9,
      layer: Math.random() < 0.3 ? 'near' : 'far',
    };
  }

  _newFlake(random=false) {
    return {
      x: Math.random() * this.W,
      y: random ? Math.random() * this.H : -10,
      r: 1.5 + Math.random()*3,
      speed: 1.5 + Math.random()*2.5,
      drift: (Math.random()-0.5)*0.5,
      op: 0.3 + Math.random()*0.5,
      wobble: Math.random()*Math.PI*2,
    };
  }

  // ─── Mountains ────────────────────────────────────────────────────────────
  initMountains() {
    this.mountainLayers = [];
    const W = this.W, H = this.H;

    // 4 layers of background mountains, each with more detail
    const layerDefs = [
      { peaks:8,  minH:0.55, maxH:0.80, color:[20,35,65],   opacity:0.9, speed:0.04, snowLine:0.62 },
      { peaks:6,  minH:0.45, maxH:0.72, color:[28,45,75],   opacity:0.85,speed:0.10, snowLine:0.52 },
      { peaks:5,  minH:0.38, maxH:0.65, color:[35,55,90],   opacity:0.8, speed:0.18, snowLine:0.44 },
      { peaks:4,  minH:0.28, maxH:0.55, color:[42,65,105],  opacity:0.7, speed:0.28, snowLine:0.33 },
    ];

    for (const def of layerDefs) {
      // Generate two tile-widths of mountain silhouette
      const pts = this._genMountainPts(def.peaks, def.minH, def.maxH, W);
      this.mountainLayers.push({ ...def, pts });
    }
  }

  _genMountainPts(peaks, minH, maxH, W) {
    // Generate smooth mountain silhouette across 0..1 x-space
    const pts = [];
    // Extra points beyond edges for seamless tiling
    for (let i=-1; i<=peaks+1; i++) {
      const x = i / peaks;
      const h = minH + Math.random()*(maxH-minH);
      pts.push({ x, h });
    }
    // Smooth with cubic interpolation segments
    return pts;
  }

  _drawMountainLayer(ctx, layer, cameraY, W, H) {
    const { pts, color, opacity, speed, snowLine } = layer;
    const scrollY = cameraY * speed;
    const parallaxX = 0; // Could add horizontal parallax

    ctx.save();
    ctx.globalAlpha = opacity;

    // Draw two tiles for seamless scrolling (horizontal)
    for (let tile=0; tile<2; tile++) {
      const offX = tile * W;

      ctx.beginPath();
      ctx.moveTo(offX + parallelX, H+10);

      for (let i=0; i<pts.length-1; i++) {
        const p0 = pts[Math.max(0,i-1)];
        const p1 = pts[i];
        const p2 = pts[i+1];
        const p3 = pts[Math.min(pts.length-1,i+2)];

        const x1 = offX + p1.x * W;
        const y1 = p1.h * H + Math.sin(scrollY*0.003 + i) * 8;
        const x2 = offX + p2.x * W;
        const y2 = p2.h * H + Math.sin(scrollY*0.003 + i+1) * 8;

        // Catmull-Rom to bezier
        const cpx1 = x1 + (x2 - (offX + p0.x*W)) / 6;
        const cpy1 = y1 + (y2 - p0.h*H) / 6;
        const cpx2 = x2 - (offX + p3.x*W - x1) / 6;
        const cpy2 = y2 - (p3.h*H - y1) / 6;

        if (i===0) ctx.lineTo(x1, y1);
        ctx.bezierCurveTo(cpx1,cpy1, cpx2,cpy2, x2,y2);
      }

      ctx.lineTo(offX + W, H+10);
      ctx.closePath();

      // Base rock fill
      const grad = ctx.createLinearGradient(0, H*0.2, 0, H);
      grad.addColorStop(0, `rgba(${color[0]+15},${color[1]+15},${color[2]+20},1)`);
      grad.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},1)`);
      ctx.fillStyle = grad;
      ctx.fill();

      // Snow cap overlay
      ctx.save();
      ctx.clip();
      const snowGrad = ctx.createLinearGradient(0, H*(snowLine-0.08), 0, H*snowLine);
      snowGrad.addColorStop(0, 'rgba(230,240,255,0.55)');
      snowGrad.addColorStop(1, 'rgba(230,240,255,0)');
      ctx.fillStyle = snowGrad;
      ctx.fillRect(0, 0, W*2, H*snowLine);
      ctx.restore();
    }

    ctx.restore();
  }

  // Fix typo
  get parallelX() { return 0; }

  // ─── Update ───────────────────────────────────────────────────────────────
  update(dt, cameraY) {
    const W = this.W, H = this.H;
    this.fogTime  += dt * 0.00018;
    this.starTime += dt * 0.0001;

    // Interpolate weather
    const lerpRate = dt * 0.0008;
    for (const k of Object.keys(this.weather)) {
      const cur = this.weather[k], tgt = this.targetWeather[k];
      if (typeof tgt === 'number') this.weather[k] += (tgt - cur) * lerpRate;
    }

    const wnd = this.weather.windX;
    const intense = this.weather.rainIntensity;

    // Rain
    const dropTarget = Math.floor((W * H / 2200) * intense * 2);
    while (this.raindrops.length < dropTarget) this.raindrops.push(this._newDrop());
    while (this.raindrops.length > dropTarget + 20) this.raindrops.pop();

    for (const d of this.raindrops) {
      d.x += wnd * (d.layer==='near' ? 1.4 : 0.7);
      d.y += d.speed;
      if (d.y > H+30 || d.x < -80 || d.x > W+80) {
        // Splash
        if (d.layer==='near' && d.y > H-20) {
          this.splashes.push({ x:d.x, y:H-2, life:1, r:0 });
        }
        Object.assign(d, this._newDrop());
      }
    }

    // Splashes
    for (let i=this.splashes.length-1;i>=0;i--) {
      const s = this.splashes[i];
      s.life -= dt*0.008; s.r += dt*0.06;
      if (s.life<=0) this.splashes.splice(i,1);
    }

    // Snowflakes (visible in blizzard)
    for (const f of this.snowflakes) {
      f.wobble += dt*0.002;
      f.x += Math.sin(f.wobble)*0.4 + wnd*0.3;
      f.y += f.speed;
      if (f.y > H+10 || f.x < -20 || f.x > W+20) Object.assign(f, this._newFlake());
    }

    // Lightning
    this.boltTimer += dt;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt*0.008);
    if (Math.random() < this.weather.lightningRate * dt) {
      this._spawnLightning();
    }
    for (let i=this.bolts.length-1;i>=0;i--) {
      this.bolts[i].life -= dt*0.003;
      if (this.bolts[i].life<=0) this.bolts.splice(i,1);
    }

    // Particles
    for (let i=this.particles.length-1;i>=0;i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += p.gravity||0;
      p.vx *= p.drag||0.98;
      p.life -= dt*(p.decay||0.06);
      if (p.life<=0) this.particles.splice(i,1);
    }
  }

  _spawnLightning() {
    const W = this.W, H = this.H;
    const startX = W*0.1 + Math.random()*W*0.8;
    const segs = [];
    let cx=startX, cy=0;
    const branches = [];

    for (let i=0;i<18;i++) {
      const nx = cx + (Math.random()-0.5)*W*0.12;
      const ny = cy + H*0.045 + Math.random()*H*0.025;
      segs.push({x1:cx,y1:cy,x2:nx,y2:ny, w:2.5-i*0.1});
      // Branch
      if (Math.random()<0.25 && i<14) {
        let bx=nx,by=ny;
        const bsegs=[];
        for (let j=0;j<5;j++) {
          const bnx=bx+(Math.random()-0.5)*W*0.1;
          const bny=by+H*0.035;
          bsegs.push({x1:bx,y1:by,x2:bnx,y2:bny,w:1});
          bx=bnx;by=bny;
        }
        branches.push(bsegs);
      }
      cx=nx;cy=ny;
    }
    this.bolts.push({ segs, branches, life:1 });
    this.flashAlpha = 0.2 + Math.random()*0.15;
  }

  // ─── Spawn helpers ────────────────────────────────────────────────────────
  spawnParticle(x, y, type='spark') {
    const cfgs = {
      spark:   { vx:(Math.random()-0.5)*5, vy:-2-Math.random()*4, life:50+Math.random()*30, size:2+Math.random()*3, color:`hsl(${40+Math.random()*30},90%,70%)`, gravity:0.18, drag:0.96 },
      coinPop: { vx:(Math.random()-0.5)*9, vy:-4-Math.random()*5, life:35+Math.random()*20, size:3+Math.random()*4, color:`hsl(${44+Math.random()*18},100%,65%)`,  gravity:0.25, drag:0.94 },
      snow:    { vx:(Math.random()-0.5)*2, vy:1+Math.random()*2,  life:80+Math.random()*60, size:1+Math.random()*3, color:'rgba(220,235,255,0.7)',                  gravity:0.02, drag:0.99 },
      dust:    { vx:(Math.random()-0.5)*3, vy:-1-Math.random()*2, life:40+Math.random()*40, size:4+Math.random()*8, color:'rgba(180,200,230,0.12)',                 gravity:0,    drag:0.99 },
      hookSpark:{ vx:(Math.random()-0.5)*6,vy:-1-Math.random()*4, life:20+Math.random()*20, size:1.5+Math.random()*2, color:`hsl(200,80%,80%)`,                    gravity:0.3,  drag:0.93 },
    };
    const cfg = cfgs[type]||cfgs.spark;
    this.particles.push({ x, y, ...cfg, maxLife:cfg.life });
  }

  spawnCoinBurst(x, y) {
    for (let i=0;i<12;i++) this.spawnParticle(x, y, 'coinPop');
    for (let i=0;i<6;i++)  this.spawnParticle(x, y, 'spark');
  }

  spawnHookSparks(x, y) {
    for (let i=0;i<8;i++) this.spawnParticle(x, y, 'hookSpark');
  }

  spawnLandDust(x, y) {
    for (let i=0;i<6;i++) this.spawnParticle(x+(Math.random()-0.5)*20, y, 'dust');
  }

  // ─── Draw: Background ─────────────────────────────────────────────────────
  drawBackground(cameraY) {
    const ctx = this.ctx, W = this.W, H = this.H;

    // Sky gradient — deep moody
    const sky = ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,   '#050912');
    sky.addColorStop(0.35,'#0a1222');
    sky.addColorStop(0.7, '#0f1c35');
    sky.addColorStop(1,   '#182840');
    ctx.fillStyle = sky;
    ctx.fillRect(0,0,W,H);

    // Stars — parallax twinkling
    ctx.save();
    for (const star of this.stars) {
      const parallaxY = cameraY * (0.005 + star.layer*0.003);
      const twinkle = 0.55 + Math.sin(this.starTime * star.twinkleSpeed + star.twinklePhase)*0.45;
      const sy = ((star.y * H*1.5 - parallaxY) % (H*1.5) + H*1.5) % (H*1.5) - H*0.25;
      ctx.globalAlpha = twinkle * (0.4 + star.layer*0.2);
      // Star color slightly warm/cool
      const hue = star.layer===0 ? 210 : star.layer===1 ? 220 : 200;
      ctx.fillStyle = `hsl(${hue},40%,92%)`;
      ctx.beginPath();
      ctx.arc(star.x*W, sy, star.size, 0, Math.PI*2);
      ctx.fill();
      // Tiny cross flare on big stars
      if (star.size > 1.4) {
        ctx.globalAlpha = twinkle * 0.2;
        ctx.strokeStyle = `hsl(${hue},60%,95%)`;
        ctx.lineWidth = 0.6;
        const fl = star.size*3;
        ctx.beginPath();
        ctx.moveTo(star.x*W - fl, sy); ctx.lineTo(star.x*W + fl, sy);
        ctx.moveTo(star.x*W, sy - fl); ctx.lineTo(star.x*W, sy + fl);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Mountain layers (back to front)
    for (const layer of this.mountainLayers) {
      this._drawMountainLayer(ctx, layer, cameraY, W, H);
    }

    // Lightning flash
    if (this.flashAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      const flashGrad = ctx.createRadialGradient(W/2,0,0,W/2,0,W*0.8);
      flashGrad.addColorStop(0,'rgba(160,190,255,1)');
      flashGrad.addColorStop(1,'rgba(80,100,200,0)');
      ctx.fillStyle = flashGrad;
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    // Lightning bolts
    for (const bolt of this.bolts) {
      ctx.save();
      ctx.globalAlpha = bolt.life;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#88aaff';
      for (const seg of bolt.segs) {
        ctx.strokeStyle = `rgba(200,220,255,${bolt.life})`;
        ctx.lineWidth = seg.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
      // Branches (thinner)
      ctx.shadowBlur = 8;
      for (const branch of bolt.branches) {
        for (const seg of branch) {
          ctx.strokeStyle = `rgba(180,200,255,${bolt.life*0.6})`;
          ctx.lineWidth = seg.w;
          ctx.beginPath();
          ctx.moveTo(seg.x1,seg.y1); ctx.lineTo(seg.x2,seg.y2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // ─── Draw: Fog ────────────────────────────────────────────────────────────
  drawFog(cameraY) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const density = this.weather.fogDensity;
    if (density < 0.05) return;

    ctx.save();
    // Multiple scrolling fog bands
    for (let i=0;i<5;i++) {
      const speed   = 0.15 + i*0.08;
      const offset  = (this.fogTime * speed * W + i*W*0.4) % (W*1.5);
      const yBase   = H*(0.25 + i*0.12) + Math.sin(this.fogTime*0.7 + i)*H*0.04;
      const bandH   = H*(0.12 + i*0.04);
      const alpha   = density * (0.06 + i*0.02);

      const fog = ctx.createLinearGradient(0, yBase-bandH*0.3, 0, yBase+bandH);
      fog.addColorStop(0,   `rgba(120,150,210,0)`);
      fog.addColorStop(0.4, `rgba(100,135,200,${alpha})`);
      fog.addColorStop(1,   `rgba(80,115,190,0)`);

      ctx.save();
      ctx.translate(-offset, 0);
      ctx.fillStyle = fog;
      ctx.fillRect(0, yBase-bandH*0.3, W*2.5, bandH*1.3);
      ctx.restore();
    }

    // Bottom mist vignette
    const mist = ctx.createLinearGradient(0, H*0.7, 0, H);
    mist.addColorStop(0, 'rgba(80,110,170,0)');
    mist.addColorStop(1, `rgba(30,50,90,${density*0.35})`);
    ctx.fillStyle = mist;
    ctx.fillRect(0, H*0.7, W, H*0.3);
    ctx.restore();
  }

  // ─── Draw: Rain ───────────────────────────────────────────────────────────
  drawRain() {
    const ctx = this.ctx, W = this.W, H = this.H;
    const wnd = this.weather.windX;
    const intense = this.weather.rainIntensity;
    const isBlizzard = intense > 2.0;

    ctx.save();

    // Far (dim, short)
    ctx.beginPath();
    for (const d of this.raindrops) {
      if (d.layer !== 'far') continue;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + wnd*d.len*0.12, d.y + d.len*0.55);
    }
    ctx.strokeStyle = `rgba(140,175,240,${0.12*intense})`;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Near (bright, long)
    ctx.beginPath();
    for (const d of this.raindrops) {
      if (d.layer !== 'near') continue;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + wnd*d.len*0.18, d.y + d.len);
    }
    ctx.strokeStyle = `rgba(170,205,255,${0.22*Math.min(intense,1.5)})`;
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // Splashes at screen bottom
    for (const s of this.splashes) {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r*1.8, s.r*0.5, 0, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(160,200,255,${s.life*0.4})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Snowflakes in blizzard
    if (isBlizzard) {
      for (const f of this.snowflakes) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(220,235,255,${f.op * (intense-1.5)})`;
        ctx.fill();
      }
    }

    // Rain screen glow (wet lens effect)
    if (intense > 0.7) {
      const rainGlow = ctx.createLinearGradient(0,0,W,H);
      rainGlow.addColorStop(0,   'rgba(30,60,130,0)');
      rainGlow.addColorStop(0.5, `rgba(20,50,110,${intense*0.03})`);
      rainGlow.addColorStop(1,   'rgba(30,60,130,0)');
      ctx.fillStyle = rainGlow;
      ctx.fillRect(0,0,W,H);
    }

    ctx.restore();
  }

  // ─── Draw: Particles ──────────────────────────────────────────────────────
  drawParticles() {
    const ctx = this.ctx;
    ctx.save();
    for (const p of this.particles) {
      const alpha = Math.min(1, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.size * 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * Math.max(0.1, alpha), 0, Math.PI*2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ─── Draw: Rope ───────────────────────────────────────────────────────────
  drawRope(ctx, px, py, ax, ay, ropeLen, taut=false) {
    const dx = ax-px, dy = ay-py;
    const dist = Math.sqrt(dx*dx+dy*dy);
    const sag = taut ? Math.max(0,(ropeLen-dist)*0.18) : Math.max(0,(ropeLen-dist)*0.35);

    const segs = 24;

    // Rope shadow
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(px+2, py+2);
    for (let i=1;i<=segs;i++) {
      const t = i/segs;
      ctx.lineTo(px+dx*t+2, py+dy*t + Math.sin(t*Math.PI)*sag + 2);
    }
    ctx.stroke();
    ctx.restore();

    // Rope strand 1 (twisted look)
    ctx.save();
    ctx.strokeStyle = '#c8a468';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(200,164,104,0.5)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let i=1;i<=segs;i++) {
      const t = i/segs;
      const sagY = Math.sin(t*Math.PI)*sag;
      const twist = Math.sin(t*Math.PI*6)*1.2;
      ctx.lineTo(px+dx*t+twist, py+dy*t+sagY);
    }
    ctx.stroke();

    // Rope strand 2
    ctx.strokeStyle = '#a07840';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let i=1;i<=segs;i++) {
      const t = i/segs;
      const sagY = Math.sin(t*Math.PI)*sag;
      const twist = Math.sin(t*Math.PI*6 + Math.PI)*1.2;
      ctx.lineTo(px+dx*t+twist, py+dy*t+sagY);
    }
    ctx.stroke();
    ctx.restore();

    // Hook glow at anchor
    ctx.save();
    const hookGlow = ctx.createRadialGradient(ax,ay,0,ax,ay,14);
    hookGlow.addColorStop(0,'rgba(150,200,255,0.5)');
    hookGlow.addColorStop(1,'rgba(150,200,255,0)');
    ctx.fillStyle = hookGlow;
    ctx.beginPath(); ctx.arc(ax,ay,14,0,Math.PI*2); ctx.fill();

    ctx.strokeStyle = '#99bbdd';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#aaccff';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(ax,ay,4,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // ─── Draw: Coin ───────────────────────────────────────────────────────────
  drawCoin(ctx, x, y, radius, time) {
    const bob = Math.sin(time*0.0025)*4;
    const squeeze = Math.abs(Math.cos(time*0.0018));
    ctx.save();
    ctx.translate(x, y+bob);
    ctx.scale(squeeze, 1);

    // Outer glow
    const glow = ctx.createRadialGradient(0,0,0,0,0,radius*2.5);
    glow.addColorStop(0,'rgba(255,210,50,0.35)');
    glow.addColorStop(1,'rgba(255,160,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0,0,radius*2.5,0,Math.PI*2); ctx.fill();

    // Coin body
    const coinGrad = ctx.createRadialGradient(-radius*0.3,-radius*0.3,0,0,0,radius);
    coinGrad.addColorStop(0,'#fff0a0');
    coinGrad.addColorStop(0.4,'#ffd700');
    coinGrad.addColorStop(0.8,'#e6a000');
    coinGrad.addColorStop(1,'#b87800');
    ctx.fillStyle = coinGrad;
    ctx.shadowColor = '#ffa000';
    ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI*2); ctx.fill();

    // Edge ring
    ctx.strokeStyle = '#c88000';
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI*2); ctx.stroke();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-radius*0.28,-radius*0.28, radius*0.35,radius*0.22, -0.6, 0, Math.PI*2);
    ctx.fill();

    // ⬟ symbol
    ctx.fillStyle = 'rgba(120,70,0,0.5)';
    ctx.font = `bold ${Math.floor(radius*1.1)}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('◆',0,1);

    ctx.restore();
  }

  // ─── Draw: Player ─────────────────────────────────────────────────────────
  drawPlayer(ctx, x, y, vel, isSwinging, ropeAngle, grounded, stats) {
    const scale = stats?.playerScale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const lean = Math.atan2(vel.x, 15) * 0.35;
    ctx.rotate(lean);

    // Trail when moving fast
    const speed = Math.sqrt(vel.x*vel.x+vel.y*vel.y);
    if (speed > 10) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#e8734a';
      const trailDir = Math.atan2(vel.y, vel.x);
      for (let i=1;i<=3;i++) {
        ctx.beginPath();
        ctx.arc(-Math.cos(trailDir)*i*6, -Math.sin(trailDir)*i*6, 12-i*2, 0,Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(2,16,10,3.5,0,0,Math.PI*2);
    ctx.fill();

    // Boots
    ctx.fillStyle = '#4a3520';
    ctx.beginPath(); ctx.roundRect(-8,10,7,10,[3,3,4,4]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(1,10,7,10,[3,3,4,4]);  ctx.fill();

    // Pants
    ctx.fillStyle = '#2d4a6a';
    ctx.beginPath(); ctx.roundRect(-9,-2,18,14,[2,2,0,0]); ctx.fill();

    // Parka body
    const bodyGrad = ctx.createRadialGradient(-4,-4,0,0,0,18);
    bodyGrad.addColorStop(0,'#f08050');
    bodyGrad.addColorStop(0.7,'#d06030');
    bodyGrad.addColorStop(1,'#b04820');
    ctx.fillStyle = bodyGrad;
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.roundRect(-10,-10,20,14,[5,5,2,2]); ctx.fill();
    ctx.shadowBlur = 0;

    // Fur trim collar
    ctx.fillStyle = '#f8e8d0';
    ctx.beginPath(); ctx.roundRect(-11,-12,22,5,[4,4,0,0]); ctx.fill();
    // Fur texture dots
    ctx.fillStyle = '#e8d4b8';
    for(let fi=0;fi<6;fi++) { ctx.beginPath(); ctx.arc(-8+fi*3.2,-10,1.2,0,Math.PI*2); ctx.fill(); }

    // Backpack
    const bpGrad = ctx.createLinearGradient(7,-6,15,8);
    bpGrad.addColorStop(0,'#5a8a6a'); bpGrad.addColorStop(1,'#3a6050');
    ctx.fillStyle = bpGrad;
    ctx.beginPath(); ctx.roundRect(7,-6,8,16,[3,3,3,3]); ctx.fill();
    ctx.fillStyle = '#2a5040';
    ctx.beginPath(); ctx.roundRect(8,0,6,3,[1]); ctx.fill();

    // Scarf — wavy
    ctx.fillStyle = '#6677cc';
    ctx.beginPath(); ctx.roundRect(-11,-13,22,5,[2]); ctx.fill();
    // Scarf end
    ctx.fillStyle = '#5566bb';
    ctx.beginPath(); ctx.roundRect(-3,-13,5,12,[1,1,3,3]); ctx.fill();

    // Head
    const headGrad = ctx.createRadialGradient(-2,-18,0,0,-16,9);
    headGrad.addColorStop(0,'#fad0a0');
    headGrad.addColorStop(1,'#e8a870');
    ctx.fillStyle = headGrad;
    ctx.shadowColor='rgba(0,0,0,0.2)'; ctx.shadowBlur=4;
    ctx.beginPath(); ctx.arc(0,-16,8,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // Eyes
    const eyeOff = isSwinging ? 1 : 0; // widen eyes while swinging
    ctx.fillStyle = '#1a1008';
    ctx.beginPath(); ctx.arc(-3,-17+eyeOff,1.8,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 3,-17+eyeOff,1.8,0,Math.PI*2); ctx.fill();
    // Eyeshine
    ctx.fillStyle='rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(-2.2,-17.5+eyeOff,0.7,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 3.8,-17.5+eyeOff,0.7,0,Math.PI*2); ctx.fill();

    // Rosy cheeks
    ctx.fillStyle='rgba(220,130,100,0.3)';
    ctx.beginPath(); ctx.ellipse(-5,-15,2.5,1.5,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 5,-15,2.5,1.5,0,0,Math.PI*2); ctx.fill();

    // Hat
    ctx.fillStyle='#c04020';
    ctx.beginPath(); ctx.ellipse(0,-22.5,10,4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-6.5,-36,13,15,[7,7,1,1]); ctx.fill();
    // Hat band
    ctx.fillStyle='#992010';
    ctx.beginPath(); ctx.roundRect(-7,-24,14,4,[1]); ctx.fill();
    // Pompom
    ctx.fillStyle='#f0e0c0';
    ctx.shadowColor='rgba(255,230,200,0.5)'; ctx.shadowBlur=6;
    ctx.beginPath(); ctx.arc(0,-36,4,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // Arm reaching toward anchor when swinging
    if (isSwinging) {
      const armDir = ropeAngle - Math.PI*0.5;
      ctx.strokeStyle='#d06030';
      ctx.lineWidth=6; ctx.lineCap='round';
      ctx.shadowColor='rgba(0,0,0,0.2)'; ctx.shadowBlur=4;
      ctx.beginPath();
      ctx.moveTo(-2,-4);
      ctx.lineTo(-2+Math.cos(armDir)*20, -4+Math.sin(armDir)*20);
      ctx.stroke();
      // Glove
      ctx.fillStyle='#f8e0c8';
      ctx.beginPath();
      ctx.arc(-2+Math.cos(armDir)*20, -4+Math.sin(armDir)*20, 4,0,Math.PI*2);
      ctx.fill();
      ctx.shadowBlur=0;
    } else {
      // Arms at sides / resting
      ctx.fillStyle='#d06030';
      ctx.beginPath(); ctx.roundRect(-15,-8,6,10,[3]); ctx.fill(); // left
      ctx.beginPath(); ctx.roundRect( 9,-8,6,10,[3]);  ctx.fill(); // right
      // Gloves
      ctx.fillStyle='#f0d8c0';
      ctx.beginPath(); ctx.arc(-12,3,3.5,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( 12,3,3.5,0,Math.PI*2); ctx.fill();
    }

    // Rain drips from hat when intense
    ctx.restore();
  }

  // ─── Draw: Checkpoint ─────────────────────────────────────────────────────
  drawCheckpoint(ctx, x, y, reached, t) {
    ctx.save();
    ctx.translate(x, y);
    const pulse = reached ? 1 : 0.88 + Math.sin(t*0.0025)*0.12;

    if (!reached) {
      // Aura glow ring
      ctx.globalAlpha = 0.5 + Math.sin(t*0.003)*0.3;
      const aura = ctx.createRadialGradient(0,0,15,0,0,50);
      aura.addColorStop(0,'rgba(100,220,180,0.25)');
      aura.addColorStop(1,'rgba(100,220,180,0)');
      ctx.fillStyle=aura;
      ctx.beginPath(); ctx.arc(0,0,50,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }

    // Pole
    ctx.save(); ctx.scale(pulse,pulse);
    ctx.strokeStyle = reached ? '#667788' : '#99bbcc';
    ctx.lineWidth=3; ctx.lineCap='round';
    ctx.shadowColor = reached ? 'none' : 'rgba(100,200,180,0.4)';
    ctx.shadowBlur=8;
    ctx.beginPath(); ctx.moveTo(0,32); ctx.lineTo(0,-25); ctx.stroke();

    // Flag body
    const flagColor = reached
      ? ctx.createLinearGradient(0,-25,25,-10)
      : ctx.createLinearGradient(0,-25,25,-10);

    if (reached) {
      flagColor.addColorStop(0,'#44dd88'); flagColor.addColorStop(1,'#22bb66');
    } else {
      flagColor.addColorStop(0,'#ffbb44'); flagColor.addColorStop(1,'#ff8822');
    }
    ctx.fillStyle=flagColor;
    ctx.shadowColor='rgba(0,0,0,0.3)'; ctx.shadowBlur=4;
    ctx.beginPath();
    ctx.moveTo(0,-25); ctx.lineTo(26,-15); ctx.lineTo(0,-5); ctx.closePath();
    ctx.fill();

    // Flag details
    if (!reached) {
      // Waving effect
      ctx.fillStyle='rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.moveTo(5,-23); ctx.lineTo(22,-14); ctx.lineTo(5,-8); ctx.closePath();
      ctx.fill();
    } else {
      // Checkmark
      ctx.strokeStyle='white';
      ctx.lineWidth=2; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(7,-18); ctx.lineTo(13,-12); ctx.lineTo(22,-22); ctx.stroke();
    }

    // Base stone
    ctx.fillStyle='#334455';
    ctx.beginPath(); ctx.roundRect(-8,28,16,8,[3]); ctx.fill();
    ctx.restore();

    // Reached sparkles
    if (reached) {
      for(let i=0;i<5;i++){
        const angle = t*0.002 + i*Math.PI*0.4;
        const r = 35 + Math.sin(t*0.003+i)*8;
        ctx.fillStyle=`rgba(100,255,180,${0.3+Math.sin(t*0.004+i)*0.2})`;
        ctx.beginPath();
        ctx.arc(Math.cos(angle)*r, Math.sin(angle)*r, 2,0,Math.PI*2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

// Fix the typo in _drawMountainLayer
const _origDraw = Renderer.prototype._drawMountainLayer;
Renderer.prototype._drawMountainLayer = function(ctx, layer, cameraY, W, H) {
  const { pts, color, opacity, speed, snowLine } = layer;
  const scrollAmt = cameraY * speed;

  ctx.save();
  ctx.globalAlpha = opacity;

  for (let tile=0;tile<3;tile++) {
    const offX = tile * W - (scrollAmt * 0.05 % W);

    ctx.beginPath();
    ctx.moveTo(offX, H+10);

    if (pts.length >= 2) {
      ctx.lineTo(offX + pts[0].x*W, H*pts[0].h + Math.sin(scrollAmt*0.002)*5);
      for (let i=0;i<pts.length-1;i++) {
        const p1=pts[i], p2=pts[i+1];
        const x1=offX+p1.x*W, y1=H*p1.h + Math.sin(scrollAmt*0.002+i)*5;
        const x2=offX+p2.x*W, y2=H*p2.h + Math.sin(scrollAmt*0.002+i+1)*5;
        const cpx=(x1+x2)/2;
        ctx.quadraticCurveTo(x1+(Math.random()-0.5)*5, (y1+y2)/2, x2, y2);
      }
    }

    ctx.lineTo(offX+W, H+10);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0,H*0.15,0,H);
    grad.addColorStop(0,`rgb(${color[0]+20},${color[1]+20},${color[2]+28})`);
    grad.addColorStop(0.6,`rgb(${color[0]+8},${color[1]+8},${color[2]+10})`);
    grad.addColorStop(1,`rgb(${color[0]},${color[1]},${color[2]})`);
    ctx.fillStyle=grad;
    ctx.fill();

    // Snow overlay
    ctx.save();
    ctx.clip();
    const snowY = H*snowLine;
    const snowGrad=ctx.createLinearGradient(0,snowY-H*0.12,0,snowY+H*0.03);
    snowGrad.addColorStop(0,'rgba(225,238,255,0.6)');
    snowGrad.addColorStop(0.7,'rgba(210,228,255,0.2)');
    snowGrad.addColorStop(1,'rgba(200,220,255,0)');
    ctx.fillStyle=snowGrad;
    ctx.fillRect(0,0,W*3,snowY+H*0.03);
    ctx.restore();
  }

  ctx.restore();
};
