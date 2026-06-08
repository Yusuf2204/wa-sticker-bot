# WA Sticker Bot

WhatsApp Sticker Bot built with **Node.js**, **whatsapp-web.js**, **FFmpeg**, and **Docker**.

Convert **image**, **GIF**, and **video** into WhatsApp stickers automatically with adaptive compression and WhatsApp-friendly optimization.

---

## Features

* ✅ Image → Sticker
* ✅ GIF → Animated Sticker
* ✅ Video → Animated Sticker
* ✅ Adaptive compression (`<800KB`)
* ✅ Auto resize (`512x512`)
* ✅ Transparency preserved
* ✅ Reply / quoted media support
* ✅ Docker ready
* ✅ Session persistence with LocalAuth

---

## Tech Stack

* **Node.js**
* **whatsapp-web.js**
* **Puppeteer / Chromium**
* **FFmpeg**
* **Docker & Docker Compose**

---

## Commands

| Command    | Description                              |
| ---------- | ---------------------------------------- |
| `!help`    | Show available commands                  |
| `!sticker` | Convert image / GIF / video into sticker |

### Example Usage

Reply to media:

```text
!sticker
```

Supported media:

```text
image / gif / video
```

---

## Sticker Processing

The bot automatically optimizes media for WhatsApp sticker requirements.

### Image Sticker

```text
Image
↓
Resize to 512x512
↓
Convert to WebP
↓
Sticker
```

### Animated Sticker

```text
GIF / Video
↓
FFmpeg Processing
↓
Adaptive Compression
↓
Resize + Optimization
↓
Animated WebP
↓
WhatsApp Sticker
```

Optimizations include:

* Auto resize (`512x512`)
* FPS optimization
* Adaptive quality presets
* Transparent background preservation
* WhatsApp-compatible WebP conversion

---

## Project Structure

```text
├── docker
│   └── Dockerfile
├── src
│   ├── client
│   │   └── whatsapp.js
│   ├── commands
│   │   ├── help.js
│   │   └── sticker.js
│   ├── config
│   │   └── bot.config.js
│   ├── handlers
│   │   └── message.handler.js
│   ├── services
│   │   ├── ffmpeg.service.js
│   │   └── sticker.service.js
│   ├── utils
│   │   ├── cleanup.util.js
│   │   ├── command.util.js
│   │   ├── file.util.js
│   │   └── logger.util.js
│   └── app.js
├── temp
├── docker-compose.yml
├── package-lock.json
├── package.json
└── README.md
```

---

## Installation (Local)

### 1. Clone repository

```bash
git clone "https://github.com/Yusuf2204/wa-sticker-bot.git"
cd wa-sticker-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install Chromium & FFmpeg

Ubuntu / Debian:

```bash
sudo apt update
sudo apt install ffmpeg chromium-browser -y
```

Verify installation:

```bash
which chromium-browser
ffmpeg -version
```

### 4. Set Chromium path (optional)

If needed:

```bash
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### 5. Run bot

```bash
npm start
```

Scan QR code from WhatsApp.

---

## Installation (Docker)

### Build & Run

```bash
docker compose up -d --build
```

### View Logs

```bash
docker logs -f wa-sticker-bot
```

### Stop Container

```bash
docker compose down
```

---

## Configuration

Configuration file:

```text
src/config/bot.config.js
```

Default config:

```js
module.exports = {
  prefix: '!',
  sticker: {
    image: {
      size: 512
    },
    video: {
      size: 512,
      fps: 15,
      maxDuration: 7
    }
  },
  paths: {
    temp: 'temp'
  }
};
```

You can configure:

* Command prefix
* Sticker size
* FPS
* Max video duration

---

## Persistent Session

WhatsApp session is stored using:

```text
LocalAuth
```

Docker volume:

```yaml
volumes:
  - ./.wwebjs_auth:/app/.wwebjs_auth
```

This prevents repeated QR login after container restart.

---

## Troubleshooting

### Chromium not found

Error:

```text
Could not find Chrome
```

Fix:

```bash
sudo apt install chromium-browser -y
```

Or configure:

```bash
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

---

### Profile locked

Error:

```text
profile appears to be in use
```

Fix:

```bash
pkill -9 chrome
pkill -9 chromium
pkill -f puppeteer
```

Remove lock files:

```bash
find .wwebjs_auth -name "Singleton*" -delete
```

---

### Sticker background becomes black

Issue:

```text
transparent background → black matte
```

Solution already implemented:

* Alpha channel preservation
* Transparent padding
* WhatsApp-safe WebP encoding

---

## Development

Run locally:

```bash
npm start
```

Recommended for development:

```bash
docker compose up --build
```

---

## License

MIT License
