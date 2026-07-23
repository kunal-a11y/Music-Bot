let credentials = null;
let access = null;

async function configure(clientId, clientSecret) {
  credentials = clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function token() {
  if (!credentials) throw new Error('Spotify credentials are not configured.');
  if (access && access.expiresAt > Date.now() + 30000) return access.value;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Spotify authentication failed (${response.status}).`);
  const body = await response.json();
  access = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return access.value;
}

async function api(path) {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${await token()}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    const error = new Error(`Spotify request failed (${response.status}).`);
    error.status = response.status;
    error.details = details.slice(0, 500);
    throw error;
  }
  return response.json();
}

async function pages(firstPath, limit) {
  const output = [];
  let path = firstPath;
  while (path && output.length < limit) {
    const page = await api(path);
    output.push(...page.items);
    path = page.next ? new URL(page.next).pathname + new URL(page.next).search : null;
  }
  return output.slice(0, limit);
}

function mapTrack(track, requestedBy, fallbackImage) {
  return {
    title: track.name,
    artist: track.artists?.map((a) => a.name).join(', ') || 'Unknown artist',
    duration: Math.floor((track.duration_ms || 0) / 1000),
    thumbnail: track.album?.images?.[0]?.url || fallbackImage || null,
    url: track.external_urls?.spotify,
    query: `${track.name} ${track.artists?.[0]?.name || ''} audio`,
    source: 'spotify',
    requestedBy
  };
}

function image(entity) {
  return entity.visualIdentity?.image?.at(-1)?.url || null;
}

function mapEmbedded(track, requestedBy, fallbackImage) {
  const artist = track.subtitle || track.artists?.map((item) => item.name).join(', ') || 'Unknown artist';
  const id = track.uri?.split(':').at(-1);
  return {
    title: track.title || track.name,
    artist,
    duration: Math.floor((track.duration || 0) / 1000),
    thumbnail: image(track) || fallbackImage,
    url: id ? `https://open.spotify.com/track/${id}` : null,
    query: `${track.title || track.name} ${artist} audio`,
    source: 'spotify',
    requestedBy
  };
}

async function resolveEmbed(type, id, requestedBy, limit) {
  const response = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 NEXORA-Music/1.0' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Spotify public metadata failed (${response.status}).`);
  const html = await response.text();
  const marker = html.split('__NEXT_DATA__')[1];
  if (!marker) throw new Error('Spotify returned an unsupported metadata page.');
  const jsonText = marker.slice(marker.indexOf('>') + 1, marker.indexOf('</script>'));
  const entity = JSON.parse(jsonText).props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error('Spotify metadata was empty.');
  const raw = type === 'track' ? [entity] : entity.trackList;
  if (!Array.isArray(raw) || !raw.length) throw new Error('This Spotify collection has no playable tracks.');
  const artwork = image(entity);
  return raw.slice(0, limit).map((track) => mapEmbedded(track, requestedBy, artwork));
}

async function resolve(url, requestedBy, limit) {
  const match = new URL(url).pathname.match(/^\/(track|playlist|album)\/([A-Za-z0-9]+)/);
  if (!match) throw new Error('That Spotify URL is not supported.');
  const [, type, id] = match;
  try {
    if (type === 'track') return [mapTrack(await api(`/tracks/${id}`), requestedBy)];
    if (type === 'playlist') {
      const items = await pages(`/playlists/${id}/items?limit=50`, limit);
      return items.map((entry) => entry.item || entry.track).filter(Boolean).map((track) => mapTrack(track, requestedBy));
    }
    const album = await api(`/albums/${id}?limit=50`);
    const tracks = [...album.tracks.items];
    if (album.tracks.next) tracks.push(...await pages(new URL(album.tracks.next).pathname + new URL(album.tracks.next).search, limit - tracks.length));
    return tracks.slice(0, limit).map((track) => mapTrack(track, requestedBy, album.images?.[0]?.url));
  } catch (cause) {
    console.warn(`[Spotify] API resolution failed (${cause.status || cause.message}); using public metadata.`);
    return resolveEmbed(type, id, requestedBy, limit);
  }
}

module.exports = { configure, resolve };
