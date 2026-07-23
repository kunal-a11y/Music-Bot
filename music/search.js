const spotify = require('./services/spotifyService');
const youtube = require('./services/youtubeService');
const config = require('../config');
const resolveCache = new Map();

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?.*)?$/i;

function classify(input) {
  let url;
  try { url = new URL(input); } catch { return 'search'; }
  if (url.hostname.includes('spotify.com')) return 'spotify';
  if (youtube.isYouTubeUrl(input)) return 'youtube';
  if (AUDIO_EXT.test(url.pathname)) return 'direct';
  // Unknown hosts (including SoundCloud, which we no longer resolve
  // directly) fall back to a YouTube search using the URL text itself —
  // better to find a close match than to hard-fail.
  return 'search';
}

async function resolve(input, requestedBy) {
  const cacheKey = input.toLowerCase().trim();
  const cached = resolveCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.tracks.map((track) => ({ ...track, requestedBy }));

  const type = classify(input);
  let tracks;
  if (type === 'spotify') tracks = await spotify.resolve(input, requestedBy, config.maxPlaylistSize);
  else if (type === 'youtube') tracks = await youtube.resolveYouTube(input, requestedBy, config.maxPlaylistSize);
  else if (type === 'direct') {
    tracks = [{
      title: decodeURIComponent(new URL(input).pathname.split('/').pop()),
      artist: 'Direct audio',
      duration: 0,
      thumbnail: null,
      url: input,
      query: input,
      source: 'direct',
      requestedBy
    }];
  } else {
    tracks = await youtube.search(input, requestedBy, 1);
  }

  resolveCache.set(cacheKey, { expires: Date.now() + 30 * 60 * 1000, tracks });
  if (resolveCache.size > 250) resolveCache.delete(resolveCache.keys().next().value);
  return tracks;
}

async function suggestions(query) {
  if (!query || query.length < 2) return [];
  return (await youtube.search(query, '0', 8)).map((t) => ({ name: `${t.title} — ${t.artist}`.slice(0, 100), value: t.url }));
}

module.exports = { resolve, suggestions };
