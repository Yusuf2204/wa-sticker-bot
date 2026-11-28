# WA Sticker & Social Media Downloader Bot

WhatsApp Bot built with **Node.js**, **whatsapp-web.js**, **FFmpeg**, **yt-dlp**, and **Docker**.

A multi-purpose bot designed for high reliability: automatically converts **images**, **GIFs**, and **videos** into WhatsApp stickers, and downloads media from **Instagram**, **Twitter / X**, **TikTok** (No Watermark), and **Facebook** with smart compression and queue management.

---

## Features

### 🎨 Sticker Maker
* ✅ **Image → Static Sticker** (Auto resize `512x512`, WebP conversion, alpha/transparency preserved)
* ✅ **GIF / Video → Animated Sticker** (Adaptive FFmpeg compression `<800KB`, FPS optimization)
* ✅ **Custom Sticker Metadata** (Set custom Pack Name & Author: `!sticker MyPack | MyAuthor`)
* ✅ **Batch Sticker Mode (`!sticker batch`)** (Convert up to 5 images/videos at once via album caption or interactive session)
* ✅ **Reply / Quoted Media Support** (Reply any media or downloaded post to make a sticker)

### 📥 Social Media Downloader
* ✅ **Instagram Downloader (`!ig`)**
  * Downloads **Reels**, single videos, and IGTV.
  * Full **Carousel / Slideshow** support (sends all photo slides in order).
  * Multi-engine fallback (SaveInsta API, VKr, yt-dlp).
* ✅ **Twitter / X Downloader (`!tw`)**
  * Downloads high-quality **video**, **GIF**, and **photos** (including multi-photo posts).
  * **Intelligent Resolution Selection:** Automatically chooses the highest quality (up to 1080p Full HD) that fits safely within WhatsApp limits (`<15MB`).
  * **Auto-Compress Fallback:** Automatically downscales via FFmpeg if a 4K video exceeds WhatsApp limits.
  * Multi-engine fallback (FxTwitter API, VxTwitter API, yt-dlp).
* ✅ **TikTok Downloader (`!tt`)**
  * **No Watermark** video extraction.
  * Supports TikTok photo slideshow posts (multi-slide galleries).
  * Multi-engine fallback (SSSTik scraper, MusicalDown, yt-dlp).
* ✅ **Facebook Downloader (`!fb`)**
  * Downloads **Reels**, **Watch videos**, and video posts.
  * Supports Facebook photo posts and albums.
  * **Intelligent Compression:** Auto-compresses videos via FFmpeg if exceeding WhatsApp limits (`<16MB`).
  * Multi-engine fallback (fbdownloader.to, SnapSave API, getmyfb, yt-dlp).

### ⏰ Reminder & Utility
* ✅ **Automated Reminders (`!remind`, `!reminder`)**
  * Supports duration (`10m`, `2j`, `45s`) and specific time (`14:30`, `besok 08:00`).
  * Constrained to a safe maximum of **24 hours**.
  * Supports replying to any message to set it as reminder content.
  * Group mentions (@user tag) & personal chat delivery.
  * **Persistent JSON Storage** (`data/reminders.json`) with auto-recovery of missed timers after restart.

### ⚙️ Production Reliability & Architecture
* ✅ **Queue System (`p-queue`)** with concurrent processing (`10 jobs`) to prevent CPU spikes.
* ✅ **Rate Limiting** per user with reset timers and quota alerts.
* ✅ **Auto Cleanup** of temporary media (`temp/`) after 20 seconds.
* ✅ **Automated Lock Recovery** (Cleans stale Chromium `SingletonLock`, `SingletonCookie`, `SingletonSocket` on startup).
* ✅ **LID & Web Client Patches** (Bidirectional LID resolver patch & automated modal dismissal).
* ✅ **Docker Ready** with persistent sessions via `LocalAuth`.

---

## Tech Stack

* **Node.js** (v20+ / v24+)
* **whatsapp-web.js**
* **Puppeteer / Chromium**
* **FFmpeg** (adaptive video transcoding & compression)
* **yt-dlp** (command-line media extractor fallback)
* **PQueue** (concurrency management)
* **Docker & Docker Compose**

---

## Commands

| Command | Alias | Description | Example |
| :--- | :--- | :--- | :--- |
| `!sticker` | - | Convert image / GIF / video into sticker | `!sticker Pack | Author` *(or reply media)* |
| `!sticker batch` | `!sticker stop` | Batch convert up to 5 media items into stickers | `!sticker batch` *(album caption or session)* |
| `!ig` | `!instagram` | Download Reels, video, or photo carousel | `!ig https://instagram.com/p/xxxx` |
| `!tw` | `!twitter`, `!x` | Download video, GIF, or photo from Twitter / X | `!tw https://x.com/user/status/xxxx` |
| `!tt` | `!tiktok` | Download video (No Watermark) or photo slide | `!tt https://vt.tiktok.com/xxxx/` |
| `!fb` | `!facebook` | Download video (Reels/Watch) or photo from Facebook | `!fb https://www.facebook.com/watch?v=xxxx` |
| `!remind` | `!reminder` | Set automated reminder (max 24h, list, cancel) | `!remind 15m Istirahat` / `!remind list` |
| `!help` | - | Display interactive help menu | `!help` |

