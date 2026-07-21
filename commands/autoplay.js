const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('autoplay').setDescription('Toggle related-song autoplay')
    .addBooleanOption((o) => o.setName('enabled').setDescription('Whether autoplay is enabled').setRequired(true)),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    if (!q) return i.reply({ embeds: [error('Start a music session first.')], ephemeral: true });
    q.autoplay = i.options.getBoolean('enabled');
    return i.reply({ embeds: [success('Autoplay updated', `Autoplay is **${q.autoplay ? 'on' : 'off'}**.`)] });
  }
};
