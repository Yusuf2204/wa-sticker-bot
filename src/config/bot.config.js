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
    },
    packName: 'wa-sticker-bot',
    author: 'JJ HomeServer'
  },
  paths: {
    temp: 'temp'
  },

  queue: {
    concurrency: 2,       // 2 task bersamaan (optimal untuk CPU 1.5 core)
    timeout: 120000       // 120 detik timeout per task video
  },

  rateLimit: {
    maxRequests: 5,       // 5 sticker per menit
    windowMs: 60000       // 1 menit
  }
};
