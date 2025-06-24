import express      from 'express';
import path         from 'path';
import bodyParser   from 'body-parser';
import cookieParser from 'cookie-parser';
import { Low }      from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { fileURLToPath } from 'url';
import fs           from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const app        = express();
const PORT       = process.env.PORT || 3000;

// Middlewares
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory and seed DB if missing
const dataDir = path.join(__dirname, 'data');
const dbPath  = path.join(dataDir, 'db.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(dbPath)) {
  fs.copyFileSync(path.join(dataDir, 'db.seed.json'), dbPath);
}

// LowDB setup
const adapter     = new JSONFile(dbPath);
const defaultData = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.seed.json'), 'utf-8'));
const db          = new Low(adapter, defaultData);
await db.read();
db.data = db.data || defaultData;
await db.write();

// Helpers
const getUserCookie = req => req.cookies.user || '';
const getPerms      = req => {
  const u = db.data.users.find(u => u.username === getUserCookie(req));
  return u ? u.permissions : {};
};
const authorize = perm => (req, res, next) => {
  if (!getPerms(req)[perm]) {
    return res.status(403).json({ error: `Keine Berechtigung: ${perm}` });
  }
  next();
};

// --- Auth & Profile ---
app.post('/api/login', async (req, res) => {
  await db.read();
  const { username, password } = req.body;
  const u = db.data.users.find(u => u.username === username && u.password === password);
  if (!u) return res.status(401).json({ error: 'Login fehlgeschlagen' });
  res
    .cookie('user', u.username, { httpOnly: true })
    .cookie('role', u.role,     { httpOnly: true })
    .json({
      user: u.username,
      role: u.role,
      permissions: u.permissions,
      mustChangePassword: !!u.mustChangePassword
    });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('user').clearCookie('role').sendStatus(200);
});

app.get('/api/me', async (req, res) => {
  await db.read();
  const u = db.data.users.find(u => u.username === getUserCookie(req));
  if (!u) return res.status(401).json({ error: 'Nicht eingeloggt' });
  res.json({
    user: u.username,
    role: u.role,
    permissions: u.permissions,
    mustChangePassword: !!u.mustChangePassword
  });
});

// --- Password Flows ---
app.post('/api/users/:username/password', async (req, res) => {
  const target = req.params.username;
  const current = getUserCookie(req);
  if (target !== current) return res.status(403).json({ error: 'Nur eigenes Passwort änderbar' });
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: 'Leeres Passwort nicht erlaubt' });
  await db.read();
  const u = db.data.users.find(u => u.username === target);
  u.password = newPassword;
  u.mustChangePassword = false;
  await db.write();
  res.json({ success: true });
});

app.post('/api/users/:username/reset-password', authorize('manageUsers'), async (req, res) => {
  const target = req.params.username;
  await db.read();
  const u = db.data.users.find(u => u.username === target);
  if (!u) return res.status(404).json({ error: 'User nicht gefunden' });
  u.password = 'Passwort';
  u.mustChangePassword = true;
  await db.write();
  res.json({ success: true, resetTo: 'Passwort' });
});

app.put('/api/users/:username/username', async (req, res) => {
  const target = req.params.username;
  const current = getUserCookie(req);
  const { newUsername } = req.body;
  if (!newUsername) return res.status(400).json({ error: 'Leerer neuer Benutzername' });
  await db.read();
  const admin = db.data.users.find(u => u.username === getUserCookie(req) && u.role === 'Admin');
  if (target !== current && !admin) return res.status(403).json({ error: 'Keine Berechtigung' });
  if (db.data.users.find(u => u.username === newUsername)) {
    return res.status(409).json({ error: 'Benutzer existiert bereits' });
  }
  const u = db.data.users.find(u => u.username === target);
  if (!u) return res.status(404).json({ error: 'User nicht gefunden' });
  u.username = newUsername;
  await db.write();
  if (current === target) {
    res.cookie('user', newUsername, { httpOnly: true });
  }
  res.json({ success: true, username: newUsername });
});

// --- User Management ---
app.get('/api/users', authorize('manageUsers'), async (req, res) => {
  await db.read();
  res.json(db.data.users.map(u => ({
    username: u.username,
    role: u.role,
    permissions: u.permissions,
    mustChangePassword: u.mustChangePassword
  })));
});

