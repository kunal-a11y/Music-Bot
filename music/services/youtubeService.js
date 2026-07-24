const { Readable } = require('node:stream');
const { Innertube, UniversalCache } = require('youtubei.js');

// -- InnerTube client (lazy singleton) --------------------------------------
// youtubei.js talks to YouTube's InnerTube API the same way the official
// clients do. It needs no cookies file and no external binary.
let clientPromise = null;
function client() {
  if (!clientPromise) {
    clientPromise = Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true
    }).catch((cause) => {
      clientPromise = null; // allow retry on the next call instead of caching a failure forever
      throw cause;
    });
  }
  return clientPromise;
}

// The default WEB client increasingly returns LOGIN_REQUIRED for playback
// formats unless the request carries a signed-in session or a proof-of-origin
// token. ANDROID/IOS clients don't carry that requirement for ordinary
// (non age-gated, non members-only) videos, so we try them first and only
// fall back to WEB last, per-video, with no persistent cookies involved.
const PLAYBACK_CLIENTS = ['ANDROID', 'IOS', 'WEB'];

const searchCache = new Map();
const CACHE_TTL = 15 * 60 * 1000;
let lastBotChallengeLog = 0;

// -- Structured errors ----------------------------------------------------
class PlaybackError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PlaybackError';
    this.code = code;
  }
}

function classifyStatus(status, reason) {
  switch (status) {
    case undefined:
    case 'OK':
      return null;
    case 'LOGIN_REQUIRED':
      return new PlaybackError(
        /members|join this channel/i.test(reason || '') ? 'MEMBERS_ONLY' : 'LOGIN_REQUIRED',
        /members|join this channel/i.test(reason || '')
          ? 'This video is members-only for its channel and cannot be played.'
          : 'This video requires sign-in on every playback client — it is likely age-restricted or region-locked.'
      );
    case 'AGE_CHECK_REQUIRED':
    case 'CONTENT_CHECK_REQUIRED':
      return new PlaybackError('AGE_RESTRICTED', 'This video is age-restricted and cannot be played.');
    case 'UNPLAYABLE':
      return new PlaybackError('UNPLAYABLE', reason || 'This video is unplayable (it may have been removed).');
    case 'LIVE_STREAM_OFFLINE':
      return new PlaybackError('LIVE_OFFLINE', 'That livestream is not currently live.');
    case 'ERROR':
      return new PlaybackError('UNAVAILABLE', 'That video is unavailable — it may be private or deleted.');
    default:
      return new PlaybackError('UNKNOWN', reason || `Playback was blocked (${status}).`);
  }
}

function isBotChallenge(cause) {
  return /sign in to confirm|not a bot|confirm you're not a bot|429|too many requests/i.test(cause?.message || String(cause || ''));
}

function warnBotChallenge(cause) {
  const now = Date.now();
  if (now - lastBotChallengeLog < 10 * 60 * 1000) return;
  lastBotChallengeLog = now;
  console.warn(`[YouTube] Search temporarily blocked by provider: ${cause.message || cause}`);
}

/**
 * Fetches video info, trying playback clients in order until one reports
 * the video as actually playable. Throws a structured PlaybackError
 * (private / age-restricted / members-only / login-required / unplayable)
 * if none of them can play it — never a raw InnertubeError.
 */
async function getPlayableInfo(yt, videoId) {
  let lastError = null;
  for (const clientType of PLAYBACK_CLIENTS) {
    let info;
    try {
      info = await yt.getInfo(videoId, { client: clientType });
    } catch (cause) {
      lastError = cause;
      continue;
    }
    const status = info.playability_status;
    const structured = classifyStatus(status?.status, status?.reason);
    if (!structured) return { info, client: clientType };
    lastError = structured;
    console.warn(`[YouTube] ${clientType} client rejected ${videoId}: ${status?.status || 'ERROR'} (${status?.reason || 'no reason given'})`);
  }
  throw lastError instanceof PlaybackError ? lastError : new PlaybackError('UNKNOWN', lastError?.message || 'No playback client could play this video.');
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
    console.error('[Search] YouTube search failed:', cause.message || cause);
    throw cause;
  }

  if (!items.length) return [];
  searchCache.set(key, { expires: Date.now() + CACHE_TTL, items });
  if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value);
  return items;
}

/**
 * Resolves a YouTube URL (video or playlist) into queueable tracks.
 * For a single video, this also validates playability up front so a
 * private/age-restricted/members-only link fails fast with a clear
 * message instead of only at playback time.
 */
async function resolveYouTube(url, requestedBy, limit) {
  const yt = await client();
  const playlistId = extractPlaylistId(url);
  if (playlistId) {
    const playlist = await yt.getPlaylist(playlistId);
    return playlist.items.slice(0, limit).map((item) => trackFromPlaylistItem(item, requestedBy));
  }
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('That YouTube link is not supported.');
  const { info } = await getPlayableInfo(yt, videoId);
  return [trackFromBasicInfo(info, requestedBy)];
}

/**
 * Returns a Node Readable stream of the best available audio for a video.
 * Callers pipe this straight into ffmpeg's stdin. Throws a structured
 * PlaybackError if the video cannot be played on any client.
 */
async function getAudioStream(urlOrId) {
  const yt = await client();
  const videoId = extractVideoId(urlOrId) || urlOrId;
  const { info, client: clientType } = await getPlayableInfo(yt, videoId);
  const webStream = await info.download({ type: 'audio', quality: 'best', client: clientType });
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
  PlaybackError,
  track: trackFromSearchResult
};
