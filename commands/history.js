const { SlashCommandBuilder } = require('discord.js');
const store = require('../utils/store');
const { base } = require('../utils/embeds');
const { truncate } = require('../utils/format');
module.exports = {
  data: new SlashCommandBuilder().setName('history').setDescription('Show your recently requested songs'),
  async execute(i) {
    const list = store.user(i.user.id).history.slice(0, 15)
      .map((t, n) => `\`${n + 1}.\` [${truncate(t.title, 65)}](${t.url}) • <t:${Math.floor(t.at / 1000)}:R>`).join('\n');
    return i.reply({ embeds: [base('Recently Played', list || 'Your history is empty.')], ephemeral: true });
  }
};
