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

// Global middleware to enforce password change
app.use(async (req, res, next) => {
  const openPaths = ['/api/login', '/api/logout', '/api/change-password'];
  if (req.path.startsWith('/api') && !openPaths.includes(req.path)) {
    await db.read();
    const u = db.data.users.find(u => u.username === getUserCookie(req));
    if (u && u.mustChangePassword) {
      return res.status(403).json({ error: 'Passwort muss geändert werden' });
    }
  }
  next();
});

// Authorization middleware factory
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

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('user').clearCookie('role').sendStatus(200);
});

// Current user info
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

// Change password endpoint for users
app.post('/api/change-password', async (req, res) => {
  const { newPassword } = req.body;
  await db.read();
  const username = getUserCookie(req);
  const u = db.data.users.find(u => u.username === username);
  if (!u) return res.status(401).json({ error: 'Nicht eingeloggt' });
  u.password = newPassword;
  u.mustChangePassword = false;
  await db.write();
  res.json({ success: true });
});

// Admin reset password endpoint
app.post('/api/admin/reset-password', authorize('reset-password'), async (req, res) => {
  const { username, newPassword } = req.body;
  await db.read();
  const u = db.data.users.find(u => u.username === username);
  if (!u) return res.status(404).json({ error: 'User nicht gefunden' });
  u.password = newPassword;
  u.mustChangePassword = true;
  await db.write();
  res.json({ success: true });
});

// Catch-all to serve index.html for root/SPAs
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Start server
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
