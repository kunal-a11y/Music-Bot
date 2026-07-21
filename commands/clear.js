const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('clear').setDescription('Clear the entire queue and reset playback'),
  async execute(i) {
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    if (!q?.current && !q?.tracks.length) return i.reply({ embeds: [error('The queue is already empty.')], ephemeral: true });
    const count = q.tracks.length + (q.current ? 1 : 0);
    i.client.music.stop(q);
    return i.reply({ embeds: [success('Queue fully cleared', `Removed **${count} track${count === 1 ? '' : 's'}** and reset playback. Your next \`/play\` starts fresh.`)] });
  }
};
