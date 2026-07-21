const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('volume').setDescription('Set playback volume')
    .addIntegerOption((o) => o.setName('level').setDescription('0 to 200 percent').setRequired(true).setMinValue(0).setMaxValue(200)),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    if (!q) return i.reply({ embeds: [error('Nothing is playing.')], ephemeral: true });
    i.client.music.setVolume(q, i.options.getInteger('level'));
    return i.reply({ embeds: [success('Volume changed', `Volume is now **${q.volume}%**.`)] });
  }
};
