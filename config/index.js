const fs = require('fs');
const path = require('path');

const number = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

function executable(configured, fallback, filename) {
  if (!configured) return fallback;
  const resolved = path.resolve(configured);
  if (fs.existsSync(resolved)) {
    if (fs.statSync(resolved).isDirectory()) {
      const candidate = path.join(resolved, process.platform === 'win32' ? `${filename}.exe` : filename);
      return fs.existsSync(candidate) ? candidate : fallback;
    }
    return resolved;
  }
  return configured.includes('/') || configured.includes('\\') ? fallback : configured;
}

module.exports = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || null,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || null,
  djRoleId: process.env.DJ_ROLE_ID || null,
  leaveTimeoutMs: number(process.env.LEAVE_TIMEOUT_MS, 300000, 30000, 3600000),
  defaultVolume: number(process.env.DEFAULT_VOLUME, 70, 1, 200),
  voiceReadyTimeoutMs: number(process.env.VOICE_READY_TIMEOUT_MS, 20000, 5000, 60000),
  voiceDebug: process.env.VOICE_DEBUG === 'true',
  maxPlaylistSize: number(process.env.MAX_PLAYLIST_SIZE, 500, 1, 5000),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  ffmpegPath: executable(process.env.FFMPEG_PATH, require('ffmpeg-static'), 'ffmpeg'),
  registerCommands: process.env.REGISTER_COMMANDS !== 'false',
  colors: { primary: 0x8b5cf6, error: 0xef4444, success: 0x22c55e, dark: 0x09090b }
};
