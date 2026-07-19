// config/vars.js
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env lives at vinnoflow/.env (two levels up from vinnoflow/backend/config/)
const ENV_PATH = path.resolve(__dirname, '../../.env');

dotenv.config({ path: ENV_PATH });

let _cache = null;

function envSnapshot() {
  return {
    MONGO_URI:      process.env.MONGO_URI      || '',
    SESSION_SECRET: process.env.SESSION_SECRET || 'nexpanel_secret_fallback',
    EMAIL:          process.env.EMAIL          || '',
    PASSWORD:       process.env.PASSWORD       || '',
    API_ID:         process.env.API_ID         || '',
    API_HASH:       process.env.API_HASH        || '',
    BOT_TOKEN:      process.env.BOT_TOKEN       || '',
    DB_CHANNEL_ID:  process.env.DB_CHANNEL_ID   || '',
    OWNER_ID:       process.env.OWNER_ID        || '',
    SERVER_URL:     process.env.SERVER_URL      || 'http://localhost:3000',
    PORT:           process.env.PORT            || '3000',
    TG_SESSION:     process.env.TG_SESSION      || '',
  };
}

export function getConfig() {
  return _cache || envSnapshot();
}

export async function refreshConfigFromDB() {
  try {
    const { Settings } = await import('../features/settings/Models/SettingsModel.js');
    const doc = await Settings.findOne({});
    if (!doc) { _cache = envSnapshot(); return; }
    const env = envSnapshot();
    _cache = {
      MONGO_URI:      process.env.MONGO_URI      || env.MONGO_URI,
      SESSION_SECRET: doc.sessionSecret          || env.SESSION_SECRET,
      EMAIL:          doc.admin?.email           || env.EMAIL,
      PASSWORD:       doc.admin?.passwordHash    || env.PASSWORD,
      API_ID:         doc.telegram?.apiId        || env.API_ID,
      API_HASH:       doc.telegram?.apiHash      || env.API_HASH,
      BOT_TOKEN:      doc.telegram?.botToken     || env.BOT_TOKEN,
      DB_CHANNEL_ID:  doc.telegram?.dbChannelId  || env.DB_CHANNEL_ID,
      OWNER_ID:       doc.telegram?.ownerId      || env.OWNER_ID,
      SERVER_URL:     doc.serverUrl              || env.SERVER_URL,
      PORT:           env.PORT,
      TG_SESSION:     doc.telegram?.session      || env.TG_SESSION,
      DISPLAY_NAME:   doc.admin?.displayName     || '',
      AVATAR_URL:     doc.admin?.avatarUrl       || '',
      SETUP_COMPLETE: doc.setupComplete          || false,
      TG_CONNECTED:   doc.telegram?.connected    || false,
    };
  } catch (e) {
    console.warn('[vars] refreshConfigFromDB failed:', e.message);
    _cache = envSnapshot();
  }
}

export function invalidateCache() { _cache = null; }

export function writeEnvValues(pairs) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) content = fs.readFileSync(ENV_PATH, 'utf8');
  for (const [key, value] of Object.entries(pairs)) {
    const safeVal = String(value).includes(' ') ? `"${value}"` : value;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${safeVal}`);
    } else {
      content += (content.endsWith('\n') || content === '' ? '' : '\n') + `${key}=${safeVal}\n`;
    }
    process.env[key] = String(value);
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

export const getApiId      = () => getConfig().API_ID;
export const getApiHash    = () => getConfig().API_HASH;
export const getBotToken   = () => getConfig().BOT_TOKEN;
export const getMongoUri   = () => getConfig().MONGO_URI;
export const getOwnerID    = () => getConfig().OWNER_ID;
export const getDbChannel  = () => getConfig().DB_CHANNEL_ID;
export const getServerUrl  = () => getConfig().SERVER_URL;
export const getPort       = () => getConfig().PORT;
export const getTgSession  = () => getConfig().TG_SESSION;
