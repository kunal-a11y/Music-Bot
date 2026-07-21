const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle upcoming tracks'),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    if (!q?.tracks.length) return i.reply({ embeds: [error('There is nothing to shuffle.')], ephemeral: true });
    q.shuffle(); i.client.music.persist(q);
    return i.reply({ embeds: [success('Queue shuffled', `Mixed **${q.tracks.length} tracks**.`)] });
  }
};
