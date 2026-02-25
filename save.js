// save.js - Progress persistence
const Save = {
  defaultData: {
    highestPoint: 0,
    coins: 0,
    totalCoinsEver: 0,
    checkpointsReached: 0,
    upgrades: [],
    stats: {
      gamesPlayed: 0,
      totalDistance: 0,
    }
  },

  load() {
    try {
      const raw = localStorage.getItem('mountainClimber_save');
      if (!raw) return JSON.parse(JSON.stringify(this.defaultData));
      return { ...JSON.parse(JSON.stringify(this.defaultData)), ...JSON.parse(raw) };
    } catch (e) {
      return JSON.parse(JSON.stringify(this.defaultData));
    }
  },

  save(data) {
    try {
      localStorage.setItem('mountainClimber_save', JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save:', e);
    }
  },

  clear() {
    localStorage.removeItem('mountainClimber_save');
  }
};

// Upgrades catalog
const UPGRADES = [
  {
    id: 'rope_length',
    name: 'Longer Rope',
    description: 'Your rope extends 25% further, giving you more swing range.',
    icon: '🪢',
    color: '#8BC34A',
    effect: (state) => { state.maxRopeLength *= 1.25; }
  },
  {
    id: 'swing_power',
    name: 'Iron Grip',
    description: 'Swing momentum increased by 30%. Fly farther!',
    icon: '💪',
    color: '#FF9800',
    effect: (state) => { state.swingPower *= 1.3; }
  },
  {
    id: 'coin_magnet',
    name: 'Coin Magnet',
    description: 'Coins within a larger radius are automatically collected.',
    icon: '🧲',
    color: '#FFD700',
    effect: (state) => { state.coinMagnetRadius += 80; }
  },
  {
    id: 'double_coins',
    name: 'Golden Touch',
    description: 'All coin pickups are worth double.',
    icon: '✨',
    color: '#FFC107',
    effect: (state) => { state.coinMultiplier *= 2; }
  },
  {
    id: 'air_control',
    name: 'Wind Rider',
    description: 'Better air control while swinging.',
    icon: '🌬️',
    color: '#03A9F4',
    effect: (state) => { state.airControl *= 1.4; }
  },
  {
    id: 'stamina',
    name: 'Mountain Heart',
    description: 'Reduce fall penalty - bounce back faster.',
    icon: '❤️',
    color: '#E91E63',
    effect: (state) => { state.fallResistance *= 1.35; }
  },
  {
    id: 'rope_attach',
    name: 'Quick Hook',
    description: 'Rope attaches to surfaces faster and at greater angles.',
    icon: '⚓',
    color: '#9C27B0',
    effect: (state) => { state.hookRange *= 1.3; }
  },
  {
    id: 'speed_boost',
    name: 'Peak Runner',
    description: 'Your base movement speed is increased.',
    icon: '💨',
    color: '#00BCD4',
    effect: (state) => { state.speedMultiplier *= 1.2; }
  },
  {
    id: 'checkpoint_coins',
    name: 'Treasure Finder',
    description: 'Earn bonus coins at each checkpoint.',
    icon: '🏆',
    color: '#FF5722',
    effect: (state) => { state.checkpointBonus += 15; }
  },
  {
    id: 'ghost_rope',
    name: 'Spectral Rope',
    description: 'Your rope can pass through thin ledges to hook on surfaces behind.',
    icon: '👻',
    color: '#607D8B',
    effect: (state) => { state.ghostRope = true; }
  }
];

function getRandomUpgrades(count = 3) {
  const shuffled = [...UPGRADES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
