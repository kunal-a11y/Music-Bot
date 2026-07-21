const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('voteskip').setDescription('Vote to skip the current song'),
  async execute(i) {
    const channel = await voice(i);
    if (!channel) return;
    const q = i.client.music.get(i.guildId);
    if (!q?.current) return i.reply({ embeds: [error('Nothing is playing.')], ephemeral: true });
    if (q.votes.has(i.user.id)) return i.reply({ embeds: [error('You already voted for this track.')], ephemeral: true });
    q.votes.add(i.user.id);
    const listeners = channel.members.filter((m) => !m.user.bot).size;
    const needed = Math.max(1, Math.ceil(listeners / 2));
    if (q.votes.size >= needed) {
      q.player.stop(true);
      return i.reply({ embeds: [success('Vote passed', `Skipped with **${q.votes.size}/${needed} votes**.`)] });
    }
    return i.reply({ embeds: [success('Vote recorded', `**${q.votes.size}/${needed} votes** needed to skip.`)] });
  }
};
