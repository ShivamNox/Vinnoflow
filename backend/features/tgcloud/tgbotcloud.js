// features/tgcloud/tgbotcloud.js

import { getBot } from '../../bot.js';
import { Folder, FolderFile } from './Models/FileModels.js';
import { BOT, ActiveChannel } from './Models/BotModels.js';
import { getConfig } from '../../config/vars.js';

const fileBatches = new Map();
const BATCH_WAIT = 3000;

function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(2) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function sanitize(name) {
  return name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/@\w+/g, '').trim();
}

function extractFileInfo(msg) {
  let filename = 'file', fileId = '', fileSize = 0, thumbId = '';
  if (msg.document) {
    filename = msg.document.file_name || 'document';
    fileId = msg.document.file_id;
    fileSize = msg.document.file_size || 0;
  } else if (msg.video) {
    filename = msg.video.file_name || `video_${msg.message_id}.mp4`;
    fileId = msg.video.file_id;
    fileSize = msg.video.file_size || 0;
    thumbId = msg.video.thumb?.file_id || '';
  } else if (msg.audio) {
    filename = msg.audio.file_name || `audio_${msg.message_id}.mp3`;
    fileId = msg.audio.file_id;
    fileSize = msg.audio.file_size || 0;
  } else if (msg.photo) {
    const p = msg.photo.at(-1);
    filename = `photo_${msg.message_id}.jpg`;
    fileId = p.file_id;
    fileSize = p.file_size || 0;
  }
  return { filename, fileId, fileSize, thumbId };
}

async function ensureFolderForChannel(bot, channelId) {
  const { DB_CHANNEL_ID } = getConfig();
  const isDefaultChannel = String(channelId) === String(DB_CHANNEL_ID);
  let existing = await Folder.findOne({ channelId: String(channelId), parentId: null }).lean();
  if (existing) return existing.folderId;
  let folderName;
  if (isDefaultChannel) {
    folderName = 'DB Channel';
  } else {
    try {
      const chat = await bot.getChat(channelId);
      folderName = chat.title || chat.username || `Channel ${channelId}`;
    } catch {
      folderName = `Channel ${channelId}`;
    }
  }
  let finalName = folderName;
  let suffix = 1;
  while (await Folder.findOne({ name: finalName, parentId: null }).lean()) {
    suffix++;
    finalName = `${folderName} (${suffix})`;
    if (suffix > 50) break;
  }
  const folderId = (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toLowerCase();
  try {
    await Folder.create({ name: finalName, folderId, parentId: null, channelId: String(channelId) });
    console.log(`[tgbotcloud] Auto-created folder "${finalName}" for channel ${channelId}`);
  } catch (e) {
    console.error('[tgbotcloud] Folder create failed:', e.message);
    const again = await Folder.findOne({ channelId: String(channelId), parentId: null }).lean();
    if (again) return again.folderId;
    return null;
  }
  const bd = await BOT.findOne();
  if (!bd) { await BOT.create({ folderId }); }
  else if (!bd.folderId) { bd.folderId = folderId; await bd.save(); }
  return folderId;
}

// ── Button-based /settings — pick a channel, then pick its active folder ──
async function showMainSettings(bot, chatId, messageId = null) {
  const channelsAgg = await Folder.aggregate([
    { $match: { channelId: { $exists: true, $ne: null, $ne: '' } } },
    { $group: { _id: '$channelId', folderCount: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  if (channelsAgg.length === 0) {
    const text = '📭 *No channels configured*\n\nSet a Telegram Channel ID when creating a folder (web) or send /addf inside a channel.';
    return messageId
      ? bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }).catch(() => {})
      : bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  const activeChannels = await ActiveChannel.find({}).lean();
  const activeMap = new Map(activeChannels.map(a => [a.channelId, a.folderId]));

  const keyboard = [];
  for (const ch of channelsAgg) {
    const channelId = ch._id;
    let channelName = channelId;
    try {
      const chat = await bot.getChat(channelId);
      channelName = chat.title || chat.username || channelId;
    } catch {}

    let buttonText = `📡 ${channelName} (${ch.folderCount} folder${ch.folderCount > 1 ? 's' : ''})`;
    if (activeMap.has(channelId)) {
      const folder = await Folder.findOne({ folderId: activeMap.get(channelId) }).lean();
      buttonText += ` ✅ ${folder?.name || ''}`;
    }
    keyboard.push([{ text: buttonText, callback_data: `settings_channel_${channelId}` }]);
  }
  keyboard.push([
    { text: '🔄 Refresh', callback_data: 'settings_refresh' },
    { text: '📊 Status', callback_data: 'settings_status' },
  ]);

  const text = '⚙️ *Channel Settings*\n\n📡 Select a channel to manage its active folder:\n\n' +
    `Total Channels: ${channelsAgg.length}\nActive Mappings: ${activeChannels.length}`;

  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } };
  return messageId
    ? bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts }).catch(() => bot.sendMessage(chatId, text, opts))
    : bot.sendMessage(chatId, text, opts);
}

