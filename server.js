// ════════════════════════════════════════════════════════════
//  ZombieWave V5 – Server
//  Express + Socket.io + MongoDB
// ════════════════════════════════════════════════════════════
require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_prod';
const MONGO_URI  = process.env.MONGODB_URI || '';

// ── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB Models ───────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  username:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:  { type: String, required: true },
  coins:         { type: Number, default: 0 },
  weapons:       { type: [String], default: ['pistol'] },
  perma:         { type: Object, default: { hp:0, speed:0, dmg:0, reload:0, mag:0 } },
  kunaiCountLvl: { type: Number, default: 0 },
  kunaiSpeedLvl: { type: Number, default: 0 },
  guardianShopLvl:{ type: Number, default: 0 },
  firstPlay:     { type: Boolean, default: true },
  createdAt:     { type: Date, default: Date.now },
  friends:       { type: [String], default: [] },          // accepted friends (lowercase usernames)
  friendRequests:{ type: [String], default: [] },          // incoming requests
  sentRequests:  { type: [String], default: [] },           // outgoing (to avoid duplicates)
  banned:        { type: Boolean, default: false },           // banned by owner
  isAdmin:       { type: Boolean, default: false },           // granted admin panel by owner
});
const User = mongoose.model('User', UserSchema);

const ScoreSchema = new mongoose.Schema({
  player:    { type: String, required: true },
  time:      String,
  secs:      Number,
  kills:     Number,
  wave:      Number,
  diff:      String,
  mode:      { type: String, default: 'solo' },   // 'solo' | 'coop' | 'versus'
  date:      { type: String, default: ()=>new Date().toLocaleDateString('de-DE') },
  createdAt: { type: Date, default: Date.now },
});
const Score = mongoose.model('Score', ScoreSchema);

// ── Auth helpers ─────────────────────────────────────────────
function signToken(userId, username) {
  return jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}
function authMiddleware(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Nicht autorisiert' });
  req.user = decoded;
  next();
}

// ── REST API ─────────────────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || username.length < 3 || username.length > 16)
      return res.status(400).json({ error: 'Benutzername: 3–16 Zeichen.' });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res.status(400).json({ error: 'Nur Buchstaben, Zahlen, Unterstrich.' });
    if (!password || password.length < 4)
      return res.status(400).json({ error: 'Passwort: mind. 4 Zeichen.' });

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ error: 'Benutzername bereits vergeben.' });

    const hash = await bcrypt.hash(password, 10);

    // Admin special case
    const isAdmin = ['adminmaik','mrmaik'].includes(username.toLowerCase());
    const user = await User.create({
      username: username.toLowerCase(),
      passwordHash: hash,
      coins: isAdmin ? 999999 : 0,
      weapons: isAdmin
        ? ['pistol','rifle','shotgun','kunai','sniper','rpg','molotov','minigun']
        : ['pistol'],
    });

    const token = signToken(user._id, username);
    res.json({ token, user: sanitizeUser(user) });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Falscher Benutzername oder Passwort.' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Falscher Benutzername oder Passwort.' });
    if (user.banned) return res.status(403).json({ error: '🚫 Dein Account wurde gesperrt.' });
    const token = signToken(user._id, username);
    res.json({ token, user: sanitizeUser(user) });
  } catch (e) {
    res.status(500).json({ error: 'Serverfehler: ' + e.message });
  }
});

// Get own profile
app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden.' });
  res.json(sanitizeUser(user));
});

