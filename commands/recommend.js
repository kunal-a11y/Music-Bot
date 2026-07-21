const { SlashCommandBuilder } = require('discord.js');
const recommendations = require('../music/recommendations');
const { error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('recommend').setDescription('Discover a fresh, non-repeating song'),
  async execute(i) {
    await i.deferReply();
    const result = await recommendations.pick(i.guildId, i.user.id);
    return result ? i.editReply(recommendations.payload(result)) : i.editReply({ embeds: [error('I could not find a fresh recommendation right now.')] });
  }
};
