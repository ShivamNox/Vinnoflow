// index.js
import { connectDB } from "./config/db.js";
import { refreshConfigFromDB, getConfig } from "./config/vars.js";
import { app, addCatchAll } from "./app.js";
import { initScrapers } from './features/scrapers/scrapers.js';

async function boot() {
  console.log("[boot] Starting...");

  // ── Settings routes ──
  try {
    const { default: settingsRouter } = await import(
      "./features/settings/settingsRoutes.js"
    );
    app.use("/setup", settingsRouter);
    app.use("/profile", settingsRouter);
    console.log("[boot] Settings routes mounted");
  } catch (e) {
    console.error("[boot] settingsRoutes FAILED:", e);
  }

  // ── DB ──
  const cfg = getConfig();
  console.log("[boot] MONGO_URI exists:", !!cfg.MONGO_URI);

  if (cfg.MONGO_URI) {
    const result = await connectDB(cfg.MONGO_URI);
    console.log("[boot] DB connect result:", result);
    if (result.ok) {
      await refreshConfigFromDB();
      console.log("[boot] Config refreshed from DB");
    }
  }

  // ── Cloud routes ──
  console.log("[boot] Loading tgwebcloud...");
  try {
    const { initRoutes } = await import("./features/tgcloud/tgwebcloud.js");
    await initRoutes();
    console.log("[boot] tgwebcloud routes registered");
  } catch (e) {
    console.error("[boot] tgwebcloud import FAILED:");
    console.error(e);
  }

  // 6. Initialize scrapers
  console.log('6️⃣ Initializing scrapers...');
  const scraperRoutes = await import('./features/scrapers/scraperRoutes.js');
  app.use('/api/scrapers', scraperRoutes.default);
  await initScrapers();

  // ── Telegram init ──
  const fullCfg = getConfig();
  console.log(
    "[boot] TG creds exist:",
    !!(fullCfg.API_ID && fullCfg.API_HASH && fullCfg.BOT_TOKEN),
  );

  if (fullCfg.API_ID && fullCfg.API_HASH && fullCfg.BOT_TOKEN) {
    try {
      const { initClient } = await import("./features/tgcloud/tgwebcloud.js");
      await initClient();
      console.log("[boot] MTProto ready");
    } catch (e) {
      console.warn("[boot] MTProto init failed:", e.message);
    }

    try {
      const { reinitBot } = await import("./bot.js");
      await reinitBot();
      const { registerBotHandlers } = await import(
        "./features/tgcloud/tgbotcloud.js"
      );
      registerBotHandlers();
      console.log("[boot] Bot ready");
    } catch (e) {
      console.warn("[boot] Bot init failed:", e.message);
    }
  }

  // ── Add React catch-all LAST (after all API routes) ──
  addCatchAll();

  // ── Start ──
  const port = getConfig().PORT || 3000;
  app.listen(port, () => {
    console.log(
      `[boot] Running at http://localhost:${port}\n\nGive a Star to the repo if you like it! 🌟\nhttps://github.com/shivamnox/vinnoflow`,
    );
  });
}

boot().catch((err) => {
  console.error("[boot] Fatal:", err);
  process.exit(1);
});
