// ui.js — HUD, cards, title screen, floating text, combo meter

class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;

    this.titleT     = 0;
    this.showTitle  = true;
    this.cardState  = null; // { cards, onChoose, animIn, chosen }
    this.hoverCard  = -1;

    this.floats     = []; // floating text particles
    this.screenFlash = { alpha:0, color:'#fff' };

    // Animated HUD values
    this.displayCoins  = 0;
    this.displayHeight = 0;
    this.comboDisplay  = 0;

    // Altitude milestone
    this.milestoneText = null;
    this.milestoneT    = 0;

    // Transition
    this.transAlpha = 0;
    this.transDir   = 0; // 1=fade in, -1=fade out

    // Weather label
    this.weatherLabel = { text:'', alpha:0 };
  }

  resize(w, h) { this.W=w; this.H=h; }

  // ─── Floating texts ───────────────────────────────────────────────────────
  addFloat(x, y, text, color='#FFD700', size=22, duration=1.2) {
    this.floats.push({ x, y, text, color, size, life:1.0, speed:duration, vy:-1.2+(Math.random()-0.5)*0.4 });
  }

  showScreenFlash(color='rgba(100,220,180,0.3)') {
    this.screenFlash = { alpha:1, color };
  }

  showMilestone(text) {
    this.milestoneText = text;
    this.milestoneT    = 1.0;
  }

  showWeather(name) {
    this.weatherLabel = { text: `⛅ ${name}`, alpha:1.0 };
  }

  startFade(inOrOut) { this.transDir = inOrOut; }

  // ─── Cards ────────────────────────────────────────────────────────────────
  showCards(cards, onChoose) {
    this.cardState = { cards, onChoose, animIn:0, chosen:-1 };
  }

  _cardLayout(count) {
    const W=this.W, H=this.H;
    const cardW = Math.min(185, W*0.27);
    const cardH = cardW * 1.58;
    const gap   = Math.min(24, W*0.025);
    const total = count*cardW + (count-1)*gap;
    const sx    = (W-total)/2;
    const sy    = (H-cardH)/2;
    return Array.from({length:count}, (_,i) => ({
      x:sx + i*(cardW+gap), y:sy, w:cardW, h:cardH
    }));
  }

  handleClick(mx, my) {
    if (!this.cardState || this.cardState.chosen !== -1) return false;
    const layout = this._cardLayout(this.cardState.cards.length);
    for (let i=0;i<layout.length;i++) {
      const {x,y,w,h} = layout[i];
      if (mx>=x&&mx<=x+w&&my>=y&&my<=y+h) {
        this.cardState.chosen = i;
        setTimeout(() => {
          this.cardState.onChoose(i);
          this.cardState = null;
        }, 700);
        return true;
      }
    }
    return false;
  }

  handleMove(mx, my) {
    if (!this.cardState) return;
    const layout = this._cardLayout(this.cardState.cards.length);
    this.hoverCard = -1;
    for (let i=0;i<layout.length;i++) {
      const {x,y,w,h}=layout[i];
      if (mx>=x&&mx<=x+w&&my>=y&&my<=y+h) this.hoverCard=i;
    }
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  update(dt, gs) {
    this.titleT += dt;

    // HUD interpolation
    if (gs) {
      this.displayCoins  += (gs.coins  - this.displayCoins)  * Math.min(1, dt*0.008);
      this.displayHeight += (gs.height - this.displayHeight) * Math.min(1, dt*0.005);
      this.comboDisplay  += (gs.combo  - this.comboDisplay)  * Math.min(1, dt*0.015);
    }

    // Floating texts
    for (let i=this.floats.length-1;i>=0;i--) {
      const f=this.floats[i];
      f.y += f.vy;
      f.life -= dt * (0.0006 / f.speed);
      if (f.life<=0) this.floats.splice(i,1);
    }

    // Screen flash
    this.screenFlash.alpha = Math.max(0, this.screenFlash.alpha - dt*0.005);

    // Milestone
    this.milestoneT = Math.max(0, this.milestoneT - dt*0.0008);

    // Card anim
    if (this.cardState && this.cardState.animIn < 1) {
      this.cardState.animIn = Math.min(1, this.cardState.animIn + dt*0.0035);
    }

    // Transition
    if (this.transDir !== 0) {
      this.transAlpha = Math.max(0, Math.min(1, this.transAlpha + this.transDir * dt*0.004));
      if (this.transAlpha >= 1 && this.transDir === 1) this.transDir=0;
      if (this.transAlpha <= 0 && this.transDir === -1) this.transDir=0;
    }

    // Weather label fade
    this.weatherLabel.alpha = Math.max(0, this.weatherLabel.alpha - dt*0.0005);
  }

  // ─── Draw: Screen Flash ────────────────────────────────────────────────────
  drawFlash() {
    if (this.screenFlash.alpha < 0.01) return;
    const ctx=this.ctx;
    ctx.save();
    ctx.globalAlpha = this.screenFlash.alpha;
    ctx.fillStyle   = this.screenFlash.color;
    ctx.fillRect(0,0,this.W,this.H);
    ctx.restore();
  }

  // ─── Draw: HUD ────────────────────────────────────────────────────────────
  drawHUD(gs) {
    const ctx=this.ctx, W=this.W, H=this.H;

    // Top gradient bar
    const bar=ctx.createLinearGradient(0,0,0,80);
    bar.addColorStop(0,'rgba(3,8,20,0.85)');
    bar.addColorStop(1,'rgba(3,8,20,0)');
    ctx.fillStyle=bar; ctx.fillRect(0,0,W,80);

    ctx.save();
    ctx.textBaseline='middle';

    // ── Altitude ────────────────────────────────────────────────────────────
    const altM = Math.floor(this.displayHeight/10);
    ctx.font='bold 11px monospace';
    ctx.fillStyle='rgba(140,170,230,0.65)';
    ctx.fillText('ALTITUDE', 18, 18);

    ctx.font='bold 30px "Crimson Text",serif';
    ctx.fillStyle='#d0e0ff';
    ctx.shadowColor='#5577ff'; ctx.shadowBlur=16;
    ctx.fillText(`${altM}m`, 18, 46);
    ctx.shadowBlur=0;

    // Height bar
    const bestH = gs.bestHeight || 0;
    if (bestH > 0) {
      const pct = Math.min(1, gs.height / bestH);
      ctx.fillStyle='rgba(60,100,200,0.25)';
      ctx.beginPath(); ctx.roundRect(18,62,80,5,[2]); ctx.fill();
      ctx.fillStyle='rgba(100,160,255,0.6)';
      ctx.beginPath(); ctx.roundRect(18,62,80*pct,5,[2]); ctx.fill();
      ctx.font='9px monospace';
      ctx.fillStyle='rgba(120,150,220,0.5)';
      ctx.fillText(`BEST ${Math.floor(bestH/10)}m`,18,72);
    }

    // ── Coins ───────────────────────────────────────────────────────────────
    ctx.textAlign='right';
    ctx.font='bold 11px monospace';
    ctx.fillStyle='rgba(200,170,60,0.65)';
    ctx.fillText('COINS', W-18, 18);

    ctx.font='bold 30px "Crimson Text",serif';
    ctx.fillStyle='#ffe066';
    ctx.shadowColor='#cc8800'; ctx.shadowBlur=14;
    ctx.fillText(`◆ ${Math.floor(this.displayCoins)}`, W-18, 46);
    ctx.shadowBlur=0;

    // ── Combo meter ─────────────────────────────────────────────────────────
    if (gs.combo > 1) {
      const cx = W/2;
      ctx.textAlign='center';
      const comboAlpha = Math.min(1, gs.combo/3);
      const comboColor = gs.combo >= 6 ? '#ff9933' : gs.combo >= 3 ? '#ffcc33' : '#ffee88';
      ctx.font=`bold ${20+Math.min(gs.combo,8)*1.5}px "Crimson Text",serif`;
      ctx.fillStyle=comboColor;
      ctx.shadowColor=comboColor; ctx.shadowBlur=20;
      ctx.globalAlpha=comboAlpha;
      ctx.fillText(`${gs.combo}× COMBO!`, cx, 30);
      ctx.globalAlpha=1; ctx.shadowBlur=0;

      // Combo bar
      const barW=120, barX=cx-barW/2;
      ctx.fillStyle='rgba(80,60,20,0.4)';
      ctx.beginPath(); ctx.roundRect(barX,44,barW,5,[2]); ctx.fill();
      const comboFill = (gs.comboTimer / gs.comboWindow);
      ctx.fillStyle=comboColor;
      ctx.beginPath(); ctx.roundRect(barX,44,barW*(1-comboFill),5,[2]); ctx.fill();
    }

    // ── Upgrades tray ───────────────────────────────────────────────────────
    if (gs.upgrades && gs.upgrades.length > 0) {
      const ux=W-18, uy=H-20;
      ctx.textAlign='right';
      ctx.font='16px serif';
      ctx.fillStyle='rgba(150,180,230,0.5)';
      ctx.fillText(gs.upgrades.map(u=>u.icon).join(' '), ux, uy);
    }

    // ── Checkpoint count ────────────────────────────────────────────────────
    if (gs.checkpoints > 0) {
      ctx.textAlign='left';
      ctx.font='12px "Crimson Text",serif';
      ctx.fillStyle='rgba(80,220,150,0.65)';
      ctx.fillText(`✦ ${gs.checkpoints} checkpoint${gs.checkpoints!==1?'s':''}`, 18, H-18);
    }

    // ── Weather label ────────────────────────────────────────────────────────
    if (this.weatherLabel.alpha > 0.05) {
      ctx.textAlign='center';
      ctx.globalAlpha = this.weatherLabel.alpha * 0.8;
      ctx.font='italic 13px "Crimson Text",serif';
      ctx.fillStyle='rgba(180,210,255,1)';
      ctx.fillText(this.weatherLabel.text, W/2, H-18);
      ctx.globalAlpha=1;
    }

    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    ctx.restore();

    // ── Floating texts ───────────────────────────────────────────────────────
    ctx.save();
    for (const f of this.floats) {
      const alpha = Math.min(1, f.life * 1.5);
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${f.size}px "Crimson Text",serif`;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color; ctx.shadowBlur = 10;
      ctx.textAlign='center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur=0; ctx.textAlign='left'; ctx.globalAlpha=1;
    ctx.restore();

    // ── Milestone text ───────────────────────────────────────────────────────
    if (this.milestoneT > 0 && this.milestoneText) {
      ctx.save();
      const mt = this.milestoneT;
      const scale = 1 + (1-mt)*0.3;
      ctx.globalAlpha = Math.min(1, mt*3) * Math.min(1, (1-mt)*4);
      ctx.translate(W/2, H*0.38);
      ctx.scale(scale,scale);
      ctx.textAlign='center';
      ctx.font='bold 26px "Crimson Text",serif';
      ctx.fillStyle='#aaddff';
      ctx.shadowColor='#5599ff'; ctx.shadowBlur=30;
      ctx.fillText(this.milestoneText,0,0);
      ctx.restore();
    }
  }

  // ─── Draw: Cards ──────────────────────────────────────────────────────────
  drawCards() {
    if (!this.cardState) return;
    const ctx=this.ctx, W=this.W, H=this.H;
    const { cards, animIn, chosen } = this.cardState;

    // Dark overlay
    ctx.save();
    ctx.fillStyle=`rgba(2,6,18,${animIn*0.82})`;
    ctx.fillRect(0,0,W,H);

    // Decorative top/bottom lines
    ctx.globalAlpha=animIn*0.4;
    ctx.strokeStyle='rgba(80,120,200,0.5)';
    ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,H/2-210); ctx.lineTo(W,H/2-210); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,H/2+210); ctx.lineTo(W,H/2+210); ctx.stroke();
    ctx.globalAlpha=1;

    // Header
    ctx.globalAlpha=animIn;
    ctx.textAlign='center';

    ctx.font='bold 12px monospace';
    ctx.fillStyle='rgba(120,160,220,0.7)';
    ctx.letterSpacing='3px';
    ctx.fillText('— CHECKPOINT REACHED —', W/2, H/2-178);
    ctx.letterSpacing='0px';

    ctx.font='bold 36px "Crimson Text",serif';
    ctx.fillStyle='#c8daff';
    ctx.shadowColor='#4466bb'; ctx.shadowBlur=28;
    ctx.fillText('Choose Your Upgrade', W/2, H/2-145);
    ctx.shadowBlur=0;

    const layout = this._cardLayout(cards.length);

    for (let i=0;i<cards.length;i++) {
      const card = cards[i];
      const { x,y,w,h } = layout[i];
      const isHover  = this.hoverCard===i && chosen===-1;
      const isChosen = chosen===i;
      const isOther  = chosen!==-1 && !isChosen;

      // Stagger in
      const cardDelay = i * 0.12;
      const cardT = Math.max(0, (animIn - cardDelay) / (1-cardDelay));
      const slideY = (1-cardT)*(1-cardT)*70;
      const cardAlpha = cardT;

      ctx.save();
      ctx.globalAlpha = cardAlpha * (isOther ? 0.35 : 1);
      ctx.translate(0, slideY);

      // Card shadow
      ctx.shadowColor='rgba(0,0,0,0.6)';
      ctx.shadowBlur=30; ctx.shadowOffsetY=8;

      // Card background
      const lift = isHover ? -8 : isChosen ? -4 : 0;
      const cg=ctx.createLinearGradient(x,y+lift,x,y+h+lift);
      if (isChosen) {
        cg.addColorStop(0,'#192d50'); cg.addColorStop(1,'#0d1828');
      } else if (isHover) {
        cg.addColorStop(0,'#1a2d4a'); cg.addColorStop(1,'#0f1d32');
      } else {
        cg.addColorStop(0,'#111e30'); cg.addColorStop(1,'#080f1c');
      }
      ctx.fillStyle=cg;
      ctx.shadowBlur=0; ctx.shadowOffsetY=0;
      ctx.beginPath(); ctx.roundRect(x,y+lift,w,h,[14]); ctx.fill();

      // Rarity border glow
      const rarityColors = { common:'rgba(100,160,100,', rare:'rgba(100,100,220,', legendary:'rgba(220,160,50,' };
      const rc = rarityColors[card.rarity]||'rgba(100,140,180,';
      ctx.strokeStyle = isHover||isChosen ? `${rc}0.9)` : `${rc}0.4)`;
      ctx.lineWidth = isHover||isChosen ? 2.5 : 1.5;
      if (isHover||isChosen) { ctx.shadowColor=card.color; ctx.shadowBlur=25; }
      ctx.beginPath(); ctx.roundRect(x,y+lift,w,h,[14]); ctx.stroke();
      ctx.shadowBlur=0;

      // Top accent bar
      ctx.fillStyle=card.color+'44';
      ctx.beginPath(); ctx.roundRect(x,y+lift,w,4,[14,14,0,0]); ctx.fill();

      // Rarity badge
      const rarityLabel = { common:'COMMON', rare:'RARE', legendary:'✦ LEGENDARY' };
      ctx.font=`bold 9px monospace`;
      ctx.fillStyle=`${rc}0.8)`;
      ctx.textAlign='center';
      ctx.fillText(rarityLabel[card.rarity]||'', x+w/2, y+lift+18);

      // Icon
      const iconSize = w*0.32;
      ctx.font=`${iconSize}px serif`;
      ctx.shadowColor=card.color; ctx.shadowBlur=isHover?30:15;
      ctx.fillText(card.icon, x+w/2, y+lift+h*0.3);
      ctx.shadowBlur=0;

      // Name
      ctx.font=`bold ${Math.floor(w*0.1)}px "Crimson Text",serif`;
      ctx.fillStyle='#ddeeff';
      ctx.fillText(card.name, x+w/2, y+lift+h*0.5);

      // Divider
      ctx.strokeStyle=`${rc}0.3)`;
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(x+20,y+lift+h*0.55); ctx.lineTo(x+w-20,y+lift+h*0.55);
      ctx.stroke();

      // Description
      ctx.font=`${Math.max(11,Math.floor(w*0.073))}px "Crimson Text",serif`;
      ctx.fillStyle='rgba(150,175,220,0.85)';
      this._wrapText(ctx, card.desc, x+w/2, y+lift+h*0.65, w-28, Math.max(13,w*0.082));

      // CTA
      if (isChosen) {
        ctx.font=`bold ${w*0.1}px "Crimson Text",serif`;
        ctx.fillStyle=card.color;
        ctx.shadowColor=card.color; ctx.shadowBlur=15;
        ctx.fillText('✓ CHOSEN', x+w/2, y+lift+h*0.92);
        ctx.shadowBlur=0;
      } else {
        ctx.font=`${w*0.078}px "Crimson Text",serif`;
        ctx.fillStyle = isHover ? card.color : 'rgba(80,110,160,0.6)';
        ctx.fillText(isHover ? '▶ SELECT' : '· · ·', x+w/2, y+lift+h*0.92);
      }

      ctx.restore();
    }

    ctx.textAlign='left';
    ctx.restore();
  }

  _wrapText(ctx, text, cx, y, maxW, lineH) {
    const words=text.split(' ');
    let line='', lineY=y;
    for (const w of words) {
      const test=line+w+' ';
      if (ctx.measureText(test).width>maxW&&line!=='') {
        ctx.fillText(line.trim(),cx,lineY);
        line=w+' '; lineY+=lineH;
      } else line=test;
    }
    ctx.fillText(line.trim(),cx,lineY);
  }

  // ─── Draw: Title Screen ───────────────────────────────────────────────────
  drawTitle(saveData, onStart, onReset) {
    const ctx=this.ctx, W=this.W, H=this.H;
    const t=this.titleT;

    ctx.save();

    // Vignette
    const vig=ctx.createRadialGradient(W/2,H/2,H*0.15,W/2,H/2,H*0.85);
    vig.addColorStop(0,'rgba(0,0,0,0)');
    vig.addColorStop(1,'rgba(0,0,20,0.6)');
    ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);

    // Center glow aura
    const aura=ctx.createRadialGradient(W/2,H*0.38,0,W/2,H*0.38,W*0.55);
    aura.addColorStop(0,'rgba(40,70,160,0.18)');
    aura.addColorStop(1,'rgba(20,40,100,0)');
    ctx.fillStyle=aura; ctx.fillRect(0,0,W,H);

    // Mountain silhouette (hero graphic)
    this._drawTitleMountain(ctx, W, H, t);

    // Logo text
    ctx.textAlign='center';
    const bob=Math.sin(t*0.0012)*5;

    // "SUMMIT" title
    ctx.font=`bold ${Math.min(80,W*0.14)}px "Crimson Text",serif`;
    ctx.shadowColor='#3355cc'; ctx.shadowBlur=50;
    ctx.fillStyle='#e0ecff';
    ctx.fillText('SUMMIT', W/2, H*0.36+bob);
    ctx.shadowBlur=0;

    // Subtitle shimmer
    const shimX=((t*0.0004)%1)*W*2-W*0.3;
    ctx.save();
    const shimmerGrad=ctx.createLinearGradient(shimX-80,0,shimX+80,0);
    shimmerGrad.addColorStop(0,'rgba(180,210,255,0)');
    shimmerGrad.addColorStop(0.5,'rgba(220,235,255,0.5)');
    shimmerGrad.addColorStop(1,'rgba(180,210,255,0)');
    ctx.font=`bold ${Math.min(80,W*0.14)}px "Crimson Text",serif`;
    ctx.fillStyle=shimmerGrad;
    ctx.fillText('SUMMIT', W/2, H*0.36+bob);
    ctx.restore();

    // Subtitle
    ctx.font=`${Math.min(32,W*0.055)}px "Crimson Text",serif`;
    ctx.fillStyle='rgba(150,185,240,0.85)';
    ctx.shadowColor='rgba(80,120,220,0.5)'; ctx.shadowBlur=12;
    ctx.fillText('Rope & Rain', W/2, H*0.44+bob);
    ctx.shadowBlur=0;

    // Tagline
    ctx.font=`italic ${Math.min(16,W*0.03)}px "Crimson Text",serif`;
    ctx.fillStyle='rgba(120,155,210,0.6)';
    ctx.fillText('An infinite mountain climbing adventure', W/2, H*0.49);

    // Best score
    if (saveData.highestPoint > 0) {
      ctx.font=`${Math.min(15,W*0.028)}px "Crimson Text",serif`;
      ctx.fillStyle='rgba(100,200,150,0.75)';
      ctx.fillText(
        `⬆ Best: ${Math.floor(saveData.highestPoint/10)}m   ◆ Coins: ${saveData.totalCoinsEver}   Games: ${saveData.gamesPlayed||0}`,
        W/2, H*0.545
      );
    }

    // Start button
    const btnW=Math.min(220,W*0.42), btnH=58;
    const btnX=W/2-btnW/2, btnY=H*0.615;
    const btnPulse=0.96+Math.sin(t*0.0028)*0.04;

    ctx.save();
    ctx.translate(W/2, btnY+btnH/2);
    ctx.scale(btnPulse, btnPulse);
    ctx.translate(-W/2, -(btnY+btnH/2));

    ctx.shadowColor='rgba(60,100,255,0.5)'; ctx.shadowBlur=28;
    const bg=ctx.createLinearGradient(btnX,btnY,btnX,btnY+btnH);
    bg.addColorStop(0,'#3a5ec0'); bg.addColorStop(1,'#1d3580');
    ctx.fillStyle=bg;
    ctx.beginPath(); ctx.roundRect(btnX,btnY,btnW,btnH,[12]); ctx.fill();
    ctx.shadowBlur=0;

    ctx.strokeStyle='rgba(120,170,255,0.5)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(btnX,btnY,btnW,btnH,[12]); ctx.stroke();

    // Button shine
    const shine=ctx.createLinearGradient(btnX,btnY,btnX,btnY+btnH*0.5);
    shine.addColorStop(0,'rgba(255,255,255,0.12)');
    shine.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=shine;
    ctx.beginPath(); ctx.roundRect(btnX,btnY,btnW,btnH*0.5,[12,12,0,0]); ctx.fill();

    ctx.font=`bold ${Math.min(24,W*0.042)}px "Crimson Text",serif`;
    ctx.fillStyle='#e8f2ff'; ctx.textAlign='center';
    ctx.fillText('⛰  BEGIN CLIMB', W/2, btnY+btnH*0.64);
    ctx.restore();
    this._startBtn = { x:btnX, y:btnY, w:btnW, h:btnH };

    // How to play
    const ctrlY = H*0.73;
    ctx.font=`${Math.min(14,W*0.026)}px "Crimson Text",serif`;
    ctx.fillStyle='rgba(100,135,200,0.55)';
    ctx.fillText('Tap to throw rope  •  Tap again to release  •  Swing to climb!', W/2, ctrlY);

    // Stats row
    if (saveData.highestPoint > 0) {
      const cards = [
        { label:'BEST HEIGHT', val:`${Math.floor(saveData.highestPoint/10)}m` },
        { label:'COINS EARNED', val:`${saveData.totalCoinsEver}` },
        { label:'RUNS', val:`${saveData.gamesPlayed||0}` },
      ];
      const cw=Math.min(120,W*0.22), ch=56, cgap=12;
      const totalCW = cards.length*(cw+cgap)-cgap;
      let cx = W/2 - totalCW/2;
      const cy = H*0.78;
      for (const c of cards) {
        ctx.fillStyle='rgba(20,35,65,0.6)';
        ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,[8]); ctx.fill();
        ctx.strokeStyle='rgba(60,90,160,0.4)'; ctx.lineWidth=1;
        ctx.stroke();
        ctx.font=`bold 9px monospace`; ctx.fillStyle='rgba(100,140,220,0.65)';
        ctx.fillText(c.label,cx+cw/2,cy+16);
        ctx.font=`bold ${Math.min(22,cw*0.18)}px "Crimson Text",serif`;
        ctx.fillStyle='#d0e4ff';
        ctx.fillText(c.val,cx+cw/2,cy+40);
        cx += cw+cgap;
      }
    }

    // Reset link
    ctx.font=`11px monospace`;
    ctx.fillStyle='rgba(80,100,150,0.35)';
    ctx.fillText('[ reset save data ]', W/2, H*0.93);
    this._resetY = H*0.93;

    ctx.textAlign='left';
    ctx.restore();
  }

  _drawTitleMountain(ctx, W, H, t) {
    ctx.save();

    // Far peak
    ctx.fillStyle='rgba(25,40,75,0.5)';
    ctx.beginPath();
    ctx.moveTo(W*0.2, H*0.62);
    ctx.bezierCurveTo(W*0.3,H*0.45, W*0.45,H*0.18, W*0.5,H*0.15);
    ctx.bezierCurveTo(W*0.55,H*0.18, W*0.7,H*0.45, W*0.8,H*0.62);
    ctx.closePath(); ctx.fill();

    // Snow cap
    ctx.fillStyle='rgba(210,230,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(W*0.44,H*0.25);
    ctx.bezierCurveTo(W*0.46,H*0.19, W*0.5,H*0.15, W*0.5,H*0.15);
    ctx.bezierCurveTo(W*0.5,H*0.15, W*0.54,H*0.19, W*0.56,H*0.25);
    ctx.bezierCurveTo(W*0.53,H*0.27, W*0.5,H*0.28, W*0.47,H*0.27);
    ctx.closePath(); ctx.fill();

    // Animated rope on mountain silhouette
    const ropeSwing = Math.sin(t*0.0015)*20;
    ctx.strokeStyle='rgba(200,165,100,0.35)';
    ctx.lineWidth=2; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(W*0.5, H*0.18);
    ctx.quadraticCurveTo(W*0.5+ropeSwing, H*0.28, W*0.5+ropeSwing*1.5, H*0.36);
    ctx.stroke();

    // Tiny climber on rope
    const clx=W*0.5+ropeSwing*1.5, cly=H*0.36;
    ctx.fillStyle='rgba(220,130,80,0.6)';
    ctx.beginPath(); ctx.arc(clx,cly,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(240,200,160,0.6)';
    ctx.beginPath(); ctx.arc(clx,cly-7,3.5,0,Math.PI*2); ctx.fill();

    // Atmospheric glow at peak
    const peakGlow=ctx.createRadialGradient(W/2,H*0.15,0,W/2,H*0.15,W*0.25);
    peakGlow.addColorStop(0,'rgba(80,120,220,0.12)');
    peakGlow.addColorStop(1,'rgba(40,70,160,0)');
    ctx.fillStyle=peakGlow; ctx.fillRect(0,0,W,H*0.5);

    ctx.restore();
  }

  checkTitleClick(mx, my, saveData, onStart, onReset) {
    if (this._startBtn) {
      const b=this._startBtn;
      if (mx>=b.x&&mx<=b.x+b.w&&my>=b.y&&my<=b.y+b.h) { onStart(); return; }
    }
    if (this._resetY && Math.abs(my-this._resetY)<14 && saveData.highestPoint>0) {
      onReset();
    }
  }

  // ─── Draw: Transition ─────────────────────────────────────────────────────
  drawTransition() {
    if (this.transAlpha < 0.01) return;
    const ctx=this.ctx;
    ctx.save();
    ctx.globalAlpha=this.transAlpha;
    ctx.fillStyle='#020612';
    ctx.fillRect(0,0,this.W,this.H);
    ctx.restore();
  }
}
