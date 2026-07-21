const { PermissionFlagsBits } = require('discord.js');
const { error } = require('./embeds');
const config = require('../config');

async function reply(interaction, payload) {
  const options = typeof payload === 'string' ? { embeds: [error(payload)], ephemeral: true } : payload;
  return interaction.deferred || interaction.replied ? interaction.editReply(options) : interaction.reply(options);
}

async function voice(interaction, options = {}) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) {
    await reply(interaction, { embeds: [error('Join a voice channel first.')], ephemeral: true });
    return null;
  }
  const me = interaction.guild.members.me;
  const permissions = channel.permissionsFor(me);
  const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];
  if (!permissions || required.some((flag) => !permissions.has(flag))) {
    await reply(interaction, { embeds: [error('I need **View Channel**, **Connect**, and **Speak** permissions there.')], ephemeral: true });
    return null;
  }
  const queue = interaction.client.music.get(interaction.guildId);
  if (queue?.voiceChannelId && queue.voiceChannelId !== channel.id && !options.allowMove) {
    await reply(interaction, { embeds: [error('Join my current voice channel to control playback.')], ephemeral: true });
    return null;
  }
  return channel;
}

function canDJ(interaction) {
  if (!config.djRoleId) return true;
  return interaction.member.roles.cache.has(config.djRoleId) || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
}

module.exports = { reply, voice, canDJ };
