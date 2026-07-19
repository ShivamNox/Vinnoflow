// features/tgcloud/tgwebcloud.js

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import multer from "multer";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { CustomFile } from "telegram/client/uploads.js";
import authMiddleware from "../../auth/auth.js";
import { Folder, FolderFile, ShareLink } from "./Models/FileModels.js";
import { getConfig, refreshConfigFromDB, writeEnvValues } from "../../config/vars.js";

const CHUNK   = 1024 * 1024;
const PREFETCH = 15;

const senders   = new Map();
const metaCache = new Map();
const chunkCache = {
  data: new Map(),
  maxAge: 120000,
  maxSize: 50,
  key: (id, off) => `${id}_${off}`,
  get(id, off) {
    const k = this.key(id, off);
    const e = this.data.get(k);
    if (!e) return null;
    if (Date.now() - e.ts > this.maxAge) { this.data.delete(k); return null; }
    e.ts = Date.now();
    return e.buf;
  },
  set(id, off, buf) {
    if (this.data.size >= this.maxSize) {
      const old = [...this.data.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < 10; i++) this.data.delete(old[i][0]);
    }
    this.data.set(this.key(id, off), { buf, ts: Date.now() });
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _client = null;

export async function initClient() {
  if (_client?.connected) return _client;
  const cfg = getConfig();
  if (!cfg.API_ID || !cfg.API_HASH || !cfg.BOT_TOKEN) {
    console.warn("[tgwebcloud] Telegram credentials not configured — skipping MTProto init");
    return null;
  }
  let sessionString = "";
  try {
    const { Settings } = await import("../settings/Models/SettingsModel.js");
    const doc = await Settings.findOne({});
    sessionString = doc?.telegram?.session || cfg.TG_SESSION || "";
  } catch {
    sessionString = cfg.TG_SESSION || "";
  }
  if (_client) { try { await _client.disconnect(); } catch {} _client = null; }
  _client = new TelegramClient(new StringSession(sessionString), Number(cfg.API_ID), cfg.API_HASH, { connectionRetries: 5 });
  await _client.start({ botAuthToken: cfg.BOT_TOKEN });
  const savedSession = _client.session.save();
  try {
    const { Settings } = await import("../settings/Models/SettingsModel.js");
    const doc = await Settings.findOne({});
    if (doc) { doc.telegram.session = savedSession; doc.telegram.connected = true; await doc.save(); }
  } catch (e) { console.warn("[tgwebcloud] Could not save session to DB:", e.message); }
  writeEnvValues({ TG_SESSION: savedSession });
  await refreshConfigFromDB();
  console.log("[tgwebcloud] MTProto client connected, session saved");
  return _client;
}

export async function reinitClient() {
  try {
    if (_client) { try { await _client.disconnect(); } catch {} _client = null; }
    await initClient();
    return { ok: true };
  } catch (e) {
    console.error("[tgwebcloud] reinitClient failed:", e.message);
    return { ok: false, error: e.message };
  }
}

export function getClient() { return _client; }

let _app = null;
async function getApp() {
  if (_app) return _app;
  const mod = await import("../../app.js");
  _app = mod.app;
  return _app;
}

const MAX_FILES_PER_UPLOAD = 20;
// Stream straight to disk instead of buffering in memory — with up to
// MAX_FILES_PER_UPLOAD files at 2GB each, memoryStorage would risk OOM.
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => cb(null, `vnf_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`),
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: 2 * 1024 * 1024 * 1024, files: MAX_FILES_PER_UPLOAD } });
// Accept both the new multi-file field ("files") and the legacy single-file
// field ("file") so older callers keep working.
const uploadFields = upload.fields([
  { name: "files", maxCount: MAX_FILES_PER_UPLOAD },
  { name: "file", maxCount: 1 },
]);

const fmtSize = (b) => {
  if (!b) return "";
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(1) + " " + ["B", "KB", "MB", "GB"][i];
};

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function getSender(dc) {
  const client = getClient();
  if (!client) throw new Error("Cloud not connected");
  if (senders.get(dc)?._connected) return senders.get(dc);
  senders.delete(dc);
  const s = await client.getSender(dc);
  senders.set(dc, s);
  return s;
}

