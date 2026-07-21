const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('loop').setDescription('Set the loop mode')
    .addStringOption((o) => o.setName('mode').setDescription('Loop mode').setRequired(true)
      .addChoices({ name: 'Off', value: 'off' }, { name: 'Current track', value: 'track' }, { name: 'Entire queue', value: 'queue' })),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    if (!q) return i.reply({ embeds: [error('Nothing is playing.')], ephemeral: true });
    q.loop = i.options.getString('mode');
    return i.reply({ embeds: [success('Loop updated', `Loop mode is now **${q.loop}**.`)] });
  }
};
