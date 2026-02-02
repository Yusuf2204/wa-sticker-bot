FROM node:18-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p temp .wwebjs_auth

VOLUME ["/app/.wwebjs_auth"]

CMD ["node", "src/app.js"]
