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
  },

   queue: {
    concurrency: 10,      // 10 request bersamaan
    timeout: 30000        // 30 detik timeout per task
  },

  rateLimit: {
    maxRequests: 5,      // 5 sticker per menit
    windowMs: 60000       // 1 menit
  }
};
