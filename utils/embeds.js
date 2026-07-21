const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { duration, progress, truncate } = require('./format');
let brandIcon = null;

function base(title, description, color = config.colors.primary) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: 'NEXORA Music', ...(brandIcon ? { iconURL: brandIcon } : {}) })
    .setTitle(title)
    .setDescription(description || null)
    .setTimestamp()
    .setFooter({ text: 'NEXORA Music', ...(brandIcon ? { iconURL: brandIcon } : {}) });
  return embed;
}

function error(message) { return base('Something went off-beat', message, config.colors.error); }
function success(title, message) { return base(title, message, config.colors.success); }

function nowPlaying(queue) {
  const track = queue.current;
  const elapsed = queue.elapsed;
  return base('Now Playing')
    .setImage(track.thumbnail || null)
    .setDescription(`**[${truncate(track.title, 100)}](${track.url})**\n${track.artist || 'Unknown artist'}`)
    .addFields(
      { name: 'Progress', value: `${progress(elapsed, track.duration)}\n\`${duration(elapsed)} / ${duration(track.duration)}\``, inline: false },
      { name: 'Duration', value: `\`${duration(track.duration)}\``, inline: true },
      { name: 'Requested by', value: `<@${track.requestedBy}>`, inline: true },
      { name: 'Volume', value: `${queue.volume}%`, inline: true },
      { name: 'Queue', value: `#1 • ${queue.tracks.length} upcoming`, inline: true },
      { name: 'Loop', value: queue.loop, inline: true },
      { name: 'Shuffle', value: queue.shuffled ? 'On' : 'Off', inline: true },
      { name: 'Autoplay', value: queue.autoplay ? 'On' : 'Off', inline: true },
      { name: 'Voice', value: queue.voiceChannelId ? `<#${queue.voiceChannelId}>` : 'Unknown', inline: true }
    );
}

function setBranding(url) { brandIcon = url || null; }
module.exports = { base, error, success, nowPlaying, setBranding };
