const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { Readable } = require('stream');
const { finished } = require('stream/promises');

const logger = require('../utils/logger.util');
const config = require('../config/bot.config');
const execFileAsync = promisify(execFile);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

const TWITTER_REGEX =
  /https?:\/\/(?:(?:www|mobile)\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?([a-zA-Z0-9_]+)\/status\/([0-9]+)/i;

const TIKTOK_REGEX =
  /https?:\/\/(?:(?:www|m|vt|vm|t)\.)?tiktok\.com\/[^\s]+/i;

const FACEBOOK_REGEX =
  /https?:\/\/(?:(?:www|m|web|fb)\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i;

/**
 * Download file from URL to disk
 */
async function downloadToFile(url, destPath, referer) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': referer || 'https://www.google.com/'
    }
  });

  if (!res.ok) {
    throw new Error(`Gagal download media dari URL: HTTP ${res.status}`);
  }

  const fileStream = fs.createWriteStream(destPath);
  await finished(Readable.fromWeb(res.body).pipe(fileStream));
  return destPath;
}

/**
 * Engine 1: SaveInsta scraper
 * Mendukung video/reels, foto tunggal, dan carousel (multi-slide)
 */
async function trySaveInsta(targetUrl) {
  logger.info(`[DOWNLOADER][SaveInsta] Trying to scrape: ${targetUrl}`);

  // 1. Get tokens
  const resToken = await fetch('https://saveinsta.to/en/highlights', {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.google.com/'
    }
  });
  const html = await resToken.text();

  const tokenMatch = html.match(/<script[^>]*>var\s+k_url_search="[^"]+"(.*?)<\/script>/s);
  if (!tokenMatch) {
    throw new Error('SaveInsta token script block not found');
  }

  const scriptBlock = tokenMatch[1];
  const extractVar = name => {
    const m = scriptBlock.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`));
    return m ? m[1] : null;
  };

  const k_exp = extractVar('k_exp');
  const k_token = extractVar('k_token');
  if (!k_exp || !k_token) {
    throw new Error('SaveInsta k_exp or k_token missing');
  }

  // 2. Get userverify CF token
  const resVerify = await fetch('https://saveinsta.to/api/userverify', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://saveinsta.to',
      'Referer': 'https://saveinsta.to/en/video',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: new URLSearchParams({ url: targetUrl })
  });
  const dataVerify = await resVerify.json();
  const cftoken = dataVerify?.token;
  if (!cftoken) {
    throw new Error('SaveInsta userverify failed');
  }

  // 3. ajaxSearch
  const resSearch = await fetch('https://saveinsta.to/api/ajaxSearch', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': 'https://saveinsta.to',
      'Referer': 'https://saveinsta.to/en/highlights',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: new URLSearchParams({
      k_exp,
      k_token,
      q: targetUrl,
      t: 'media',
      lang: 'en',
      v: 'v2',
      cftoken
    })
  });
  const searchData = await resSearch.json();

  if (searchData.status === 'ok' && searchData.data) {
    const htmlData = searchData.data;

    // Ambil isi di dalam <ul class="download-box">
    const boxMatch = htmlData.match(/<ul class="download-box">([\s\S]*?)<\/ul>/i);
    const container = boxMatch ? boxMatch[1] : htmlData;

    // Pisahkan per item <li>
    const rawItems = container.split(/<\/li>/i).filter(s => s.trim().length > 0);
    const mediaUrls = [];

    for (const item of rawItems) {
      const isVideo = item.includes('icon-dlvideo') || item.includes('Download Video') || item.includes('video=');

      // Ambil link download dari tombol aksi
      const btnMatch = item.match(/<div class="download-items__btn"[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"/i) ||
        item.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*title="Download (?:Video|Image)"/i) ||
        item.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*abutton[^"]*"/i);

      let downloadUrl = btnMatch ? btnMatch[1] : null;

      // Jika tidak ada di tombol, cari dari pilihan resolusi
      if (!downloadUrl) {
        const optionMatch = item.match(/<option[^>]*value="(https?:\/\/[^"]+)"/i);
        if (optionMatch) {
          downloadUrl = optionMatch[1];
        }
      }

      if (downloadUrl) {
        downloadUrl = downloadUrl.replace(/&amp;/g, '&');
        mediaUrls.push({
          url: downloadUrl,
          type: isVideo ? 'video' : 'image',
          ext: isVideo ? 'mp4' : 'jpg'
        });
      }
    }

    if (mediaUrls.length > 0) {
      logger.info(`[DOWNLOADER][SaveInsta] Found ${mediaUrls.length} media item(s)`);
      return mediaUrls;
    }
  }

  if (searchData.mess) {
    throw new Error(`SaveInsta: ${searchData.mess.replace(/<[^>]*>/g, '')}`);
  }

  throw new Error('SaveInsta: Media link not found in response');
}

/**
 * Engine 2: VKrDownloader API
 */
async function tryVKrDownloader(targetUrl) {
  logger.info(`[DOWNLOADER][VKr] Trying: ${targetUrl}`);
  const apiUrl = `https://vkrdownloader.org/server/?api_key=vkrdownloader&vkr=${encodeURIComponent(targetUrl)}`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });

  const data = await res.json();
  if (data?.source) {
    const isVideo = data.formats && data.formats.some(f => f.ext === 'mp4');
    return [{
      url: data.source,
      type: isVideo ? 'video' : 'image',
      ext: isVideo ? 'mp4' : 'jpg'
    }];
  }

  if (data?.formats && Array.isArray(data.formats) && data.formats.length > 0) {
    const format = data.formats.find(f => f.url && f.ext === 'mp4') || data.formats[0];
    if (format?.url) {
      return [{
        url: format.url,
        type: format.ext === 'mp4' ? 'video' : 'image',
        ext: format.ext || 'mp4'
      }];
    }
  }

  throw new Error(data?.error?.message || 'VKr: Media not found');
}

