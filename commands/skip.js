const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    if (!q?.current) return i.reply({ embeds: [error('Nothing is playing.')], ephemeral: true });
    q.player.stop(true);
    return i.reply({ embeds: [success('Skipped', 'Moving to the next track.')] });
  }
};
