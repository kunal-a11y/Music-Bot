# NEXORA Music

A modular Discord music bot for Node.js with Spotify resolution, YouTube and SoundCloud playback, direct audio streams, persistent queues, modern controls, audio filters, favorites, history, vote-skip, and 24/7 mode.

## Requirements

- Node.js 22 LTS or newer
- A Discord application and bot token
- FFmpeg (bundled through `ffmpeg-static`; a system binary can be selected with `FFMPEG_PATH`)
- yt-dlp is installed as a project dependency; set `YTDLP_PATH` when using a custom executable
- Spotify developer credentials are optional and only needed for Spotify links

## Installation

1. Open the [Discord Developer Portal](https://discord.com/developers/applications), create an application, and add a bot.
2. Under **Bot**, enable no privileged intents—the bot only needs Guilds and Guild Voice States.
3. Invite it with the `bot` and `applications.commands` scopes. Grant View Channels, Connect, Speak, Send Messages, Embed Links, Read Message History, and Use Application Commands.
4. Install and configure:

```powershell
npm install
Copy-Item .env.example .env
```

5. Edit `.env`, then start:

```powershell
npm start
```

Use `npm run dev` for automatic restarts while editing and `npm run check` for syntax validation.

## Configuration

| Variable | Required | Purpose |
|---|---:|---|
| `TOKEN` | Yes | Discord bot token |
| `CLIENT_ID` | Yes | Discord application ID |
| `SPOTIFY_CLIENT_ID` | Spotify only | Spotify application client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify only | Spotify client secret |
| `GUILD_ID` | No | Registers commands instantly in one test server; omit for global commands |
| `DJ_ROLE_ID` | No | Restricts disruptive player controls to a role (Manage Server bypasses it) |
| `LEAVE_TIMEOUT_MS` | No | Empty-channel timeout; defaults to five minutes |
| `DEFAULT_VOLUME` | No | Startup volume, 1–200 |
| `MAX_PLAYLIST_SIZE` | No | Safety cap; defaults to 500 |
| `DATA_DIR` | No | Persistent favorites, history, settings, and queues |
| `FFMPEG_PATH` | No | Custom FFmpeg executable |
| `YTDLP_PATH` | No | Custom yt-dlp executable |
| `REGISTER_COMMANDS` | No | Set `false` when commands are managed separately |

Never commit `.env`; it is ignored by Git.

### Spotify setup

Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), copy its client ID and secret into `.env`, and restart NEXORA. Spotify audio is not streamed from Spotify: metadata is resolved in playlist/album order and each track is matched to playable audio.

## Commands

- Playback: `/play`, `/pause`, `/resume`, `/skip`, `/previous`, `/seek`, `/stop`, `/nowplaying`, `/volume`
- Queue: `/queue`, `/remove`, `/clear`, `/shuffle`, `/loop`, `/autoplay`
- Discovery/library: `/search`, `/lyrics`, `/favorite`, `/favorites`, `/history`
- Recommendations: `/recommend`, `/radio`
- Audio: `/filter` (bass boost, nightcore, vaporwave, 8D, treble boost, equalizer)
- Voice/admin: `/join`, `/leave`, `/247`, `/music setup`, `/voteskip`, `/ping`, `/help`

`/play` accepts text searches, YouTube videos/playlists, Spotify tracks/playlists/albums, SoundCloud, and direct audio URLs. Its input supports live autocomplete. Now Playing messages include previous, pause/resume, next, stop, loop, volume, shuffle, queue, and favorite controls.

`/music setup` saves a player channel, recommendation channel, default volume, and autoplay preference per server. Configured recommendation channels receive one non-repeating, multi-genre recommendation every 30 minutes without mentions.

## Persistence and operations

Runtime data is written atomically to `data/nexora.json`. Back up this directory for favorites, history, 24/7 settings, and queues. On graceful shutdown, active queue state is saved. Logs go to standard output and are suitable for PM2, Docker, systemd, or a hosting provider.

For deployment, keep one bot process per token, use a current Node LTS image, persist the `data` directory, supply environment variables through the host’s secret manager, and allow outbound HTTPS plus Discord voice UDP traffic.

## Troubleshooting

- **Commands do not appear:** set `GUILD_ID` while testing and confirm the invite includes `applications.commands`. Global registration can take time.
- **Joins but no audio:** check Connect/Speak permissions and ensure outbound UDP is allowed. Try a system FFmpeg installation and set `FFMPEG_PATH`.
- **A source stops working:** video platforms change frequently. Run `npm update`; for yt-dlp, use a current executable and set `YTDLP_PATH`.
- **Spotify links fail:** verify both Spotify values and that the credentials belong to the same active Spotify app.
- **PowerShell blocks npm.ps1:** invoke `npm.cmd install` and `npm.cmd start`, or adjust PowerShell execution policy according to your organization’s policy.
- **Native voice encryption error:** remove `node_modules` and the lockfile, then reinstall on the target Node version.

## Security

NEXORA uses slash commands, minimal gateway intents, bounded external requests, safe mentions, permission checks, playlist caps, and friendly error boundaries. Rotate a token immediately if it is ever exposed.
