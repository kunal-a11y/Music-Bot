const { SlashCommandBuilder } = require('discord.js');
const { base } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Show NEXORA commands'),
  async execute(i) {
    const embed = base('NEXORA Music • Commands', 'Use `/play` with a name or URL. Controls also appear beneath the Now Playing card.')
      .addFields(
        { name: 'Playback', value: '`play` `pause` `resume` `skip` `previous` `seek` `stop` `nowplaying` `volume`' },
        { name: 'Queue', value: '`queue` `remove` `clear` `shuffle` `loop` `autoplay`' },
        { name: 'Discovery', value: '`search` `recommend` `radio` `lyrics` `favorite` `favorites` `history`' },
        { name: 'Sound', value: '`filter` — bass boost, nightcore, vaporwave, 8D, treble, EQ' },
        { name: 'Voice & settings', value: '`join` `leave` `247` `music setup` `voteskip` `ping` `help`' }
      );
    return i.reply({ embeds: [embed], ephemeral: true });
  }
};