function fileInfo(msg) {
  const m = msg.media;
  let name = "file", size = 0, mime = "application/octet-stream";
  if (m?.document) {
    const d = m.document;
    size = Number(d.size);
    mime = d.mimeType || mime;
    d.attributes?.forEach((a) => {
      if (a.className === "DocumentAttributeFilename") name = a.fileName;
      else if (a.className === "DocumentAttributeVideo" && name === "file") name = `video_${msg.id}.mp4`;
      else if (a.className === "DocumentAttributeAudio" && name === "file") name = `audio_${msg.id}.mp3`;
    });
  } else if (m?.photo) {
    name = `photo_${msg.id}.jpg`;
    mime = "image/jpeg";
    m.photo.sizes?.forEach((s) => { size = Math.max(size, s.size || 0); });
  }
  return { name, size, mime };
}

function fileHash(msg) {
  const m = msg.media;
  const raw = m?.document ? `${m.document.id}${m.document.accessHash}` : m?.photo ? `${m.photo.id}${m.photo.accessHash}` : "";
  return crypto.createHash("md5").update(raw).digest("hex").slice(0, 6);
}

async function getProps(msgId, channelId) {
  const { DB_CHANNEL_ID } = getConfig();
  const resolvedChannel = channelId || DB_CHANNEL_ID;
  // Message IDs are only unique per-channel, so the cache key must include
  // the channel — otherwise two different channels can collide on the same
  // numeric msgId and serve each other's file metadata/bytes.
  const cacheKey = `${resolvedChannel}:${msgId}`;
  let p = metaCache.get(cacheKey);
  if (p) return p;
  const client = getClient();
  if (!client) throw new Error("Cloud not connected");
  const [msg] = await client.getMessages(resolvedChannel, { ids: [parseInt(msgId)] });
  if (!msg?.media) throw new Error("File not found");
  const info = fileInfo(msg), hash = fileHash(msg);
  const m = msg.media, isDoc = !!m.document, src = isDoc ? m.document : m.photo;
  p = {
    ...info, hash, dc: src.dcId, cacheKey,
    loc: isDoc
      ? new Api.InputDocumentFileLocation({ id: src.id, accessHash: src.accessHash, fileReference: src.fileReference, thumbSize: "" })
      : new Api.InputPhotoFileLocation({ id: src.id, accessHash: src.accessHash, fileReference: src.fileReference, thumbSize: src.sizes?.slice(-1)[0]?.type || "y" }),
  };
  if (metaCache.size >= 500) metaCache.delete(metaCache.keys().next().value);
  metaCache.set(cacheKey, p);
  return p;
}

async function prefetch(fileId, props, fromOff) {
  let off = fromOff, fetched = 0, sender;
  try { sender = await getSender(props.dc); } catch { return; }
  while (fetched < PREFETCH && off < props.size) {
    if (chunkCache.get(fileId, off)) { off += CHUNK; continue; }
    try {
      const r = await sender.send(new Api.upload.GetFile({ location: props.loc, offset: BigInt(off), limit: CHUNK }));
      if (r.bytes?.length) { chunkCache.set(fileId, off, Buffer.from(r.bytes)); fetched++; }
      off += CHUNK;
      await sleep(30);
    } catch (e) {
      if (e.message?.includes("FLOOD") || e.seconds) { await sleep((e.seconds || 2) * 1000); continue; }
      break;
    }
  }
}

