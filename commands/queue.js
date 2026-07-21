const { SlashCommandBuilder } = require('discord.js');
const { base, error } = require('../utils/embeds');
const { duration, truncate } = require('../utils/format');
module.exports = {
  data: new SlashCommandBuilder().setName('queue').setDescription('Display the music queue')
    .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
  async execute(i) {
    const q = i.client.music.get(i.guildId);
    if (!q?.current) return i.reply({ embeds: [error('The queue is empty.')], ephemeral: true });
    const page = i.options.getInteger('page') || 1;
    const perPage = 10;
    const pages = Math.max(1, Math.ceil(q.tracks.length / perPage));
    if (page > pages) return i.reply({ embeds: [error(`There are only ${pages} pages.`)], ephemeral: true });
    const list = q.tracks.slice((page - 1) * perPage, page * perPage)
      .map((t, n) => `\`${(page - 1) * perPage + n + 1}.\` [${truncate(t.title, 55)}](${t.url}) • \`${duration(t.duration)}\``).join('\n');
    return i.reply({ embeds: [base('NEXORA Queue', `**Now:** ${q.current.title}\n\n${list || '*Nothing else queued.*'}`)
      .setFooter({ text: `Page ${page}/${pages} • ${q.tracks.length} upcoming • Loop: ${q.loop}` })] });
  }
};
