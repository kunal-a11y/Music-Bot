const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
const MusicManager = require('../music/player');
module.exports = {
  data: new SlashCommandBuilder().setName('filter').setDescription('Apply an audio effect')
    .addStringOption((o) => o.setName('effect').setDescription('Audio effect').setRequired(true)
      .addChoices({ name: 'Off', value: 'off' }, ...MusicManager.FILTERS.map((x) => ({ name: x, value: x })))),
  async execute(i) {
    await i.deferReply();
    if (!await voice(i)) return;
    const q = i.client.music.get(i.guildId);
    if (!q?.current) return i.editReply({ embeds: [error('Nothing is playing.')] });
    const effect = i.options.getString('effect');
    q.filters = effect === 'off' ? [] : [effect];
    try { await i.client.music.seek(q, q.elapsed); return i.editReply({ embeds: [success('Filter updated', effect === 'off' ? 'Audio filters are off.' : `Applied **${effect}**.`)] }); }
    catch { return i.editReply({ embeds: [error('The filter could not be applied to this source.')] }); }
  }
};