async function streamFile(req, res, uniqueId, forceDownload = false) {
  const file = await FolderFile.findOne({ uniqueId }).lean();
  if (!file) return res.status(404).send("File not found");
  const msgId = file.messageId;
  if (!msgId) return res.status(404).send("No message ID for this file");
  const p = await getProps(msgId, file.channelId);
  const range = req.headers.range;
  let start = 0, end = p.size - 1;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) { start = m[1] ? +m[1] : 0; end = m[2] ? +m[2] : p.size - 1; }
  }
  if (start >= p.size) return res.status(416).set({ "Content-Range": `bytes */${p.size}` }).end();
  end = Math.min(end, p.size - 1);
  const disposition = forceDownload ? `attachment; filename="${encodeURIComponent(p.name)}"` : `inline; filename="${encodeURIComponent(p.name)}"`;
  res.status(range ? 206 : 200).set({
    "Content-Type": p.mime, "Content-Length": end - start + 1, "Accept-Ranges": "bytes",
    "Content-Disposition": disposition, "Cache-Control": "public, max-age=31536000",
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${p.size}` } : {}),
  });
  const alignedStart = Math.floor(start / CHUNK) * CHUNK;
  prefetch(p.cacheKey, p, alignedStart);
  let off = alignedStart, skip = start - off, left = end - start + 1, done = false, retries = 0;
  req.on("close", () => { done = true; });
  let sender = await getSender(p.dc);
  while (left > 0 && !done && !res.destroyed) {
    try {
      let chunk = chunkCache.get(p.cacheKey, off);
      if (!chunk) {
        const r = await sender.send(new Api.upload.GetFile({ location: p.loc, offset: BigInt(off), limit: CHUNK }));
        if (!r.bytes?.length) break;
        chunk = Buffer.from(r.bytes);
        chunkCache.set(p.cacheKey, off, chunk);
      }
      if (skip) { chunk = chunk.slice(skip); skip = 0; }
      if (chunk.length > left) chunk = chunk.slice(0, left);
      if (chunk.length && !res.destroyed) {
        const ok = res.write(chunk);
        left -= chunk.length;
        if (!ok) await new Promise((r) => {
          const t = setTimeout(r, 30000);
          res.once("drain", () => { clearTimeout(t); r(); });
        });
      }
      off += CHUNK; retries = 0;
    } catch (err) {
      if (err.message?.includes("FLOOD") || err.seconds) { await sleep((err.seconds || 2) * 1000); continue; }
      if (err.message?.includes("FILE_REFERENCE")) { metaCache.delete(p.cacheKey); return res.end(); }
      if (++retries > 5) break;
      senders.delete(p.dc);
      await sleep(1000 * retries);
      sender = await getSender(p.dc);
    }
  }
  if (!res.destroyed && !res.writableEnded) res.end();
}

// ── Public share page helper ──────────────────────────────────────────────────
function sharePageHtml(share) {
  const escHtml = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  const safeFn  = escHtml(share.filename);
  const ext     = share.filename.toLowerCase().split(".").pop();
  const videoExts = new Set(["mp4","mkv","mov","avi","webm"]);
  const audioExts = new Set(["mp3","m4a","ogg","wav"]);
  const imageExts = new Set(["jpg","jpeg","png","gif","webp"]);
  const pdfExts   = new Set(["pdf"]);
  const isVideo = videoExts.has(ext), isAudio = audioExts.has(ext);
  const isImage = imageExts.has(ext), isPdf   = pdfExts.has(ext);
  const streamUrl = `/share/stream/${share.token}`;
  const downloadUrl = `/share/download/${share.token}`;
  const fmtSz = (b) => { if (!b) return ""; if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b/1024).toFixed(1)} KB`; if (b < 1073741824) return `${(b/1048576).toFixed(1)} MB`; return `${(b/1073741824).toFixed(2)} GB`; };
  const iconName = isVideo ? "fa-film" : isAudio ? "fa-music" : isImage ? "fa-image" : isPdf ? "fa-file-pdf" : "fa-file";
  let previewHtml = "";
  if (isVideo) previewHtml = `<div class="sp-player"><video id="vidP" playsinline controls style="width:100%;max-height:60vh;border-radius:8px;background:#000"><source src="${streamUrl}" type="video/mp4"></video></div>`;
  else if (isImage) previewHtml = `<div class="sp-player" style="text-align:center"><div id="imgSpin" style="padding:40px 0;color:#8b949e"><i class="fas fa-spinner fa-spin" style="font-size:32px;color:#3b82f6"></i><p style="margin-top:12px;font-size:13px">Loading…</p></div><img id="spImg" src="" style="max-width:100%;max-height:70vh;border-radius:8px;display:none;margin:0 auto"/><div id="imgErr" style="display:none;padding:40px 0;color:#f85149">Failed to load image.</div></div><script>(function(){var img=document.getElementById('spImg'),spin=document.getElementById('imgSpin'),err=document.getElementById('imgErr');img.onload=function(){spin.style.display='none';img.style.display='block';};img.onerror=function(){spin.style.display='none';err.style.display='block';};img.src='${streamUrl}';})()\u003c/script>`;
  else if (isPdf) previewHtml = `<div class="sp-player" style="flex:1"><iframe src="${streamUrl}" style="width:100%;height:70vh;border:none;border-radius:8px" title="PDF Preview"></iframe></div>`;
  else if (isAudio) previewHtml = `<div class="sp-player" style="text-align:center;padding:30px 0"><i class="fas fa-music" style="font-size:64px;color:#3b82f6;margin-bottom:24px;display:block;opacity:.8"></i><audio controls style="width:100%;max-width:480px" autoplay><source src="${streamUrl}"></audio></div>`;
  else previewHtml = `<div class="sp-player" style="text-align:center;padding:50px 0"><i class="fas fa-file" style="font-size:64px;color:#f59e0b;margin-bottom:20px;display:block;opacity:.8"></i><p style="color:#8b949e;font-size:14px;margin-bottom:24px">Preview not available for this file type.</p><a href="${downloadUrl}" download="${safeFn}"><button style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:10px 24px;font-size:14px;cursor:pointer"><i class="fas fa-download"></i> Download File</button></a></div>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeFn} — Vinnoflow Share</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"><style>body{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:0;background:var(--bg,#0a0a0f)}.sp-wrap{width:100%;max-width:860px;margin:0 auto;padding:24px 20px 48px}.sp-brand{display:flex;align-items:center;gap:10px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid var(--brd,#26262f)}.sp-brand-logo{font-size:18px;font-weight:700;color:var(--txt,#f4f4f5)}.sp-card{background:var(--surf,#101014);border:1px solid var(--brd,#26262f);border-radius:10px;overflow:hidden}.sp-hdr{padding:16px 20px;border-bottom:1px solid var(--brd,#26262f);display:flex;align-items:center;gap:12px;flex-wrap:wrap}.sp-icon{width:38px;height:38px;background:var(--surf-2,#17171d);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--pri,#8b5cf6);flex-shrink:0}.sp-meta{flex:1;min-width:0}.sp-fn{font-size:14px;font-weight:600;color:var(--txt,#f4f4f5);word-break:break-all}.sp-sz{font-size:12px;color:var(--txt-m,#a1a1aa);margin-top:2px}.sp-dl{background:var(--pri,#8b5cf6);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:500}.sp-player{padding:16px}.sp-footer{text-align:center;margin-top:32px;font-size:12px;color:var(--txt-d,#71717a)}</style></head><body><div class="sp-wrap"><div class="sp-brand"><div class="lt-icon" style="width:30px;height:30px;background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px"><i class="fas fa-bolt"></i></div><div class="sp-brand-logo">Vinnoflow</div><span style="font-size:12px;color:var(--txt-m,#a1a1aa);margin-left:6px">Shared File</span></div><div class="sp-card"><div class="sp-hdr"><div class="sp-icon"><i class="fas ${iconName}"></i></div><div class="sp-meta"><div class="sp-fn">${safeFn}</div>${fmtSz(share.size) ? `<div class="sp-sz">${fmtSz(share.size)}</div>` : ""}</div><a class="sp-dl" href="${downloadUrl}" download="${safeFn}"><i class="fas fa-download"></i> Download</a></div>${previewHtml}</div><div class="sp-footer">Shared via Vinnoflow · Telegram-powered cloud storage</div></div></body></html>`;
}

