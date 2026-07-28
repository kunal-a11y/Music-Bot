const { Readable } = require('node:stream');
const { Innertube, UniversalCache, Log } = require('youtubei.js');
const { ProxyAgent, fetch: undiciFetch } = require('undici');
const config = require('../../config');

// youtubei.js logs every time YouTube's page layout includes a UI element
// it doesn't have a parser class for yet (concert ticket shelves, footnote
// links, etc.) and JIT-generates a class on the fly. This is expected and
// harmless — YouTube's frontend changes constantly — but it's extremely
// noisy. Only real errors are worth surfacing in production logs.
Log.setLevel(Log.Level.ERROR);

// -- InnerTube client (lazy singleton) --------------------------------------
// youtubei.js talks to YouTube's InnerTube API the same way the official
// clients do. It needs no cookies file and no external binary.
//
// If YT_PROXY_URL is set (e.g. http://user:pass@host:port), all InnerTube
// requests are routed through it. This is the only real fix for datacenter
// IPs (Oracle Cloud, AWS, GCP, etc.) that YouTube flags at the network level
// — no client type, no cookie, and no library swap gets around an IP-level
// block, because the block isn't about the request, it's about where it
// came from.
const proxyDispatcher = config.ytProxyUrl ? new ProxyAgent(config.ytProxyUrl) : null;
const proxiedFetch = proxyDispatcher
  ? (input, init) => {
      // youtubei.js's HTTPClient sometimes calls fetch(Request) instead of
      // fetch(url, init). Passing a Request straight through as `input`
      // alongside an init object trips an undici bug ("Failed to parse URL
      // from [object Request]"), so we unpack it into a plain (url, init)
      // call ourselves instead of relying on undici to merge the two.
      if (input && typeof input === 'object' && typeof input.url === 'string') {
        const req = input;
        return undiciFetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          duplex: req.body ? 'half' : undefined,
          ...init,
          dispatcher: proxyDispatcher
        });
      }
      return undiciFetch(input, { ...init, dispatcher: proxyDispatcher });
    }
  : undefined; // undefined = youtubei.js uses the platform default fetch

let defaultClientPromise = null;
let authClientPromise = null;

function getClient(useAuth = false) {
  if (useAuth && config.ytCookie) {
    if (!authClientPromise) {
      authClientPromise = Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
        ...(proxiedFetch ? { fetch: proxiedFetch } : {}),
        ...(config.ytPoToken ? { po_token: config.ytPoToken } : {}),
        ...(config.ytVisitorData ? { visitor_data: config.ytVisitorData } : {}),
        cookie: config.ytCookie
      }).catch((cause) => {
        authClientPromise = null;
        throw cause;
      });
    }
    return authClientPromise;
  }

  if (!defaultClientPromise) {
    defaultClientPromise = Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      ...(proxiedFetch ? { fetch: proxiedFetch } : {}),
      ...(config.ytPoToken ? { po_token: config.ytPoToken } : {}),
      ...(config.ytVisitorData ? { visitor_data: config.ytVisitorData } : {})
    }).catch((cause) => {
      defaultClientPromise = null;
      throw cause;
    });
  }
  return defaultClientPromise;
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
    case 'LOGIN_REQUIRED': {
      if (/not a bot|sign in to confirm/i.test(reason || '')) {
        return new PlaybackError('IP_BLOCKED', "YouTube is blocking this server's IP address (datacenter IPs are frequently flagged) — this is not fixable by switching client type or removing cookies.");
      }
      const isMembersOnly = /members|join this channel/i.test(reason || '');
      return new PlaybackError(
        isMembersOnly ? 'MEMBERS_ONLY' : 'LOGIN_REQUIRED',
        isMembersOnly
          ? 'This video is members-only for its channel and cannot be played.'
          : 'This video requires sign-in on every playback client — it is likely age-restricted or region-locked.'
      );
    }
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
async function getPlayableInfo(videoId) {
  let lastError = null;
  for (const clientType of PLAYBACK_CLIENTS) {
    const yt = await getClient(clientType === 'WEB');
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
    if (structured.code === 'IP_BLOCKED') break; // other clients will fail identically — don't waste round trips
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
    const yt = await getClient(true);
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
  const playlistId = extractPlaylistId(url);
  if (playlistId) {
    const yt = await getClient(true);
    const playlist = await yt.getPlaylist(playlistId);
    return playlist.items.slice(0, limit).map((item) => trackFromPlaylistItem(item, requestedBy));
  }
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('That YouTube link is not supported.');
  const { info } = await getPlayableInfo(videoId);
  return [trackFromBasicInfo(info, requestedBy)];
}

/**
 * Returns a Node Readable stream of the best available audio for a video.
 * Callers pipe this straight into ffmpeg's stdin. Throws a structured
 * PlaybackError if the video cannot be played on any client.
 *
 * Playability and downloadability are retried together per client: a
 * client can report a video as OK but still fail to produce a usable
 * stream URL (e.g. a decipher failure) — in that case we move on to the
 * next client instead of giving up.
 */
async function getAudioStream(urlOrId) {
  const videoId = extractVideoId(urlOrId) || urlOrId;
  let lastError = null;

  for (const clientType of PLAYBACK_CLIENTS) {
    const yt = await getClient(clientType === 'WEB');
    let info;
    try {
      info = await yt.getInfo(videoId, { client: clientType });
    } catch (cause) {
      lastError = cause;
      continue;
    }

    const status = info.playability_status;
    const structured = classifyStatus(status?.status, status?.reason);
    if (structured) {
      lastError = structured;
      console.warn(`[YouTube] ${clientType} client rejected ${videoId}: ${status?.status || 'ERROR'} (${status?.reason || 'no reason given'})`);
      if (structured.code === 'IP_BLOCKED') break; // other clients will fail identically
      continue;
    }

    try {
      const webStream = await info.download({ type: 'audio', quality: 'best', client: clientType });
      return Readable.fromWeb(webStream);
    } catch (cause) {
      const status = cause?.info?.response?.status;
      lastError = cause;
      console.warn(`[YouTube] ${clientType} client could not produce a stream for ${videoId}: ${cause.message || cause}${status ? ` (HTTP ${status})` : ''}`);
    }
  }

  throw lastError instanceof PlaybackError ? lastError : new PlaybackError('UNKNOWN', lastError?.message || 'No playback client could stream this video.');
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
