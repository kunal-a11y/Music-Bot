const { SlashCommandBuilder } = require('discord.js');
const { search } = require('../music/youtube');
const { base, error } = require('../utils/embeds');
const { duration, truncate } = require('../utils/format');
module.exports = {
  data: new SlashCommandBuilder().setName('search').setDescription('Search YouTube without changing the queue')
    .addStringOption((o) => o.setName('query').setDescription('What to find').setRequired(true)),
  async execute(i) {
    await i.deferReply();
    try {
      const results = await search(i.options.getString('query'), i.user.id, 10);
      const text = results.map((t, n) => `\`${n + 1}.\` [${truncate(t.title, 65)}](${t.url}) • ${duration(t.duration)}`).join('\n');
      return i.editReply({ embeds: [base('Search results', text || 'No results.')] });
    } catch { return i.editReply({ embeds: [error('Search is temporarily unavailable.')] }); }
  }
};