async function showChannelFolders(bot, chatId, channelId, messageId) {
  const folders = await Folder.find({ channelId }).lean();
  let channelName = channelId;
  try {
    const chat = await bot.getChat(channelId);
    channelName = chat.title || chat.username || channelId;
  } catch {}

  if (folders.length === 0) {
    return bot.editMessageText(`📡 *Channel:* ${channelName}\n\n❌ No folders linked to this channel.`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '« Back', callback_data: 'settings_back' }]] },
    }).catch(() => {});
  }

  const active = await ActiveChannel.findOne({ channelId }).lean();
  const activeFolderId = active?.folderId;

  const keyboard = folders.map(folder => ([{
    text: folder.folderId === activeFolderId ? `✅ ${folder.name}` : `📂 ${folder.name}`,
    callback_data: `settings_setfolder_${channelId}_${folder.folderId}`,
  }]));
  keyboard.push([
    { text: '🔴 Close Active', callback_data: `settings_close_${channelId}` },
    { text: '« Back', callback_data: 'settings_back' },
  ]);

  const text = `📡 *Channel:* ${channelName}\n\n📂 Select folder to set as active:\n\n` +
    `Total Folders: ${folders.length}\n` +
    (activeFolderId ? `Current Active: *${folders.find(f => f.folderId === activeFolderId)?.name || 'Unknown'}*` : 'No active folder');

  return bot.editMessageText(text, {
    chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  }).catch(() => bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }));
}

async function showStatus(bot, chatId, messageId) {
  const totalFolders = await Folder.countDocuments();
  const totalFiles = await FolderFile.countDocuments();
  const activeChannels = await ActiveChannel.find({}).lean();
  const bd = await BOT.findOne().lean();

  let defaultFolderName = 'Not set';
  if (bd?.folderId) {
    const f = await Folder.findOne({ folderId: bd.folderId }).lean();
    defaultFolderName = f?.name || bd.folderId;
  }

  let activeDetails = '';
  for (const ac of activeChannels) {
    const f = await Folder.findOne({ folderId: ac.folderId }).lean();
    let channelName = ac.channelId;
    try {
      const chat = await bot.getChat(ac.channelId);
      channelName = chat.title || chat.username || ac.channelId;
    } catch {}
    activeDetails += `  📡 ${channelName} → 📂 ${f?.name || 'Unknown'}\n`;
  }

  const text = '📊 *System Status*\n\n' +
    `📂 Total Folders: ${totalFolders}\n📄 Total Files: ${totalFiles}\n\n` +
    `🔧 Default Folder: *${defaultFolderName}*\n\n` +
    `📡 Active Channels: ${activeChannels.length}\n` + (activeDetails || '  _None_');

  return bot.editMessageText(text, {
    chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '« Back', callback_data: 'settings_back' }]] },
  }).catch(() => {});
}

