const { Events } = require('discord.js');
const { error } = require('../utils/embeds');
const { canDJ } = require('../utils/guards');

const DJ_COMMANDS = new Set(['skip', 'stop', 'pause', 'resume', 'volume', 'shuffle', 'remove', 'clear', 'loop', 'seek', 'previous', 'filter', 'autoplay']);

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith('recommend:play:')) {
      return require('../music/recommendations').handleButton(interaction);
    }
    if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return;
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;
    if (interaction.isAutocomplete()) return command.autocomplete?.(interaction);
    if (!interaction.inGuild()) return interaction.reply({ embeds: [error('NEXORA commands are available inside servers.')], ephemeral: true });
    if (DJ_COMMANDS.has(interaction.commandName) && !canDJ(interaction)) {
      return interaction.reply({ embeds: [error('This control requires the configured DJ role.')], ephemeral: true });
    }
    try { await command.execute(interaction); }
    catch (cause) {
      console.error(`[Command:${interaction.commandName}]`, cause);
      const payload = { embeds: [error('That command hit an unexpected error. Please try again.')], ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
};
