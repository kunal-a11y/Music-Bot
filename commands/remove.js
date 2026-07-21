const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('remove').setDescription('Remove an upcoming track')
    .addIntegerOption((o) => o.setName('position').setDescription('Queue position').setRequired(true).setMinValue(1)),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    const position = i.options.getInteger('position') - 1;
    if (!q?.tracks[position]) return i.reply({ embeds: [error('That queue position does not exist.')], ephemeral: true });
    const [track] = q.tracks.splice(position, 1); i.client.music.persist(q);
    return i.reply({ embeds: [success('Track removed', `Removed **${track.title}**.`)] });
  }
};
