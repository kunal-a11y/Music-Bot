const { SlashCommandBuilder } = require('discord.js');
const store = require('../utils/store');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('favorite').setDescription('Save the current track to favorites'),
  async execute(i) {
    const q = i.client.music.get(i.guildId);
    if (!q?.current) return i.reply({ embeds: [error('Nothing is playing.')], ephemeral: true });
    const user = store.user(i.user.id);
    if (user.favorites.some((f) => f.url === q.current.url)) return i.reply({ embeds: [error('That track is already in your favorites.')], ephemeral: true });
    user.favorites.push({ ...q.current }); store.save();
    return i.reply({ embeds: [success('Favorite saved', `Added **${q.current.title}** to your library.`)], ephemeral: true });
  }
};
