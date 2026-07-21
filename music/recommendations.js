const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { search } = require('./youtube');
const { base } = require('../utils/embeds');
const { duration } = require('../utils/format');
const store = require('../utils/store');
const resolver = require('./search');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');

const GENRES = ['pop', 'hip hop', 'indie', 'rock', 'electronic', 'R&B', 'Punjabi', 'Bollywood', 'lofi', 'Afrobeats'];
let timer = null;

async function pick(guildId, requestedBy = '0') {
  const guild = store.guild(guildId);
  const seen = new Set(guild.recommendationHistory);
  for (let attempt = 0; attempt < 4; attempt++) {
    const genre = GENRES[Math.floor(Math.random() * GENRES.length)];
    try {
      const results = await search(`trending ${genre} music ${new Date().getFullYear()}`, requestedBy, 8);
      const track = results.find((item) => !seen.has(item.url));
      if (track) {
        guild.recommendationHistory.push(track.url);
        guild.recommendationHistory = guild.recommendationHistory.slice(-500);
        store.save();
        return { track, genre };
      }
    } catch (cause) {
      console.warn(`[Recommend] Attempt ${attempt + 1} failed:`, cause.message);
      continue;
    }
  }
  return null;
}

function payload(result) {
  const { track, genre } = result;
  
  const embed = base("🌟 Today's Recommendation", `**[${track.title}](${track.url})**`)
    .setImage(track.thumbnail || null)
    .addFields(
      { name: 'Artist', value: track.artist, inline: true },
      { name: 'Duration', value: duration(track.duration), inline: true },
      { name: 'Genre', value: genre, inline: true }
    );
    
  if (track.source === 'spotify') {
    embed.addFields({ name: 'Spotify', value: `[Listen on Spotify](${track.url})`, inline: true });
  } else if (track.url?.includes('youtube.com') || track.url?.includes('youtu.be')) {
    embed.addFields({ name: 'YouTube', value: `[Watch on YouTube](${track.url})`, inline: true });
  }

  embed.setFooter({ text: 'NEXORA Music Recommendations' }).setTimestamp();

  const parsed = new URL(track.url);
  const videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).at(-1);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId(`recommend:play:${videoId}`)
    .setStyle(ButtonStyle.Primary)
    .setLabel('Listen in Voice')
    .setEmoji('▶️'));
    
  return { embeds: [embed], components: [row] };
}

async function handleButton(interaction) {
  const channel = await voice(interaction);
  if (!channel) return;
  const videoId = interaction.customId.split(':').at(-1);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return interaction.reply({ embeds: [error('This recommendation is no longer available.')], ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const tracks = await resolver.resolve(`https://www.youtube.com/watch?v=${videoId}`, interaction.user.id);
    if (!tracks.length) throw new Error('No playable result');
    const settings = store.guild(interaction.guildId).settings;
    const queue = await interaction.client.music.connect(channel, settings.musicChannelId || interaction.channelId);
    const idle = !queue.current;
    if (idle) {
      queue.tracks = [];
      queue.current = tracks.shift();
      queue.tracks.unshift(...tracks);
    } else {
      queue.add(tracks);
    }
    interaction.client.music.persist(queue);
    await interaction.editReply({ embeds: [success(
      idle ? 'Starting recommendation' : 'Recommendation queued',
      `**${idle ? queue.current.title : tracks[0].title}** ${idle ? 'is starting now' : `was added at position ${queue.tracks.length}`}.`
    )] });
    if (idle) await interaction.client.music.play(queue);
  } catch (cause) {
    console.error('[Recommendation button]', cause);
    await interaction.editReply({ embeds: [error('I could not start that recommendation. Please try another one.')] });
  }
}

async function postForGuild(client, guildId) {
  const channelId = store.guild(guildId).settings.recommendationChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const result = await pick(guildId);
  if (result) await channel.send(payload(result)).catch((e) => console.warn(`[Recommend:${guildId}]`, e.message));
}

function start(client) {
  clearInterval(timer);
  timer = setInterval(() => {
    for (const guild of client.guilds.cache.values()) postForGuild(client, guild.id).catch((e) => console.warn(`[Recommend:${guild.id}]`, e.message));
  }, 5 * 60 * 1000);
  timer.unref?.();
}

module.exports = { pick, payload, start, handleButton };
