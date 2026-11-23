const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

const logger = require('../utils/logger.util');
const config = require('../config/bot.config');
const execFileAsync = promisify(execFile);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

/**
 * Download file from URL to disk
 */
async function downloadToFile(url, destPath) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Referer': 'https://www.instagram.com/'
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

module.exports = {
  downloadInstagram
};
