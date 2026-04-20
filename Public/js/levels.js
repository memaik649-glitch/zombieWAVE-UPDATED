// ═══════════════════════════════════════════════════════
//  ZOMBIEWAVE V5 – LEVEL DEFINITIONS
//  Each level has: map theme, zombie types, unlock req,
//  survival time goal, and a description.
// ═══════════════════════════════════════════════════════

const LEVELS = [
  {
    id: 1,
    name: 'Verlassene Stadt',
    icon: '🏚️',
    desc: 'Die Innenstadt ist gefallen. Überall Zombies.',
    unlocked: true,   // always unlocked
    requiredLevel: 0,
    survivalGoal: 300, // 5 min in seconds
    mapTheme: 'city',
    zombieTypes: ['a','b','c'],        // basic 3
    bossMultiplier: 1.0,
    spawnRate: 1.0,
    bgColor: '#1e3a2f',
    roadColor: '#252525',
    buildingColors: ['#1a2535','#1e2d1e','#231e1e'],
    accentColor: '#f7c948',
    ambientDesc: 'Straßen und Trümmer',
  },
  {
    id: 2,
    name: 'Industriegebiet',
    icon: '🏭',
    desc: 'Fabriken voller Explosions-Zombies. Gefährlich!',
    unlocked: false,
    requiredLevel: 1,
    survivalGoal: 300,
    mapTheme: 'industrial',
    zombieTypes: ['a','b','c','d'],    // + explosive
    bossMultiplier: 1.2,
    spawnRate: 1.1,
    bgColor: '#1a2a1a',
    roadColor: '#2a2520',
    buildingColors: ['#2a2020','#1e2020','#252015'],
    accentColor: '#e67e22',
    ambientDesc: 'Rohre, Maschinen, Öl',
  },
  {
    id: 3,
    name: 'Krankenhaus',
    icon: '🏥',
    desc: 'Heiler-Zombies überall. Töte sie zuerst!',
    unlocked: false,
    requiredLevel: 2,
    survivalGoal: 300,
    mapTheme: 'hospital',
    zombieTypes: ['a','b','c','d','e'], // + healer
    bossMultiplier: 1.4,
    spawnRate: 1.2,
    bgColor: '#1a2030',
    roadColor: '#1e2025',
    buildingColors: ['#1a2540','#1e3040','#152030'],
    accentColor: '#2ecc71',
    ambientDesc: 'Weiße Gänge, Krankenbetten',
  },
  {
    id: 4,
    name: 'Militärstützpunkt',
    icon: '🪖',
    desc: 'Riesen-Zombies in voller Rüstung. Viel Glück.',
    unlocked: false,
    requiredLevel: 3,
    survivalGoal: 300,
    mapTheme: 'military',
    zombieTypes: ['b','c','d','e','f'], // + giant, no easy type
    bossMultiplier: 1.7,
    spawnRate: 1.35,
    bgColor: '#1a2015',
    roadColor: '#202818',
    buildingColors: ['#1a2515','#202015','#1e2810'],
    accentColor: '#8e44ad',
    ambientDesc: 'Sandsäcke, Stacheldraht, Bunker',
  },
  {
    id: 5,
    name: 'Unterstadt',
    icon: '🌆',
    desc: 'Alle Zombie-Typen. Das letzte Level.',
    unlocked: false,
    requiredLevel: 4,
    survivalGoal: 300,
    mapTheme: 'downtown',
    zombieTypes: ['a','b','c','d','e','f'], // all types
    bossMultiplier: 2.0,
    spawnRate: 1.5,
    bgColor: '#0d1525',
    roadColor: '#1a1a2a',
    buildingColors: ['#0d1530','#1a1040','#200d30'],
    accentColor: '#c0392b',
    ambientDesc: 'Hochhäuser, Neon-Ruinen',
  },
];

