const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('join').setDescription('Join your voice channel'),
  async execute(i) {
    const channel = await voice(i, { allowMove: true });
    if (!channel) return;
    await i.deferReply();
    try { await i.client.music.connect(channel, i.channelId); return i.editReply({ embeds: [success('Connected', `Ready in **${channel.name}**.`)] }); }
    catch { return i.editReply({ embeds: [error('I could not connect to that voice channel.')] }); }
  }
};
