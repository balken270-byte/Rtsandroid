'use strict';
// ═══════════════════════════════════════════════════════
//  IRON FRONT — Pixel RTS Engine
// ═══════════════════════════════════════════════════════

// ── ASSET PATHS ─────────────────────────────────────────
const IMG = {
  hull:    'hull.png',
  turret:  'turret.png',
  ehull:   'ehull.png',
  eturret: 'eturret.png',
  factory: 'factory.png',
  ground:  'ground.png',
};

// ── CANVAS SETUP ────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');
mmCanvas.width = 130; mmCanvas.height = 90;

let VW, VH, DPR;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.floor(VW * DPR);
  canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}
window.addEventListener('resize', resize); resize();

// ── IMAGES ──────────────────────────────────────────────
const imgs = {};
let loadedCount = 0, totalImgs = Object.keys(IMG).length;
function loadImages(cb) {
  for (const [key, src] of Object.entries(IMG)) {
    const img = new Image();
    img.onload = () => { loadedCount++; if (loadedCount >= totalImgs) cb(); };
    img.onerror = () => { loadedCount++; if (loadedCount >= totalImgs) cb(); };
    img.src = src;
    imgs[key] = img;
  }
}

// ── AUDIO ────────────────────────────────────────────────
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
['pointerdown','touchstart'].forEach(e => document.addEventListener(e, initAudio, {once:false}));

function playShoot(team) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(team==='player'?200:140, t);
  o.frequency.exponentialRampToValueAtTime(50, t+0.14);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t+0.15);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t+0.16);
}

function playExplosion(big=false) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = big ? 0.6 : 0.35;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate*dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/d.length, 1.5);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const g = audioCtx.createGain(); g.gain.setValueAtTime(big?0.5:0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  const f = audioCtx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=big?800:500;
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start(t);
}

// ── CONSTANTS ────────────────────────────────────────────
const MAP_W = 4000, MAP_H = 3000;
const TILE = 80; // terrain tile size

// Tank sprites
const S = {
  HULL_W:351, HULL_H:645, TUR_W:287, TUR_H:697,
  EHULL_W:354, EHULL_H:653, ETUR_W:293, ETUR_H:702,
  FAC_W:1333, FAC_H:686,
  SCALE:0.13, FAC_SCALE:0.40,
  TPX:0.495, TPY:0.670,
  ETPX:0.491, ETPY:0.567,
};

// Unit stats
const UNIT_STATS = {
  tank: { maxHp:150, dmg:18, speed:1.1, turnRate:0.045, turretTurn:0.055,
          range:440, fireRate:100, radius:36, bulletSpeed:9, cost:100 }
};

// ── CAMERA ───────────────────────────────────────────────
const cam = { x:200, y:600, zoom:1.3 };
function clampCam() {
  cam.x = Math.max(0, Math.min(MAP_W - VW/cam.zoom, cam.x));
  cam.y = Math.max(0, Math.min(MAP_H - VH/cam.zoom, cam.y));
}
function w2s(wx, wy) { return [(wx-cam.x)*cam.zoom, (wy-cam.y)*cam.zoom]; }
function s2w(sx, sy) { return [sx/cam.zoom+cam.x, sy/cam.zoom+cam.y]; }

// ── TERRAIN ──────────────────────────────────────────────
// Generate a simple terrain grid with variation
const TERRAIN_COLS = Math.ceil(MAP_W/TILE)+1;
const TERRAIN_ROWS = Math.ceil(MAP_H/TILE)+1;
const terrainColors = [];
function generateTerrain() {
  // Base colors: dark olive greens, browns for a military feel
  const bases = [
    '#3d4a28','#404e2a','#48562f','#3a4725','#445230',
    '#4a5535','#3e4b28','#435030','#3b4926','#46532d'
  ];
  for (let r = 0; r < TERRAIN_ROWS; r++) {
    terrainColors[r] = [];
    for (let c = 0; c < TERRAIN_COLS; c++) {
      terrainColors[r][c] = bases[Math.floor(Math.random()*bases.length)];
    }
  }
}

// ── TERRAIN FEATURES (rocks, bushes, debris) ─────────────
const terrainFeatures = [];
function generateFeatures() {
  // Scatter rocks and bushes
  for (let i = 0; i < 120; i++) {
    const type = Math.random() < 0.4 ? 'rock' : 'bush';
    terrainFeatures.push({
      x: 300 + Math.random() * (MAP_W-600),
      y: 300 + Math.random() * (MAP_H-600),
      type,
      size: 8 + Math.random()*14,
      rot: Math.random()*Math.PI*2,
      color: type==='rock' ? '#5a5a4a' : '#2a4a1a',
    });
  }
  // A dirt road (horizontal center)
  for (let x = 0; x < MAP_W; x += 20) {
    terrainFeatures.push({
      x: x, y: MAP_H*0.5 + (Math.random()-0.5)*30,
      type:'road', size:18, rot:0, color:'#5a4a30'
    });
  }
}

// ── GAME STATE ────────────────────────────────────────────
let gold = 200, oil = 0;
let time = 0, shake = 0;
let waveNum = 0, waveTimer = 480;
let gameOver = false, victory = false;
let attackMoveMode = false;

const tanks = [];
const bullets = [];
const particles = [];
const smokes = [];
const tracks = [];
const explosions = [];
const wrecks = [];

