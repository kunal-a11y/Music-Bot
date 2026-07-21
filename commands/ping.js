const { SlashCommandBuilder } = require('discord.js');
const { base } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  async execute(i) {
    const sent = await i.reply({ content: 'Measuring…', fetchReply: true });
    return i.editReply({ content: null, embeds: [base('NEXORA Status')
      .addFields({ name: 'API latency', value: `${Math.round(i.client.ws.ping)} ms`, inline: true }, { name: 'Round trip', value: `${sent.createdTimestamp - i.createdTimestamp} ms`, inline: true })] });
  }
};