/**
 * Engine 3: yt-dlp CLI
 */
async function tryYtDlp(targetUrl, outputBase) {
  logger.info(`[DOWNLOADER][yt-dlp] Trying: ${targetUrl}`);

  const outputTemplate = `${outputBase}.%(ext)s`;
  const args = [
    '--no-playlist',
    '--max-filesize', '50M',
    '-o', outputTemplate,
    targetUrl
  ];

  // Tambahkan cookies jika ada file cookies.txt
  const possibleCookies = [
    path.resolve(__dirname, '../../cookies.txt'),
    path.resolve(__dirname, '../config/cookies.txt')
  ];
  for (const cPath of possibleCookies) {
    if (fs.existsSync(cPath)) {
      args.unshift('--cookies', cPath);
      logger.info(`[DOWNLOADER][yt-dlp] Using cookies file: ${cPath}`);
      break;
    }
  }

  try {
    await execFileAsync('yt-dlp', args, { timeout: 60000 });

    const dir = path.dirname(outputBase);
    const baseName = path.basename(outputBase);
    const files = fs.readdirSync(dir);
    const matching = files.find(f => f.startsWith(baseName) && !f.endsWith('.part'));

    if (matching) {
      const fullPath = path.join(dir, matching);
      const ext = path.extname(matching).replace('.', '').toLowerCase();
      const isVideo = ['mp4', 'mkv', 'mov', 'webm'].includes(ext);
      logger.info(`[DOWNLOADER][yt-dlp] Successfully downloaded: ${fullPath}`);
      return [{
        filePath: fullPath,
        type: isVideo ? 'video' : 'image',
        ext
      }];
    }
  } catch (err) {
    throw new Error(`yt-dlp failed: ${err.message}`);
  }

  throw new Error('yt-dlp: Download completed but output file not found');
}

/**
 * Main Download Function for Instagram
 */