// Save profile (coins, weapons, perma upgrades etc.)
app.put('/api/me', authMiddleware, async (req, res) => {
  try {
    const allowed = ['coins','weapons','perma','kunaiCountLvl','kunaiSpeedLvl','guardianShopLvl','firstPlay'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    // Admin can never lose their coins/weapons via normal save
    if (req.user.username.toLowerCase() === 'adminmaik') {
      if (update.coins !== undefined) update.coins = Math.max(update.coins, 999999);
    }

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json(sanitizeUser(user));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Submit score
app.post('/api/scores', authMiddleware, async (req, res) => {
  try {
    const { time, secs, kills, wave, diff, mode } = req.body;
    await Score.create({ player: req.user.username, time, secs, kills, wave, diff, mode });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get global leaderboard
app.get('/api/scores', async (req, res) => {
  try {
    const { diff, sort='secs', limit=50 } = req.query;
    const query = diff && diff !== 'all' ? { diff } : {};
    const sortField = ['secs','kills','wave'].includes(sort) ? sort : 'secs';
    const scores = await Score.find(query)
      .sort({ [sortField]: -1 })
      .limit(parseInt(limit))
      .lean();
    // Convert _id to string so client can use it for deletion
    res.json(scores.map(s => ({ ...s, _id: s._id.toString() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get own scores
app.get('/api/scores/me', authMiddleware, async (req, res) => {
  try {
    const { diff } = req.query;
    const query = { player: req.user.username };
    if (diff && diff !== 'all') query.diff = diff;
    const scores = await Score.find(query).sort({ secs: -1 }).limit(50).lean();
    res.json(scores);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: reset ALL players (except MrMaik) and rename admin
app.post('/api/admin/reset-all', authMiddleware, async (req, res) => {
  if (req.user.username.toLowerCase() !== 'mrmaik' &&
      req.user.username.toLowerCase() !== 'adminmaik') {
    return res.status(403).json({ error: 'Nur Admin erlaubt.' });
  }
  try {
    const defaultData = {
      coins: 0,
      weapons: ['pistol'],
      perma: { hp:0, speed:0, dmg:0, reload:0, mag:0 },
      kunaiCountLvl: 0,
      kunaiSpeedLvl: 0,
      guardianShopLvl: 0,
      friends: [],
      friendRequests: [],
      sentRequests: [],
    };
    const result = await User.updateMany(
      { username: { $nin: ['mrmaik', 'adminmaik'] } },
      { $set: defaultData }
    );
    // Also delete all scores for non-admin users
    await Score.deleteMany({ player: { $nin: ['mrmaik', 'adminmaik'] } });
    res.json({ ok: true, modified: result.modifiedCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: rename self from AdminMaik to MrMaik
app.post('/api/admin/rename', authMiddleware, async (req, res) => {
  if (req.user.username.toLowerCase() !== 'adminmaik' &&
      req.user.username.toLowerCase() !== 'mrmaik') {
    return res.status(403).json({ error: 'Nur Admin erlaubt.' });
  }
  try {
    const oldName = req.user.username.toLowerCase();
    await User.findByIdAndUpdate(req.user.id, { username: 'mrmaik' });
    await Score.updateMany({ player: oldName }, { player: 'mrmaik' });
    res.json({ ok: true, newName: 'mrmaik' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Owner: grant/revoke admin to a user
app.post('/api/admin/grant', authMiddleware, async (req, res) => {
  if (!isOwner(req.user.username)) return res.status(403).json({ error: 'Nur Owner.' });
  const { username, grant } = req.body;
  const target = await User.findOne({ username: username.toLowerCase() });
  if (!target) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
  if (isOwner(target.username)) return res.status(400).json({ error: 'Owner kann nicht geändert werden.' });
  await User.findByIdAndUpdate(target._id, { isAdmin: !!grant });
  res.json({ ok: true, username: target.username, isAdmin: !!grant });
});

// Owner: ban/unban a user
app.post('/api/admin/ban', authMiddleware, async (req, res) => {
  if (!isOwner(req.user.username)) return res.status(403).json({ error: 'Nur Owner.' });
  const { username, ban } = req.body;
  const target = await User.findOne({ username: username.toLowerCase() });
  if (!target) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
  if (isOwner(target.username)) return res.status(400).json({ error: 'Owner kann nicht gebannt werden.' });
  await User.findByIdAndUpdate(target._id, { banned: !!ban });
  // Kick banned user if online
  if (ban) {
    for (const [sid, uname] of onlineUsers) {
      if (uname === target.username.toLowerCase()) {
        io.to(sid).emit('banned', { reason: 'Du wurdest vom Owner gesperrt.' });
        break;
      }
    }
  }
  res.json({ ok: true, username: target.username, banned: !!ban });
});

// Owner: delete a user account
app.delete('/api/admin/user/:username', authMiddleware, async (req, res) => {
  if (!isOwner(req.user.username)) return res.status(403).json({ error: 'Nur Owner.' });
  const uname = req.params.username.toLowerCase();
  if (isOwner(uname)) return res.status(400).json({ error: 'Owner-Account kann nicht gelöscht werden.' });
  try {
    const user = await User.findOneAndDelete({ username: uname });
    if (!user) return res.status(404).json({ error: 'Spieler nicht gefunden.' });
    await Score.deleteMany({ player: uname });
    // Kick if online
    for (const [sid, u] of onlineUsers) {
      if (u === uname) { io.to(sid).emit('banned', { reason: 'Dein Account wurde gelöscht.' }); break; }
    }
    res.json({ ok: true, deleted: uname });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Owner: delete a specific score entry by its _id
app.delete('/api/admin/score/:id', authMiddleware, async (req, res) => {
  if (!isOwner(req.user.username)) return res.status(403).json({ error: 'Nur Owner.' });
  try {
    await Score.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Owner: delete all scores for a player
app.delete('/api/admin/scores/:username', authMiddleware, async (req, res) => {
  if (!isOwner(req.user.username)) return res.status(403).json({ error: 'Nur Owner.' });
  try {
    const result = await Score.deleteMany({ player: req.params.username.toLowerCase() });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Owner: change own password
app.post('/api/me/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4)
      return res.status(400).json({ error: 'Neues Passwort: mind. 4 Zeichen.' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden.' });
    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Altes Passwort falsch.' });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function sanitizeUser(user) {
  const u = user.toObject ? user.toObject() : user;
  delete u.passwordHash;
  delete u.__v;
  return u;
}


// Owner account (MrMaik) – has all powers
const OWNER_NAMES = ['mrmaik'];
function isOwner(username) { return OWNER_NAMES.includes((username||'').toLowerCase()); }
function isAdminUser(username) { return isOwner(username); } // legacy alias

// ── Online user tracking ─────────────────────────────────────
const onlineUsers = new Map(); // socketId -> username (lowercase)

// ── Friends REST API ──────────────────────────────────────────

// Get friends list + incoming requests
app.get('/api/friends', authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).lean();
    if (!me) return res.status(404).json({ error: 'User not found' });

    const friends = await Promise.all((me.friends || []).map(async uname => {
      const isOnline = [...onlineUsers.values()].includes(uname);
      return { username: uname, status: isOnline ? 'online' : 'offline' };
    }));

    const incoming = (me.friendRequests || []).map(uname => ({ from: uname }));
    res.json({ friends, incoming });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Send friend request
app.post('/api/friends/request', authMiddleware, async (req, res) => {
  try {
    const { to } = req.body;
    const toName = (to || '').toLowerCase().trim();
    const myName = req.user.username.toLowerCase();
    if (!toName) return res.status(400).json({ error: 'Benutzername fehlt.' });
    if (toName === myName) return res.status(400).json({ error: 'Kannst dir nicht selbst eine Anfrage senden.' });

    const target = await User.findOne({ username: toName });
    if (!target) return res.status(404).json({ error: 'Spieler nicht gefunden.' });

    const me = await User.findById(req.user.id);
    if ((me.friends || []).includes(toName)) return res.status(400).json({ error: 'Bereits befreundet.' });
    if ((me.sentRequests || []).includes(toName)) return res.status(400).json({ error: 'Anfrage bereits gesendet.' });
    if ((target.friendRequests || []).includes(myName)) return res.status(400).json({ error: 'Anfrage bereits gesendet.' });

    // Add to target's incoming and my sent
    await User.findByIdAndUpdate(target._id, { $addToSet: { friendRequests: myName } });
    await User.findByIdAndUpdate(req.user.id,  { $addToSet: { sentRequests: toName } });

    // Notify target via socket if online
    for (const [sid, uname] of onlineUsers) {
      if (uname === toName) {
        io.to(sid).emit('friend:request', { from: req.user.username });
        break;
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Accept or decline friend request
app.post('/api/friends/respond', authMiddleware, async (req, res) => {
  try {
    const { from, accept } = req.body;
    const fromName = (from || '').toLowerCase();
    const myName = req.user.username.toLowerCase();

    const me = await User.findById(req.user.id);
    if (!(me.friendRequests || []).includes(fromName))
      return res.status(400).json({ error: 'Keine Anfrage von diesem Spieler.' });

    // Remove from my requests
    await User.findByIdAndUpdate(req.user.id, { $pull: { friendRequests: fromName } });
    // Remove from their sent
    await User.findOneAndUpdate({ username: fromName }, { $pull: { sentRequests: myName } });

    if (accept) {
      await User.findByIdAndUpdate(req.user.id, { $addToSet: { friends: fromName } });
      await User.findOneAndUpdate({ username: fromName }, { $addToSet: { friends: myName } });
      // Notify both
      for (const [sid, uname] of onlineUsers) {
        if (uname === fromName) { io.to(sid).emit('friend:accepted', { by: req.user.username }); break; }
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Remove friend
app.delete('/api/friends/:username', authMiddleware, async (req, res) => {
  try {
    const target = req.params.username.toLowerCase();
    const myName = req.user.username.toLowerCase();
    await User.findByIdAndUpdate(req.user.id, { $pull: { friends: target } });
    await User.findOneAndUpdate({ username: target }, { $pull: { friends: myName } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── In-memory Party state ─────────────────────────────────────
//  parties: Map<code, PartyState>
const parties = new Map();

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function makeParty(leaderSocket, leaderName, mode, diff, level=1) {
  let code;
  do { code = generateCode(); } while (parties.has(code));
  const party = {
    code,
    leader: leaderSocket.id,
    leaderName,
    mode,        // 'coop' | 'versus'
    level: level || 1,
    diff,
    state: 'lobby',   // 'lobby' | 'ingame' | 'ended'
    members: [{
      socketId: leaderSocket.id,
      username: leaderName,
      ready: false,
      x: 400, y: 300,
      hp: 100, kills: 0,
    }],
    enemies: [],       // server-authoritative enemy list
    nextEnemyId: 1,
    tick: 0,
    spawnCd: 150,
    waveTimer: 0,
    wave: 1,
    bossActive: false,
    boss: null,
    bossTimer: 0,
    bossWarn: false,
    gameTime: 0,
    startedAt: null,
    gameInterval: null,
  };
  parties.set(code, party);
  return party;
}

function partyOf(socketId) {
  for (const [, p] of parties) {
    if (p.members.some(m => m.socketId === socketId)) return p;
  }
  return null;
}

function removeMember(socketId) {
  const party = partyOf(socketId);
  if (!party) return;
  party.members = party.members.filter(m => m.socketId !== socketId);
  if (party.members.length === 0) {
    stopPartyGame(party);
    parties.delete(party.code);
  } else if (party.leader === socketId) {
    party.leader = party.members[0].socketId;
    party.leaderName = party.members[0].username;
    io.to(party.code).emit('party:update', partyPublic(party));
    io.to(party.code).emit('party:leaderChanged', { newLeader: party.leaderName });
  } else {
    io.to(party.code).emit('party:update', partyPublic(party));
  }
}

function partyPublic(party) {
  return {
    code: party.code,
    leader: party.leaderName,
    mode: party.mode,
    diff: party.diff,
    level: party.level || 1,
    state: party.state,
    members: party.members.map(m => ({
      username: m.username,
      ready: m.ready,
      isLeader: m.socketId === party.leader,
    })),
  };
}

// ── Server-side game simulation (authoritative enemy positions) ─
const DIFF_CFG = {
  easy:      { spawnBase: 220, spawnMin: 80,  waveSize: [4,7],   speedMul: 0.7,  bossHpMul: 0.7  },
  normal:    { spawnBase: 160, spawnMin: 55,  waveSize: [5,9],   speedMul: 0.85, bossHpMul: 1.0  },
  hard:      { spawnBase: 110, spawnMin: 35,  waveSize: [7,11],  speedMul: 1.0,  bossHpMul: 1.4  },
  nightmare: { spawnBase: 70,  spawnMin: 20,  waveSize: [9,14],  speedMul: 1.2,  bossHpMul: 2.0  },
};

function avgPos(party) {
  if (!party.members.length) return { x: 400, y: 300 };
  const ax = party.members.reduce((s,m)=>s+m.x,0)/party.members.length;
  const ay = party.members.reduce((s,m)=>s+m.y,0)/party.members.length;
  return { x: ax, y: ay };
}

function spawnAdminBoss(party) {
  const cfg = DIFF_CFG[party.diff] || DIFF_CFG.normal;
  const center = avgPos(party);
  const side = Math.floor(Math.random()*4), off = 400;
  let x, y;
  if(side===0){x=center.x;y=center.y-off;}else if(side===1){x=center.x+off;y=center.y;}
  else if(side===2){x=center.x;y=center.y+off;}else{x=center.x-off;y=center.y;}
  const hp = Math.round((800 + party.wave*150) * cfg.bossHpMul);
  const boss = { id:'boss_'+Date.now(), x, y, hp, maxHp:hp, speed:0.85*cfg.speedMul, size:52, dmg:22, isBoss:true, slamCd:300 };
  party.bossActive = true;
  party.boss = boss;
  return boss;
}

function spawnEnemy(party, boss=false) {
  const cfg = DIFF_CFG[party.diff] || DIFF_CFG.normal;
  const center = avgPos(party);
  const side = Math.floor(Math.random()*4);
  const off = 380;
  let x, y;
  if (side===0){x=center.x+Math.random()*off*2-off;y=center.y-off;}
  else if(side===1){x=center.x+off;y=center.y+Math.random()*off*2-off;}
  else if(side===2){x=center.x+Math.random()*off*2-off;y=center.y+off;}
  else{x=center.x-off;y=center.y+Math.random()*off*2-off;}

  if (boss) {
    const hp = Math.round((800 + party.wave*150)*cfg.bossHpMul);  // doubled HP
    return { id:'boss', x, y, hp, maxHp:hp, speed:0.85*cfg.speedMul, size:52, dmg:22, isBoss:true, slamCd:300 };
  }
  const wave = party.wave;
  const types = [
    { type:'a', speed:(1.2+wave*.03)*cfg.speedMul, hp:28+wave*4, size:18, dmg:8  },
    { type:'b', speed:(1.7+wave*.06)*cfg.speedMul, hp:14+wave*2, size:14, dmg:5  },
    { type:'c', speed:(.65+wave*.02)*cfg.speedMul, hp:85+wave*10,size:22, dmg:16 },
  ];
  const t = types[Math.floor(Math.random()*(wave<3?2:3))];
  return { id: party.nextEnemyId++, x, y, ...t, maxHp:t.hp, attackCd:0 };
}

function startPartyGame(party) {
  party.state = 'ingame';
  party.startedAt = Date.now();
  party.tick = 0;
  party.enemies = [];
  party.bossTimer = 0;
  party.wave = 1;
  party.waveTimer = 0;
  party.spawnCd = DIFF_CFG[party.diff]?.spawnBase || 160;
  party.gameTime = 0;

  // reset member stats
  party.members.forEach(m => { m.hp = 100; m.kills = 0; m.alive = true; });

  // Broadcast to all sockets in this party room
  io.to(party.code).emit('game:start', { mode: party.mode, diff: party.diff, level: party.level || 1 });
  // Also emit directly to each member socket as fallback
  party.members.forEach(m => {
    io.to(m.socketId).emit('game:start', { mode: party.mode, diff: party.diff, level: party.level || 1 });
  });

  const TICK_MS = 50; // 20 ticks/sec
  party.gameInterval = setInterval(() => tickPartyGame(party), TICK_MS);
}

function stopPartyGame(party) {
  if (party.gameInterval) { clearInterval(party.gameInterval); party.gameInterval = null; }
  party.state = 'ended';
}

function tickPartyGame(party) {
  if (!party.members.length) { stopPartyGame(party); return; }
  party.tick++;
  party.gameTime++;
  party.bossTimer++;

  const cfg = DIFF_CFG[party.diff] || DIFF_CFG.normal;
  const aliveMembers = party.members.filter(m => m.alive !== false);

  // Enemy spawn
  if (!party.bossActive) {
    party.spawnCd--;
    if (party.spawnCd <= 0) {
      const [mn, mx] = cfg.waveSize;
      const count = mn + Math.floor(Math.random()*(mx-mn+1));
      // Coop: scale with player count
      const scale = party.mode === 'coop' ? aliveMembers.length : 1;
      for (let i = 0; i < count*scale; i++) {
        party.enemies.push(spawnEnemy(party));
      }
      party.spawnCd = Math.max(cfg.spawnMin, (DIFF_CFG[party.diff]?.spawnBase||160) - party.wave*3);
    }
  }

  // Boss every 5 min (6000 ticks at 20/sec)
  if (!party.bossActive && party.bossTimer >= 1200) {  // 1 minute at 20 ticks/sec
    party.bossTimer = 0;
    party.bossWarn = true;
    io.to(party.code).emit('game:bossWarning');
    setTimeout(() => {
      if (party.state !== 'ingame') return;
      party.boss = spawnEnemy(party, true);
      party.bossActive = true;
      party.bossWarn = false;
      io.to(party.code).emit('game:bossSpawned', party.boss);
    }, 3000);
  }

  // Move enemies toward nearest alive member
  party.enemies.forEach(e => {
    if (!aliveMembers.length) return;
    let best = aliveMembers[0], bd = Infinity;
    aliveMembers.forEach(m => {
      const d = (e.x-m.x)**2 + (e.y-m.y)**2;
      if (d < bd) { bd = d; best = m; }
    });
    const dist = Math.sqrt(bd);
    if (dist > 2) { e.x += (best.x-e.x)/dist * e.speed; e.y += (best.y-e.y)/dist * e.speed; }

    // Attack
    if (dist < e.size + 14) {
      e.attackCd = (e.attackCd||0) - 1;
      if (e.attackCd <= 0) {
        e.attackCd = 60;
        best.hp = Math.max(0, (best.hp||100) - e.dmg);
        io.to(party.code).emit('game:playerDamaged', { username: best.username, hp: best.hp });
        if (best.hp <= 0) {
          best.alive = false;
          io.to(party.code).emit('game:playerDied', { username: best.username });
        }
      }
    }
  });

  // Move boss
  if (party.bossActive && party.boss) {
    const b = party.boss;
    if (aliveMembers.length) {
      let best = aliveMembers[0], bd = Infinity;
      aliveMembers.forEach(m => { const d=(b.x-m.x)**2+(b.y-m.y)**2; if(d<bd){bd=d;best=m;} });
      const dist = Math.sqrt(bd);
      if (dist > 2) { b.x += (best.x-b.x)/dist*b.speed; b.y += (best.y-b.y)/dist*b.speed; }
      if (dist < b.size+18) {
        b.attackCd = (b.attackCd||0)-1;
        if (b.attackCd<=0) { b.attackCd=80; best.hp=Math.max(0,(best.hp||100)-b.dmg); io.to(party.code).emit('game:playerDamaged',{username:best.username,hp:best.hp}); }
      }
      // Boss slam AOE
      b.slamCd = (b.slamCd||300)-1;
      if (b.slamCd<=0 && dist<200) {
        b.slamCd=300;
        io.to(party.code).emit('game:bossSlam',{x:b.x,y:b.y,r:130});
        setTimeout(()=>{
          if(!party.bossActive) return;
          aliveMembers.forEach(m=>{
            if((m.x-b.x)**2+(m.y-b.y)**2<130**2){
              m.hp=Math.max(0,(m.hp||100)-38);
              io.to(party.code).emit('game:playerDamaged',{username:m.username,hp:m.hp});
            }
          });
        },500);
      }
    }
  }

  // Wave timer (every 2 min = 2400 ticks)
  party.waveTimer++;
  if (party.waveTimer >= 2400) { party.waveTimer=0; party.wave++; io.to(party.code).emit('game:newWave',{wave:party.wave}); }

  // Broadcast compact state update (every tick)
  const snapshot = {
    enemies: party.enemies.map(e=>({id:e.id,x:Math.round(e.x),y:Math.round(e.y),hp:e.hp,maxHp:e.maxHp})),
    boss: party.bossActive && party.boss ? {x:Math.round(party.boss.x),y:Math.round(party.boss.y),hp:party.boss.hp,maxHp:party.boss.maxHp} : null,
    members: party.members.map(m=>({username:m.username,x:Math.round(m.x),y:Math.round(m.y),hp:m.hp,kills:m.kills,alive:m.alive!==false})),
    wave: party.wave,
    gameTime: party.gameTime,
  };
  io.to(party.code).emit('game:tick', snapshot);

  // Check game over
  const allDead = party.members.length > 0 && party.members.every(m => m.alive === false);
  if (allDead) {
    endPartyGame(party, 'all_dead');
  }
}

function endPartyGame(party, reason) {
  stopPartyGame(party);
  const results = party.members.map(m => ({
    username: m.username,
    kills: m.kills || 0,
    alive: m.alive !== false,
  }));
  io.to(party.code).emit('game:over', {
    reason,
    results,
    wave: party.wave,
    gameTime: party.gameTime,
  });
}

// ── Socket.io ────────────────────────────────────────────────
io.on('connection', socket => {
  let socketUser = null; // { id, username }

  // Authenticate socket with JWT
  socket.on('auth', (token) => {
    const decoded = verifyToken(token);
    if (decoded) {
      socketUser = { id: decoded.id, username: decoded.username };
      onlineUsers.set(socket.id, decoded.username.toLowerCase());
      socket.emit('auth:ok', { username: socketUser.username });
      // Notify friends that this user is online
      io.emit('friend:online', { username: decoded.username });
    } else {
      socket.emit('auth:error', 'Ungültiges Token.');
    }
  });

  // ── PARTY EVENTS ──────────────────────────────────────────
  socket.on('party:create', ({ mode, diff, level }) => {
    if (!socketUser) return socket.emit('error', 'Nicht eingeloggt.');
    const existing = partyOf(socket.id);
    if (existing) removeMember(socket.id);

    const party = makeParty(socket, socketUser.username, mode || 'coop', diff || 'normal', data.level || 1);
    socket.join(party.code);
    socket.emit('party:created', { code: party.code, party: partyPublic(party) });
  });

  socket.on('party:join', (code) => {
    if (!socketUser) return socket.emit('error', 'Nicht eingeloggt.');
    const party = parties.get(code?.toUpperCase());
    if (!party) return socket.emit('party:joinError', 'Party nicht gefunden.');
    if (party.state !== 'lobby') return socket.emit('party:joinError', 'Party läuft bereits.');
    if (party.members.length >= 4) return socket.emit('party:joinError', 'Party ist voll (max. 4).');

    const existing = partyOf(socket.id);
    if (existing) removeMember(socket.id);

    party.members.push({ socketId: socket.id, username: socketUser.username, ready: false, x:400, y:300, hp:100, kills:0, alive:true });
    socket.join(party.code);
    socket.emit('party:joined', { code: party.code, party: partyPublic(party) });
    io.to(party.code).emit('party:update', partyPublic(party));
    io.to(party.code).emit('party:memberJoined', { username: socketUser.username });
  });

  socket.on('party:leave', () => {
    const party = partyOf(socket.id);
    if (!party) return;
    socket.leave(party.code);
    io.to(party.code).emit('party:memberLeft', { username: socketUser?.username });
    removeMember(socket.id);
    socket.emit('party:left');
  });

  socket.on('party:ready', (isReady) => {
    const party = partyOf(socket.id);
    if (!party) return;
    const member = party.members.find(m => m.socketId === socket.id);
    if (member) member.ready = isReady;
    io.to(party.code).emit('party:update', partyPublic(party));
  });

  socket.on('party:startGame', () => {
    const party = partyOf(socket.id);
    if (!party) return socket.emit('error', 'Keine Party gefunden.');
    // Accept leader check by socket.id OR by username (case-insensitive)
    const isLeader = party.leader === socket.id ||
      (socketUser && party.leaderName.toLowerCase() === socketUser.username.toLowerCase());
    if (!isLeader) return socket.emit('error', 'Nur der Leader kann das Spiel starten.');
    if (party.members.length < 1) return socket.emit('error', 'Keine Mitglieder.');
    startPartyGame(party);
  });

  // ── IN-GAME EVENTS ────────────────────────────────────────
  // Client reports its own position every frame
  socket.on('game:move', ({ x, y, facing }) => {
    const party = partyOf(socket.id);
    if (!party || party.state !== 'ingame') return;
    const member = party.members.find(m => m.socketId === socket.id);
    if (member) { member.x = x; member.y = y; member.facing = facing; }
  });

  // Client reports a bullet hitting an enemy
  socket.on('game:hit', ({ enemyId, dmg }) => {
    const party = partyOf(socket.id);
    if (!party || party.state !== 'ingame') return;
    const member = party.members.find(m => m.socketId === socket.id);

    if (enemyId === 'boss') {
      if (party.boss) {
        party.boss.hp -= dmg;
        if (party.boss.hp <= 0) {
          party.bossActive = false;
          io.to(party.code).emit('game:bossDefeated', { killer: socketUser.username });
          if (member) member.kills++;
        }
      }
    } else {
      const e = party.enemies.find(e => e.id === enemyId);
      if (e) {
        e.hp -= dmg;
        if (e.hp <= 0) {
          party.enemies = party.enemies.filter(x => x.id !== enemyId);
          if (member) member.kills++;
          io.to(party.code).emit('game:enemyDied', { enemyId, killer: socketUser.username });
        }
      }
    }
  });

  // Client says they're dead (fallback / client auth)
  socket.on('game:died', () => {
    const party = partyOf(socket.id);
    if (!party) return;
    const member = party.members.find(m => m.socketId === socket.id);
    if (member) member.alive = false;
    io.to(party.code).emit('game:playerDied', { username: socketUser?.username });
    const allDead = party.members.every(m => m.alive === false);
    if (allDead) endPartyGame(party, 'all_dead');
  });

  // Score submission from in-game
  socket.on('game:submitScore', async ({ time, secs, kills, wave, diff, mode }) => {
    if (!socketUser) return;
    try {
      await Score.create({ player: socketUser.username, time, secs, kills, wave, diff, mode });
    } catch (e) { console.error('Score save error:', e.message); }
  });

  // ── DISCONNECT ────────────────────────────────────────────
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    if (socketUser) io.emit('friend:offline', { username: socketUser.username });
    const party = partyOf(socket.id);
    if (party) {
      socket.leave(party.code);
      io.to(party.code).emit('party:memberLeft', { username: socketUser?.username });
      removeMember(socket.id);
    }
  });

  // Friend party invite
  socket.on('party:inviteFriend', ({ to, code }) => {
    if (!socketUser) return;
    const toName = (to || '').toLowerCase();
    for (const [sid, uname] of onlineUsers) {
      if (uname === toName) {
        io.to(sid).emit('party:friendInvite', { from: socketUser.username, code });
        break;
      }
    }
  });


  // ── ADMIN COMMANDS ──────────────────────────────────────
  // Admin: spawn boss in current party (for granted admins)
  socket.on('admin:spawnBoss', () => {
    if (!socketUser) return;
    User.findOne({ username: socketUser.username.toLowerCase() }).lean().then(doc => {
      if (!doc || (!doc.isAdmin && !isOwner(socketUser.username))) return;
      const party = partyOf(socket.id);
      if (!party || party.state !== 'ingame') {
        socket.emit('error', 'Nicht in einem laufenden Spiel.');
        return;
      }
      // Owner: no boss limit (up to 25). Admin: only if no boss active
      const bossCount = (party.bosses || [party.boss].filter(Boolean)).length;
      if (!isOwner(socketUser.username) && party.bossActive) {
        socket.emit('error', 'Es ist bereits ein Boss aktiv.');
        return;
      }
      if (bossCount >= 25) {
        socket.emit('error', 'Maximale Boss-Anzahl (25) erreicht.');
        return;
      }
      const boss = spawnAdminBoss(party);
      io.to(party.code).emit('game:bossSpawned', boss);
      // Add to multi-boss array
      if (!party.extraBosses) party.extraBosses = [];
      party.extraBosses.push(boss);
    });
  });

  // Admin: spawn wave in current party
  socket.on('admin:spawnWave', () => {
    if (!socketUser) return;
    User.findOne({ username: socketUser.username.toLowerCase() }).lean().then(doc => {
      if (!doc || (!doc.isAdmin && !isOwner(socketUser.username))) return;
      const party = partyOf(socket.id);
      if (!party || party.state !== 'ingame') {
        socket.emit('error', 'Nicht in einem laufenden Spiel.');
        return;
      }
      const cfg = DIFF_CFG[party.diff] || DIFF_CFG.normal;
      const [mn, mx] = cfg.waveSize;
      const count = mn + Math.floor(Math.random()*(mx-mn+1));
      for (let i = 0; i < count; i++) party.enemies.push(spawnEnemy(party, false));
      io.to(party.code).emit('game:adminWave', { count });
    });
  });

  socket.on('admin:command', async ({ cmd, target }) => {
    if (!socketUser) return socket.emit('admin:error', 'Nicht eingeloggt.');
    const userDoc = await User.findOne({ username: socketUser.username.toLowerCase() }).lean();
    const canOwner = isOwner(socketUser.username);
    const canAdmin = canOwner || (userDoc && userDoc.isAdmin);
    // Certain commands need owner, others need admin
    const ownerOnlyCmds = ['join','check','edit','reset-all','admin','ban','unban','delete'];
    if (ownerOnlyCmds.includes(cmd) && !canOwner) {
      return socket.emit('admin:error', 'Nur der Owner kann diesen Befehl nutzen.');
    }
    if (!canAdmin) {
      return socket.emit('admin:error', 'Kein Zugriff.');
    }
    const targetName = (target || '').toLowerCase().trim();

    if (cmd === 'join') {
      // Find which party target is in and force-join admin
      let found = null;
      for (const [,p] of parties) {
        if (p.members.some(m => m.username.toLowerCase() === targetName)) { found = p; break; }
      }
      if (!found) return socket.emit('admin:result', { cmd, error: 'Spieler nicht in einer Party gefunden.' });
      // Remove admin from current party if any
      const existing = partyOf(socket.id);
      if (existing) removeMember(socket.id);
      // Add to target party
      found.members.push({ socketId: socket.id, username: socketUser.username, ready: true, x:400, y:300, hp:100, kills:0, alive:true });
      socket.join(found.code);
      io.to(found.code).emit('party:update', partyPublic(found));
      socket.emit('admin:result', { cmd, success: true, code: found.code, party: partyPublic(found) });
      socket.emit('party:joined', { code: found.code, party: partyPublic(found) });
    }

    else if (cmd === 'check') {
      const user = await User.findOne({ username: targetName }).lean();
      if (!user) return socket.emit('admin:result', { cmd, error: 'Spieler nicht gefunden.' });
      socket.emit('admin:result', {
        cmd, success: true,
        data: {
          username: user.username,
          coins: user.coins,
          weapons: user.weapons,
          perma: user.perma,
          kunaiCountLvl: user.kunaiCountLvl || 0,
          kunaiSpeedLvl: user.kunaiSpeedLvl || 0,
          guardianShopLvl: user.guardianShopLvl || 0,
        }
      });
    }

    else if (cmd === 'edit') {
      // target contains: "username field value"
      // e.g. "maik coins 9999" or "maik weapons pistol,rifle"
      const parts = target.split(' ');
      const uname = parts[0].toLowerCase();
      const field = parts[1];
      const val   = parts.slice(2).join(' ');
      if (!uname || !field || !val) return socket.emit('admin:result', { cmd, error: 'Format: {name} {field} {value}' });
      const allowed = ['coins','weapons','perma','kunaiCountLvl','kunaiSpeedLvl','guardianShopLvl'];
      if (!allowed.includes(field)) return socket.emit('admin:result', { cmd, error: 'Feld nicht erlaubt: ' + field });
      let parsed;
      try {
        parsed = field === 'weapons' ? val.split(',').map(s=>s.trim()) :
                 field === 'perma'   ? JSON.parse(val) :
                 Number(val);
      } catch(e) { return socket.emit('admin:result', { cmd, error: 'Ungültiger Wert: ' + val }); }
      await User.findOneAndUpdate({ username: uname }, { [field]: parsed });
      socket.emit('admin:result', { cmd, success: true, msg: `${uname}.${field} = ${JSON.stringify(parsed)}` });
      // If target is online, notify them
      for (const [sid, u] of onlineUsers) {
        if (u === uname) { io.to(sid).emit('admin:profileUpdated'); break; }
      }
    }

    else if (cmd === 'admin') {
      // /admin {username} [revoke]
      const parts = target.split(' ');
      const uname = parts[0].toLowerCase();
      const revoke = parts[1] === 'revoke';
      try {
        const res2 = await User.findOneAndUpdate({ username: uname }, { isAdmin: !revoke }, { new: true });
        if (!res2) { socket.emit('admin:result', { cmd, error: 'Spieler nicht gefunden.' }); }
        else {
          socket.emit('admin:result', { cmd, success: true, msg: (revoke ? '✓ Admin entfernt: ' : '✓ Admin vergeben: ') + uname });
          // Notify the target
          for (const [sid, u] of onlineUsers) {
            if (u === uname) { io.to(sid).emit(revoke ? 'admin:revoked' : 'admin:granted'); break; }
          }
        }
      } catch(e) { socket.emit('admin:result', { cmd, error: e.message }); }
    }
    else if (cmd === 'delete') {
      const uname = target.toLowerCase();
      if (isOwner(uname)) {
        socket.emit('admin:result', { cmd, error: 'Owner-Account kann nicht gelöscht werden.' });
      } else {
        await User.findOneAndDelete({ username: uname });
        await Score.deleteMany({ player: uname });
        // Kick if online
        for (const [sid, u] of onlineUsers) {
          if (u === uname) { io.to(sid).emit('banned', { reason: 'Dein Account wurde gelöscht.' }); break; }
        }
        socket.emit('admin:result', { cmd, success: true, msg: '✓ Account von ' + uname + ' gelöscht.' });
      }
    }
    else if (cmd === 'ban') {
      const uname = target.toLowerCase();
      if (isOwner(uname)) { socket.emit('admin:result', { cmd, error: 'Owner kann nicht gebannt werden.' }); }
      else {
        await User.findOneAndUpdate({ username: uname }, { banned: true });
        // Kick if online
        for (const [sid, u] of onlineUsers) {
          if (u === uname) { io.to(sid).emit('banned', { reason: 'Du wurdest vom Owner gesperrt.' }); break; }
        }
        socket.emit('admin:result', { cmd, success: true, msg: '✓ ' + uname + ' gebannt.' });
      }
    }
    else if (cmd === 'unban') {
      const uname = target.toLowerCase();
      await User.findOneAndUpdate({ username: uname }, { banned: false });
      socket.emit('admin:result', { cmd, success: true, msg: '✓ ' + uname + ' entbannt.' });
    }
    else if (cmd === 'reset-all') {
      // Reset all non-admin users
      const defaultData = {
        coins:0, weapons:['pistol'],
        perma:{hp:0,speed:0,dmg:0,reload:0,mag:0},
        kunaiCountLvl:0, kunaiSpeedLvl:0, guardianShopLvl:0,
        friends:[], friendRequests:[], sentRequests:[],
      };
      await User.updateMany({ username: { $nin:['mrmaik','adminmaik'] } }, { $set: defaultData });
      await Score.deleteMany({ player: { $nin:['mrmaik','adminmaik'] } });
      // Notify all online users
      io.emit('admin:profileUpdated');
      socket.emit('admin:result', { cmd, success: true, msg: 'Alle Spieler zurückgesetzt!' });
    }
    else {
      socket.emit('admin:result', { cmd, error: 'Unbekannter Befehl: ' + cmd });
    }
  });

  // Chat in lobby
  socket.on('party:chat', (msg) => {
    const party = partyOf(socket.id);
    if (!party || !socketUser) return;
    const sanitized = String(msg).substring(0, 120);
    io.to(party.code).emit('party:chat', { from: socketUser.username, msg: sanitized });
  });
});

// ── Connect DB & start server ────────────────────────────────
async function main() {
  if (MONGO_URI) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log('✅ MongoDB verbunden');
    } catch (e) {
      console.error('❌ MongoDB Fehler:', e.message);
      process.exit(1);
    }
  } else {
    console.warn('⚠️  MONGODB_URI nicht gesetzt – Daten werden nicht gespeichert!');
  }

  server.listen(PORT, () => {
    console.log(`🎮 ZombieWave V5 läuft auf Port ${PORT}`);
  });
}

main();
