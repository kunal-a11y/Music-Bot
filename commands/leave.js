const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
const store = require('../utils/store');
module.exports = {
  data: new SlashCommandBuilder().setName('leave').setDescription('Disconnect from voice'),
  async execute(i) {
    if (!await voice(i)) return;
    if (!i.client.music.get(i.guildId)) return i.reply({ embeds: [error('I am not connected.')], ephemeral: true });
    const queue = i.client.music.get(i.guildId);
    queue.twentyFourSeven = false;
    store.guild(i.guildId).twentyFourSeven = false;
    store.save();
    i.client.music.destroy(i.guildId);
    return i.reply({ embeds: [success('Disconnected', 'See you next session.')] });
  }
};