export function registerBotHandlers() {
  const bot = getBot();
  if (!bot) { console.warn('[tgbotcloud] Bot not ready — handlers not registered'); return; }
  const { OWNER_ID } = getConfig();
  bot.removeAllListeners();
  bot.setMyCommands([
    { command: 'start',       description: 'Start the bot' },
    { command: 'settings',    description: 'Channel → folder mapping settings' },
    { command: 'activeinfo',  description: 'Show active mappings' },
    { command: 'addf',        description: 'Set default folder' },
    { command: 'clearactive', description: 'Remove channel mapping' },
  ]).catch(e => console.error('setMyCommands:', e.message));

  bot.onText(/\/start(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const param  = match[1]?.trim();
    if (!param) {
      return bot.sendMessage(chatId, '👋 *NexPanel Cloud Bot*\n\nSend any file to save it.', { parse_mode: 'Markdown' });
    }
    const file = await FolderFile.findOne({ uniqueId: param }).lean();
    if (!file) return bot.sendMessage(chatId, '❌ File not found.');
    try {
      await bot.sendDocument(chatId, file.fileId, { caption: `📄 ${file.filename}` });
    } catch (e) { bot.sendMessage(chatId, '❌ ' + e.message); }
  });

  // ── /settings ─ button-based channel → folder picker ─────
  bot.onText(/\/settings/, async (msg) => {
    if (String(msg.from.id) !== String(OWNER_ID)) return;
    await showMainSettings(bot, msg.chat.id);
  });

  // ── Inline-keyboard callback handler for /settings ────────
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data || '';

    if (String(query.from.id) !== String(OWNER_ID)) {
      return bot.answerCallbackQuery(query.id, { text: '❌ Owner only', show_alert: true });
    }

    try {
      if (data === 'settings_back' || data === 'settings_refresh') {
        await showMainSettings(bot, chatId, messageId);
        await bot.answerCallbackQuery(query.id);
      } else if (data === 'settings_status') {
        await showStatus(bot, chatId, messageId);
        await bot.answerCallbackQuery(query.id);
      } else if (data.startsWith('settings_channel_')) {
        const channelId = data.slice('settings_channel_'.length);
        await showChannelFolders(bot, chatId, channelId, messageId);
        await bot.answerCallbackQuery(query.id);
      } else if (data.startsWith('settings_setfolder_')) {
        const rest = data.slice('settings_setfolder_'.length);
        const sep = rest.indexOf('_');
        if (sep === -1) {
          await bot.answerCallbackQuery(query.id, { text: '❌ Malformed request', show_alert: true });
          return;
        }
        const channelId = rest.slice(0, sep);
        const folderId = rest.slice(sep + 1);
        const folder = await Folder.findOne({ folderId }).lean();
        if (!folder) {
          await bot.answerCallbackQuery(query.id, { text: '❌ Folder not found', show_alert: true });
        } else {
          await ActiveChannel.findOneAndUpdate({ channelId }, { channelId, folderId }, { upsert: true });
          await bot.answerCallbackQuery(query.id, { text: `✅ Active: ${folder.name}` });
          await showChannelFolders(bot, chatId, channelId, messageId);
        }
      } else if (data.startsWith('settings_close_')) {
        const channelId = data.slice('settings_close_'.length);
        const removed = await ActiveChannel.findOneAndDelete({ channelId });
        await bot.answerCallbackQuery(query.id, { text: removed ? '✅ Active folder cleared' : '⚠️ No active folder was set' });
        await showChannelFolders(bot, chatId, channelId, messageId);
      } else {
        await bot.answerCallbackQuery(query.id);
      }
    } catch (e) {
      console.error('[tgbotcloud] callback_query error:', e.message);
      bot.answerCallbackQuery(query.id, { text: '❌ Error: ' + e.message, show_alert: true }).catch(() => {});
    }
  });

  // ── /addf <folderId> ─ map current chat/channel to a folder ─
  bot.onText(/^\/addf(?:@\S+)?(?:\s+(\S+))?/, async (msg, match) => {
    const isOwner = String(msg.from?.id) === String(OWNER_ID);
    if (!isOwner) return;

    const chatId    = msg.chat.id;
    const channelId = chatId.toString();
    const folderId  = match?.[1]?.trim();

    if (!folderId) {
      return bot.sendMessage(chatId, '❗ Usage: `/addf <folderId>`', { parse_mode: 'Markdown' });
    }

    const folder = await Folder.findOne({ folderId }).lean();
    if (!folder) return bot.sendMessage(chatId, `❌ No folder found with id \`${folderId}\``, { parse_mode: 'Markdown' });

    // In a channel/group → map that channel to the folder.
    // In a private DM with the owner → set as the global default folder.
    if (msg.chat.type === 'channel' || msg.chat.type === 'supergroup' || msg.chat.type === 'group') {
      await ActiveChannel.findOneAndUpdate(
        { channelId },
        { channelId, folderId },
        { upsert: true }
      );
      return bot.sendMessage(chatId, `✅ This channel is now mapped to folder *${folder.name}*`, { parse_mode: 'Markdown' });
    }

    const bd = await BOT.findOne();
    if (!bd) await BOT.create({ folderId });
    else { bd.folderId = folderId; await bd.save(); }
    bot.sendMessage(chatId, `✅ Default folder set to *${folder.name}*`, { parse_mode: 'Markdown' });
  });

  // ── /activeinfo ─ list channel → folder mappings ────────────
  bot.onText(/\/activeinfo/, async (msg) => {
    if (String(msg.from?.id) !== String(OWNER_ID)) return;
    const chatId = msg.chat.id;

    const mappings = await ActiveChannel.find({}).lean();
    const bd = await BOT.findOne().lean();

    let lines = ['📋 *Active Mappings*', ''];
    if (bd?.folderId) {
      const f = await Folder.findOne({ folderId: bd.folderId }).lean();
      lines.push(`• Default folder → *${f?.name || bd.folderId}* (\`${bd.folderId}\`)`);
    } else {
      lines.push('• No default folder set');
    }

    if (mappings.length) {
      lines.push('', '*Channels:*');
      for (const m of mappings) {
        const f = await Folder.findOne({ folderId: m.folderId }).lean();
        lines.push(`• \`${m.channelId}\` → *${f?.name || m.folderId}* (\`${m.folderId}\`)`);
      }
    } else {
      lines.push('', '_No explicit channel mappings — channels auto-create their own folder._');
    }

    bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  });

  // ── /clearactive <channelId> ─ remove a channel mapping ─────
  bot.onText(/^\/clearactive(?:@\S+)?(?:\s+(\S+))?/, async (msg, match) => {
    if (String(msg.from?.id) !== String(OWNER_ID)) return;
    const chatId = msg.chat.id;
    const channelId = match?.[1]?.trim() || msg.chat.id.toString();

    const removed = await ActiveChannel.findOneAndDelete({ channelId });
    if (removed) {
      bot.sendMessage(chatId, `✅ Mapping removed for \`${channelId}\``, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, `ℹ️ No mapping found for \`${channelId}\``, { parse_mode: 'Markdown' });
    }
  });

  bot.on('channel_post', async (msg) => {
    const channelId = msg.chat.id.toString();
    const hasFile = msg.document || msg.photo || msg.video || msg.audio;
    if (!hasFile) return;
    let folderId = null;
    const ac = await ActiveChannel.findOne({ channelId });
    if (ac?.folderId) folderId = ac.folderId;
    if (!folderId) {
      const linked = await Folder.find({ channelId }).lean();
      if (linked.length === 1) folderId = linked[0].folderId;
      else if (linked.length > 1) {
        const root = linked.find(f => f.parentId === null);
        if (root) folderId = root.folderId;
      }
    }
    if (!folderId) folderId = await ensureFolderForChannel(bot, channelId);
    if (!folderId) {
      const bd = await BOT.findOne();
      if (bd?.folderId) folderId = bd.folderId;
    }
    if (!folderId) { console.warn(`[tgbotcloud] No folder resolved for channel ${channelId}`); return; }
    const { filename, fileId, fileSize, thumbId } = extractFileInfo(msg);
    addToBatch(bot, channelId, folderId, filename, fileId, fileSize, thumbId, msg.message_id);
  });

  bot.on('message', async (msg) => {
    if (String(msg.from?.id) !== String(OWNER_ID)) return;
    const hasFile = msg.document || msg.photo || msg.video || msg.audio;
    if (!hasFile) return;
    let folderId = null;
    const bd = await BOT.findOne();
    if (bd?.folderId) {
      folderId = bd.folderId;
    } else {
      const { DB_CHANNEL_ID } = getConfig();
      if (DB_CHANNEL_ID) folderId = await ensureFolderForChannel(bot, DB_CHANNEL_ID);
    }
    if (!folderId) {
      return bot.sendMessage(msg.chat.id, '❌ No default folder set.\nUse /addf <folderId>');
    }
    const { filename, fileId, fileSize, thumbId } = extractFileInfo(msg);
    const uniqueId = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    await FolderFile.create({ folderId, filename: sanitize(filename), fileId, uniqueId, size: fileSize, thumbId, messageId: msg.message_id, channelId: msg.chat.id.toString() });
    bot.sendMessage(msg.chat.id, `✅ Saved: ${sanitize(filename)}`);
  });

  console.log('[tgbotcloud] Bot handlers registered');
}

