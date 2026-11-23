# =========================
# BASE IMAGE (NODE BOOKWORM)
# =========================
FROM node:18-bookworm

# =========================
# SYSTEM DEPENDENCIES
# =========================
RUN apt-get update && apt-get install -y \
  curl \
  ffmpeg \
  chromium \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libcairo2 \
  dumb-init \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp


# =========================
# PUPPETEER ENV
# =========================
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# =========================
# WORKDIR
# =========================
WORKDIR /app

# =========================
# INSTALL DEPENDENCIES
# =========================
COPY package*.json ./
RUN npm install --omit=dev

# =========================
# COPY SOURCE
# =========================
COPY src ./src
COPY temp ./temp

# =========================
# RUNTIME
# =========================
ENTRYPOINT ["dumb-init", "--"]

CMD ["npm", "start"]