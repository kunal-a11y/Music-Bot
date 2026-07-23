const { SlashCommandBuilder } = require('discord.js');
const search = require('../music/search');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
const store = require('../utils/store');

module.exports = {
  data: new SlashCommandBuilder().setName('play').setDescription('Play a song, playlist, album, or URL')
    .addStringOption((o) => o.setName('query').setDescription('Song name or URL').setRequired(true).setAutocomplete(true)),
  async autocomplete(interaction) {
    const value = interaction.options.getFocused();
    try { await interaction.respond(await search.suggestions(value)); } catch { await interaction.respond([]).catch(() => {}); }
  },
  async execute(interaction) {
    await interaction.deferReply();
    const channel = await voice(interaction);
    if (!channel) return;
    try {
      const settings = store.guild(interaction.guildId).settings;
      const queue = await interaction.client.music.connect(channel, settings.musicChannelId || interaction.channelId);
      const wasIdle = !queue.current;
      const tracks = await search.resolve(interaction.options.getString('query', true), interaction.user.id);
      if (!tracks.length) return interaction.editReply({ embeds: [error('I could not find anything playable for that query.')] });
      const firstTrack = tracks[0];
      const total = tracks.length;
      let position;
      if (wasIdle) {
        queue.tracks = [];
        queue.current = tracks.shift();
        queue.tracks.unshift(...tracks);
        position = 1;
      } else {
        queue.add(tracks);
        position = queue.tracks.length - total + 1;
      }
      interaction.client.music.persist(queue);
      await interaction.editReply({ embeds: [success(total > 1 ? 'Collection queued' : 'Track queued', total > 1
        ? `Added **${total} tracks** in their original order.`
        : `Added **${firstTrack.title}** • queue position ${Math.max(1, position)}`)] });
      if (wasIdle) await interaction.client.music.play(queue);
    } catch (cause) {
      console.error('[Play]', cause);
      await interaction.editReply({ embeds: [error(`Playback setup failed: ${cause.message || 'Unknown error'}`)] });
    }
  }
};
