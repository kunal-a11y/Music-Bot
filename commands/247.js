const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/store');
const { voice } = require('../utils/guards');
const { success } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('247').setDescription('Keep NEXORA connected around the clock')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((o) => o.setName('enabled').setDescription('Whether 24/7 mode is enabled').setRequired(true)),
  async execute(i) {
    const channel = await voice(i);
    if (!channel) return;
    const q = await i.client.music.connect(channel, i.channelId);
    q.twentyFourSeven = i.options.getBoolean('enabled');
    store.guild(i.guildId).twentyFourSeven = q.twentyFourSeven; store.save();
    return i.reply({ embeds: [success('24/7 mode updated', `24/7 mode is **${q.twentyFourSeven ? 'on' : 'off'}**.`)] });
  }
};
