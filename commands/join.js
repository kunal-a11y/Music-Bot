const { SlashCommandBuilder } = require('discord.js');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('join').setDescription('Join your voice channel'),
  async execute(i) {
    const channel = await voice(i, { allowMove: true });
    if (!channel) return;
    await i.deferReply();
    await i.editReply({ embeds: [success('Joining voice', `Connecting to **${channel.name}**...`)] }).catch(() => {});
    try {
      await i.client.music.connect(channel, i.channelId, 0);
      return i.editReply({ embeds: [success('Connected', `Ready in **${channel.name}**.`)] }).catch(() => {});
    } catch (cause) {
      const message = cause.message?.includes('UDP') || cause.message?.includes('network')
        ? 'I reached Discord voice, but the voice network handshake did not become ready. On hosting, allow outbound UDP voice traffic and try `VOICE_DEBUG=true npm start` for deeper logs.'
        : 'I could not connect to that voice channel.';
      return i.editReply({ embeds: [error(message)] }).catch(() => i.followUp({ embeds: [error(message)], ephemeral: true }).catch(() => {}));
    }
  }
};