async function downloadInstagram(targetUrl) {
  const tempDir = path.resolve(__dirname, '../../', config.paths?.temp || 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileId = uuidv4();
  const outputBase = path.join(tempDir, `ig_${fileId}`);

  let lastError = null;

  // 1. Coba Engine 1 (SaveInsta)
  try {
    const mediaUrls = await trySaveInsta(targetUrl);
    const downloadedItems = [];
    const limit = Math.min(mediaUrls.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaUrls[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath);
      downloadedItems.push({
        filePath: destPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 1 (SaveInsta) failed: ${err.message}`);
    lastError = err;
  }

  // 2. Coba Engine 2 (VKrDownloader)
  try {
    const mediaUrls = await tryVKrDownloader(targetUrl);
    const downloadedItems = [];
    const limit = Math.min(mediaUrls.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaUrls[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath);
      downloadedItems.push({
        filePath: destPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 2 (VKr) failed: ${err.message}`);
    lastError = err;
  }

  // 3. Coba Engine 3 (yt-dlp)
  try {
    const items = await tryYtDlp(targetUrl, outputBase);
    return {
      items,
      filePath: items[0].filePath,
      type: items[0].type,
      ext: items[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 3 (yt-dlp) failed: ${err.message}`);
    lastError = err;
  }

  throw new Error(
    `Gagal mengunduh media dari Instagram.\n` +
    `Kemungkinan postingan bersifat privat atau dibatasi oleh login wall Instagram.\n` +
    `_Detail error:_ ${lastError ? lastError.message : 'Unknown'}`
  );
}

/**
 * Engine 1: FxTwitter API
 * Mendukung video/GIF dan foto (single maupun multi-image)
 */
async function tryFxTwitter(statusId, username) {
  logger.info(`[DOWNLOADER][FxTwitter] Fetching tweet ID: ${statusId}`);
  const apiUrl = username
    ? `https://api.fxtwitter.com/${username}/status/${statusId}`
    : `https://api.fxtwitter.com/status/${statusId}`;

  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Tweet tidak ditemukan atau akun bersifat privat.');
    }
    throw new Error(`FxTwitter error HTTP ${res.status}`);
  }

  const data = await res.json();
  const tweet = data?.tweet;
  if (!tweet) {
    throw new Error('Data tweet tidak ditemukan.');
  }

  const media = tweet.media;
  const videos = media?.videos;
  const photos = media?.photos;
  const resultItems = [];

  // 1. Ekstraksi Video / GIF jika ada
  if (videos && Array.isArray(videos) && videos.length > 0) {
    for (const videoObj of videos) {
      let videoUrl = videoObj.url;

      if (videoObj.variants && Array.isArray(videoObj.variants)) {
        const mp4Variants = videoObj.variants.filter(
          v => (v.content_type === 'video/mp4' || v.container === 'mp4') && v.url
        );
        if (mp4Variants.length > 0) {
          mp4Variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

          const duration = videoObj.duration || 0;
          const MAX_SAFE_BYTES = 15 * 1024 * 1024; // 15 MB

          let chosen = null;
          if (duration > 0) {
            for (const v of mp4Variants) {
              const estSize = ((v.bitrate || 0) * duration) / 8;
              if (estSize <= MAX_SAFE_BYTES) {
                chosen = v;
                break;
              }
            }
          } else {
            chosen = mp4Variants.find(v => (v.bitrate || 0) <= 3000000);
          }

          if (!chosen) {
            chosen = mp4Variants[mp4Variants.length - 1];
          }

          videoUrl = chosen.url;
          logger.info(`[DOWNLOADER][FxTwitter] Selected video variant: bitrate=${chosen.bitrate}`);
        }
      }

      resultItems.push({
        url: videoUrl,
        type: 'video',
        ext: 'mp4'
      });
    }
  }

  // 2. Ekstraksi Foto / Gambar jika ada
  if (photos && Array.isArray(photos) && photos.length > 0) {
    for (const photoObj of photos) {
      if (photoObj.url) {
        resultItems.push({
          url: photoObj.url,
          type: 'image',
          ext: 'jpg'
        });
      }
    }
  }

  if (resultItems.length === 0) {
    const err = new Error('Tweet ini tidak mengandung media (video, GIF, atau foto).');
    err.isUserError = true;
    throw err;
  }

  return resultItems;
}

/**
 * Engine 2: VxTwitter API
 */
async function tryVxTwitter(statusId, username) {
  logger.info(`[DOWNLOADER][VxTwitter] Fetching tweet ID: ${statusId}`);
  const apiUrl = username
    ? `https://api.vxtwitter.com/${username}/status/${statusId}`
    : `https://api.vxtwitter.com/status/${statusId}`;

  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
    }
  });

  if (!res.ok) {
    throw new Error(`VxTwitter error HTTP ${res.status}`);
  }

  const data = await res.json();
  const mediaExtended = data?.media_extended || [];
  const resultItems = [];

  for (const item of mediaExtended) {
    if (item.type === 'video' || item.type === 'gif') {
      if (item.url) {
        resultItems.push({
          url: item.url,
          type: 'video',
          ext: 'mp4'
        });
      }
    } else if (item.type === 'image') {
      if (item.url) {
        const photoUrl = item.url.includes('?') ? item.url : `${item.url}?name=orig`;
        resultItems.push({
          url: photoUrl,
          type: 'image',
          ext: 'jpg'
        });
      }
    }
  }

  // Fallback ke mediaURLs jika media_extended kosong
  if (resultItems.length === 0 && data?.mediaURLs && Array.isArray(data.mediaURLs)) {
    for (const u of data.mediaURLs) {
      const isVideo = u.includes('.mp4') || u.includes('/vid/');
      resultItems.push({
        url: u,
        type: isVideo ? 'video' : 'image',
        ext: isVideo ? 'mp4' : 'jpg'
      });
    }
  }

  if (resultItems.length === 0) {
    const err = new Error('Tweet ini tidak mengandung media (video, GIF, atau foto).');
    err.isUserError = true;
    throw err;
  }

  return resultItems;
}

/**
 * Kompres video jika ukurannya melebihi batas WhatsApp (16 MB)
 */
async function ensureVideoUnderLimit(filePath, maxBytes = 16 * 1024 * 1024) {
  try {
    if (!fs.existsSync(filePath)) return filePath;
    const stat = fs.statSync(filePath);
    if (stat.size <= maxBytes) return filePath;

    logger.info(
      `[VIDEO] File size ${(stat.size / (1024 * 1024)).toFixed(2)} MB melebihi batas aman, kompresi dengan ffmpeg...`
    );
    const compressedPath = filePath.replace('.mp4', '_comp.mp4');

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i', filePath,
        '-vf', "scale='min(720,iw)':-2",
        '-c:v', 'libx264',
        '-crf', '26',
        '-preset', 'veryfast',
        '-c:a', 'aac',
        '-b:a', '128k',
        compressedPath
      ],
      { timeout: 60000 }
    );

    if (fs.existsSync(compressedPath) && fs.statSync(compressedPath).size > 0) {
      try { fs.unlinkSync(filePath); } catch (_) {}
      return compressedPath;
    }
  } catch (err) {
    logger.warn(`[VIDEO] Failed to compress video: ${err.message}`);
  }
  return filePath;
}

