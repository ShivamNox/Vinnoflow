<div align="center">

# 🌊 Vinnoflow

**Your all-in-one self-hosted automation platform.**

Bots · Cloud Storage · Automation · Scrapers · AI Agents — all in one dashboard.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/shivamnox/Vinnoflow)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Stars](https://img.shields.io/github/stars/shivamnox/Vinnoflow?style=social)](https://github.com/shivamnox/Vinnoflow)

</div>

---

## 🎯 What is Vinnoflow?

**Vinnoflow** is a modular, self-hosted platform designed to be the **command center for builders**.

Instead of juggling 10 different tools — a cloud service, a bot host, a scraper runner, an automation platform — Vinnoflow brings them all under **one beautiful dashboard**.

> **Zero config files. Everything set up from your browser.**

---

## 🧩 Modules

Vinnoflow is built as a **modular platform**. Each module is independent — enable only what you need.

| Module | Status | Description |
|---|---|---|
| ☁️ **Cloud Storage** | ✅ **Live (v1)** | Telegram-powered unlimited storage with web UI |
| 🤖 **Bot Templates** | 🚧 Coming Soon | Deploy pre-built Telegram bots in one click |
| ⚡ **Automation Flows** | 🚧 Coming Soon | Visual workflow builder (like Zapier / n8n) |
| 🕷️ **Web Scrapers** | 🗓️ Planned | Scheduled scrapers with data export |
| 🧠 **AI Agents** | 🗓️ Planned | Chat agents, task agents, autonomous bots |
| 🔐 **Credential Vault** | 🗓️ Planned | Secure storage for API keys and secrets |

---

## ✨ Current Release — v1.0 (Cloud Storage)

The first module of Vinnoflow lets you turn Telegram into your **personal cloud drive**.

### Features
- 🌐 Clean, mobile-friendly dashboard
- ☁️ **Unlimited free storage** via Telegram
- 📤 Upload files up to **2 GB** with live progress
- 🎥 In-browser **video streaming** with seek
- 🔗 **Public share links** — no login required to view
- 📁 Nested folders, rename, move, delete
- 🤖 Upload via Telegram bot (DM or channel post)
- 🔒 Secure login (bcrypt hashed passwords, session auth)
- ⚙️ **Zero config files** — full setup through browser wizard

---

## 🚀 Quick Start

```bash
git clone https://github.com/shivamnox/Vinnoflow.git
cd Vinnoflow
npm install && npm start
```

Then open **http://localhost:3000** and follow the setup wizard 🎉

---

## 📝 Setup — 3 Simple Screens

### 1️⃣ Connect Database
Free MongoDB in 2 minutes at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) → paste URI → connect.

### 2️⃣ Create Admin Login
Email + password (8+ chars).

### 3️⃣ Set Up Profile
Avatar (optional) + display name → **Done!**

---

## ☁️ Enable Cloud Storage Module

Click the **Cloud Storage** card on the dashboard. Fill 5 fields:

| Field | Where to Get |
|---|---|
| **API ID** & **API Hash** | [my.telegram.org](https://my.telegram.org) → API Development Tools |
| **Bot Token** | [@BotFather](https://t.me/BotFather) → `/newbot` |
| **DB Channel ID** | Create private channel → **add bot as admin** → forward a message to [@userinfobot](https://t.me/userinfobot) |
| **Owner Telegram ID** | Send `/start` to [@userinfobot](https://t.me/userinfobot) |

> ⚠️ **Important:** Bot must be **admin** in your DB Channel — otherwise uploads will fail.

Click **Save & Connect** → wait 15-40 seconds → done ✅

---

## 🎯 Using Cloud Storage

| Action | How |
|---|---|
| Upload file | Open folder → **Upload** button |
| Share file | 3-dot menu → **Share** → copy public link |
| Stream video | Just click any video |
| Bot upload | DM bot any file OR post in DB channel |
| Organize | Right-click / 3-dot menu on any item |

---

## 🤖 Bot Commands

| Command | Purpose |
|---|---|
| `/start` | Start the bot |
| `/settings` | Link channels to folders |
| `/addf` | Set default folder |
| `/activeinfo` | Show active channel mappings |
| `/clearactive` | Remove a channel mapping |

---

## 🗺️ Roadmap

### v1.0 — Cloud Storage ✅ (Current)
- Telegram-powered file storage
- Web dashboard, video streaming, share links
- Bot integration

### v1.1 — Bot Templates 🚧
- One-click deploy for popular Telegram bots
- Manage multiple bots from single dashboard
- Bot analytics and logs

### v1.2 — Automation Flows 🚧
- Visual workflow builder
- Connect apps and services
- Scheduled and event-driven triggers

### v2.0 — Full Platform 🗓️
- Web scrapers with scheduling
- AI agents and autonomous bots
- Credential vault for secure API storage
- Plugin system for community modules

Follow [releases](https://github.com/shivamnox/Vinnoflow/releases) to stay updated.

---

## 🌐 Deploy Online

Vinnoflow works on any Node.js host:

- **Replit** — click Run
- **Railway** — free credits
- **Render** — free tier available
- **VPS** — use `pm2` for persistence

```bash
npm install -g pm2
pm2 start index.js --name vinnoflow
pm2 save && pm2 startup
```

---

## 🛠️ Tech Stack

- **Node.js + Express** — backend
- **MongoDB (Mongoose)** — database
- **GramJS (MTProto)** — Telegram large file transfers
- **node-telegram-bot-api** — bot commands
- **bcrypt** — password hashing
- **Plyr.js** — video player
- **Multer** — file upload handling

---

## ❓ Troubleshooting

| Problem | Fix |
|---|---|
| Uploads fail with "Cloud not connected" | Profile → **Reconnect Cloud** |
| Bot not saving channel files | Ensure bot is **admin** in that channel |
| Setup wizard reappears after restart | Check `.env` file permissions |
| Port already in use | Run `PORT=4000 npm start` |

---

## 🤝 Contributing

Vinnoflow is designed to be **modular and extensible**. Contributions are welcome for:

- New modules (bots, scrapers, agents)
- UI/UX improvements
- Bug fixes and documentation
- Deployment guides for new platforms

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT — free to use, modify, and share.

---

## ⭐ Support the Project

If Vinnoflow helped you, please **star the repo** ⭐  
Every star helps more builders discover the project.

---

<div align="center">

**Vinnoflow** — Built with ❤️ by [ShivamNox](https://github.com/ShivamNox)

Part of the **[Vinnoshiv](https://github.com/shivamnox)** product suite

*One dashboard. Every tool. Total control.*

</div>
