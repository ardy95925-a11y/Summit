// save.js — Persistence, upgrades catalog, weather definitions

const Save = {
  defaultData: {
    highestPoint: 0, coins: 0, totalCoinsEver: 0,
    checkpointsReached: 0, gamesPlayed: 0, totalDistanceM: 0, bestCombo: 0,
  },
  load() {
    try {
      const raw = localStorage.getItem('summit_v2');
      if (!raw) return JSON.parse(JSON.stringify(this.defaultData));
      return Object.assign(JSON.parse(JSON.stringify(this.defaultData)), JSON.parse(raw));
    } catch { return JSON.parse(JSON.stringify(this.defaultData)); }
  },
  save(d) { try { localStorage.setItem('summit_v2', JSON.stringify(d)); } catch {} },
  clear()  { localStorage.removeItem('summit_v2'); }
};

const UPGRADES = [
  { id:'rope_length',  name:'Long Reach',      desc:'Rope extends 30% further. Grab those distant hooks!', icon:'🪢', rarity:'common',    color:'#8BC34A', effect:s=>{s.maxRopeLength*=1.3;} },
  { id:'swing_power',  name:'Iron Grip',        desc:'Swing momentum +40%. Soar like a mountain hawk.',     icon:'💪', rarity:'common',    color:'#FF9800', effect:s=>{s.swingPower*=1.4;} },
  { id:'coin_magnet',  name:'Lodestone',        desc:'Coins fly to you from 120px away automatically.',    icon:'🧲', rarity:'common',    color:'#FFD700', effect:s=>{s.coinMagnetRadius+=120;} },
  { id:'double_coins', name:'Golden Touch',     desc:'Every coin worth double. Cha-ching!',                icon:'✨', rarity:'rare',      color:'#FFC107', effect:s=>{s.coinMultiplier*=2;} },
  { id:'air_control',  name:'Wind Rider',       desc:'Superior mid-air steering. Own the sky.',            icon:'🌬️',rarity:'common',    color:'#03A9F4', effect:s=>{s.airControl*=1.5;} },
  { id:'stamina',      name:'Mountain Heart',   desc:'Fall resistance +45%. The mountain cannot stop you.',icon:'❤️', rarity:'common',    color:'#E91E63', effect:s=>{s.fallResistance*=1.45;} },
  { id:'quick_hook',   name:'Quick Hook',       desc:'Hook range +50%. Reach further surfaces.',           icon:'⚓', rarity:'rare',      color:'#9C27B0', effect:s=>{s.hookRange*=1.5;} },
  { id:'speed_boost',  name:'Peak Runner',      desc:'Top speed +30%. The summit calls!',                  icon:'💨', rarity:'common',    color:'#00BCD4', effect:s=>{s.speedMultiplier*=1.3;} },
  { id:'cp_coins',     name:'Treasure Seeker',  desc:'Earn 30 bonus coins at every checkpoint.',           icon:'🏆', rarity:'rare',      color:'#FF5722', effect:s=>{s.checkpointBonus+=30;} },
  { id:'cloud_step',   name:'Cloud Step',       desc:'Release rope at peak swing for a vertical burst!',   icon:'☁️', rarity:'legendary', color:'#aad4ff', effect:s=>{s.cloudStep=true;} },
  { id:'elastic_rope', name:'Elastic Rope',     desc:'Rope snap gives a slingshot speed boost.',           icon:'🌀', rarity:'rare',      color:'#76ff03', effect:s=>{s.elasticRope=true;} },
  { id:'storm_cloak',  name:'Storm Cloak',      desc:'Born of thunder. Rain barely slows you.',            icon:'🌩️',rarity:'legendary', color:'#b388ff', effect:s=>{s.stormCloak=true;} },
  { id:'combo_master', name:'Combo King',       desc:'Coin streak multiplier starts higher!',              icon:'🔥', rarity:'legendary', color:'#ff6d00', effect:s=>{s.comboStart=2;} },
  { id:'ghost_hook',   name:'Phantom Hook',     desc:'Hook through geometry to reach hidden surfaces.',    icon:'👻', rarity:'rare',      color:'#607D8B', effect:s=>{s.ghostRope=true;} },
  { id:'bigger_reach', name:'Giant Stride',     desc:'Slightly larger hitbox — easier to land on ledges.',icon:'🏔️', rarity:'common',    color:'#78909c', effect:s=>{s.playerScale=(s.playerScale||1)*1.15;} },
];

const RARITY_WEIGHTS = { common:55, rare:32, legendary:13 };

function getRandomUpgrades(count=3) {
  const weighted = [];
  for (const u of UPGRADES) {
    const w = RARITY_WEIGHTS[u.rarity]||30;
    for (let i=0;i<w;i++) weighted.push(u);
  }
  const result=[], used=new Set();
  let tries=0;
  while (result.length<count && tries++<500) {
    const pick = weighted[Math.floor(Math.random()*weighted.length)];
    if (!used.has(pick.id)) { used.add(pick.id); result.push(pick); }
  }
  return result;
}

const WEATHER_PRESETS = {
  calm:     { rainIntensity:0.35, windX:-0.4,  fogDensity:0.2, lightningRate:0.00008, name:'Calm Night'   },
  rainy:    { rainIntensity:1.0,  windX:-1.5,  fogDensity:0.55,lightningRate:0.0006,  name:'Heavy Rain'   },
  stormy:   { rainIntensity:2.2,  windX:-3.2,  fogDensity:0.85,lightningRate:0.0025,  name:'Storm'        },
  blizzard: { rainIntensity:3.0,  windX:-5.0,  fogDensity:1.0, lightningRate:0.0015,  name:'Blizzard'     },
};
