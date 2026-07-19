// features/settings/settingsRoutes.js
import express from 'express';
import bcrypt from 'bcrypt';
import { connectDB, isConnected } from '../../config/db.js';
import { writeEnvValues, refreshConfigFromDB, getConfig } from '../../config/vars.js';
import { Settings } from './Models/SettingsModel.js';
import authMiddleware from '../../auth/auth.js';

const router = express.Router();

async function getSettings() {
  let doc = await Settings.findOne({});
  if (!doc) doc = await Settings.create({});
  return doc;
}

export async function isSetupComplete() {
  if (!isConnected()) return false;
  try {
    const doc = await Settings.findOne({}).lean();
    return doc?.setupComplete === true;
  } catch { return false; }
}

async function autoInitTelegram() {
  const cfg = getConfig();
  if (!cfg.API_ID || !cfg.API_HASH || !cfg.BOT_TOKEN) return { ok: false, reason: 'no-creds' };
  try {
    const { initClient } = await import('../tgcloud/tgwebcloud.js');
    await initClient();
    const { reinitBot }           = await import('../../bot.js');
    const { registerBotHandlers } = await import('../tgcloud/tgbotcloud.js');
    await reinitBot();
    registerBotHandlers();
    return { ok: true };
  } catch (e) {
    console.warn('[setup] Auto-init failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── SETUP ROUTES (no auth required) ──────────────────────────────────────────

// POST /setup/connect-db
router.post('/connect-db', async (req, res) => {
  const { uri } = req.body || {};
  if (!uri?.trim()) return res.json({ ok: false, error: 'URI required' });
  const result = await connectDB(uri.trim());
  if (!result.ok) return res.json({ ok: false, error: result.error });
  writeEnvValues({ MONGO_URI: uri.trim() });
  try {
    const existing = await Settings.findOne({});
    if (!existing) await Settings.create({});
  } catch (e) { console.warn('[setup] settings doc create failed:', e.message); }
  await refreshConfigFromDB();
  const doc = await Settings.findOne({}).lean();
  if (doc?.setupComplete) {
    console.log('[setup] Existing setup detected — auto-restoring...');
    const { markSetupComplete } = await import('../../app.js');
    markSetupComplete();
    await autoInitTelegram();
    req.session.auth = true;
    return new Promise((resolve) => {
      req.session.save((err) => {
        if (err) console.error('[setup] session save error:', err);
        res.json({ ok: true, existingSetup: true });
        resolve();
      });
    });
  }
  res.json({ ok: true, existingSetup: false });
});

// POST /setup/save-credentials
router.post('/save-credentials', async (req, res) => {
  if (!isConnected()) return res.json({ ok: false, error: 'DB not connected' });
  // Block mutation once setup is already complete (prevent account takeover)
  const done = await isSetupComplete();
  if (done) return res.status(403).json({ ok: false, error: 'Setup already completed' });
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ ok: false, error: 'Email and password required' });
  if (password.length < 8) return res.json({ ok: false, error: 'Password must be ≥ 8 characters' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const doc  = await getSettings();
    doc.admin.email        = email.toLowerCase().trim();
    doc.admin.passwordHash = hash;
    await doc.save();
    writeEnvValues({ EMAIL: email, PASSWORD: password });
    await refreshConfigFromDB();
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /setup/save-profile
router.post('/save-profile', async (req, res) => {
  if (!isConnected()) return res.json({ ok: false, error: 'DB not connected' });
  // Block mutation once setup is already complete
  const done = await isSetupComplete();
  if (done) return res.status(403).json({ ok: false, error: 'Setup already completed' });
  const { displayName, avatarBase64 } = req.body || {};
  if (!displayName?.trim()) return res.json({ ok: false, error: 'Display name required' });
  try {
    const doc = await getSettings();
    doc.admin.displayName = displayName.trim();
    if (avatarBase64) doc.admin.avatarUrl = avatarBase64;
    doc.setupComplete = true;
    await doc.save();
    await refreshConfigFromDB();
    const { markSetupComplete } = await import('../../app.js');
    markSetupComplete();
    await autoInitTelegram();
    req.session.auth = true;
    req.session.save((err) => {
      if (err) return res.json({ ok: false, error: 'Session save failed' });
      res.json({ ok: true, redirect: '/' });
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── PROFILE ROUTES (auth required) ───────────────────────────────────────────

// POST /profile/update
router.post('/update', authMiddleware, async (req, res) => {
  const { displayName, email, avatarBase64 } = req.body || {};
  if (!displayName || !email) return res.json({ ok: false, error: 'Name and email required' });
  try {
    const doc = await getSettings();
    doc.admin.displayName = displayName.trim();
    doc.admin.email       = email.toLowerCase().trim();
    if (avatarBase64) doc.admin.avatarUrl = avatarBase64;
    await doc.save();
    writeEnvValues({ EMAIL: email });
    await refreshConfigFromDB();
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /profile/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
  const { current, newPassword } = req.body || {};
  if (!current || !newPassword) return res.json({ ok: false, error: 'All fields required' });
  if (newPassword.length < 8) return res.json({ ok: false, error: 'Password must be ≥ 8 chars' });
  try {
    const doc = await getSettings();
    if (!doc.admin?.passwordHash) return res.json({ ok: false, error: 'No password set in DB' });
    const ok = await bcrypt.compare(current, doc.admin.passwordHash);
    if (!ok) return res.json({ ok: false, error: 'Current password is incorrect' });
    doc.admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await doc.save();
    writeEnvValues({ PASSWORD: newPassword });
    await refreshConfigFromDB();
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /profile/update-telegram
router.post('/update-telegram', authMiddleware, async (req, res) => {
  const { apiId, apiHash, botToken, dbChannelId, ownerId } = req.body || {};
  if (!apiId || !apiHash || !botToken || !dbChannelId || !ownerId)
    return res.json({ ok: false, error: 'All fields required' });
  try {
    const doc = await getSettings();
    doc.telegram.apiId       = apiId.trim();
    doc.telegram.apiHash     = apiHash.trim();
    doc.telegram.botToken    = botToken.trim();
    doc.telegram.dbChannelId = dbChannelId.trim();
    doc.telegram.ownerId     = ownerId.trim();
    await doc.save();
    writeEnvValues({ API_ID: apiId, API_HASH: apiHash, BOT_TOKEN: botToken, DB_CHANNEL_ID: dbChannelId, OWNER_ID: ownerId });
    await refreshConfigFromDB();
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// GET /profile/get-telegram-creds
router.get('/get-telegram-creds', authMiddleware, async (req, res) => {
  try {
    const doc = await getSettings();
    res.json({
      ok: true,
      apiId:       doc.telegram?.apiId       || '',
      apiHash:     doc.telegram?.apiHash     || '',
      botToken:    doc.telegram?.botToken    || '',
      dbChannelId: doc.telegram?.dbChannelId || '',
      ownerId:     doc.telegram?.ownerId     || '',
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// POST /profile/connect-telegram
router.post('/connect-telegram', authMiddleware, async (req, res) => {
  const cfg = getConfig();
  if (!cfg.API_ID || !cfg.API_HASH || !cfg.BOT_TOKEN)
    return res.json({ ok: false, error: 'Save Telegram credentials first' });
  try {
    const { reinitClient } = await import('../tgcloud/tgwebcloud.js');
    const result = await reinitClient();
    if (!result.ok) return res.json({ ok: false, error: result.error });
    const { reinitBot }           = await import('../../bot.js');
    const { registerBotHandlers } = await import('../tgcloud/tgbotcloud.js');
    await reinitBot();
    registerBotHandlers();
    const doc = await getSettings();
    doc.telegram.connected = true;
    await doc.save();
    await refreshConfigFromDB();
    res.json({ ok: true });
  } catch (e) {
    console.error('[profile/connect-telegram]', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// GET /profile/settings-data  — return current settings as JSON for React UI
router.get('/settings-data', authMiddleware, async (req, res) => {
  try {
    const doc = await getSettings();
    res.json({
      ok: true,
      admin: {
        displayName: doc.admin?.displayName || '',
        email:       doc.admin?.email       || '',
        avatarUrl:   doc.admin?.avatarUrl   || '',
      },
      telegram: {
        apiId:       doc.telegram?.apiId       || '',
        apiHash:     doc.telegram?.apiHash     || '',
        botToken:    doc.telegram?.botToken    || '',
        dbChannelId: doc.telegram?.dbChannelId || '',
        ownerId:     doc.telegram?.ownerId     || '',
        connected:   doc.telegram?.connected   || false,
      },
    });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

export default router;