// Buildings
const buildings = {
  player: { x:480, y:900, w:S.FAC_W*S.FAC_SCALE, h:S.FAC_H*S.FAC_SCALE,
            hp:500, maxHp:500, team:'player',
            buildQueue:0, buildTimer:0, rallyX:480, rallyY:1150,
            selected:false },
  enemy:  { x:MAP_W-480, y:MAP_H-900, w:S.FAC_W*S.FAC_SCALE, h:S.FAC_H*S.FAC_SCALE,
            hp:500, maxHp:500, team:'enemy',
            spawnTimer:0, resources:200 }
};

// ── TANK FACTORY ──────────────────────────────────────────
function makeTank(x, y, team) {
  const st = UNIT_STATS.tank;
  return {
    x, y, tx:x, ty:y, team,
    hp: st.maxHp, maxHp: st.maxHp,
    hullAngle: Math.PI/2,
    turretAngle: team==='player' ? Math.PI/2 : -Math.PI/2,
    hullTurnVel: 0,
    fireCooldown: Math.random()*60,
    trackPhase: 0, recoil: 0, muzzle: 0,
    idlePhase: Math.random()*6,
    selected: false, alive: true,
    deadTimer: 0, smokeTimer: 0,
    hasOrder: false, spawning: 0,
    incomingDmg: 0,
  };
}

// ── SETUP ─────────────────────────────────────────────────
function setup() {
  tanks.length = 0; bullets.length = 0; particles.length = 0;
  smokes.length = 0; tracks.length = 0; explosions.length = 0; wrecks.length = 0;
  gold = 200; oil = 0; time = 0; waveNum = 0; waveTimer = 480;
  gameOver = false; victory = false; attackMoveMode = false;
  buildings.player.hp = 500; buildings.player.buildQueue = 0; buildings.player.buildTimer = 0;
  buildings.enemy.hp = 500; buildings.enemy.spawnTimer = 0; buildings.enemy.resources = 200;

  // Spawn starting tanks
  for (let i = 0; i < 3; i++) {
    tanks.push(makeTank(600 + (i%2)*90, 1000 + Math.floor(i/2)*110, 'player'));
  }
  spawnEnemyWave(2);
  cam.x = 150; cam.y = 700; clampCam();
  updateHUD();
  document.getElementById('game-over').style.display = 'none';
}

// ── WAVE SPAWNER ──────────────────────────────────────────
function spawnEnemyWave(n) {
  waveNum++;
  for (let i = 0; i < n; i++) {
    const ex = MAP_W - 280 - Math.random()*200;
    const ey = 400 + Math.random()*(MAP_H-800);
    tanks.push(makeTank(ex, ey, 'enemy'));
  }
  flashStatus(`⚔️ DÜŞMAN DALGASI ${waveNum}!  ${n} tank yaklaşıyor`);
  document.getElementById('wave-num').textContent = waveNum;
}

// ── HUD ───────────────────────────────────────────────────
let statusTimer = 0;
function flashStatus(msg) {
  const el = document.getElementById('status-msg');
  el.textContent = msg; el.classList.add('show');
  statusTimer = 180;
}
function updateHUD() {
  document.getElementById('res-gold').textContent = Math.floor(gold);
  document.getElementById('res-oil').textContent = Math.floor(oil);
  // Selection info
  const sel = tanks.filter(t => t.selected && t.alive);
  const portrait = document.getElementById('sel-portrait');
  const stats = document.getElementById('sel-stats');
  if (sel.length === 1) {
    const t = sel[0];
    portrait.textContent = '🪖';
    stats.innerHTML = `TANK M1A2<br>HP: ${Math.max(0,Math.floor(t.hp))}/${t.maxHp}<br>TAKIM: ${t.team==='player'?'MÜTTEFIK':'DÜŞMAN'}`;
  } else if (sel.length > 1) {
    portrait.textContent = '⚔️';
    stats.innerHTML = `${sel.length} BİRİM SEÇİLİ<br>ORTALAMA HP: ${Math.floor(sel.reduce((a,t)=>a+t.hp,0)/sel.length)}`;
  } else if (buildings.player.selected) {
    portrait.textContent = '🏭';
    stats.innerHTML = `KIŞLA<br>HP: ${Math.floor(buildings.player.hp)}/500<br>KUYRUK: ${buildings.player.buildQueue}`;
  } else {
    portrait.textContent = '🎖️';
    stats.innerHTML = `DEMIR CEPHE<br>Birim seç veya<br>kışlaya dokun`;
  }
}

// ── INPUT ─────────────────────────────────────────────────
const pointers = new Map();
let dragStart = null, camStart = null, didDrag = false;
let pinchStart = null, selBox = null;

canvas.addEventListener('pointerdown', e => {
  initAudio();
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pointers.size === 1) {
    dragStart = {x:e.clientX, y:e.clientY};
    camStart = {x:cam.x, y:cam.y};
    didDrag = false;
    selBox = {x0:e.clientX, y0:e.clientY, x1:e.clientX, y1:e.clientY};
  } else if (pointers.size === 2) {
    const p = [...pointers.values()];
    pinchStart = {d:Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y), zoom:cam.zoom};
    selBox = null;
  }
});

canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

  if (pointers.size === 2 && pinchStart) {
    const p = [...pointers.values()];
    const d = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
    const mid = {x:(p[0].x+p[1].x)/2, y:(p[0].y+p[1].y)/2};
    cam.zoom = Math.max(0.6, Math.min(2.6, pinchStart.zoom*(d/pinchStart.d)));
    if (pinchStart.mid) { cam.x+=(pinchStart.mid.x-mid.x)/cam.zoom; cam.y+=(pinchStart.mid.y-mid.y)/cam.zoom; }
    pinchStart.mid = mid; clampCam(); didDrag = true;
  } else if (pointers.size === 1 && dragStart) {
    const dx = e.clientX-dragStart.x, dy = e.clientY-dragStart.y;
    if (Math.abs(dx)>5 || Math.abs(dy)>5) didDrag = true;
    if (selBox) { selBox.x1 = e.clientX; selBox.y1 = e.clientY; }
  }
});

canvas.addEventListener('pointerup', e => {
  const wasOne = pointers.size === 1;
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (pinchStart && pointers.size < 2) pinchStart = null;
  if (!wasOne || !p) { dragStart = null; selBox = null; return; }

  if (gameOver) { restartGame(); dragStart=null; selBox=null; return; }

  const [wx, wy] = s2w(p.x, p.y);

  if (didDrag && selBox) {
    // Box select
    const [wx0,wy0] = s2w(Math.min(selBox.x0,selBox.x1), Math.min(selBox.y0,selBox.y1));
    const [wx1,wy1] = s2w(Math.max(selBox.x0,selBox.x1), Math.max(selBox.y0,selBox.y1));
    tanks.forEach(t => t.selected = false);
    buildings.player.selected = false;
    let c = 0;
    tanks.forEach(t => { if(t.alive&&t.team==='player'&&t.x>=wx0&&t.x<=wx1&&t.y>=wy0&&t.y<=wy1){t.selected=true;c++;} });
    if (c) burst(wx, wy, '#7fff9f', 6); 
    attackMoveMode = false;
  } else {
    // Single tap
    if (attackMoveMode) {
      // Attack-move order
      const sel = tanks.filter(t => t.selected && t.alive);
      sel.forEach((t,i) => {
        const a = i/sel.length*Math.PI*2, r = sel.length>1 ? 60:0;
        t.tx = wx+Math.cos(a)*r; t.ty = wy+Math.sin(a)*r;
        t.hasOrder = true; t.attackMove = true;
      });
      spawnWaveRing(wx, wy, '#ff7f3f');
      attackMoveMode = false;
    } else if (hitBuilding(wx, wy, buildings.player)) {
      // Click on player factory
      tanks.forEach(t => t.selected=false);
      buildings.player.selected = true;
      buildings.enemy.selected = false;
      burst(buildings.player.x, buildings.player.y, '#cfffaf', 10);
    } else {
      // Try selecting a tank
      let tapped = null;
      for (const t of tanks) {
        if (t.alive && t.team==='player' && dist(wx,wy,t.x,t.y)<UNIT_STATS.tank.radius+12) { tapped=t; break; }
      }
      if (tapped) {
        tanks.forEach(t => t.selected=false);
        buildings.player.selected = false;
        tapped.selected = true;
        burst(tapped.x, tapped.y, '#7fff9f', 8);
      } else {
        const sel = tanks.filter(t => t.selected && t.alive);
        if (sel.length) {
          // Move order
          sel.forEach((t,i) => {
            const a = i/sel.length*Math.PI*2, r = sel.length>1?55:0;
            t.tx = wx+Math.cos(a)*r; t.ty = wy+Math.sin(a)*r;
            t.hasOrder = true; t.attackMove = false;
          });
          spawnWaveRing(wx, wy, '#7fff9f');
        } else if (buildings.player.selected) {
          buildings.player.rallyX = wx; buildings.player.rallyY = wy;
          flashStatus('🚩 Toplanma noktası güncellendi');
        }
        tanks.forEach(t => t.selected=false);
        buildings.player.selected = false;
      }
    }
  }
  dragStart = null; selBox = null;
  updateHUD();
});

// Pinch zoom on wheel
canvas.addEventListener('wheel', e => {
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  cam.zoom = Math.max(0.6, Math.min(2.6, cam.zoom*factor));
  clampCam();
});

// ── ACTION BUTTONS ────────────────────────────────────────
function produceTank() {
  if (gold >= 100) {
    gold -= 100;
    buildings.player.buildQueue++;
    flashStatus(`🔧 Tank üretim kuyruğu: ${buildings.player.buildQueue}`);
    updateHUD();
  } else {
    flashStatus('⚠️ Yeterli altın yok! (100 gerekli)');
  }
}
function stopSelected() {
  tanks.filter(t=>t.selected&&t.alive).forEach(t=>{t.tx=t.x;t.ty=t.y;t.hasOrder=false;t.attackMove=false;});
  flashStatus('✋ Birimler durduruldu');
}
function attackMove() {
  const sel = tanks.filter(t=>t.selected&&t.alive);
  if (sel.length) { attackMoveMode=true; flashStatus('⚔️ Saldırı noktasına dokun'); }
}
function restartGame() { setup(); }
window.produceTank = produceTank;
window.stopSelected = stopSelected;
window.attackMove = attackMove;
window.restartGame = restartGame;

// ── HELPERS ───────────────────────────────────────────────
function dist(ax,ay,bx,by) { return Math.hypot(ax-bx,ay-by); }
function hitBuilding(wx,wy,b) { return Math.abs(wx-b.x)<b.w/2 && Math.abs(wy-b.y)<b.h/2; }
function angleDiff(tg,cur) { let d=tg-cur; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2; return d; }

