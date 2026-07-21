const play = require('play-dl');
const spotify = require('./spotify');
const youtube = require('./youtube');
const config = require('../config');
const resolveCache = new Map();

function isDirect(value) {
  try {
    const url = new URL(value);
    return /\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?.*)?$/i.test(url.pathname) || !/youtube|youtu\.be|spotify|soundcloud/.test(url.hostname);
  } catch { return false; }
}

async function resolve(input, requestedBy) {
  const cacheKey = input.toLowerCase().trim();
  const cached = resolveCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.tracks.map((track) => ({ ...track, requestedBy }));
  const type = await play.validate(input);
  let tracks;
  if (type?.startsWith('sp_')) tracks = await spotify.resolve(input, requestedBy, config.maxPlaylistSize);
  else if (type?.startsWith('yt_')) tracks = await youtube.resolveYouTube(input, requestedBy, config.maxPlaylistSize);
  if (type?.startsWith('so_')) {
    const info = await play.soundcloud(input);
    if (info.type === 'playlist') {
      const sourceTracks = await info.all_tracks();
      tracks = sourceTracks.slice(0, config.maxPlaylistSize).map((t) => youtube.track(t, requestedBy));
    } else {
      tracks = [youtube.track(info, requestedBy)];
    }
  }
  if (!tracks && isDirect(input)) tracks = [{ title: decodeURIComponent(new URL(input).pathname.split('/').pop()), artist: 'Direct audio', duration: 0, thumbnail: null, url: input, query: input, source: 'direct', requestedBy }];
  if (!tracks) tracks = await youtube.search(input, requestedBy, 1);
  resolveCache.set(cacheKey, { expires: Date.now() + 30 * 60 * 1000, tracks });
  if (resolveCache.size > 250) resolveCache.delete(resolveCache.keys().next().value);
  return tracks;
}

async function suggestions(query) {
  if (!query || query.length < 2) return [];
  return (await youtube.search(query, '0', 8)).map((t) => ({ name: `${t.title} — ${t.artist}`.slice(0, 100), value: t.url }));
}

module.exports = { resolve, suggestions };
