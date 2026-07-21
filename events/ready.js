const { Events, version } = require('discord.js');
const config = require('../config');
const spotify = require('../music/spotify');
const store = require('../utils/store');
const { setBranding } = require('../utils/embeds');
const recommendations = require('../music/recommendations');
module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    setBranding(client.user.displayAvatarURL({ size: 256 }));
    if (config.registerCommands) {
      const body = [...client.commands.values()].map((command) => command.data.toJSON());
      if (config.guildId) await client.application.commands.set(body, config.guildId);
      else await client.application.commands.set(body);
    }
    await spotify.configure(config.spotifyClientId, config.spotifyClientSecret).catch((e) => console.warn('[Spotify]', e.message));
    for (const [guildId, saved] of Object.entries(store.data.guilds)) {
      if (!saved.twentyFourSeven || !saved.voiceChannelId) continue;
      const channel = await client.channels.fetch(saved.voiceChannelId).catch(() => null);
      if (!channel?.isVoiceBased()) continue;
      const queue = await client.music.connect(channel, saved.textChannelId).catch((e) => {
        console.warn(`[24/7:${guildId}]`, e.message);
        return null;
      });
      if (queue && !queue.current && queue.tracks.length) await client.music.play(queue).catch((e) => client.music.fail(queue, e));
    }
    const memory = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    console.log([
      '╭──────────────────────────────────────╮',
      `│ NEXORA Music • ${client.user.tag}`,
      `│ Guilds: ${client.guilds.cache.size} • Ping: ${Math.round(client.ws.ping)}ms`,
      `│ Memory: ${memory}MB • discord.js ${version}`,
      `│ Node ${process.version}`,
      '╰──────────────────────────────────────╯'
    ].join('\n'));
    client.user.setActivity('/play • NEXORA Music');
    recommendations.start(client);
  }
};
