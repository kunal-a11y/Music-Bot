const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    if (!q) return i.reply({ embeds: [error('Nothing is playing.')], ephemeral: true });
    i.client.music.stop(q);
    return i.reply({ embeds: [success('Playback stopped', 'The queue has been cleared.')] });
  }
};
