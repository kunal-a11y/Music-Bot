const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('previous').setDescription('Return to the previous track'),
  async execute(i) {
    if (!await voice(i)) return;
    const ok = await i.client.music.previous(i.client.music.get(i.guildId) || {});
    return ok ? i.reply({ embeds: [success('Going back', 'Playing the previous track.')] }) : i.reply({ embeds: [error('There is no previous track.')], ephemeral: true });
  }
};
