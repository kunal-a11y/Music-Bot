const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    return i.client.music.resume(q || {}) ? i.reply({ embeds: [success('Resumed', 'Playback continues.')] }) : i.reply({ embeds: [error('Nothing is paused.')], ephemeral: true });
  }
};
