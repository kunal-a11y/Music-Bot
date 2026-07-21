const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
function parse(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(':').map(Number);
  return parts.every(Number.isFinite) && parts.length <= 3 ? parts.reduce((sum, part) => sum * 60 + part, 0) : NaN;
}
module.exports = {
  data: new SlashCommandBuilder().setName('seek').setDescription('Seek within the current track')
    .addStringOption((o) => o.setName('time').setDescription('Seconds or MM:SS').setRequired(true)),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    const seconds = parse(i.options.getString('time'));
    if (!Number.isFinite(seconds) || !await i.client.music.seek(q || {}, seconds)) return i.reply({ embeds: [error('That seek position is not valid for the current track.')], ephemeral: true });
    return i.reply({ embeds: [success('Position changed', `Jumped to **${i.options.getString('time')}**.`)] });
  }
};
