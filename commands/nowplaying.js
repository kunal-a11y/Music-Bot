const { SlashCommandBuilder } = require('discord.js');
const { nowPlaying, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track'),
  async execute(i) {
    const q = i.client.music.get(i.guildId);
    return q?.current ? i.reply({ embeds: [nowPlaying(q)], components: i.client.music.controls(q) }) : i.reply({ embeds: [error('Nothing is playing.')], ephemeral: true });
  }
};
