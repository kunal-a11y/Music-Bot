const { SlashCommandBuilder } = require('discord.js');
const store = require('../utils/store');
const { voice } = require('../utils/guards');
const { base, success, error } = require('../utils/embeds');
const { truncate } = require('../utils/format');
module.exports = {
  data: new SlashCommandBuilder().setName('favorites').setDescription('View or play your saved songs')
    .addSubcommand((s) => s.setName('list').setDescription('List favorites'))
    .addSubcommand((s) => s.setName('play').setDescription('Queue one favorite').addIntegerOption((o) => o.setName('position').setDescription('Favorite number').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('play-all').setDescription('Queue all favorites'))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove one favorite').addIntegerOption((o) => o.setName('position').setDescription('Favorite number').setRequired(true).setMinValue(1))),
  async execute(i) {
    const user = store.user(i.user.id);
    const action = i.options.getSubcommand();
    if (action === 'list') {
      const list = user.favorites.slice(0, 25).map((t, n) => `\`${n + 1}.\` [${truncate(t.title, 70)}](${t.url})`).join('\n');
      return i.reply({ embeds: [base('Your Favorites', list || 'No favorites yet. Use `/favorite` while a song plays.')], ephemeral: true });
    }
    const position = (i.options.getInteger('position') || 1) - 1;
    if (action === 'remove') {
      const [removed] = user.favorites.splice(position, 1);
      if (!removed) return i.reply({ embeds: [error('That favorite does not exist.')], ephemeral: true });
      store.save(); return i.reply({ embeds: [success('Favorite removed', `Removed **${removed.title}**.`)], ephemeral: true });
    }
    await i.deferReply();
    const channel = await voice(i);
    if (!channel) return;
    const tracks = action === 'play-all' ? user.favorites.map((t) => ({ ...t, requestedBy: i.user.id })) : user.favorites[position] ? [{ ...user.favorites[position], requestedBy: i.user.id }] : [];
    if (!tracks.length) return i.editReply({ embeds: [error('There are no matching favorites to play.')] });
    const q = await i.client.music.connect(channel, i.channelId);
    const idle = !q.current; q.add(tracks); i.client.music.persist(q);
    await i.editReply({ embeds: [success('Favorites queued', `Added **${tracks.length} track${tracks.length === 1 ? '' : 's'}**.`)] });
    if (idle) await i.client.music.play(q);
  }
};
