const { Events } = require('discord.js');
module.exports = {
  name: Events.VoiceStateUpdate,
  execute(oldState, newState) {
    const queue = newState.client.music.get(oldState.guild.id);
    if (!queue || (oldState.channelId !== queue.voiceChannelId && newState.channelId !== queue.voiceChannelId)) return;
    const channel = oldState.guild.channels.cache.get(queue.voiceChannelId);
    if (!channel) return newState.client.music.destroy(queue.guildId);
    const humans = channel.members.filter((member) => !member.user.bot).size;
    if (humans === 0 && !queue.twentyFourSeven) newState.client.music.scheduleLeave(queue);
    else clearTimeout(queue.leaveTimer);
  }
};
