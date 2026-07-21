const { spawn } = require('child_process');
const {
  AudioPlayerStatus, VoiceConnectionStatus, createAudioPlayer, createAudioResource,
  entersState, joinVoiceChannel, NoSubscriberBehavior, StreamType
} = require('@discordjs/voice');
const play = require('play-dl');
const ytdlp = require('yt-dlp-exec');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType
} = require('discord.js');
const config = require('../config');
const MusicQueue = require('./queue');
const { search } = require('./youtube');
const { nowPlaying, error } = require('../utils/embeds');
const store = require('../utils/store');

const FILTERS = {
  bassboost: 'bass=g=10',
  nightcore: 'asetrate=48000*1.25,aresample=48000,atempo=0.8',
  vaporwave: 'asetrate=48000*0.8,aresample=48000,atempo=1.1',
  '8d': 'apulsator=hz=0.09',
  treble: 'treble=g=8',
  equalizer: 'superequalizer=1b=2:2b=1:3b=1:4b=1:5b=0:6b=0:7b=1:8b=2:9b=2:10b=1'
};
const VOICE_RECONNECT_DELAY_MS = 2500;
const MAX_VOICE_RECONNECTS = 3;

class MusicManager {
  constructor(client) {
    this.client = client;
    this.queues = new Map();
  }
  get(id) { return this.queues.get(id); }
  ensure(guildId) {
    if (!this.queues.has(guildId)) {
      const queue = new MusicQueue(guildId, config.defaultVolume);
      const saved = store.guild(guildId);
      queue.twentyFourSeven = saved.twentyFourSeven;
      queue.volume = saved.settings.defaultVolume ?? config.defaultVolume;
      queue.autoplay = saved.settings.autoplay ?? false;
      queue.tracks = saved.queue || [];
      this.queues.set(guildId, queue);
    }
    return this.queues.get(guildId);
  }
  persist(queue) {
    const saved = store.guild(queue.guildId);
    saved.twentyFourSeven = queue.twentyFourSeven;
    saved.voiceChannelId = queue.voiceChannelId;
    saved.textChannelId = queue.textChannelId;
    saved.queue = [queue.current, ...queue.tracks].filter(Boolean).slice(0, config.maxPlaylistSize);
    store.save();
  }
  async connect(channel, textChannelId, retries = 0, isRetry = false) {
    const queue = this.ensure(channel.guild.id);
    clearTimeout(queue.leaveTimer);
    clearTimeout(queue.reconnectTimer);
    queue.textChannelId = textChannelId || queue.textChannelId;
    queue.voiceChannelId = channel.id;
    if (queue.connection && queue.connection.joinConfig.channelId === channel.id && queue.connection.state.status === VoiceConnectionStatus.Ready) {
      queue.reconnectAttempts = 0;
      if (isRetry) console.log(`[Voice:${channel.guild.id}] Retry successful.`);
      return queue;
    }
    
    if (queue.connection) {
      queue.connection.removeAllListeners();
      queue.connection.destroy();
      queue.connection = null;
    }
    
    if (!channel.guild.voiceAdapterCreator) {
      throw new Error('Discord voice adapter is not available for this guild.');
    }

    console.log(`[Voice:${channel.guild.id}] Joining ${channel.name} (${channel.id})...`);
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: true,
      debug: config.voiceDebug
    });
    queue.connection = connection;

    connection.on('stateChange', (oldState, newState) => {
      console.log(`[Voice:${channel.guild.id}] ${oldState.status} -> ${newState.status}`);
    });
    connection.on('debug', (message) => {
      if (config.voiceDebug) console.log(`[Voice:${channel.guild.id}:debug] ${message}`);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log(`[Voice:${channel.guild.id}] Voice disconnected.`);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch {
        if (queue.connection === connection) {
          connection.removeAllListeners();
          connection.destroy();
          queue.connection = null;
          this.scheduleReconnect(queue);
        }
      }
    });
    
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, config.voiceReadyTimeoutMs);
      console.log(`[Voice:${channel.guild.id}] Ready.`);
      queue.reconnectAttempts = 0;
      if (isRetry) console.log(`[Voice:${channel.guild.id}] Retry successful.`);
    } catch (cause) {
      if (queue.connection === connection) {
        connection.removeAllListeners();
        connection.destroy();
        queue.connection = null;
      }
      if (retries > 0) {
        const attempt = 4 - retries;
        console.warn(`[Voice:${channel.guild.id}] Connection timed out. Retry ${attempt}/3`);
        return this.connect(channel, textChannelId, retries - 1, true);
      }
      const reason = cause.name === 'AbortError' ? `Timeout waiting for VoiceConnectionStatus.Ready (${config.voiceReadyTimeoutMs / 1000}s)` : cause.message;
      throw new Error(`Voice connection failed: ${reason}. If this happens on Ubuntu/Oracle while logs loop connecting -> signalling, check outbound UDP voice traffic and IPv6/network routing.`);
    }

    if (queue.player && queue.connection === connection) {
      connection.subscribe(queue.player);
    }
    this.persist(queue);
    return queue;
  }
  async scheduleReconnect(queue) {
    if (queue.reconnectAttempts >= MAX_VOICE_RECONNECTS) {
      console.warn(`[Voice:${queue.guildId}] Reconnect limit reached. Destroying stale voice connection.`);
      this.destroy(queue.guildId);
      return;
    }
    const channel = this.client.channels.cache.get(queue.voiceChannelId) || await this.client.channels.fetch(queue.voiceChannelId).catch(() => null);
    if (!channel) {
      this.destroy(queue.guildId);
      return;
    }
    const humans = channel.members?.filter((member) => !member.user.bot).size ?? 0;
    if (humans === 0 && !queue.twentyFourSeven) {
      this.scheduleLeave(queue);
      return;
    }
    queue.reconnectAttempts += 1;
    console.warn(`[Voice:${queue.guildId}] Reconnect ${queue.reconnectAttempts}/${MAX_VOICE_RECONNECTS} scheduled.`);
    clearTimeout(queue.reconnectTimer);
    queue.reconnectTimer = setTimeout(() => {
      this.connect(channel, queue.textChannelId, 1, true)
        .then(() => {
          if (queue.current && queue.player && queue.player.state.status === AudioPlayerStatus.Idle) return this.play(queue);
          return null;
        })
        .catch((e) => {
          console.error(`[Voice:${queue.guildId}] Reconnect failed:`, e.message);
          this.scheduleReconnect(queue);
        });
    }, VOICE_RECONNECT_DELAY_MS);
  }
  createPlayer(queue) {
    if (queue.player) return;
    queue.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    queue.connection.subscribe(queue.player);
    queue.player.on(AudioPlayerStatus.Idle, () => this.advance(queue).catch((e) => this.fail(queue, e)));
    queue.player.on('error', (e) => this.fail(queue, e));
  }
  async source(track, seek = 0, filters = []) {
    if (track.source === 'spotify' && !track.playUrl) {
      const [result] = await search(track.query, track.requestedBy, 1);
      if (!result) throw new Error(`No playable match found for ${track.title}`);
      track.playUrl = result.url;
      track.duration ||= result.duration;
      track.thumbnail ||= result.thumbnail;
    }
    const url = track.playUrl || track.query || track.url;
    if (filters.length || seek > 0 || track.source === 'direct') {
      const args = ['-hide_banner', '-loglevel', 'error'];
      let inputStream = null;
      if (track.source === 'direct') {
        args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', url);
      } else {
        const playable = await play.stream(url, { discordPlayerCompatibility: true });
        inputStream = playable.stream;
        args.push('-i', 'pipe:0');
      }
      if (seek > 0) args.push('-ss', String(seek));
      args.push('-vn');
      if (filters.length) args.push('-af', filters.map((f) => FILTERS[f]).filter(Boolean).join(','));
      args.push('-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');
      const ffmpeg = spawn(config.ffmpegPath, args, { windowsHide: true });
      inputStream?.pipe(ffmpeg.stdin);
      let stderr = '';
      ffmpeg.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-1000); });
      ffmpeg.on('error', (e) => ffmpeg.stdout.destroy(e));
      ffmpeg.on('close', (code) => { if (code && !ffmpeg.killed) ffmpeg.stdout.destroy(new Error(stderr || `FFmpeg exited ${code}`)); });
      return { stream: ffmpeg.stdout, type: StreamType.Raw };
    }
    try { return await play.stream(url, { discordPlayerCompatibility: true }); }
    catch (primaryError) {
      const runners = config.ytdlpPath ? [ytdlp.create(config.ytdlpPath), ytdlp] : [ytdlp];
      let directUrl = '';
      let fallbackError = primaryError;
      for (const runner of runners) {
        try {
          directUrl = String(await runner(url, {
            getUrl: true,
            format: 'bestaudio/best',
            noPlaylist: true,
            noWarnings: true
          })).trim().split(/\r?\n/)[0];
          if (directUrl) break;
        } catch (cause) {
          fallbackError = cause;
        }
      }
      if (!directUrl) throw fallbackError;
      const ffmpeg = spawn(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', directUrl, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { windowsHide: true });
      return { stream: ffmpeg.stdout, type: StreamType.Raw };
    }
  }
  async play(queue, seek = 0) {
    if (!queue.current) queue.current = queue.tracks.shift();
    if (!queue.current) return this.finish(queue);
    this.createPlayer(queue);
    const source = await this.source(queue.current, seek, queue.filters);
    const resource = createAudioResource(source.stream, { inputType: source.type, inlineVolume: true });
    resource.volume.setVolume(queue.volume / 100);
    resource.playbackDuration = seek * 1000;
    queue.resource = resource;
    queue.startedAt = Date.now() - seek * 1000;
    queue.pausedAt = 0;
    queue.pauseStarted = 0;
    queue.votes.clear();
    queue.player.play(resource);
    store.addHistory(queue.current.requestedBy, queue.current);
    this.persist(queue);
    await this.announce(queue);
    this.prefetch(queue).catch((e) => console.warn(`[Prefetch:${queue.guildId}]`, e.message));
  }
  async prefetch(queue) {
    const next = queue.tracks[0];
    if (!next || next.source !== 'spotify' || next.playUrl) return;
    const [result] = await search(next.query, next.requestedBy, 1);
    if (result) {
      next.playUrl = result.url;
      next.duration ||= result.duration;
      next.thumbnail ||= result.thumbnail;
    }
  }
  async advance(queue) {
    if (queue.stopping) { queue.stopping = false; return; }
    if (queue.current) {
      queue.history.unshift(queue.current);
      queue.history = queue.history.slice(0, 50);
      if (queue.loop === 'track') queue.tracks.unshift(queue.current);
      else if (queue.loop === 'queue') queue.tracks.push(queue.current);
    }
    const previous = queue.current;
    queue.current = queue.tracks.shift() || null;
    if (!queue.current && queue.autoplay && previous) {
      const results = await search(`${previous.artist} ${previous.title}`, previous.requestedBy, 5);
      queue.current = results.find((r) => r.url !== previous.playUrl && r.url !== previous.url) || null;
    }
    await this.play(queue);
  }
  async previous(queue) {
    const track = queue.history.shift();
    if (!track) return false;
    if (queue.current) queue.tracks.unshift(queue.current);
    queue.current = track;
    queue.stopping = true;
    queue.player.stop(true);
    await this.play(queue);
    return true;
  }
  async seek(queue, seconds) {
    if (!queue.current || seconds < 0 || (queue.current.duration && seconds >= queue.current.duration)) return false;
    queue.stopping = true;
    queue.player.stop(true);
    await this.play(queue, seconds);
    return true;
  }
  pause(queue) {
    if (!queue.player?.pause()) return false;
    queue.pauseStarted = Date.now();
    return true;
  }
  resume(queue) {
    if (!queue.player?.unpause()) return false;
    if (queue.pauseStarted) queue.pausedAt += Date.now() - queue.pauseStarted;
    queue.pauseStarted = 0;
    return true;
  }
  setVolume(queue, value) {
    queue.volume = Math.max(0, Math.min(200, value));
    queue.resource?.volume?.setVolume(queue.volume / 100);
  }
  stop(queue) {
    queue.tracks = [];
    queue.current = null;
    queue.stopping = queue.player?.stop(true) || false;
    queue.history = [];
    queue.votes.clear();
    queue.shuffled = false;
    this.persist(queue);
    if (!queue.twentyFourSeven) this.scheduleLeave(queue);
  }
  async finish(queue) {
    queue.current = null;
    this.persist(queue);
    if (!queue.twentyFourSeven) this.scheduleLeave(queue);
  }
  scheduleLeave(queue) {
    clearTimeout(queue.leaveTimer);
    queue.leaveTimer = setTimeout(() => this.destroy(queue.guildId), config.leaveTimeoutMs);
  }
  destroy(guildId) {
    const queue = this.queues.get(guildId);
    if (!queue) return;
    clearTimeout(queue.leaveTimer);
    clearTimeout(queue.reconnectTimer);
    queue.stopping = true;
    queue.player?.stop(true);
    queue.connection?.removeAllListeners();
    queue.connection?.destroy();
    this.persist(queue);
    this.queues.delete(guildId);
  }
  async fail(queue, cause) {
    console.error(`[Player:${queue.guildId}]`, cause);
    const channel = this.client.channels.cache.get(queue.textChannelId);
    await channel?.send({ embeds: [error(`Could not play **${queue.current?.title || 'that track'}**. Skipping it.`)] }).catch(() => {});
    queue.stopping = false;
    await this.advance(queue).catch((e) => console.error('[Player recovery]', e));
  }
  controls(queue) {
    const paused = queue.player?.state.status === AudioPlayerStatus.Paused;
    const button = (id, emoji, style = ButtonStyle.Secondary, disabled = false) =>
      new ButtonBuilder().setCustomId(id).setEmoji(emoji).setStyle(style).setDisabled(disabled);
    return [
      new ActionRowBuilder().addComponents(
        button('music:previous', '⏮️', ButtonStyle.Secondary, !queue.history.length),
        button(paused ? 'music:resume' : 'music:pause', paused ? '▶️' : '⏸️', ButtonStyle.Primary),
        button('music:skip', '⏭️'), button('music:stop', '⏹️', ButtonStyle.Danger),
        button('music:loop', '🔁', queue.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        button('music:down', '🔉'), button('music:up', '🔊'),
        button('music:shuffle', '🔀'), button('music:queue', '📜'),
        button('music:favorite', '💜')
      ),
      new ActionRowBuilder().addComponents(
        button('music:lyrics', '🎤')
      )
    ];
  }
  async announce(queue) {
    let channel = this.client.channels.cache.get(queue.textChannelId);
    if (!channel?.isTextBased?.()) {
      const voiceChannel = this.client.channels.cache.get(queue.voiceChannelId);
      if (voiceChannel?.isTextBased?.()) channel = voiceChannel;
    }
    if (!channel?.isTextBased()) return;
    const message = await channel.send({ embeds: [nowPlaying(queue)], components: this.controls(queue) }).catch((cause) => {
      console.warn(`[Now Playing:${queue.guildId}] Could not send player controls: ${cause.message}`);
      return null;
    });
    if (!message) return;
    const announcedTrack = queue.current;
    const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 21600000 });
    collector.on('collect', async (i) => {
      const memberChannel = i.member?.voice?.channelId;
      if (memberChannel !== queue.voiceChannelId) return i.reply({ embeds: [error('Join my voice channel to use the controls.')], ephemeral: true });
      await i.deferUpdate();
      const action = i.customId.slice(6);
      if (action === 'pause') this.pause(queue);
      else if (action === 'resume') this.resume(queue);
      else if (action === 'skip') queue.player.stop(true);
      else if (action === 'stop') this.stop(queue);
      else if (action === 'previous') await this.previous(queue);
      else if (action === 'up') this.setVolume(queue, queue.volume + 10);
      else if (action === 'down') this.setVolume(queue, queue.volume - 10);
      else if (action === 'shuffle') queue.shuffle();
      else if (action === 'loop') queue.loop = queue.loop === 'off' ? 'track' : queue.loop === 'track' ? 'queue' : 'off';
      else if (action === 'favorite') {
        const user = store.user(i.user.id);
        if (!user.favorites.some((f) => f.url === queue.current.url)) user.favorites.push(queue.current);
        store.save();
      } else if (action === 'queue') {
        const list = queue.tracks.slice(0, 10).map((t, n) => `${n + 1}. ${t.title}`).join('\n') || 'The queue is empty.';
        await i.followUp({ content: list, ephemeral: true });
      } else if (action === 'lyrics') {
        const track = queue.current;
        const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(track.artist)}/${encodeURIComponent(track.title)}`).catch(() => null);
        const lyrics = response?.ok ? (await response.json()).lyrics : null;
        await i.followUp({ content: lyrics ? `**${track.title} — ${track.artist}**\n${lyrics.slice(0, 1800)}` : 'Lyrics were not found for this track.', ephemeral: true });
      }
      await message.edit({ embeds: queue.current ? [nowPlaying(queue)] : [], components: queue.current ? this.controls(queue) : [] }).catch(() => {});
    });
    const progressTimer = setInterval(() => {
      if (queue.current !== announcedTrack) return clearInterval(progressTimer);
      message.edit({ embeds: [nowPlaying(queue)], components: this.controls(queue) }).catch(() => clearInterval(progressTimer));
    }, 15000);
    collector.on('end', () => clearInterval(progressTimer));
  }
}

MusicManager.FILTERS = Object.keys(FILTERS);
module.exports = MusicManager;
