const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { search } = require('./youtube');
const { base } = require('../utils/embeds');
const { duration } = require('../utils/format');
const store = require('../utils/store');
const resolver = require('./search');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');

const GENRES = ['pop', 'hip hop', 'indie', 'rock', 'electronic', 'R&B', 'Punjabi', 'Bollywood', 'lofi', 'Afrobeats'];
const CURATED_FALLBACKS = [
  { title: 'Believer', artist: 'Imagine Dragons', duration: 204, thumbnail: 'https://i.ytimg.com/vi/7wtfhZwyrcc/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=7wtfhZwyrcc' },
  { title: 'Faded', artist: 'Alan Walker', duration: 212, thumbnail: 'https://i.ytimg.com/vi/60ItHLz5WEA/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=60ItHLz5WEA' },
  { title: 'Still Rollin', artist: 'Shubh', duration: 174, thumbnail: 'https://i.ytimg.com/vi/k85UB5b6pJU/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=k85UB5b6pJU' },
  { title: 'Blinding Lights', artist: 'The Weeknd', duration: 200, thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ' },
  { title: 'On & On', artist: 'Cartoon, Daniel Levi', duration: 208, thumbnail: 'https://i.ytimg.com/vi/K4DyBUG242c/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=K4DyBUG242c' },
  { title: 'Excuses', artist: 'AP Dhillon, Gurinder Gill, Intense', duration: 176, thumbnail: 'https://i.ytimg.com/vi/vX2cDW8LUWk/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=vX2cDW8LUWk' }
];
let timer = null;
let lastRecommendationWarning = 0;

function warnOnce(message, cause) {
  const now = Date.now();
  if (now - lastRecommendationWarning < 10 * 60 * 1000) return;
  lastRecommendationWarning = now;
  console.warn(`[Recommend] ${message}: ${cause.message || cause}`);
}

function buildSeeds(guildId, requestedBy, client) {
  const seeds = [];
  const queue = client?.music?.get(guildId);
  const add = (track) => {
    if (!track?.title) return;
    const artist = track.artist && track.artist !== 'Unknown artist' ? `${track.artist} ` : '';
    seeds.push(`${artist}${track.title} related music official audio`);
  };
  add(queue?.current);
  queue?.history?.slice(0, 4).forEach(add);
  queue?.tracks?.slice(0, 3).forEach(add);
  for (const user of Object.values(store.data.users || {})) {
    user.history?.slice(0, 2).forEach(add);
  }
  const genre = GENRES[Math.floor(Math.random() * GENRES.length)];
  seeds.push(`best ${genre} music official audio ${new Date().getFullYear()}`);
  return [...new Set(seeds)].slice(0, 8).map((query) => ({ query, genre, requestedBy }));
}

function fallback(guildId, requestedBy) {
  const guild = store.guild(guildId);
  const seen = new Set(guild.recommendationHistory);
  const track = CURATED_FALLBACKS.find((item) => !seen.has(item.url)) || CURATED_FALLBACKS[Math.floor(Math.random() * CURATED_FALLBACKS.length)];
  guild.recommendationHistory.push(track.url);
  guild.recommendationHistory = guild.recommendationHistory.slice(-500);
  store.save();
  return { track: { ...track, query: track.url, source: 'youtube', requestedBy }, genre: 'NEXORA Picks' };
}

async function pick(guildId, requestedBy = '0', client = null) {
  const guild = store.guild(guildId);
  const seen = new Set(guild.recommendationHistory);
  for (const seed of buildSeeds(guildId, requestedBy, client)) {
    try {
      const results = await search(seed.query, requestedBy, 6);
      const track = results.find((item) => !seen.has(item.url));
      if (track) {
        guild.recommendationHistory.push(track.url);
        guild.recommendationHistory = guild.recommendationHistory.slice(-500);
        store.save();
        return { track, genre: seed.genre };
      }
    } catch (cause) {
      warnOnce('Search seed failed', cause);
      continue;
    }
  }
  return fallback(guildId, requestedBy);
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

  let videoId = null;
  try {
    const parsed = new URL(track.url);
    videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).at(-1);
  } catch {}
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
    .setCustomId(`recommend:play:${videoId || 'unavailable'}`)
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
    const playerChannelId = typeof channel.isTextBased === 'function' && channel.isTextBased()
      ? channel.id
      : settings.musicChannelId || interaction.channelId;
    const queue = await interaction.client.music.connect(channel, playerChannelId);
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
  const result = await pick(guildId, '0', client);
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
