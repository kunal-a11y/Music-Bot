const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('radio').setDescription('Start endless related music from the current song'),
  async execute(i) {
    if (!await voice(i)) return;
    const queue = i.client.music.get(i.guildId);
    if (!queue?.current) return i.reply({ embeds: [error('Play a song first, then start radio mode.')], ephemeral: true });
    queue.autoplay = true;
    queue.loop = 'off';
    return i.reply({ embeds: [success('NEXORA Radio started', `Endless music is now based on **${queue.current.title}**.`)] });
  }
};