function burst(x,y,color,n,spd=3) {
  for (let i=0;i<n;i++) {
    const a=Math.random()*Math.PI*2, s=1+Math.random()*spd;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color,size:2+Math.random()*3});
  }
}
function smoke(x,y,big) {
  smokes.push({x,y,r:big?7:3,life:1,vy:-0.6-Math.random()*0.5,vx:(Math.random()-0.5)*0.5,grow:big?1.0:0.4});
}
function spawnExplosion(x,y,big=false) {
  explosions.push({x,y,life:1,big,ring:0});
  burst(x,y,'#ff8040',big?40:20,big?7:4);
  burst(x,y,'#ffcc60',big?20:10,big?5:3);
  smoke(x,y,big); smoke(x+5,y-5,false); smoke(x-5,y+5,false);
  shake = Math.max(shake, big?18:8);
  playExplosion(big);
}
function spawnWaveRing(x,y,color='#7fff9f') {
  particles.push({x,y,life:1,ring:true,r:4,color,type:'ring'});
}

function nearestEnemy(t) {
  let best=null, bd=Infinity;
  for (const o of tanks) {
    if (!o.alive||o.team===t.team) continue;
    if (o.hp-o.incomingDmg<=0) continue;
    const d=dist(t.x,t.y,o.x,o.y);
    if (d<bd) { bd=d; best=o; }
  }
  if (!best) {
    for (const o of tanks) {
      if (!o.alive||o.team===t.team) continue;
      const d=dist(t.x,t.y,o.x,o.y);
      if (d<bd) { bd=d; best=o; }
    }
  }
  return {e:best,d:bd};
}

