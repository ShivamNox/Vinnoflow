// bot.js
import TelegramBot from 'node-telegram-bot-api';
import { getBotToken } from './config/vars.js';

let _bot = null;

export async function reinitBot() {
  const token = getBotToken();
  if (!token) {
    console.warn('[bot] No BOT_TOKEN available — bot not started');
    return;
  }
  if (_bot) {
    try { await _bot.stopPolling(); } catch (e) { console.warn('[bot] Error stopping old bot:', e.message); }
    _bot = null;
  }
  _bot = new TelegramBot(token, { polling: true });
  console.log('[bot] Bot initialized with polling');
  return _bot;
}

export function getBot() { return _bot; }

const botProxy = new Proxy({}, {
  get(_, prop) {
    return (...args) => {
      if (!_bot) throw new Error('[bot] Bot not initialized yet');
      return _bot[prop](...args);
    };
  }
});

export default botProxy;
