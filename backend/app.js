// app.js
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { getConfig } from './config/vars.js';
import { isConnected } from './config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Serve React build ─────────────────────────────────────────────────────────
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

// ── Serve public assets (style.css for share pages, etc.) ────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Session ───────────────────────────────────────────────────────────────────
const SESSION_SECRET = getConfig().SESSION_SECRET || 'nexPanel_fallback_$$';
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// ── In-memory setup cache ─────────────────────────────────────────────────────
let _setupComplete = false;

export function markSetupComplete() {
  _setupComplete = true;
  console.log('[app] Setup marked complete');
}

export async function checkSetupStatus() {
  if (_setupComplete) return true;
  if (!isConnected()) return false;
  try {
    const { Settings } = await import('./features/settings/Models/SettingsModel.js');
    const doc = await Settings.findOne({}).lean();
    _setupComplete = doc?.setupComplete === true;
    return _setupComplete;
  } catch { return false; }
}

// ── Auth helper ───────────────────────────────────────────────────────────────
export function requireAuth(req, res, next) {
  if (req.session?.auth === true) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ── GET /api/me ───────────────────────────────────────────────────────────────
app.get('/api/me', async (req, res) => {
  if (!req.session?.auth) return res.json({ authenticated: false });
  try {
    let user = { displayName: 'Admin', email: '', avatarUrl: '' };
    if (isConnected()) {
      const { Settings } = await import('./features/settings/Models/SettingsModel.js');
      const doc = await Settings.findOne({}).lean();
      if (doc?.admin) {
        user = {
          displayName: doc.admin.displayName || 'Admin',
          email:       doc.admin.email       || '',
          avatarUrl:   doc.admin.avatarUrl   || '',
        };
      }
    }
    res.json({ authenticated: true, user });
  } catch {
    res.json({ authenticated: true, user: { displayName: 'Admin', email: '', avatarUrl: '' } });
  }
});

// ── GET /api/setup/status ─────────────────────────────────────────────────────
app.get('/api/setup/status', async (req, res) => {
  const dbConnected    = isConnected();
  const setupComplete  = await checkSetupStatus();
  res.json({ dbConnected, setupComplete });
});

// ── POST /login ───────────────────────────────────────────────────────────────
app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ ok: false, error: 'Email and password required' });
  try {
    let authenticated = false;
    if (isConnected()) {
      const { Settings } = await import('./features/settings/Models/SettingsModel.js');
      const doc = await Settings.findOne({}).lean();
      if (doc?.admin?.email && doc?.admin?.passwordHash) {
        const emailOk = doc.admin.email.toLowerCase() === email.toLowerCase().trim();
        const passOk  = await bcrypt.compare(password, doc.admin.passwordHash);
        authenticated = emailOk && passOk;
      }
    }
    if (!authenticated) {
      const cfg = getConfig();
      if (cfg.EMAIL && cfg.PASSWORD) {
        authenticated = (email === cfg.EMAIL && password === cfg.PASSWORD);
      }
    }
    if (authenticated) {
      req.session.auth = true;
      req.session.save(err => {
        if (err) return res.json({ ok: false, error: 'Session error' });
        res.json({ ok: true });
      });
    } else {
      res.json({ ok: false, error: 'Invalid email or password' });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GET /logout ───────────────────────────────────────────────────────────────
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('[logout]', err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[app] Error:', err.stack || err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Catch-all: serve React SPA ────────────────────────────────────────────────
// Must be added LAST, after all other routes. Call addCatchAll() from index.js.
export function addCatchAll() {
  // Binary / API paths that should NOT fall through to React
  const binaryPaths = ['/stream/', '/download/', '/share/', '/cloud/upload', '/api/'];

  app.get('*', (req, res) => {
    const isBinary = binaryPaths.some(p => req.path.startsWith(p));
    if (isBinary) return res.status(404).json({ error: 'Not found' });
    const indexPath = path.join(frontendDist, 'index.html');
    res.sendFile(indexPath, err => {
      if (err) res.status(200).send('App is loading...');
    });
  });
}

export default app;