// ── UPDATE ────────────────────────────────────────────────
function update() {
  if (gameOver) return;
  time++;
  if (statusTimer>0) { statusTimer--; if(statusTimer===0) document.getElementById('status-msg').classList.remove('show'); }
  if (time%60===0) { gold+=3; oil+=1; } // passive income
  if (time%300===0) updateHUD();

  // ── PLAYER FACTORY ──
  const pb = buildings.player;
  if (pb.buildQueue > 0) {
    pb.buildTimer++;
    if (pb.buildTimer >= 200) {
      pb.buildTimer=0; pb.buildQueue--;
      const nt = makeTank(pb.x, pb.y+pb.h/2+40, 'player');
      nt.spawning=40; nt.tx=pb.rallyX; nt.ty=pb.rallyY; nt.hasOrder=true;
      tanks.push(nt);
      burst(nt.x, nt.y, '#7fff9f', 16, 4);
      flashStatus('✅ Yeni tank hazır!');
    }
  }

  // ── ENEMY FACTORY ──
  const eb = buildings.enemy;
  eb.resources += 0.15;
  eb.spawnTimer++;
  const waveSize = Math.min(2+Math.floor(waveNum/2), 6);
  if (eb.spawnTimer >= Math.max(180, 360-waveNum*20) && eb.resources >= 100) {
    eb.spawnTimer=0; eb.resources-=100;
    const nt=makeTank(eb.x, eb.y-eb.h/2-40,'enemy');
    nt.tx=pb.x; nt.ty=pb.y;
    tanks.push(nt);
  }

  // ── WAVE TIMER ──
  waveTimer--;
  if (waveTimer<=0) {
    waveTimer = Math.max(280, 480-waveNum*15);
    spawnEnemyWave(waveSize);
  }

  // ── INCOMING DMG CALC ──
  tanks.forEach(t=>t.incomingDmg=0);
  bullets.forEach(b=>{
    let bd=999;let best=null;
    tanks.forEach(t=>{if(t.alive&&t.team!==b.team){const d=dist(b.x,b.y,t.x,t.y);if(d<bd&&d<60){bd=d;best=t;}}});
    if(best)best.incomingDmg+=b.dmg;
  });

  // ── TANKS ──
  const st = UNIT_STATS.tank;
  for (const t of tanks) {
    if (!t.alive) {
      if (t.deadTimer===0) wrecks.push({x:t.x,y:t.y,a:t.hullAngle,fade:1});
      t.deadTimer++; t.smokeTimer++;
      if (t.deadTimer<150 && t.smokeTimer%5===0) smoke(t.x+(Math.random()-0.5)*20, t.y-8, true);
      continue;
    }
    if (t.spawning>0) t.spawning--;
    t.idlePhase+=0.04;

    const {e:tg, d:td} = nearestEnemy(t);

    // AI targeting movement
    if (t.team==='enemy') {
      if (tg) {
        if (td>st.range*0.85) { t.tx=tg.x; t.ty=tg.y; }
        else { t.tx=t.x; t.ty=t.y; }
      } else {
        // Attack player factory
        t.tx=pb.x; t.ty=pb.y; t.hasOrder=false;
      }
    } else {
      if (t.attackMove && tg && td<=st.range) { t.tx=t.x; t.ty=t.y; }
      else if (!t.hasOrder && tg && td<=st.range) { t.tx=t.x; t.ty=t.y; }
    }

    // Hull movement
    const dx=t.tx-t.x, dy=t.ty-t.y, dd=Math.hypot(dx,dy);
    const moving = dd > st.speed+2;
    if (moving) {
      const targetH = Math.atan2(dy,dx);
      const diff = angleDiff(targetH, t.hullAngle);
      const maxV = Math.min(st.turnRate, Math.abs(diff)*0.5+0.005);
      const desired = Math.sign(diff)*maxV;
      t.hullTurnVel += (desired-t.hullTurnVel)*0.25;
      if (Math.abs(diff)<0.03) { t.hullAngle=targetH; t.hullTurnVel=0; }
      else t.hullAngle += t.hullTurnVel;
      if (Math.abs(diff)<0.2) {
        t.x+=Math.cos(t.hullAngle)*st.speed;
        t.y+=Math.sin(t.hullAngle)*st.speed;
        t.trackPhase+=0.28;
        if (time%4===0) tracks.push({x:t.x,y:t.y,a:t.hullAngle,life:1});
      }
    } else { t.hullTurnVel*=0.7; if(!t.attackMove)t.hasOrder=false; }

    // Turret tracking
    if (tg) {
      const tt = Math.atan2(tg.y-t.y, tg.x-t.x);
      const tdiff = angleDiff(tt, t.turretAngle);
      t.turretAngle += Math.sign(tdiff)*Math.min(Math.abs(tdiff), st.turretTurn);

      // Fire
      if (td<=st.range && t.fireCooldown<=0 && Math.abs(tdiff)<0.12 && t.spawning<=0) {
        const accuracy = 0.92 - Math.min(0.4,(td/st.range)*0.45);
        const willHit = Math.random()<accuracy;
        const barrelL = S.TUR_H*S.SCALE*0.42;
        const mx=t.x+Math.cos(t.turretAngle)*barrelL;
        const my=t.y+Math.sin(t.turretAngle)*barrelL;
        let aimAng=t.turretAngle;
        if(!willHit) aimAng+=(Math.random()-0.5)*0.3;
        bullets.push({x:mx,y:my,vx:Math.cos(aimAng)*st.bulletSpeed,vy:Math.sin(aimAng)*st.bulletSpeed,
                      team:t.team,dmg:st.dmg,life:120,willHit});
        burst(mx,my,'#ffd27f',6,2);
        smoke(mx,my,false);
        t.fireCooldown=st.fireRate; t.recoil=8; t.muzzle=14;
        playShoot(t.team);
      }
    } else if (moving) {
      t.turretAngle += angleDiff(t.hullAngle,t.turretAngle)*0.04;
    }
    if(t.fireCooldown>0)t.fireCooldown--;
    if(t.recoil>0)t.recoil*=0.78;
    if(t.muzzle>0)t.muzzle--;
  }

  // Separation
  for (let i=0;i<tanks.length;i++) {
    const a=tanks[i]; if(!a.alive)continue;
    for (let j=i+1;j<tanks.length;j++) {
      const b=tanks[j]; if(!b.alive)continue;
      const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy), minD=st.radius*2;
      if(d<minD&&d>0.1){const push=(minD-d)/2*1.1,nx=dx/d,ny=dy/d;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}
    }
  }
  tanks.forEach(t=>{t.x=Math.max(20,Math.min(MAP_W-20,t.x));t.y=Math.max(20,Math.min(MAP_H-20,t.y));});

  // ── BULLETS ──
  for (const b of bullets) {
    b.x+=b.vx; b.y+=b.vy; b.life--;
    // vs tanks
    for (const t of tanks) {
      if (!t.alive||t.team===b.team) continue;
      if (dist(b.x,b.y,t.x,t.y)<st.radius+5) {
        if (b.willHit) {
          t.hp-=b.dmg; burst(b.x,b.y,'#ff9d5c',10,4);
          if(t.hp<=0){t.alive=false;t.deadTimer=0;t.smokeTimer=0;spawnExplosion(t.x,t.y,true);}
        } else {
          burst(b.x,b.y,'#aaaaaa',4,2);
        }
        b.life=0; break;
      }
    }
    // vs enemy building
    if (b.team==='player' && hitBuilding(b.x,b.y,buildings.enemy)) {
      if(b.willHit){buildings.enemy.hp-=b.dmg;burst(b.x,b.y,'#ff9d5c',8,3);if(buildings.enemy.hp<=0){buildings.enemy.hp=0;spawnExplosion(buildings.enemy.x,buildings.enemy.y,true);victory=true;showVictory();}}
      b.life=0;
    }
    // vs player building
    if (b.team==='enemy' && hitBuilding(b.x,b.y,buildings.player)) {
      if(b.willHit){buildings.player.hp-=b.dmg;burst(b.x,b.y,'#ff5c3a',8,3);if(buildings.player.hp<=0){buildings.player.hp=0;spawnExplosion(buildings.player.x,buildings.player.y,true);showGameOver();}}
      b.life=0;
    }
  }
  for(let i=bullets.length-1;i>=0;i--)if(bullets[i].life<=0)bullets.splice(i,1);

  // ── PARTICLES ──
  for(const p of particles){
    if(p.type==='ring'){p.r+=3;p.life-=0.04;continue;}
    p.x+=p.vx;p.y+=p.vy;p.vx*=0.93;p.vy*=0.93;p.life-=0.028;
  }
  for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);

  for(const s of smokes){s.x+=s.vx;s.y+=s.vy;s.r+=s.grow;s.life-=0.012;}
  for(let i=smokes.length-1;i>=0;i--)if(smokes[i].life<=0)smokes.splice(i,1);

  for(const tr of tracks)tr.life-=0.005;
  for(let i=tracks.length-1;i>=0;i--)if(tracks[i].life<=0)tracks.splice(i,1);

  for(const wr of wrecks)wr.fade-=0.001;
  for(let i=wrecks.length-1;i>=0;i--)if(wrecks[i].fade<=0)wrecks.splice(i,1);

  if(shake>0)shake*=0.84;

  // ── RESOURCE UPDATE EVERY 2S ──
  if(time%120===0)updateHUD();

  // ── GAME OVER CHECK ──
  const playerAlive=tanks.filter(t=>t.alive&&t.team==='player').length;
  if(playerAlive===0 && buildings.player.hp<=0) showGameOver();
}