// Tile draw themes per map
const MAP_THEMES = {
  city: {
    road: (ctx, sx, sy, TILE, seed) => {
      ctx.fillStyle = seed < 4 ? '#252525' : '#222';
      ctx.fillRect(sx, sy, TILE, TILE);
      if (seed % 4 === 0) {
        ctx.strokeStyle = 'rgba(180,160,50,.12)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx+TILE/2,sy); ctx.lineTo(sx+TILE/2,sy+TILE); ctx.stroke();
      }
    },
    building: (ctx, sx, sy, TILE, seed, variant) => {
      const clrs = ['#1a2535','#1e2d1e','#231e1e'];
      ctx.fillStyle = clrs[variant % 3]; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.fillStyle='rgba(255,220,80,.12)';
      [[6,6],[6,28],[32,6],[32,28]].forEach(([ox,oy])=>{
        if((seed+ox)%3!==0) ctx.fillRect(sx+ox,sy+oy,14,12);
      });
    },
    rubble: (ctx, sx, sy, TILE) => {
      ctx.fillStyle='#2a2520'; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.fillStyle='#3a3028';
      [[4,8,22,16],[22,6,18,22],[8,28,26,18]].forEach(([rx,ry,rw,rh])=>ctx.fillRect(sx+rx,sy+ry,rw,rh));
    },
  },
  industrial: {
    road: (ctx, sx, sy, TILE, seed) => {
      ctx.fillStyle = '#1e1a14'; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.fillStyle='rgba(200,120,0,.08)';
      if(seed%3===0) ctx.fillRect(sx,sy+TILE/2-1,TILE,2);
      // oil stains
      if(seed===2){ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(sx+20,sy+30,12,8,0.5,0,Math.PI*2);ctx.fill();}
    },
    building: (ctx, sx, sy, TILE, seed) => {
      ctx.fillStyle='#2a1e10'; ctx.fillRect(sx,sy,TILE,TILE);
      // pipes
      ctx.fillStyle='#3a3020';
      ctx.fillRect(sx+4,sy,8,TILE); ctx.fillRect(sx+TILE-12,sy,8,TILE);
      ctx.fillStyle='rgba(255,140,0,.2)';
      if(seed<3) ctx.fillRect(sx+6,sy+10,4,4);
    },
    rubble: (ctx, sx, sy, TILE) => {
      ctx.fillStyle='#1e1a10'; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.fillStyle='#2a2215';
      [[2,4,20,20],[28,10,22,16]].forEach(([rx,ry,rw,rh])=>ctx.fillRect(sx+rx,sy+ry,rw,rh));
      ctx.fillStyle='rgba(255,100,0,.15)'; ctx.beginPath();ctx.arc(sx+20,sy+20,8,0,Math.PI*2);ctx.fill();
    },
  },
  hospital: {
    road: (ctx, sx, sy, TILE, seed) => {
      ctx.fillStyle='#1a1e25'; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.strokeStyle='rgba(200,220,255,.06)'; ctx.lineWidth=1;
      ctx.strokeRect(sx+2,sy+2,TILE-4,TILE-4);
    },
    building: (ctx, sx, sy, TILE, seed) => {
      ctx.fillStyle='#1e2840'; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.fillStyle='rgba(180,220,255,.18)';
      [[6,6],[6,28],[32,6],[32,28]].forEach(([ox,oy])=>{
        if((seed+ox)%2===0) ctx.fillRect(sx+ox,sy+oy,14,12);
      });
      // red cross
      if(seed===1){
        ctx.fillStyle='rgba(200,50,50,.5)';
        ctx.fillRect(sx+TILE/2-2,sy+8,4,12); ctx.fillRect(sx+TILE/2-6,sy+12,12,4);
      }
    },
    rubble: (ctx, sx, sy, TILE) => {
      ctx.fillStyle='#141820'; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.fillStyle='#1e2030';
      [[6,6,20,20],[28,20,18,14]].forEach(([rx,ry,rw,rh])=>ctx.fillRect(sx+rx,sy+ry,rw,rh));
    },
  },
  military: {
    road: (ctx, sx, sy, TILE, seed) => {
      ctx.fillStyle='#1e2218'; ctx.fillRect(sx,sy,TILE,TILE);
      // tire tracks
      ctx.strokeStyle='rgba(100,120,60,.2)'; ctx.lineWidth=3;
      if(seed%3===0){ctx.beginPath();ctx.moveTo(sx+16,sy);ctx.lineTo(sx+16,sy+TILE);ctx.stroke();}
    },
    building: (ctx, sx, sy, TILE, seed) => {
      ctx.fillStyle='#1e2818'; ctx.fillRect(sx,sy,TILE,TILE);
      // sandbags on edge
      ctx.fillStyle='#3a3820';
      for(let i=0;i<4;i++) ctx.fillRect(sx+i*14,sy+TILE-8,12,8);
      ctx.fillStyle='rgba(150,180,80,.1)';
      if(seed%2===0) ctx.fillRect(sx+4,sy+4,TILE-8,TILE-12);
    },
    rubble: (ctx, sx, sy, TILE) => {
      ctx.fillStyle='#181e14'; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.fillStyle='#252c1a';
      [[4,4,18,18],[26,16,20,14]].forEach(([rx,ry,rw,rh])=>ctx.fillRect(sx+rx,sy+ry,rw,rh));
    },
  },
  downtown: {
    road: (ctx, sx, sy, TILE, seed) => {
      ctx.fillStyle='#0e1020'; ctx.fillRect(sx,sy,TILE,TILE);
      // neon reflections
      const neonColors=['rgba(255,0,100,.06)','rgba(0,200,255,.05)','rgba(180,0,255,.04)'];
      ctx.fillStyle=neonColors[seed%3];
      ctx.fillRect(sx,sy,TILE,TILE);
    },
    building: (ctx, sx, sy, TILE, seed) => {
      const clrs=['#0d1530','#1a1040','#200d30'];
      ctx.fillStyle=clrs[seed%3]; ctx.fillRect(sx,sy,TILE,TILE);
      // neon glow windows
      const neonW=['rgba(255,50,100,.4)','rgba(0,200,255,.35)','rgba(180,0,255,.3)'];
      ctx.fillStyle=neonW[seed%3];
      [[6,6],[6,28],[32,6],[32,28]].forEach(([ox,oy])=>{
        if((seed+ox)%2===0){
          ctx.fillRect(sx+ox,sy+oy,14,12);
          ctx.fillStyle='rgba(255,255,255,.05)'; ctx.fillRect(sx+ox+1,sy+oy+1,12,2);
          ctx.fillStyle=neonW[seed%3];
        }
      });
    },
    rubble: (ctx, sx, sy, TILE) => {
      ctx.fillStyle='#0a0c18'; ctx.fillRect(sx,sy,TILE,TILE);
      ctx.fillStyle='rgba(180,0,255,.1)'; ctx.beginPath();ctx.arc(sx+28,sy+20,10,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#14182a';
      [[6,8,20,18]].forEach(([rx,ry,rw,rh])=>ctx.fillRect(sx+rx,sy+ry,rw,rh));
    },
  },
};

// Zombie wave compositions per level theme
function getLevelZombieTypes(levelId, wave) {
  const lvl = LEVELS.find(l => l.id === levelId) || LEVELS[0];
  const available = lvl.zombieTypes;
  // Early waves only use first 2-3 types
  if (wave <= 2) return available.slice(0, Math.min(2, available.length));
  if (wave <= 4) return available.slice(0, Math.min(3, available.length));
  return available;
}
