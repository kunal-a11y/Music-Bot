const play = require('play-dl');
const ytdlp = require('yt-dlp-exec');
const config = require('../config');
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;
let lastBotChallengeLog = 0;

function isBotChallenge(cause) {
  return /sign in to confirm|not a bot|confirm you're not a bot|429|too many requests/i.test(cause?.message || String(cause || ''));
}

function warnBotChallenge(cause) {
  const now = Date.now();
  if (now - lastBotChallengeLog < 10 * 60 * 1000) return;
  lastBotChallengeLog = now;
  console.warn(`[YouTube] Search temporarily blocked by provider: ${cause.message || cause}`);
}

function track(info, requestedBy) {
  return {
    title: info.title || 'Unknown title',
    artist: info.channel?.name || info.user?.name || 'Unknown artist',
    duration: info.durationInSec || 0,
    thumbnail: info.thumbnails?.at(-1)?.url || info.thumbnail || null,
    url: info.url,
    query: info.url,
    source: info.url?.includes('soundcloud.com') ? 'soundcloud' : 'youtube',
    requestedBy
  };
}

async function resolveYouTube(url, requestedBy, limit) {
  const kind = play.yt_validate(url);
  if (kind === 'playlist') {
    const playlist = await play.playlist_info(url, { incomplete: true });
    const videos = await playlist.all_videos();
    return videos.slice(0, limit).map((v) => track(v, requestedBy));
  }
  const info = await play.video_basic_info(url);
  return [track(info.video_details, requestedBy)];
}

async function search(query, requestedBy, count = 1) {
  const key = `${query.toLowerCase().trim()}:${count}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.items.map((item) => ({ ...item, requestedBy }));
  }
  let items = [];
  try {
    const results = await play.search(query, { limit: count, source: { youtube: 'video' } });
    items = results.map((item) => track(item, requestedBy));
  } catch (cause) {
    if (isBotChallenge(cause)) {
      warnBotChallenge(cause);
      return [];
    }
    if (cause.message?.includes('browseId') || cause.message?.includes('videoRenderer') || cause.message?.includes('Parse')) {
      const runner = config.ytdlpPath ? ytdlp.create(config.ytdlpPath) : ytdlp;
      try {
        const data = await runner(query, {
          defaultSearch: `ytsearch${count}`,
          dumpSingleJson: true,
          noWarnings: true,
          noCallHome: true,
          noCheckCertificate: true,
          ignoreErrors: true
        });
        const entries = data?.entries || (data?.title ? [data] : []);
        items = entries.map((info) => ({
          title: info.title || 'Unknown title',
          artist: info.uploader || info.channel || 'Unknown artist',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || null,
          url: info.webpage_url || info.url,
          query: info.webpage_url || info.url,
          source: 'youtube',
          requestedBy
        }));
      } catch (fallbackCause) {
        if (isBotChallenge(fallbackCause)) {
          warnBotChallenge(fallbackCause);
          return [];
        }
        throw fallbackCause;
      }
    } else {
      throw cause;
    }
  }
  if (!items.length) return [];
  cache.set(key, { expires: Date.now() + CACHE_TTL, items });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return items;
}

module.exports = { resolveYouTube, search, track };