> 💡 **Pro-tip:** Every media downloaded via `!ig`, `!tw`, `!tt`, or `!fb` can be instantly turned into a WhatsApp sticker by simply replying to the bot's media with `!sticker`!

---

## Media Processing Pipeline

### 1. Sticker Generation

```text
Incoming Media (Image / GIF / Video)
       │
       ├── Image ──> Resize (512x512) ──> WebP Encoding ──────┐
       │                                                      │
       └── Video ──> FFmpeg (FPS/Scale) ──> Animated WebP ────┴──> WhatsApp Sticker
```

Optimizations applied:
* Auto resize & square canvas padding (`512x512`).
* Transparent background preservation (alpha channel safe).
* Target file size strictly under WhatsApp's `800KB` animated sticker limit.

### 2. Video Downloader & Safe Delivery

```text
Social Media Link (IG / Twitter / TikTok)
       │
       ├── Multi-Engine Scraper (Fast API / Scraper / yt-dlp)
       │
       ├── Safe Resolution Check (<15MB WhatsApp limit)
       │      │
       │      ├── Exceeds Limit ──> FFmpeg Downscale & Compression
       │      └── Fits Limit ─────> Direct Download
       │
       └── Send Media ──> Auto-cleanup temp file after 20s
```

---

## Project Structure

```text
├── docker
│   └── Dockerfile             # Multi-stage image with Chromium, FFmpeg & yt-dlp
├── docker-compose.yml         # Container definitions & volume mounts
├── src
│   ├── app.js                 # Application entry point
│   ├── client
│   │   └── whatsapp.js        # WhatsApp client initialization & lock cleanup
│   ├── commands
│   │   ├── help.js            # Help command handler
│   │   ├── ig.js              # Instagram downloader command
│   │   ├── sticker.js         # Sticker maker command (Pack/Author support)
│   │   ├── tt.js              # TikTok downloader command (No Watermark)
│   │   └── tw.js              # Twitter/X video downloader command
│   ├── config
│   │   └── bot.config.js      # Central bot configuration & limits
│   ├── handlers
│   │   └── message.handler.js # Command router, rate limiter & queue dispatcher
│   ├── services
│   │   ├── downloader.service.js # Multi-engine scrapers (IG, Twitter, TikTok)
│   │   ├── ffmpeg.service.js     # Media conversion & WebP compression
│   │   ├── queue.service.js      # Concurrency & queue pipeline
│   │   ├── rateLimit.service.js  # Per-user rate limit enforcement
│   │   └── sticker.service.js    # Sticker processing orchestration
│   └── utils
│       ├── cleanup.util.js    # Temp file lifecycle & auto-deletion
│       ├── command.util.js    # Command & argument parsing
│       ├── file.util.js       # Filesystem helpers
│       ├── logger.util.js     # Structured logging
│       └── patch.util.js      # WhatsApp Web runtime & disk patches
├── temp/                      # Ephemeral file storage
├── package.json
└── README.md
```

---

## Deployment & Setup

### Running with Docker (Recommended)

1. **Clone repository:**
   ```bash
   git clone https://github.com/Yusuf2204/wa-sticker-bot.git
   cd wa-sticker-bot
   ```

2. **Build and start container:**
   ```bash
   docker compose up -d --build
   ```

3. **Check logs & scan WhatsApp QR Code:**
   ```bash
   docker compose logs -f wa-sticker-bot
   ```
   Scan the generated QR code in your WhatsApp terminal log using **Linked Devices** on your phone.

4. **Restart / Stop container:**
   ```bash
   # Restart
   docker compose restart wa-sticker-bot

   # Stop
   docker compose down
   ```

---

### Running Locally (Without Docker)

1. **Prerequisites:**
   * Node.js v20+
   * FFmpeg (`sudo apt install ffmpeg`)
   * Chromium (`sudo apt install chromium-browser`)
   * yt-dlp (`sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`)

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set executable paths (if required):**
   ```bash
   export PUPPETEER_EXECUTABLE_PATH=$(which chromium || which chromium-browser)
   ```

4. **Start the bot:**
   ```bash
   npm start
   ```

---

## Configuration

Edit [`src/config/bot.config.js`](file:///var/www/html/wa-sticker-bot/src/config/bot.config.js) to adjust limits:

```javascript
module.exports = {
  prefix: '!',
  sticker: {
    image: { size: 512 },
    video: {
      size: 512,
      fps: 15,
      maxDuration: 7
    }
  },
  rateLimit: {
    maxRequests: 5,     // Max stickers per window
    windowMs: 60 * 1000 // 1 minute window
  },
  queue: {
    concurrency: 2      // Parallel sticker jobs
  },
  paths: {
    temp: 'temp'
  }
};
```

---

## Persistent Authentication

Authentication state is managed by `LocalAuth` and persisted in `./.wwebjs_auth`:

```yaml
volumes:
  - ./.wwebjs_auth:/app/.wwebjs_auth
```

Once paired, your WhatsApp session remains active across container restarts and updates without re-scanning QR codes.

---

## License

This project is licensed under the MIT License.