function showGameOver(){
  if(gameOver)return; gameOver=true;
  document.getElementById('game-over').style.display='flex';
  document.getElementById('game-over-title').textContent='YIKILDIN';
  document.getElementById('game-over-sub').textContent='Üssün düşman tarafından ele geçirildi';
}
function showVictory(){
  if(gameOver)return; gameOver=true;
  document.getElementById('game-over').style.display='flex';
  document.getElementById('game-over-title').style.color='#5ecb30';
  document.getElementById('game-over-title').textContent='ZAFER!';
  document.getElementById('game-over-sub').textContent='Düşman üssü imha edildi!';
}

// ── DRAW ─────────────────────────────────────────────────
function drawTerrain() {
  const z = cam.zoom;
  const startC = Math.max(0, Math.floor(cam.x/TILE));
  const endC = Math.min(TERRAIN_COLS-1, Math.ceil((cam.x+VW/z)/TILE));
  const startR = Math.max(0, Math.floor(cam.y/TILE));
  const endR = Math.min(TERRAIN_ROWS-1, Math.ceil((cam.y+VH/z)/TILE));

  for (let r=startR; r<=endR; r++) {
    for (let c=startC; c<=endC; c++) {
      const [sx,sy] = w2s(c*TILE, r*TILE);
      ctx.fillStyle = terrainColors[r]?.[c] || '#3d4a28';
      ctx.fillRect(Math.floor(sx), Math.floor(sy), Math.ceil(TILE*z)+1, Math.ceil(TILE*z)+1);
    }
  }

  // Ground texture overlay
  if (imgs.ground.complete) {
    const ts = 180*z;
    const offX = -(cam.x*z) % ts;
    const offY = -(cam.y*z) % ts;
    ctx.globalAlpha = 0.55;
    for (let x=offX-ts; x<VW+ts; x+=ts) {
      for (let y=offY-ts; y<VH+ts; y+=ts) {
        ctx.drawImage(imgs.ground, x, y, ts, ts);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawFeatures() {
  const z = cam.zoom;
  for (const f of terrainFeatures) {
    const [sx,sy] = w2s(f.x, f.y);
    if (sx<-60||sx>VW+60||sy<-60||sy>VH+60) continue;
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(f.rot);
    if (f.type==='rock') {
      ctx.fillStyle=f.color;
      ctx.beginPath();
      ctx.ellipse(0,0,f.size*z,f.size*0.7*z,0,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.ellipse(-f.size*z*0.2,-f.size*z*0.2,f.size*z*0.4,f.size*z*0.3,0,0,Math.PI*2);
      ctx.fill();
    } else if (f.type==='bush') {
      ctx.fillStyle=f.color;
      ctx.beginPath(); ctx.arc(0,0,f.size*z,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#1e3a12';
      ctx.beginPath(); ctx.arc(f.size*z*0.3,0,f.size*z*0.7,0,Math.PI*2); ctx.fill();
    } else if (f.type==='road') {
      ctx.fillStyle=f.color;
      ctx.fillRect(-10*z,-f.size*0.5*z,20*z,f.size*z);
    }
    ctx.restore();
  }
}

function drawBuilding(b, isEnemy) {
  const [sx,sy] = w2s(b.x, b.y);
  const z = cam.zoom;
  const fw = S.FAC_W*S.FAC_SCALE*z, fh = S.FAC_H*S.FAC_SCALE*z;

  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(sx+fh*0.08, sy+fh*0.12, fw*0.55, fh*0.18, 0, 0, Math.PI*2);
  ctx.fill();

  if (imgs.factory.complete) {
    ctx.save();
    if (isEnemy) { ctx.filter='hue-rotate(300deg) saturate(1.4) brightness(0.9)'; }
    ctx.drawImage(imgs.factory, sx-fw/2, sy-fh/2, fw, fh);
    ctx.filter='none';
    ctx.restore();
  }

  // HP bar
  const bw=fw*0.7, bh=5*z, by=sy-fh/2-10*z;
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(sx-bw/2,by,bw,bh);
  const ratio=Math.max(0,b.hp/500);
  ctx.fillStyle=ratio>0.5?'#5cff7a':ratio>0.25?'#ffd27f':'#ff5c3a';
  ctx.fillRect(sx-bw/2,by,bw*ratio,bh);

  // Team indicator
  ctx.fillStyle=isEnemy?'#ff5c5c':'#5cff7a';
  ctx.beginPath(); ctx.arc(sx,sy-fh/2-18*z,4*z,0,Math.PI*2); ctx.fill();

  // Production bar (player only)
  if (!isEnemy && b.buildQueue>0) {
    const prog=b.buildTimer/200;
    ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(sx-bw/2,by-8*z,bw,5*z);
    ctx.fillStyle='#cfffaf'; ctx.fillRect(sx-bw/2,by-8*z,bw*prog,5*z);
    ctx.fillStyle='#cfffaf'; ctx.font=`${10*z}px Share Tech Mono,monospace`;
    ctx.textAlign='center';
    ctx.fillText(`⚙️ ${b.buildQueue}`, sx, by-10*z);
  }

  // Selection outline
  if (b.selected) {
    ctx.strokeStyle='#7fff9f'; ctx.lineWidth=2*z;
    ctx.setLineDash([8,5]);
    ctx.strokeRect(sx-fw/2,sy-fh/2,fw,fh);
    ctx.setLineDash([]);
    // Rally line
    const [rx,ry]=w2s(b.rallyX,b.rallyY);
    ctx.strokeStyle='rgba(127,255,159,0.45)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(rx,ry); ctx.stroke();
    ctx.fillStyle='#7fff9f'; ctx.beginPath(); ctx.arc(rx,ry,5*z,0,Math.PI*2); ctx.fill();
  }
}

function drawHullTurret(sx,sy,hullAngle,turretAngle,opts={}) {
  const z=cam.zoom;
  const enemy=opts.team==='enemy';
  const hImg=enemy?imgs.ehull:imgs.hull, tImg=enemy?imgs.eturret:imgs.turret;
  const HW=enemy?S.EHULL_W:S.HULL_W, HH=enemy?S.EHULL_H:S.HULL_H;
  const TW=enemy?S.ETUR_W:S.TUR_W, TH=enemy?S.ETUR_H:S.TUR_H;
  const tpx=enemy?S.ETPX:S.TPX, tpy=enemy?S.ETPY:S.TPY;
  const hw=HW*S.SCALE*z, hh=HH*S.SCALE*z;
  const tw=TW*S.SCALE*z, th=TH*S.SCALE*z;
  const {dark=false,recoil=0,idle=0,muzzle=0,alpha=1}=opts;

  ctx.save(); ctx.translate(sx,sy);
  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0,0,hw*0.45,hh*0.38,0,0,Math.PI*2); ctx.fill();

  ctx.globalAlpha=alpha;

  // Hull
  ctx.save(); ctx.rotate(hullAngle+Math.PI/2); ctx.translate(0,idle);
  if(dark)ctx.filter='brightness(0.25) saturate(0.3)';
  if(hImg.complete)ctx.drawImage(hImg,-hw/2,-hh/2,hw,hh);
  ctx.filter='none'; ctx.restore();

  // Turret
  ctx.save(); ctx.rotate(turretAngle+Math.PI/2); ctx.translate(0,idle);
  const offX=(0.5-tpx)*tw, offY=(0.5-tpy)*th;
  if(dark)ctx.filter='brightness(0.25) saturate(0.3)';
  if(tImg.complete)ctx.drawImage(tImg,-tw/2+offX,-th/2+offY-recoil*z,tw,th);
  ctx.filter='none';

  // Muzzle flash
  if(muzzle>0){
    const prog=1-muzzle/14;
    ctx.save(); ctx.translate(offX,-th*0.5+offY-recoil*z);
    if(prog<0.5){
      const s=prog/0.5; const sz=(8+26*s)*z;
      const grd=ctx.createRadialGradient(0,-th*0.1,0,0,-th*0.1,sz);
      grd.addColorStop(0,`rgba(255,255,220,${1-s*0.3})`);
      grd.addColorStop(0.3,`rgba(255,200,80,${0.85-s*0.4})`);
      grd.addColorStop(1,'rgba(200,60,10,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(0,-th*0.1,sz,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha=1; ctx.restore();
}

function drawTank(t) {
  const [sx,sy]=w2s(t.x,t.y);
  const z=cam.zoom;
  const isEnemy=t.team==='enemy';
  const hh=S.HULL_H*S.SCALE*z;
  const idle=t.alive?Math.sin(t.idlePhase*4)*0.1*z:0;
  const alpha=t.spawning>0?(0.4+0.6*(1-t.spawning/40)):1;

  drawHullTurret(sx,sy,t.hullAngle,t.turretAngle,{recoil:t.recoil,idle,muzzle:t.muzzle,alpha,team:t.team});

  // Selection ring
  if(t.selected){
    const r=hh*0.44+Math.sin(time*0.12)*2.5*z;
    ctx.strokeStyle='#7fff9f'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(sx,sy,r,0,Math.PI*2); ctx.stroke();
    // Range ring
    ctx.strokeStyle='rgba(127,255,100,0.07)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(sx,sy,UNIT_STATS.tank.range*z,0,Math.PI*2); ctx.stroke();
  }

  // Team dot
  ctx.fillStyle=isEnemy?'#ff5c5c':'#5cff7a';
  ctx.beginPath(); ctx.arc(sx,sy-hh*0.45,3*z,0,Math.PI*2); ctx.fill();

  // HP bar
  const bw=38*z, bh=4*z, by=sy-hh*0.42-8*z;
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(sx-bw/2,by,bw,bh);
  const r=Math.max(0,t.hp/t.maxHp);
  ctx.fillStyle=r>0.5?'#5cff7a':r>0.25?'#ffd27f':'#ff5c3a';
  ctx.fillRect(sx-bw/2,by,bw*r,bh);
}

function drawWrecks() {
  for (const wr of wrecks) {
    const [x,y]=w2s(wr.x,wr.y);
    ctx.globalAlpha=Math.min(1,wr.fade)*0.35;
    ctx.fillStyle='#1a160f';
    ctx.beginPath(); ctx.ellipse(x,y,S.HULL_W*S.SCALE*cam.zoom*0.44,S.HULL_H*S.SCALE*cam.zoom*0.38,0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    drawHullTurret(x,y,wr.a,wr.a,{dark:true,alpha:Math.min(1,wr.fade)*0.7});
  }
}

function draw() {
  ctx.save();
  if (shake>0.2) ctx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);

  const z=cam.zoom;

  // Background
  ctx.fillStyle='#2a3018'; ctx.fillRect(0,0,VW,VH);

  // Terrain
  drawTerrain();
  drawFeatures();

  // Map border
  const [bx,by]=w2s(0,0);
  ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=3;
  ctx.strokeRect(bx,by,MAP_W*z,MAP_H*z);

  // Tracks
  for(const tr of tracks){
    const[x,y]=w2s(tr.x,tr.y);
    ctx.save(); ctx.translate(x,y); ctx.rotate(tr.a+Math.PI/2);
    ctx.fillStyle=`rgba(18,14,8,${tr.life*0.2})`;
    ctx.fillRect(-17*z,-3*z,5*z,6*z);
    ctx.fillRect(12*z,-3*z,5*z,6*z);
    ctx.restore();
  }

  // Buildings
  drawBuilding(buildings.player, false);
  drawBuilding(buildings.enemy, true);

  // Wrecks
  drawWrecks();

  // Sorted tanks (y-sort for depth)
  const sorted=[...tanks].sort((a,b)=>a.y-b.y);
  for(const t of sorted)drawTank(t);

  // Bullets
  for(const b of bullets){
    const[x,y]=w2s(b.x,b.y);
    const col=b.team==='player'?'#d0ff80':'#ffae6c';
    ctx.fillStyle=col;
    ctx.fillRect(x-3*z,y-3*z,6*z,6*z);
    ctx.strokeStyle=b.team==='player'?'rgba(200,255,120,0.4)':'rgba(255,174,108,0.4)';
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-b.vx*z*1.5,y-b.vy*z*1.5); ctx.stroke();
  }

  // Smokes
  for(const s of smokes){
    const[x,y]=w2s(s.x,s.y);
    ctx.globalAlpha=s.life*0.38;
    ctx.fillStyle='#404040';
    ctx.beginPath(); ctx.arc(x,y,s.r*z,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;

  // Particles
  for(const p of particles){
    const[x,y]=w2s(p.x,p.y);
    if(p.type==='ring'){
      ctx.strokeStyle=p.color.replace(')',`,${p.life})`).replace('rgb','rgba');
      ctx.strokeStyle=p.color; ctx.globalAlpha=p.life;
      ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,p.r*z,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=1; continue;
    }
    ctx.globalAlpha=p.life;
    ctx.fillStyle=p.color;
    ctx.fillRect(x-p.size/2*z,y-p.size/2*z,p.size*z,p.size*z);
  }
  ctx.globalAlpha=1;

  // Selection box
  if(selBox&&didDrag){
    const x=Math.min(selBox.x0,selBox.x1),y=Math.min(selBox.y0,selBox.y1);
    const w=Math.abs(selBox.x1-selBox.x0),h=Math.abs(selBox.y1-selBox.y0);
    ctx.strokeStyle='#7fff9f'; ctx.lineWidth=1.5; ctx.setLineDash([6,4]);
    ctx.strokeRect(x,y,w,h); ctx.setLineDash([]);
    ctx.fillStyle='rgba(127,255,159,0.06)'; ctx.fillRect(x,y,w,h);
  }

  // Attack move cursor hint
  if(attackMoveMode){
    ctx.fillStyle='rgba(255,120,50,0.15)'; ctx.fillRect(0,0,VW,VH);
  }

  ctx.restore();

  drawMinimap();
}

function drawMinimap() {
  const mw=130, mh=90;
  mmCtx.fillStyle='rgba(18,26,14,0.95)';
  mmCtx.fillRect(0,0,mw,mh);
  // terrain hint
  mmCtx.fillStyle='#3a4a22'; mmCtx.fillRect(0,0,mw,mh);

  const sx=mw/MAP_W, sy=mh/MAP_H;
  // Buildings
  mmCtx.fillStyle='#5cff7a'; mmCtx.fillRect(buildings.player.x*sx-3,buildings.player.y*sy-3,6,6);
  mmCtx.fillStyle='#ff5c5c'; mmCtx.fillRect(buildings.enemy.x*sx-3,buildings.enemy.y*sy-3,6,6);
  // Units
  for(const t of tanks){
    if(!t.alive)continue;
    mmCtx.fillStyle=t.team==='player'?'#5cff7a':'#ff5c5c';
    mmCtx.fillRect(t.x*sx-1.5,t.y*sy-1.5,3,3);
  }
  // Camera viewport
  mmCtx.strokeStyle='rgba(255,255,255,0.65)'; mmCtx.lineWidth=1;
  mmCtx.strokeRect(cam.x*sx,cam.y*sy,(VW/cam.zoom)*sx,(VH/cam.zoom)*sy);
}

// ── MAIN LOOP ─────────────────────────────────────────────
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ── BOOT ─────────────────────────────────────────────────
generateTerrain();
generateFeatures();
loadImages(() => {
  setup();
  loop();
});
