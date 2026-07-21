const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    return i.client.music.pause(q || {}) ? i.reply({ embeds: [success('Paused', 'Playback is paused.')] }) : i.reply({ embeds: [error('Nothing can be paused right now.')], ephemeral: true });
  }
};
