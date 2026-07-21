const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const store = require('../utils/store');
const { success } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('music').setDescription('Configure NEXORA Music')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('setup').setDescription('Configure music and recommendations')
      .addChannelOption((o) => o.setName('music-channel').setDescription('Channel for player cards').addChannelTypes(ChannelType.GuildText))
      .addChannelOption((o) => o.setName('recommendation-channel').setDescription('Channel for 30-minute recommendations').addChannelTypes(ChannelType.GuildText))
      .addIntegerOption((o) => o.setName('default-volume').setDescription('Default volume percent').setMinValue(1).setMaxValue(200))
      .addBooleanOption((o) => o.setName('autoplay').setDescription('Enable autoplay by default'))),
  async execute(i) {
    const guild = store.guild(i.guildId);
    const music = i.options.getChannel('music-channel');
    const recommendations = i.options.getChannel('recommendation-channel');
    const volume = i.options.getInteger('default-volume');
    const autoplay = i.options.getBoolean('autoplay');
    if (music) guild.settings.musicChannelId = music.id;
    if (recommendations) guild.settings.recommendationChannelId = recommendations.id;
    if (volume !== null) guild.settings.defaultVolume = volume;
    if (autoplay !== null) guild.settings.autoplay = autoplay;
    store.save();
    const queue = i.client.music.get(i.guildId);
    if (queue) {
      if (volume !== null) i.client.music.setVolume(queue, volume);
      if (autoplay !== null) queue.autoplay = autoplay;
      if (music) queue.textChannelId = music.id;
    }
    return i.reply({ embeds: [success('Music setup saved',
      `Player channel: ${guild.settings.musicChannelId ? `<#${guild.settings.musicChannelId}>` : 'Current command channel'}\n` +
      `Recommendations: ${guild.settings.recommendationChannelId ? `<#${guild.settings.recommendationChannelId}> every 15 minutes` : 'Disabled'}\n` +
      `Default volume: **${guild.settings.defaultVolume ?? 70}%**\nAutoplay: **${guild.settings.autoplay ? 'On' : 'Off'}**`)] });
  }
};