function addToBatch(bot, channelId, folderId, filename, fileId, fileSize, thumbId, messageId) {
  if (!fileBatches.has(channelId)) fileBatches.set(channelId, { folderId, files: [], timer: null });
  const batch = fileBatches.get(channelId);
  batch.folderId = folderId;
  batch.files.push({ filename, fileId, fileSize, thumbId, messageId });
  if (batch.timer) clearTimeout(batch.timer);
  batch.timer = setTimeout(() => processBatch(bot, channelId), BATCH_WAIT);
}

async function processBatch(bot, channelId) {
  const { OWNER_ID } = getConfig();
  const batch = fileBatches.get(channelId);
  if (!batch?.files.length) return;
  fileBatches.delete(channelId);
  const { folderId, files } = batch;
  for (const f of files) {
    const uniqueId = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    try {
      await FolderFile.create({ folderId, filename: sanitize(f.filename), fileId: f.fileId, uniqueId, size: f.fileSize, thumbId: f.thumbId, messageId: f.messageId, channelId });
    } catch (e) { console.error('[tgbotcloud] File save failed:', e.message); }
  }
  if (OWNER_ID) {
    try { await bot.sendMessage(OWNER_ID, `✅ Batch saved (${files.length} files) → folder ${folderId}`); } catch {}
  }
}