/**
 * Main Download Function for Twitter / X (Video, GIF & Photo)
 */
async function downloadTwitter(targetUrl) {
  const match = targetUrl.match(TWITTER_REGEX);
  if (!match) {
    throw new Error('Link Twitter / X tidak valid. Pastikan link mengarah ke postingan status tweet.');
  }

  const username = match[1];
  const statusId = match[2];

  const tempDir = path.resolve(__dirname, '../../', config.paths?.temp || 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileId = uuidv4();
  const outputBase = path.join(tempDir, `tw_${fileId}`);

  let lastError = null;

  // 1. Coba Engine 1 (FxTwitter)
  try {
    const mediaList = await tryFxTwitter(statusId, username);
    const downloadedItems = [];
    const limit = Math.min(mediaList.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaList[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath, 'https://twitter.com/');

      let finalPath = destPath;
      if (media.type === 'video') {
        finalPath = await ensureVideoUnderLimit(destPath);
      }

      downloadedItems.push({
        filePath: finalPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    if (err.isUserError) throw err;
    logger.warn(`[DOWNLOADER] Engine 1 (FxTwitter) failed: ${err.message}`);
    lastError = err;
  }

  // 2. Coba Engine 2 (VxTwitter)
  try {
    const mediaList = await tryVxTwitter(statusId, username);
    const downloadedItems = [];
    const limit = Math.min(mediaList.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaList[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath, 'https://twitter.com/');

      let finalPath = destPath;
      if (media.type === 'video') {
        finalPath = await ensureVideoUnderLimit(destPath);
      }

      downloadedItems.push({
        filePath: finalPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    if (err.isUserError) throw err;
    logger.warn(`[DOWNLOADER] Engine 2 (VxTwitter) failed: ${err.message}`);
    lastError = err;
  }

  // 3. Coba Engine 3 (yt-dlp)
  try {
    const items = await tryYtDlp(targetUrl, outputBase);
    for (const item of items) {
      if (item.type === 'video') {
        item.filePath = await ensureVideoUnderLimit(item.filePath);
      }
    }
    return {
      items,
      filePath: items[0].filePath,
      type: items[0].type,
      ext: items[0].ext
    };
  } catch (err) {
    if (err.message && err.message.includes('No video could be found')) {
      const uErr = new Error('Tweet ini tidak mengandung media yang dapat diunduh.');
      uErr.isUserError = true;
      throw uErr;
    }
    logger.warn(`[DOWNLOADER] Engine 3 (yt-dlp) failed: ${err.message}`);
    lastError = err;
  }

  throw new Error(
    `Gagal mengunduh media dari Twitter / X.\n` +
    `Kemungkinan akun atau tweet bersifat privat / dibatasi.\n` +
    `_Detail error:_ ${lastError ? lastError.message : 'Unknown'}`
  );
}

/**
 * Engine 1: SSSTik Scraper
 * Mendukung video tanpa watermark dan slide foto TikTok
 */
async function trySSSTik(targetUrl) {
  logger.info(`[DOWNLOADER][SSSTik] Scraping: ${targetUrl}`);

  const resHome = await fetch('https://ssstik.io/en-1', {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!resHome.ok) {
    throw new Error(`SSSTik home HTTP ${resHome.status}`);
  }

  const cookie = resHome.headers.get('set-cookie') || '';
  const homeHtml = await resHome.text();

  const ttMatch = homeHtml.match(/s_tt\s*=\s*['"]([^'"]+)['"]/);
  const tt = ttMatch ? ttMatch[1] : '';

  const postUrl = 'https://ssstik.io/abc?url=dl';
  const bodyParams = new URLSearchParams({
    id: targetUrl,
    locale: 'en',
    tt
  });

  const resPost = await fetch(postUrl, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'HX-Request': 'true',
      'HX-Target': 'target',
      'HX-Current-URL': 'https://ssstik.io/en-1',
      'Cookie': cookie,
      'Referer': 'https://ssstik.io/en-1'
    },
    body: bodyParams
  });

  if (!resPost.ok) {
    throw new Error(`SSSTik post HTTP ${resPost.status}`);
  }

  const resultHtml = await resPost.text();

  // 1. Cek apakah ini slideshow gambar / slide foto
  const imageMatches = [];
  const splideMatch = resultHtml.match(/<ul class="splide__list">([\s\S]*?)<\/ul>/i);
  if (splideMatch) {
    const slideItems = splideMatch[1].split(/<\/li>/i);
    for (const slide of slideItems) {
      const hrefMatch = slide.match(/href="([^"]+)"/i) || slide.match(/src="([^"]+)"/i);
      if (hrefMatch && hrefMatch[1].startsWith('http')) {
        imageMatches.push({
          url: hrefMatch[1],
          type: 'image',
          ext: 'jpg'
        });
      }
    }
  }

  if (imageMatches.length > 0) {
    logger.info(`[DOWNLOADER][SSSTik] Found ${imageMatches.length} slide image(s)`);
    return imageMatches;
  }

  // 2. Cek apakah ini video (Without watermark)
  const videoRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  let videoUrl = null;
  while ((m = videoRegex.exec(resultHtml)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (
      href.startsWith('http') &&
      (text.includes('without watermark') ||
        text.includes('tanpa tanda air') ||
        href.includes('tikcdn.io'))
    ) {
      videoUrl = href;
      break;
    }
  }

  if (videoUrl) {
    return [
      {
        url: videoUrl,
        type: 'video',
        ext: 'mp4'
      }
    ];
  }

  throw new Error('SSSTik: Link unduhan video tidak ditemukan');
}

/**
 * Engine 2: MusicalDown Scraper
 */
async function tryMusicalDown(targetUrl) {
  logger.info(`[DOWNLOADER][MusicalDown] Scraping: ${targetUrl}`);

  const resHome = await fetch('https://musicaldown.com/en', {
    headers: { 'User-Agent': USER_AGENT }
  });

  if (!resHome.ok) {
    throw new Error(`MusicalDown home HTTP ${resHome.status}`);
  }

  const cookie = resHome.headers.get('set-cookie') || '';
  const homeHtml = await resHome.text();

  const urlInputName =
    homeHtml.match(/<input[^>]+id="link_url"[^>]+name="([^"]+)"/)?.[1] ||
    homeHtml.match(/<input[^>]+name="([^"]+)"[^>]+id="link_url"/)?.[1];
  const tokenMatch = homeHtml.match(/<input[^>]+name="([^"]+)"[^>]+type="hidden"[^>]+value="([^"]+)"/);

  if (!urlInputName || !tokenMatch) {
    throw new Error('MusicalDown input tokens not found');
  }

  const params = new URLSearchParams();
  params.append(urlInputName, targetUrl);
  params.append(tokenMatch[1], tokenMatch[2]);
  params.append('verify', '1');

  const resPost = await fetch('https://musicaldown.com/download', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'Origin': 'https://musicaldown.com',
      'Referer': 'https://musicaldown.com/en'
    },
    body: params
  });

  if (!resPost.ok) {
    throw new Error(`MusicalDown post HTTP ${resPost.status}`);
  }

  const postHtml = await resPost.text();

  // Cari link video MP4 (No Watermark)
  const regex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  let videoUrl = null;
  while ((m = regex.exec(postHtml)) !== null) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    if (
      href.startsWith('http') &&
      (text.includes('download mp4 [hd]') ||
        text.includes('download mp4') ||
        text.includes('nowatermark'))
    ) {
      if (!text.includes('watermark]') && !text.includes('with watermark')) {
        videoUrl = href;
        break;
      }
    }
  }

  if (videoUrl) {
    return [
      {
        url: videoUrl,
        type: 'video',
        ext: 'mp4'
      }
    ];
  }

  throw new Error('MusicalDown: Link unduhan video tidak ditemukan');
}

/**
 * Main Download Function for TikTok
 */
async function downloadTikTok(targetUrl) {
  const match = targetUrl.match(TIKTOK_REGEX);
  if (!match) {
    throw new Error('Link TikTok tidak valid. Pastikan link mengarah ke postingan video atau foto TikTok.');
  }

  const cleanUrl = match[0].replace(/[?&]a=.*$/, '');

  const tempDir = path.resolve(__dirname, '../../', config.paths?.temp || 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileId = uuidv4();
  const outputBase = path.join(tempDir, `tt_${fileId}`);

  let lastError = null;

  // 1. Coba Engine 1 (SSSTik)
  try {
    const mediaUrls = await trySSSTik(cleanUrl);
    const downloadedItems = [];
    const limit = Math.min(mediaUrls.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaUrls[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath, 'https://ssstik.io/');

      let finalPath = destPath;
      if (media.type === 'video') {
        finalPath = await ensureVideoUnderLimit(destPath);
      }

      downloadedItems.push({
        filePath: finalPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 1 (SSSTik) failed: ${err.message}`);
    lastError = err;
  }

  // 2. Coba Engine 2 (MusicalDown)
  try {
    const mediaUrls = await tryMusicalDown(cleanUrl);
    const downloadedItems = [];
    const limit = Math.min(mediaUrls.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaUrls[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath, 'https://musicaldown.com/');

      let finalPath = destPath;
      if (media.type === 'video') {
        finalPath = await ensureVideoUnderLimit(destPath);
      }

      downloadedItems.push({
        filePath: finalPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 2 (MusicalDown) failed: ${err.message}`);
    lastError = err;
  }

  // 3. Coba Engine 3 (yt-dlp)
  try {
    const items = await tryYtDlp(cleanUrl, outputBase);
    for (const item of items) {
      if (item.type === 'video') {
        item.filePath = await ensureVideoUnderLimit(item.filePath);
      }
    }
    return {
      items,
      filePath: items[0].filePath,
      type: items[0].type,
      ext: items[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 3 (yt-dlp) failed: ${err.message}`);
    lastError = err;
  }

  throw new Error(
    `Gagal mengunduh media dari TikTok.\n` +
    `Kemungkinan video bersifat privat atau dibatasi hak cipta.\n` +
    `_Detail error:_ ${lastError ? lastError.message : 'Unknown'}`
  );
}

/**
 * Follow redirects for short Facebook links (e.g. fb.watch)
 */
async function resolveFacebookUrl(targetUrl) {
  if (targetUrl.includes('fb.watch')) {
    try {
      const res = await fetch(targetUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'curl/7.88.1',
          'Accept': '*/*'
        }
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (loc && loc.startsWith('http')) {
          logger.info(`[DOWNLOADER][FB] Resolved redirect: ${targetUrl} -> ${loc}`);
          return loc;
        }
      }
    } catch (err) {
      logger.warn(`[DOWNLOADER][FB] Failed to resolve redirect for ${targetUrl}: ${err.message}`);
    }
  }
  return targetUrl;
}

/**
 * Facebook Engine 1: fbdownloader.to
 */
async function tryFbDownloader(targetUrl) {
  logger.info(`[DOWNLOADER][fbdownloader.to] Trying: ${targetUrl}`);
  const res = await fetch('https://fbdownloader.to/api/ajaxSearch', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Origin': 'https://fbdownloader.to',
      'Referer': 'https://fbdownloader.to/',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ q: targetUrl })
  });

  if (!res.ok) {
    throw new Error(`fbdownloader.to HTTP error: ${res.status}`);
  }

  const json = await res.json();
  if (!json || json.status !== 'ok' || !json.data) {
    throw new Error(json?.mess || 'fbdownloader.to returned no data');
  }

  const html = json.data;
  const links = [...html.matchAll(/href="([^"]+)"/g)]
    .map(m => m[1])
    .filter(l => l.startsWith('http') && !l.includes('google.com') && !l.includes('facebook.com'));

  if (links.length === 0) {
    throw new Error('No download links found in fbdownloader.to');
  }

  const hdLink = links.find(l => l.includes('(HD)') || l.includes('720p') || l.includes('1080p')) || links[0];
  return [{
    url: hdLink,
    type: 'video',
    ext: 'mp4',
    referer: 'https://fbdownloader.to/'
  }];
}

/**
 * Facebook Engine 2: snapsave.app
 */
async function trySnapSaveFacebook(targetUrl) {
  logger.info(`[DOWNLOADER][SnapSave] Trying: ${targetUrl}`);
  const res = await fetch('https://snapsave.app/action.php?lang=en', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': 'https://snapsave.app/',
      'Origin': 'https://snapsave.app',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ url: targetUrl })
  });

  if (!res.ok) {
    throw new Error(`snapsave.app HTTP error: ${res.status}`);
  }

  const text = await res.text();
  let captured = '';
  const sandbox = {
    eval: x => {
      captured = x;
    },
    decodeURIComponent,
    escape,
    String,
    Math
  };

  try {
    vm.createContext(sandbox);
    vm.runInContext(text, sandbox);
  } catch (err) {
    throw new Error(`SnapSave decode error: ${err.message}`);
  }

  if (!captured) {
    throw new Error('SnapSave unpack failed or empty');
  }

  if (captured.includes('The video is private') || captured.includes('is-danger')) {
    throw new Error('Video Facebook bersifat privat atau tidak dapat diakses.');
  }

  const htmlMatch = captured.match(/innerHTML\s*=\s*(".*");/s) || captured.match(/innerHTML\s*=\s*(`.*`);/s);
  let html = htmlMatch ? eval(htmlMatch[1]) : captured;

  // Cek apakah ada gambar / album
  const imgLinks = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map(m => m[1])
    .filter(l => l.includes('fbcdn.net') && !l.includes('thumbnailsite'));

  // Ambil download link video
  const links = [...html.matchAll(/href="([^"]+)"/g)]
    .map(m => m[1])
    .filter(l => l.startsWith('http') && !l.includes('snapsave.app') && !l.includes('google.com'));

  if (links.length === 0 && imgLinks.length === 0) {
    throw new Error('Tidak ada link unduhan di snapsave');
  }

  if (links.length > 0) {
    const directLink = links.find(l => l.includes('d.rapidcdn.app') || l.includes('fbcdn.net')) || links[0];
    return [{
      url: directLink,
      type: 'video',
      ext: 'mp4',
      referer: 'https://snapsave.app/'
    }];
  }

  // Jika berupa gambar
  return imgLinks.map(imgUrl => ({
    url: imgUrl,
    type: 'image',
    ext: 'jpg',
    referer: 'https://snapsave.app/'
  }));
}

/**
 * Facebook Engine 3: getmyfb.com
 */
async function tryGetMyFb(targetUrl) {
  logger.info(`[DOWNLOADER][getmyfb] Trying: ${targetUrl}`);
  const res = await fetch('https://getmyfb.com/process', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'https://getmyfb.com',
      'Referer': 'https://getmyfb.com/'
    },
    body: new URLSearchParams({ id: targetUrl, locale: 'en' })
  });

  if (!res.ok) {
    throw new Error(`getmyfb HTTP error: ${res.status}`);
  }

  const html = await res.text();
  const hdMatch =
    html.match(/class="[^"]*hd-button[^"]*"[^>]*href="([^"]+)"/i) ||
    html.match(/href="([^"]+)"[^>]*class="[^"]*hd-button[^"]*"/i);
  const sdMatch =
    html.match(/class="[^"]*sd-button[^"]*"[^>]*href="([^"]+)"/i) ||
    html.match(/href="([^"]+)"[^>]*class="[^"]*sd-button[^"]*"/i);
  const downloadUrl = (hdMatch ? hdMatch[1] : null) || (sdMatch ? sdMatch[1] : null);

  if (!downloadUrl || !downloadUrl.startsWith('http')) {
    throw new Error('getmyfb did not return download link');
  }

  return [{
    url: downloadUrl,
    type: 'video',
    ext: 'mp4',
    referer: 'https://getmyfb.com/'
  }];
}

/**
 * Main Download Function for Facebook
 * Mendukung video (Reels, Watch, Video Posts) dan foto
 */
async function downloadFacebook(targetUrl) {
  const tempDir = path.resolve(__dirname, '../../', config.paths?.temp || 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const fileId = uuidv4();
  const outputBase = path.join(tempDir, `fb_${fileId}`);

  // Resolve short links like fb.watch/...
  const cleanUrl = await resolveFacebookUrl(targetUrl);
  let lastError = null;

  // 1. Coba Engine 1 (fbdownloader.to)
  try {
    const mediaUrls = await tryFbDownloader(cleanUrl);
    const downloadedItems = [];
    const limit = Math.min(mediaUrls.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaUrls[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath, media.referer || 'https://fbdownloader.to/');

      let finalPath = destPath;
      if (media.type === 'video') {
        finalPath = await ensureVideoUnderLimit(destPath);
      }

      downloadedItems.push({
        filePath: finalPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 1 (fbdownloader.to) failed: ${err.message}`);
    lastError = err;
  }

  // 2. Coba Engine 2 (SnapSave)
  try {
    const mediaUrls = await trySnapSaveFacebook(cleanUrl);
    const downloadedItems = [];
    const limit = Math.min(mediaUrls.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaUrls[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath, media.referer || 'https://snapsave.app/');

      let finalPath = destPath;
      if (media.type === 'video') {
        finalPath = await ensureVideoUnderLimit(destPath);
      }

      downloadedItems.push({
        filePath: finalPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 2 (SnapSave) failed: ${err.message}`);
    lastError = err;
  }

  // 3. Coba Engine 3 (getmyfb)
  try {
    const mediaUrls = await tryGetMyFb(cleanUrl);
    const downloadedItems = [];
    const limit = Math.min(mediaUrls.length, 10);

    for (let i = 0; i < limit; i++) {
      const media = mediaUrls[i];
      const destPath = `${outputBase}_${i + 1}.${media.ext}`;
      await downloadToFile(media.url, destPath, media.referer || 'https://getmyfb.com/');

      let finalPath = destPath;
      if (media.type === 'video') {
        finalPath = await ensureVideoUnderLimit(destPath);
      }

      downloadedItems.push({
        filePath: finalPath,
        type: media.type,
        ext: media.ext
      });
    }

    return {
      items: downloadedItems,
      filePath: downloadedItems[0].filePath,
      type: downloadedItems[0].type,
      ext: downloadedItems[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 3 (getmyfb) failed: ${err.message}`);
    lastError = err;
  }

  // 4. Coba Engine 4 (yt-dlp)
  try {
    const items = await tryYtDlp(cleanUrl, outputBase);
    for (const item of items) {
      if (item.type === 'video') {
        item.filePath = await ensureVideoUnderLimit(item.filePath);
      }
    }
    return {
      items,
      filePath: items[0].filePath,
      type: items[0].type,
      ext: items[0].ext
    };
  } catch (err) {
    logger.warn(`[DOWNLOADER] Engine 4 (yt-dlp) failed: ${err.message}`);
    lastError = err;
  }

  throw new Error(
    `Gagal mengunduh media dari Facebook.\n` +
    `Kemungkinan video/postingan bersifat privat, dibatasi hak cipta, atau memerlukan login Facebook.\n` +
    `_Detail error:_ ${lastError ? lastError.message : 'Unknown'}`
  );
}

module.exports = {
  downloadInstagram,
  downloadTwitter,
  downloadTwitterVideo: downloadTwitter,
  downloadTikTok,
  downloadFacebook
};
