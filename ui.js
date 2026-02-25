// ui.js - HUD, card picker, title screen, checkpoint overlay

class UI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;

    this.cardState = null; // { cards, onChoose, animIn }
    this.showingTitle = true;
    this.titleAnimTime = 0;
    this.hoverCard = -1;
    this.clickedCard = -1;

    this.floatingTexts = [];
    this.coinDisplayValue = 0; // animated coin counter
    this.heightDisplayValue = 0;

    this.transitionAlpha = 0;
    this.transitioning = false;
  }

  resize(w, h) {
    this.W = w;
    this.H = h;
  }

  showCards(cards, onChoose) {
    this.cardState = {
      cards,
      onChoose,
      animIn: 0,
      chosen: -1,
    };
  }

  dismissCards() {
    this.cardState = null;
  }

  addFloatingText(x, y, text, color = '#FFD700', size = 22) {
    this.floatingTexts.push({
      x, y, text, color, size,
      life: 1.0,
      vy: -1.5,
    });
  }

  update(dt, gameState) {
    // Animate coin display
    if (gameState) {
      const diff = gameState.coins - this.coinDisplayValue;
      this.coinDisplayValue += diff * 0.08;
      const hdiff = gameState.highestY - this.heightDisplayValue;
      this.heightDisplayValue += hdiff * 0.05;
    }

    this.titleAnimTime += dt;

    // Card anim
    if (this.cardState && this.cardState.animIn < 1) {
      this.cardState.animIn = Math.min(1, this.cardState.animIn + dt * 0.003);
    }

    // Floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= dt * 0.001;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }

    // Transition
    if (this.transitioning) {
      this.transitionAlpha = Math.min(1, this.transitionAlpha + dt * 0.004);
    } else {
      this.transitionAlpha = Math.max(0, this.transitionAlpha - dt * 0.003);
    }
  }

  handleClick(mx, my) {
    if (this.cardState && this.cardState.chosen === -1) {
      const cards = this.cardState.cards;
      const layout = this.getCardLayout(cards.length);
      for (let i = 0; i < cards.length; i++) {
        const { x, y, w, h } = layout[i];
        if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
          this.cardState.chosen = i;
          setTimeout(() => {
            this.cardState.onChoose(i);
            this.cardState = null;
          }, 600);
          return true;
        }
      }
    }
    return false;
  }

  handleMove(mx, my) {
    if (this.cardState) {
      const cards = this.cardState.cards;
      const layout = this.getCardLayout(cards.length);
      this.hoverCard = -1;
      for (let i = 0; i < cards.length; i++) {
        const { x, y, w, h } = layout[i];
        if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
          this.hoverCard = i;
        }
      }
    }
  }

  getCardLayout(count) {
    const W = this.W, H = this.H;
    const cardW = Math.min(180, W * 0.25);
    const cardH = cardW * 1.5;
    const gap = 20;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (W - totalW) / 2;
    const startY = (H - cardH) / 2;
    return Array.from({ length: count }, (_, i) => ({
      x: startX + i * (cardW + gap),
      y: startY,
      w: cardW,
      h: cardH,
    }));
  }

  drawHUD(gameState) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    // Top bar - semi transparent
    ctx.save();
    const barGrad = ctx.createLinearGradient(0, 0, 0, 70);
    barGrad.addColorStop(0, 'rgba(5, 10, 25, 0.75)');
    barGrad.addColorStop(1, 'rgba(5, 10, 25, 0)');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, W, 70);

    // Height meter
    const heightM = Math.floor(gameState.highestY / 10);
    ctx.font = 'bold 13px "Crimson Text", serif';
    ctx.fillStyle = 'rgba(160, 180, 220, 0.7)';
    ctx.fillText('ALTITUDE', 20, 20);
    ctx.font = 'bold 28px "Crimson Text", serif';
    ctx.fillStyle = '#c8d8ff';
    ctx.shadowColor = '#4466ff';
    ctx.shadowBlur = 12;
    ctx.fillText(`${Math.floor(this.heightDisplayValue / 10)}m`, 20, 52);
    ctx.shadowBlur = 0;

    // Coin display
    const coinX = W - 140;
    ctx.font = 'bold 13px "Crimson Text", serif';
    ctx.fillStyle = 'rgba(200, 180, 100, 0.7)';
    ctx.textAlign = 'right';
    ctx.fillText('COINS', W - 20, 20);
    ctx.font = 'bold 28px "Crimson Text", serif';
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FFa000';
    ctx.shadowBlur = 10;
    ctx.fillText(`⬟ ${Math.floor(this.coinDisplayValue)}`, W - 20, 52);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // Checkpoints
    if (gameState.checkpointsReached > 0) {
      ctx.font = '13px "Crimson Text", serif';
      ctx.fillStyle = 'rgba(100, 220, 160, 0.8)';
      ctx.fillText(`✦ ${gameState.checkpointsReached} checkpoints`, 20, H - 20);
    }

    // Active upgrades indicator
    if (gameState.upgrades && gameState.upgrades.length > 0) {
      ctx.font = '12px monospace';
      ctx.fillStyle = 'rgba(150, 200, 255, 0.5)';
      ctx.textAlign = 'right';
      const upgradeStr = gameState.upgrades.map(u => u.icon).join(' ');
      ctx.fillText(upgradeStr, W - 20, H - 20);
      ctx.textAlign = 'left';
    }

    ctx.restore();

    // Floating texts
    ctx.save();
    for (const ft of this.floatingTexts) {
      ctx.font = `bold ${ft.size}px "Crimson Text", serif`;
      ctx.globalAlpha = ft.life;
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 8;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  drawCards() {
    if (!this.cardState) return;
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    const { cards, animIn, chosen } = this.cardState;

    // Dim overlay
    ctx.save();
    ctx.fillStyle = `rgba(0, 5, 20, ${0.7 * animIn})`;
    ctx.fillRect(0, 0, W, H);

    // Header text
    const t = animIn;
    ctx.globalAlpha = t;

    ctx.font = 'bold 14px "Crimson Text", serif';
    ctx.fillStyle = 'rgba(150, 180, 220, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('CHECKPOINT REACHED', W / 2, H / 2 - 180);

    ctx.font = 'bold 32px "Crimson Text", serif';
    ctx.fillStyle = '#c8d8ff';
    ctx.shadowColor = '#4466bb';
    ctx.shadowBlur = 20;
    ctx.fillText('Choose Your Upgrade', W / 2, H / 2 - 145);
    ctx.shadowBlur = 0;

    const layout = this.getCardLayout(cards.length);

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const { x, y, w, h } = layout[i];
      const isHover = this.hoverCard === i;
      const isChosen = chosen === i;

      const cardT = Math.max(0, (animIn - i * 0.1) / 0.7);
      const slideY = (1 - cardT) * 80;
      const alpha = cardT;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(0, slideY);

      // Glow for hover
      if (isHover || isChosen) {
        ctx.shadowColor = card.color;
        ctx.shadowBlur = 30;
      }

      // Card background
      const cardGrad = ctx.createLinearGradient(x, y, x, y + h);
      cardGrad.addColorStop(0, isChosen ? '#1a2a4a' : (isHover ? '#1a2540' : '#121d30'));
      cardGrad.addColorStop(1, isChosen ? '#0d1525' : '#090e1a');
      ctx.fillStyle = cardGrad;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.fill();

      // Card border
      ctx.strokeStyle = isChosen ? card.color : (isHover ? 'rgba(150,180,255,0.6)' : 'rgba(60,80,120,0.5)');
      ctx.lineWidth = isHover || isChosen ? 2 : 1;
      ctx.stroke();

      // Card inner glow at top
      const topGlow = ctx.createLinearGradient(x, y, x, y + h * 0.3);
      topGlow.addColorStop(0, `${card.color}22`);
      topGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = topGlow;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h * 0.3, [12, 12, 0, 0]);
      ctx.fill();

      // Icon
      ctx.font = `${w * 0.3}px serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = card.color;
      ctx.shadowBlur = 15;
      ctx.fillText(card.icon, x + w / 2, y + h * 0.28);
      ctx.shadowBlur = 0;

      // Card name
      ctx.font = `bold ${Math.floor(w * 0.1)}px "Crimson Text", serif`;
      ctx.fillStyle = '#e8eeff';
      ctx.shadowBlur = 0;
      ctx.fillText(card.name, x + w / 2, y + h * 0.48);

      // Divider
      ctx.strokeStyle = `${card.color}44`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 15, y + h * 0.53);
      ctx.lineTo(x + w - 15, y + h * 0.53);
      ctx.stroke();

      // Description - word wrap
      ctx.font = `${Math.floor(w * 0.07)}px "Crimson Text", serif`;
      ctx.fillStyle = 'rgba(160, 180, 220, 0.8)';
      this.wrapText(ctx, card.description, x + w / 2, y + h * 0.62, w - 20, w * 0.09);

      if (isChosen) {
        ctx.fillStyle = `${card.color}cc`;
        ctx.font = `bold ${w * 0.11}px "Crimson Text", serif`;
        ctx.fillText('✓ CHOSEN', x + w / 2, y + h * 0.9);
      } else {
        // "Select" hint
        ctx.fillStyle = isHover ? card.color : 'rgba(100,120,160,0.5)';
        ctx.font = `${w * 0.08}px "Crimson Text", serif`;
        ctx.fillText(isHover ? 'Tap to select' : '◆', x + w / 2, y + h * 0.9);
      }

      ctx.restore();
    }

    ctx.textAlign = 'left';
    ctx.restore();
  }

  wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let lineY = y;
    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > maxWidth && line !== '') {
        ctx.fillText(line.trim(), cx, lineY);
        line = word + ' ';
        lineY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), cx, lineY);
  }

  drawTitle(saveData, onStart, onReset) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    const t = this.titleAnimTime;

    // Title art  
    ctx.save();

    // Animated title background gradient
    const titleBg = ctx.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.3, W * 0.7);
    titleBg.addColorStop(0, 'rgba(30, 50, 100, 0.3)');
    titleBg.addColorStop(1, 'rgba(0, 5, 15, 0)');
    ctx.fillStyle = titleBg;
    ctx.fillRect(0, 0, W, H);

    // Logo mountain silhouette
    ctx.fillStyle = 'rgba(60, 90, 140, 0.5)';
    ctx.beginPath();
    ctx.moveTo(W * 0.3, H * 0.55);
    ctx.lineTo(W * 0.5, H * 0.2);
    ctx.lineTo(W * 0.7, H * 0.55);
    ctx.closePath();
    ctx.fill();

    // Snow cap
    ctx.fillStyle = 'rgba(200, 220, 255, 0.6)';
    ctx.beginPath();
    ctx.moveTo(W * 0.46, H * 0.28);
    ctx.lineTo(W * 0.5, H * 0.2);
    ctx.lineTo(W * 0.54, H * 0.28);
    ctx.closePath();
    ctx.fill();

    // Game title
    ctx.textAlign = 'center';
    const bobble = Math.sin(t * 0.001) * 4;

    // Glow
    ctx.shadowColor = '#4488ff';
    ctx.shadowBlur = 40;
    ctx.font = 'bold 62px "Crimson Text", serif';
    ctx.fillStyle = '#c8d8ff';
    ctx.fillText('SUMMIT', W / 2, H * 0.38 + bobble);

    ctx.shadowColor = '#8866dd';
    ctx.font = 'bold 36px "Crimson Text", serif';
    ctx.fillStyle = '#aa99ee';
    ctx.fillText('ROPE & RAIN', W / 2, H * 0.46 + bobble);

    ctx.shadowBlur = 0;

    // Subtitle
    ctx.font = 'italic 16px "Crimson Text", serif';
    ctx.fillStyle = 'rgba(150, 180, 230, 0.7)';
    ctx.fillText('An endless mountain climbing adventure', W / 2, H * 0.52);

    // High score display
    if (saveData.highestPoint > 0) {
      ctx.fillStyle = 'rgba(100, 180, 130, 0.8)';
      ctx.font = '14px "Crimson Text", serif';
      ctx.fillText(`⬆ Best: ${Math.floor(saveData.highestPoint / 10)}m  ⬟ Coins: ${saveData.totalCoinsEver}`, W / 2, H * 0.57);
    }

    // Start button
    const btnW = 200, btnH = 54;
    const btnX = W / 2 - btnW / 2;
    const btnY = H * 0.64;
    const btnPulse = Math.sin(t * 0.003) * 0.08 + 0.92;

    ctx.save();
    ctx.translate(W / 2, btnY + btnH / 2);
    ctx.scale(btnPulse, btnPulse);
    ctx.translate(-W / 2, -(btnY + btnH / 2));

    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, '#4466cc');
    btnGrad.addColorStop(1, '#2233aa');
    ctx.fillStyle = btnGrad;
    ctx.shadowColor = '#4466ff';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(100, 150, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.font = 'bold 22px "Crimson Text", serif';
    ctx.fillStyle = '#e8f0ff';
    ctx.fillText('BEGIN CLIMB', W / 2, btnY + 34);
    ctx.restore();

    this._titleBtnBounds = { x: btnX, y: btnY, w: btnW, h: btnH };

    // Reset button (small)
    if (saveData.highestPoint > 0) {
      ctx.font = '12px monospace';
      ctx.fillStyle = 'rgba(100, 120, 160, 0.5)';
      ctx.fillText('[ reset save ]', W / 2, H * 0.82);
      this._resetBtnY = H * 0.82;
    }

    // Instructions
    ctx.font = '13px "Crimson Text", serif';
    ctx.fillStyle = 'rgba(100, 130, 180, 0.6)';
    ctx.fillText('Tap & hold to throw rope • Swing to climb!', W / 2, H * 0.88);

    ctx.textAlign = 'left';
    ctx.restore();
  }

  checkTitleClick(mx, my, saveData, onStart, onReset) {
    if (this._titleBtnBounds) {
      const b = this._titleBtnBounds;
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        onStart();
        return;
      }
    }
    if (this._resetBtnY && Math.abs(my - this._resetBtnY) < 15 && saveData.highestPoint > 0) {
      onReset();
    }
  }

  drawTransition() {
    if (this.transitionAlpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = this.transitionAlpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.restore();
  }

  startTransition() {
    this.transitioning = true;
  }

  endTransition() {
    this.transitioning = false;
  }
}