// ── initRoutes: called from index.js AFTER mounting all other routes ───────────
export async function initRoutes() {
  const app = await getApp();

  // ── GET /api/cloud/folders ─────────────────────────────────────────────────
  app.get("/api/cloud/folders", authMiddleware, wrap(async (req, res) => {
    const { DB_CHANNEL_ID } = getConfig();
    const folders = await Folder.find({ parentId: null }).lean();
    res.json({ ok: true, folders, dbChannelId: DB_CHANNEL_ID });
  }));

  // ── GET /api/cloud/folder-data/* ──────────────────────────────────────────
  app.get("/api/cloud/folder-data/*", authMiddleware, wrap(async (req, res) => {
    const segs = req.params[0].split("/").filter(Boolean);
    let cur = null;
    for (const seg of segs) {
      cur = await Folder.findOne({ name: decodeURIComponent(seg), parentId: cur ? cur.folderId : null });
      if (!cur) return res.status(404).json({ ok: false, error: `Folder not found: ${seg}` });
    }
    const [files, subfolders, allFolders] = await Promise.all([
      FolderFile.find({ folderId: cur.folderId }).lean(),
      Folder.find({ parentId: cur.folderId }).lean(),
      Folder.find({}, "name folderId").lean(),
    ]);
    files.sort((a, b) => a.filename.localeCompare(b.filename));
    const breadcrumb = [{ label: "Cloud", url: "/cloud" }];
    let bPath = "";
    segs.forEach((s, i) => {
      bPath += (i ? "/" : "") + s;
      breadcrumb.push({ label: decodeURIComponent(s), url: `/cloud/folder/${bPath}`, last: i === segs.length - 1 });
    });
    res.json({ ok: true, folder: cur, subfolders, files, breadcrumb, allFolders });
  }));

  // ── POST /cloud/folder ─────────────────────────────────────────────────────
  app.post("/cloud/folder", authMiddleware, wrap(async (req, res) => {
    const { DB_CHANNEL_ID } = getConfig();
    const { name, parentId, channelId } = req.body;
    if (!name) return res.json({ ok: false, error: "Folder name required" });
    const folderId = (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toLowerCase();
    const resolvedChannelId = channelId?.trim() || String(DB_CHANNEL_ID);
    await Folder.create({ name, folderId, parentId: parentId || null, channelId: resolvedChannelId });
    res.json({ ok: true, folderId });
  }));

  // ── POST /cloud/folder/rename ──────────────────────────────────────────────
  app.post("/cloud/folder/rename", authMiddleware, wrap(async (req, res) => {
    const { folderId, newName } = req.body;
    if (!folderId || !newName) return res.json({ ok: false, error: "folderId and newName required" });
    await Folder.updateOne({ folderId }, { name: newName });
    res.json({ ok: true });
  }));

  // ── POST /cloud/folder/:name/delete ───────────────────────────────────────
  app.post("/cloud/folder/:name/delete", authMiddleware, wrap(async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const folder = await Folder.findOne({ name, parentId: null });
    if (folder) {
      await FolderFile.deleteMany({ folderId: folder.folderId });
      await Folder.deleteOne({ _id: folder._id });
    }
    res.json({ ok: true });
  }));

  // ── POST /cloud/folder/delete ──────────────────────────────────────────────
  app.post("/cloud/folder/delete", authMiddleware, wrap(async (req, res) => {
    const { folderId } = req.body;
    if (!folderId) return res.json({ ok: false, error: "folderId required" });
    await FolderFile.deleteMany({ folderId });
    await Folder.deleteOne({ folderId });
    res.json({ ok: true });
  }));

  // ── POST /cloud/file/rename ────────────────────────────────────────────────
  // Uses uniqueId as the stable identifier (fileId may be empty for uploaded files)
  app.post("/cloud/file/rename", authMiddleware, wrap(async (req, res) => {
    const { uniqueId, newFilename } = req.body;
    if (!uniqueId || !newFilename) return res.json({ ok: false, error: "uniqueId and newFilename required" });
    await FolderFile.updateOne({ uniqueId }, { filename: newFilename });
    res.json({ ok: true });
  }));

  // ── POST /cloud/file/move ──────────────────────────────────────────────────
  app.post("/cloud/file/move", authMiddleware, wrap(async (req, res) => {
    const { uniqueId, newFolderId } = req.body;
    if (!uniqueId || !newFolderId) return res.json({ ok: false, error: "uniqueId and newFolderId required" });
    await FolderFile.updateOne({ uniqueId }, { folderId: newFolderId });
    res.json({ ok: true });
  }));

  // ── POST /cloud/file/delete ────────────────────────────────────────────────
  app.post("/cloud/file/delete", authMiddleware, wrap(async (req, res) => {
    const { uniqueId } = req.body;
    if (!uniqueId) return res.json({ ok: false, error: "uniqueId required" });
    await FolderFile.deleteOne({ uniqueId });
    res.json({ ok: true });
  }));

  // ── POST /cloud/upload — accepts one or many files in a single request ────
  app.post("/cloud/upload", authMiddleware, (req, res, next) => {
    uploadFields(req, res, (err) => {
      if (err) {
        // Multer errors (too many files, oversized file, bad field, etc.)
        // happen before our handler runs — surface them the same way the
        // handler reports errors so the frontend always gets a clear signal.
        console.error("Upload middleware error:", err.message);
        res.status(400).json({ phase: "error", message: err.message || "Upload failed" });
        return;
      }
      next();
    });
  }, async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    if (res.flushHeaders) res.flushHeaders();
    const sendProgress = (data) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {} };
    const formatBytes = (bytes) => {
      if (!bytes) return "0 B";
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
      if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
      return (bytes / 1073741824).toFixed(2) + " GB";
    };
    // Normalize files from both possible fields into one flat list; clean up
    // any written temp files if we bail out before the main loop takes over.
    const files = [...(req.files?.files || []), ...(req.files?.file || [])];
    const cleanupAll = () => { for (const f of files) { try { fs.unlinkSync(f.path); } catch {} } };
    try {
      const { DB_CHANNEL_ID } = getConfig();
      const client = getClient();
      if (!client) { sendProgress({ phase: "error", message: "Cloud not connected." }); cleanupAll(); return res.end(); }
      const { folderId } = req.body;
      if (!files.length || !folderId) { sendProgress({ phase: "error", message: "Missing file(s) or folderId" }); cleanupAll(); return res.end(); }

      // Route the upload to the channel the folder is linked to (per-folder
      // channel mapping), falling back to the default DB channel only when
      // the folder has no channelId of its own. This mirrors the bot's
      // per-channel folder routing so web and Telegram uploads stay in sync.
      const folder = await Folder.findOne({ folderId }).lean();
      const targetChannel = folder?.channelId || DB_CHANNEL_ID;

      const totalFiles = files.length;
      let successCount = 0;
      const failures = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.originalname, totalSize = file.size;
        const fileMeta = { fileName, fileIndex: i, totalFiles };

        sendProgress({ phase: "server_done", ...fileMeta, uploaded: formatBytes(totalSize), total: formatBytes(totalSize) });
        sendProgress({ phase: "telegram_progress", ...fileMeta, percent: 0, uploaded: "0 B", total: formatBytes(totalSize) });

        // Multer's diskStorage already wrote this file to a temp path on
        // disk — GramJS CustomFile just needs that path, no extra buffering.
        const tmpPath = file.path;

        let lastProgress = 0;
        try {
          const customFile = new CustomFile(fileName, totalSize, tmpPath);
          const uploadedFile = await client.uploadFile({
            file: customFile, workers: 4,
            onProgress: (progress) => {
              const pct = Math.min(99, Math.round(progress * 100));
              if (pct - lastProgress >= 1 || pct === 99) {
                lastProgress = pct;
                sendProgress({ phase: "telegram_progress", ...fileMeta, percent: pct, uploaded: formatBytes(Math.round(totalSize * progress)), total: formatBytes(totalSize) });
              }
            },
          });
          const msg = await client.sendFile(targetChannel, { file: uploadedFile, caption: fileName, forceDocument: true });
          const uniqueId = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
          await FolderFile.create({ folderId, filename: fileName, fileId: "", messageId: msg.id, channelId: String(targetChannel), uniqueId, size: totalSize });
          sendProgress({ phase: "telegram_progress", ...fileMeta, percent: 100, uploaded: formatBytes(totalSize), total: formatBytes(totalSize) });
          sendProgress({ phase: "file_complete", ...fileMeta });
          successCount++;
        } catch (fileErr) {
          console.error(`Upload error (file ${i + 1}/${totalFiles}, ${fileName}):`, fileErr.message);
          failures.push(fileName);
          sendProgress({ phase: "file_error", ...fileMeta, message: fileErr.message });
        } finally {
          // Always clean up temp file regardless of success or failure
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      }

      if (successCount > 0) {
        sendProgress({ phase: "complete", totalFiles, successCount, failedCount: failures.length, failures });
      } else {
        sendProgress({ phase: "error", message: failures.length ? `All ${failures.length} file(s) failed to upload.` : "Upload failed." });
      }
      res.end();
    } catch (err) {
      console.error("Upload error:", err.message);
      sendProgress({ phase: "error", message: err.message });
      // Any files not yet reached (or already cleaned up) by the per-file
      // loop's own finally block are removed here so an early failure
      // (e.g. folder lookup, config) never leaves temp files on disk.
      cleanupAll();
      res.end();
    }
  });

  // ── GET /stream/:uniqueId ──────────────────────────────────────────────────
  app.get("/stream/:uniqueId", authMiddleware, wrap(async (req, res) => {
    try { await streamFile(req, res, req.params.uniqueId, false); }
    catch (err) { console.error("Stream:", err.message); if (!res.headersSent) res.status(500).send(err.message); else if (!res.writableEnded) res.end(); }
  }));

  // ── GET /download/:filename ────────────────────────────────────────────────
  app.get("/download/:filename", authMiddleware, wrap(async (req, res) => {
    const uniqueId = req.query.uniqueId;
    if (!uniqueId) return res.status(400).send("Missing uniqueId");
    try { await streamFile(req, res, uniqueId, true); }
    catch (err) { console.error("Download:", err.message); if (!res.headersSent) res.status(500).send(err.message); else if (!res.writableEnded) res.end(); }
  }));

  // ── GET /api/thumb-url ─────────────────────────────────────────────────────
  app.get("/api/thumb-url", authMiddleware, wrap(async (req, res) => {
    const { BOT_TOKEN } = getConfig();
    const { thumbId } = req.query;
    if (!thumbId) return res.status(400).json({ error: "Missing thumbId" });
    const file = await FolderFile.findOne({ uniqueId: thumbId }).lean();
    if (file) return res.json({ url: `/stream/${thumbId}` });
    try {
      const { getBot } = await import("../../bot.js");
      const bot = getBot();
      if (!bot) return res.status(503).json({ error: "Bot not initialized" });
      const tf = await bot.getFile(thumbId);
      return res.json({ url: `https://api.telegram.org/file/bot${BOT_TOKEN}/${tf.file_path}` });
    } catch { return res.status(404).json({ error: "Thumb not found" }); }
  }));

  // ── POST /cloud/share ──────────────────────────────────────────────────────
  app.post("/cloud/share", authMiddleware, async (req, res) => {
    try {
      const { uniqueId } = req.body;
      if (!uniqueId) return res.status(400).json({ error: "Missing uniqueId" });
      const file = await FolderFile.findOne({ uniqueId }).lean();
      if (!file) return res.status(404).json({ error: "File not found" });
      let share = await ShareLink.findOne({ uniqueId }).lean();
      if (!share) {
        const token = crypto.randomBytes(20).toString("hex");
        share = await ShareLink.create({ token, uniqueId: file.uniqueId, fileId: file.fileId || "", filename: file.filename, size: file.size });
      }
      res.json({ token: share.token, url: `/share/${share.token}` });
    } catch (err) { console.error("Share create:", err.message); res.status(500).json({ error: "Server error" }); }
  });

  // ── GET /cloud/setup-status ────────────────────────────────────────────────
  app.get("/cloud/setup-status", authMiddleware, (req, res) => {
    const cfg = getConfig();
    res.json({ configured: !!(cfg.API_ID && cfg.API_HASH && cfg.BOT_TOKEN && cfg.DB_CHANNEL_ID), connected: !!_client });
  });

  // ── GET /share/stream/:token ───────────────────────────────────────────────
  app.get("/share/stream/:token", wrap(async (req, res) => {
    const share = await ShareLink.findOne({ token: req.params.token }).lean();
    if (!share) return res.status(404).send("Share link not found");
    try { await streamFile(req, res, share.uniqueId, false); }
    catch (err) { console.error("Share stream:", err.message); if (!res.headersSent) res.status(500).send(err.message); else if (!res.writableEnded) res.end(); }
  }));

  // ── GET /share/download/:token ─────────────────────────────────────────────
  app.get("/share/download/:token", wrap(async (req, res) => {
    const share = await ShareLink.findOne({ token: req.params.token }).lean();
    if (!share) return res.status(404).send("Share link not found");
    try { await streamFile(req, res, share.uniqueId, true); }
    catch (err) { console.error("Share download:", err.message); if (!res.headersSent) res.status(500).send(err.message); else if (!res.writableEnded) res.end(); }
  }));

  // ── GET /share/:token ──────────────────────────────────────────────────────
  app.get("/share/:token", wrap(async (req, res) => {
    const share = await ShareLink.findOne({ token: req.params.token }).lean();
    if (!share) return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not Found</title></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0f;color:#a1a1aa;font-family:system-ui"><div style="text-align:center"><div style="font-size:3rem;margin-bottom:1rem">🔗</div><h2 style="color:#f4f4f5;margin-bottom:.5rem">Link Not Found</h2><p>This share link is invalid or has been removed.</p></div></body></html>`);
    res.send(sharePageHtml(share));
  }));

  // ── Cleanup interval ───────────────────────────────────────────────────────
  setInterval(() => {
    for (const [dc, s] of senders) if (!s._connected) senders.delete(dc);
    const now = Date.now();
    for (const [k, v] of chunkCache.data) if (now - v.ts > chunkCache.maxAge) chunkCache.data.delete(k);
  }, 30000);

  console.log("[tgwebcloud] All routes registered");
}