app.post('/api/users', authorize('manageUsers'), async (req, res) => {
  const { username, password, role, permissions } = req.body;
  if (!username || !password || !role || !permissions) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  await db.read();
  if (db.data.users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Benutzer existiert bereits' });
  }
  db.data.users.push({ username, password, role, mustChangePassword: true, permissions });
  await db.write();
  res.json({ success: true });
});

app.put('/api/users/:username', authorize('manageUsers'), async (req, res) => {
  const target = req.params.username;
  const { role, permissions } = req.body;
  await db.read();
  const u = db.data.users.find(u => u.username === target);
  if (!u) return res.status(404).json({ error: 'User nicht gefunden' });
  u.role = role;
  u.permissions = permissions;
  await db.write();
  res.json({ success: true });
});

// --- Articles CRUD ---
app.get('/api/articles', authorize('viewArticles'), async (req, res) => {
  await db.read();
  res.json(db.data.articles);
});
app.post('/api/articles', authorize('addArticle'), async (req, res) => {
  const { artNr, name, startBestand, mindestBestand } = req.body;
  await db.read();
  const ids    = db.data.articles.map(a => +a.id).filter(n => !isNaN(n));
  const nextId = (ids.length ? Math.max(...ids) : 0) + 1;
  const id     = String(nextId).padStart(5, '0');
  db.data.articles.push({ id, artNr, name, bestand: +startBestand||0, mindestBestand:+mindestBestand||0 });
  await db.write();
  res.json({ success: true, id });
});
app.put('/api/articles/:id', authorize('addArticle'), async (req, res) => {
  const id                    = req.params.id;
  const { artNr, name, bestand, mindestBestand } = req.body;
  await db.read();
  const a = db.data.articles.find(x => x.id === id);
  if (!a) return res.status(404).json({ error: 'Artikel nicht gefunden' });
  if (artNr        !== undefined) a.artNr          = artNr;
  if (name         !== undefined) a.name           = name;
  if (bestand      !== undefined) a.bestand        = Number(bestand);
  if (mindestBestand !== undefined) a.mindestBestand = Number(mindestBestand);
  await db.write();
  res.json({ success: true, article: a });
});
app.delete('/api/articles/:key', authorize('removeArticle'), async (req, res) => {
  const key = req.params.key.trim().toLowerCase();
  await db.read();
  const before = db.data.articles.length;
  db.data.articles = db.data.articles.filter(a => a.id !== key && a.name.toLowerCase() !== key);
  await db.write();
  if (db.data.articles.length < before) res.json({ success: true });
  else res.status(404).json({ error: 'Artikel nicht gefunden' });
});

// --- Bookings ---
app.post(
  '/api/book',
  (req, res, next) => {
    if (req.body.type === 'Verbrauch') return authorize('consume')(req, res, next);
    if (req.body.type === 'Einkauf')   return authorize('purchase')(req, res, next);
    res.status(400).json({ error: 'Unbekannter type' });
  },
  async (req, res) => {
    const { name, delta, type } = req.body;
    await db.read();
    const art = db.data.articles.find(a => a.name === name);
    if (!art) return res.status(404).json({ error: 'Artikel nicht gefunden' });
    art.bestand += delta;
    db.data.bookings.push({
      timestamp:  Date.now(),
      articleId:  art.id,
      change:     delta,
      newBestand: art.bestand,
      type,
      user:       getUserCookie(req)
    });
    await db.write();
    res.json({ success: true, newBestand: art.bestand });
  }
);

// --- Warnlist & Badges ---
app.get('/api/warnlist', authorize('viewWarnlist'), async (req, res) => {
  await db.read();
  res.json(db.data.articles.filter(a => a.bestand < a.mindestBestand));
});
app.get('/api/badges', async (req, res) => {
  await db.read();
  const cutoff = Date.now() - 24*60*60*1000;
  let verb = 0, eink = 0;
  db.data.bookings.forEach(b => {
    if (b.timestamp >= cutoff) {
      if (b.type === 'Verbrauch') verb++;
      if (b.type === 'Einkauf')   eink++;
    }
  });
  res.json({ verbrauch: verb, einkauf: eink });
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
