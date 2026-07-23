const { Readable } = require('node:stream');
const { Innertube, UniversalCache } = require('youtubei.js');

// -- InnerTube client (lazy singleton) --------------------------------------
// youtubei.js talks to YouTube's InnerTube API the same way the official
// clients do. It needs no cookies file and no external binary, which is
// what made yt-dlp fragile on datacenter IPs (Oracle Cloud etc.).
let clientPromise = null;
function client() {
  if (!clientPromise) {
    clientPromise = Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true
    }).catch((cause) => {
      clientPromise = null; // allow retry on next call instead of caching a failure forever
      throw cause;
    });
  }
  return clientPromise;
}

const searchCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;
let lastBotChallengeLog = 0;

// -- Error classification -----------------------------------------------
function isBotChallenge(cause) {
  return /sign in to confirm|not a bot|confirm you're not a bot|429|too many requests/i.test(cause?.message || String(cause || ''));
}

function isUnavailable(cause) {
  return /private video|video unavailable|removed|deleted|not available|region|blocked|age[- ]restrict/i.test(cause?.message || String(cause || ''));
}

function warnBotChallenge(cause) {
  const now = Date.now();
  if (now - lastBotChallengeLog < 10 * 60 * 1000) return;
  lastBotChallengeLog = now;
  console.warn(`[YouTube] Search temporarily blocked by provider: ${cause.message || cause}`);
}

function classify(cause) {
  if (isBotChallenge(cause)) return { code: 'bot_challenge', message: 'YouTube is temporarily rate-limiting this server.' };
  if (isUnavailable(cause)) return { code: 'unavailable', message: 'That video is private, deleted, region-locked, or age-restricted.' };
  return { code: 'unknown', message: cause?.message || String(cause) };
}

// -- URL helpers -----------------------------------------------------------
function extractVideoId(input) {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null;
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    const shorts = url.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
    return null;
  } catch {
    return /^[\w-]{11}$/.test(input) ? input : null;
  }
}

function extractPlaylistId(input) {
  try {
    const url = new URL(input);
    return url.searchParams.get('list');
  } catch {
    return null;
  }
}

function isYouTubeUrl(input) {
  try {
    const { hostname } = new URL(input);
    return /(^|\.)youtube\.com$/.test(hostname) || hostname === 'youtu.be';
  } catch {
    return false;
  }
}

// -- Track mapping -----------------------------------------------------
function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

function trackFromSearchResult(video, requestedBy) {
  const id = video.video_id || video.id;
  return {
    title: video.title?.toString?.() || 'Unknown title',
    artist: video.author?.name || 'Unknown artist',
    duration: video.duration?.seconds || 0,
    thumbnail: video.best_thumbnail?.url || video.thumbnails?.at(-1)?.url || null,
    url: watchUrl(id),
    query: watchUrl(id),
    source: 'youtube',
    requestedBy
  };
}

function trackFromPlaylistItem(item, requestedBy) {
  const id = item.id || item.video_id;
  return {
    title: item.title?.toString?.() || 'Unknown title',
    artist: item.author?.name || 'Unknown artist',
    duration: item.duration?.seconds || 0,
    thumbnail: item.thumbnails?.at(-1)?.url || null,
    url: watchUrl(id),
    query: watchUrl(id),
    source: 'youtube',
    requestedBy
  };
}

function trackFromBasicInfo(info, requestedBy) {
  const id = info.basic_info.id;
  return {
    title: info.basic_info.title || 'Unknown title',
    artist: info.basic_info.author || info.basic_info.channel?.name || 'Unknown artist',
    duration: info.basic_info.duration || 0,
    thumbnail: info.basic_info.thumbnail?.at(-1)?.url || null,
    url: watchUrl(id),
    query: watchUrl(id),
    source: 'youtube',
    requestedBy
  };
}

// -- Public API --------------------------------------------------------
async function search(query, requestedBy, count = 1) {
  const key = `${query.toLowerCase().trim()}:${count}`;
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.items.map((item) => ({ ...item, requestedBy }));

  let items = [];
  try {
    const yt = await client();
    const results = await yt.search(query, { type: 'video' });
    items = (results.videos || []).slice(0, count).map((v) => trackFromSearchResult(v, requestedBy));
  } catch (cause) {
    if (isBotChallenge(cause)) {
      warnBotChallenge(cause);
      return [];
    }
    throw cause;
  }

  if (!items.length) return [];
  searchCache.set(key, { expires: Date.now() + CACHE_TTL, items });
  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value);
  return items;
}

async function resolveYouTube(url, requestedBy, limit) {
  const yt = await client();
  const playlistId = extractPlaylistId(url);
  if (playlistId) {
    const playlist = await yt.getPlaylist(playlistId);
    return playlist.items.slice(0, limit).map((item) => trackFromPlaylistItem(item, requestedBy));
  }
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('That YouTube link is not supported.');
  const info = await yt.getBasicInfo(videoId);
  return [trackFromBasicInfo(info, requestedBy)];
}

/**
 * Returns a Node Readable stream of the best available audio for a video.
 * Callers pipe this straight into ffmpeg's stdin.
 */
async function getAudioStream(urlOrId) {
  const yt = await client();
  const videoId = extractVideoId(urlOrId) || urlOrId;
  const info = await yt.getInfo(videoId);
  const webStream = await info.download({ type: 'audio', quality: 'best' });
  return Readable.fromWeb(webStream);
}

module.exports = {
  search,
  resolveYouTube,
  getAudioStream,
  isYouTubeUrl,
  extractVideoId,
  isBotChallenge,
  warnBotChallenge,
  classify,
  track: trackFromSearchResult
};
