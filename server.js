import express                  from 'express';
import path                     from 'path';
import bodyParser               from 'body-parser';
import cookieParser             from 'cookie-parser';
import { Low }                  from 'lowdb';
import { JSONFile }             from 'lowdb/node';
import { fileURLToPath }        from 'url';
import fs                       from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const app        = express();
const PORT       = process.env.PORT || 3000;

// --- Middleware ---
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Ensure data folder & seed DB ---
const dataDir = path.join(__dirname, 'data');
const dbFile  = path.join(dataDir, 'db.json');
const seedFile = path.join(dataDir, 'db.seed.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}
if (!fs.existsSync(dbFile)) {
  fs.copyFileSync(seedFile, dbFile);
}

// --- LowDB setup ---
const adapter     = new JSONFile(dbFile);
const defaultData = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
const db          = new Low(adapter, defaultData);

await db.read();
db.data = db.data || defaultData;
await db.write();

// --- Helpers ---
const getUserFromCookie = req => req.cookies.user || null;
const getPermissions    = req => {
  const u = db.data.users.find(u => u.username === getUserFromCookie(req));
  return u ? u.permissions : {};
};

// --- Enforce password change middleware ---
app.use(async (req, res, next) => {
  const openPaths = ['/api/login', '/api/logout', '/api/change-password'];
  if (req.path.startsWith('/api') && !openPaths.includes(req.path)) {
    await db.read();
    const user = db.data.users.find(u => u.username === getUserFromCookie(req));
    if (user && user.mustChangePassword) {
      return res.status(403).json({ error: 'Passwort muss geändert werden' });
    }
  }
  next();
});

// --- Authorization factory ---
const authorize = permission => (req, res, next) => {
  const perms = getPermissions(req);
  if (!perms[permission]) {
    return res.status(403).json({ error: `Keine Berechtigung: ${permission}` });
  }
  next();
};

// --- Authentication & User Info ---

// Login
app.post('/api/login', async (req, res) => {
  await db.read();
  const { username, password } = req.body;
  const user = db.data.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Login fehlgeschlagen' });
  }
  res
    .cookie('user', username, { httpOnly: true })
    .cookie('role',  user.role,  { httpOnly: true })
    .json({
      user: username,
      role: user.role,
      permissions: user.permissions,
      mustChangePassword: !!user.mustChangePassword
    });
});

// Logout
app.post('/api/logout', (req, res) => {
  res
    .clearCookie('user')
    .clearCookie('role')
    .json({ success: true });
});

// Fetch current user info
app.get('/api/me', async (req, res) => {
  await db.read();
  const user = db.data.users.find(u => u.username === getUserFromCookie(req));
  if (!user) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }
  res.json({
    user: user.username,
    role: user.role,
    permissions: user.permissions,
    mustChangePassword: !!user.mustChangePassword
  });
});

// --- Password Management ---

// Change own password
app.post('/api/change-password', async (req, res) => {
  const { newPassword } = req.body;
  const username = getUserFromCookie(req);
  await db.read();
  const user = db.data.users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }
  user.password = newPassword;
  user.mustChangePassword = false;
  await db.write();
  res.json({ success: true });
});

// Admin: reset another user's password
app.post('/api/admin/reset-password', authorize('reset-password'), async (req, res) => {
  const { username, newPassword } = req.body;
  await db.read();
  const user = db.data.users.find(u => u.username === username);
  if (!user) {
    return res.status(404).json({ error: 'User nicht gefunden' });
  }
  user.password = newPassword;
  user.mustChangePassword = true;
  await db.write();
  res.json({ success: true });
});

// --- (Optional) Weitere API-Routen hier ---
// z.B. app.get('/api/articles', ...), app.post('/api/consume', authorize('consume'), ...), etc.

// --- Fallback für SPA/Static ---
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
