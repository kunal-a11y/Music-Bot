const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { search } = require('./youtube');
const { base } = require('../utils/embeds');
const { duration } = require('../utils/format');
const store = require('../utils/store');
const resolver = require('./search');
const { voice } = require('../utils/guards');
const { success, error } = require('../utils/embeds');

const RECOMMENDATION_POOLS = [
  { label: 'English Pop', queries: ['global english pop hits official audio', 'latest english pop songs official music video', 'top billboard pop songs official audio'] },
  { label: 'Indian Hits', queries: ['latest indian songs official music video', 'trending india music hindi official audio', 'bollywood hits official music video'] },
  { label: 'Punjabi', queries: ['latest punjabi songs official music video', 'trending punjabi music official audio', 'punjabi pop hits official music video'] },
  { label: 'Korean / K-Pop', queries: ['latest kpop songs official music video', 'korean pop hits official audio', 'trending kpop music official video'] },
  { label: 'Russian Pop', queries: ['russian pop hits official music video', 'latest russian songs official audio', 'trending russian music official video'] },
  { label: 'Spanish / Latin', queries: ['latin pop hits official music video', 'reggaeton hits official audio', 'spanish songs trending official video'] },
  { label: 'Japanese / J-Pop', queries: ['jpop hits official music video', 'latest japanese songs official audio', 'anime music hits official video'] },
  { label: 'Arabic', queries: ['arabic pop hits official music video', 'latest arabic songs official audio', 'middle eastern music hits official video'] },
  { label: 'Afrobeats', queries: ['afrobeats hits official music video', 'latest afrobeats songs official audio', 'trending afrobeat music official video'] },
  { label: 'Hip Hop / Rap', queries: ['hip hop hits official music video clean', 'latest rap songs official audio', 'global hip hop hits official video'] },
  { label: 'Electronic / EDM', queries: ['edm hits official music video', 'electronic dance music hits official audio', 'festival edm songs official video'] },
  { label: 'Lofi / Chill', queries: ['lofi songs chill music official audio', 'chill pop songs official audio', 'relaxing music popular songs official audio'] },
  { label: 'Rock', queries: ['rock hits official music video', 'modern rock songs official audio', 'alternative rock hits official video'] }
];
const CURATED_FALLBACKS = [
  { title: 'Believer', artist: 'Imagine Dragons', category: 'English Pop', duration: 204, thumbnail: 'https://i.ytimg.com/vi/7wtfhZwyrcc/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=7wtfhZwyrcc' },
  { title: 'Blinding Lights', artist: 'The Weeknd', category: 'English Pop', duration: 200, thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ' },
  { title: 'Kesariya', artist: 'Arijit Singh', category: 'Indian Hits', duration: 268, thumbnail: 'https://i.ytimg.com/vi/BddP6PYo2gs/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=BddP6PYo2gs' },
  { title: 'Apna Bana Le', artist: 'Arijit Singh', category: 'Indian Hits', duration: 261, thumbnail: 'https://i.ytimg.com/vi/ElZfdU54Cp8/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=ElZfdU54Cp8' },
  { title: 'Still Rollin', artist: 'Shubh', category: 'Punjabi', duration: 174, thumbnail: 'https://i.ytimg.com/vi/k85UB5b6pJU/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=k85UB5b6pJU' },
  { title: 'Excuses', artist: 'AP Dhillon, Gurinder Gill, Intense', category: 'Punjabi', duration: 176, thumbnail: 'https://i.ytimg.com/vi/vX2cDW8LUWk/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=vX2cDW8LUWk' },
  { title: 'Dynamite', artist: 'BTS', category: 'Korean / K-Pop', duration: 199, thumbnail: 'https://i.ytimg.com/vi/gdZLi9oWNZg/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=gdZLi9oWNZg' },
  { title: 'How You Like That', artist: 'BLACKPINK', category: 'Korean / K-Pop', duration: 181, thumbnail: 'https://i.ytimg.com/vi/ioNng23DkIM/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=ioNng23DkIM' },
  { title: 'Kometa', artist: 'JONY', category: 'Russian Pop', duration: 161, thumbnail: 'https://i.ytimg.com/vi/1NCzZHp-KhE/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=1NCzZHp-KhE' },
  { title: 'Despacito', artist: 'Luis Fonsi, Daddy Yankee', category: 'Spanish / Latin', duration: 282, thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk' },
  { title: 'Gurenge', artist: 'LiSA', category: 'Japanese / J-Pop', duration: 237, thumbnail: 'https://i.ytimg.com/vi/CwkzK-F0Y00/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=CwkzK-F0Y00' },
  { title: 'Ya Lili', artist: 'Balti, Hamouda', category: 'Arabic', duration: 201, thumbnail: 'https://i.ytimg.com/vi/6PsxwI4EUFY/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=6PsxwI4EUFY' },
  { title: 'Calm Down', artist: 'Rema', category: 'Afrobeats', duration: 239, thumbnail: 'https://i.ytimg.com/vi/WcIcVapfqXw/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=WcIcVapfqXw' },
  { title: 'Faded', artist: 'Alan Walker', category: 'Electronic / EDM', duration: 212, thumbnail: 'https://i.ytimg.com/vi/60ItHLz5WEA/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=60ItHLz5WEA' },
  { title: 'On & On', artist: 'Cartoon, Daniel Levi', category: 'Electronic / EDM', duration: 208, thumbnail: 'https://i.ytimg.com/vi/K4DyBUG242c/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=K4DyBUG242c' }
];
let timer = null;
let lastRecommendationWarning = 0;

function warnOnce(message, cause) {
  const now = Date.now();
  if (now - lastRecommendationWarning < 10 * 60 * 1000) return;
  lastRecommendationWarning = now;
  console.warn(`[Recommend] ${message}: ${cause.message || cause}`);
}

function nextPool(guild) {
  guild.recommendationCursor = Number.isInteger(guild.recommendationCursor) ? guild.recommendationCursor : 0;
  const pool = RECOMMENDATION_POOLS[guild.recommendationCursor % RECOMMENDATION_POOLS.length];
  guild.recommendationCursor = (guild.recommendationCursor + 1) % RECOMMENDATION_POOLS.length;
  return pool;
}

function buildSeeds(guildId, requestedBy, client) {
  const seeds = [];
  const guild = store.guild(guildId);
  const pool = nextPool(guild);
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
  seeds.push(...pool.queries);
  seeds.push(`${pool.label} popular songs official audio ${new Date().getFullYear()}`);
  return [...new Set(seeds)].slice(0, 10).map((query) => ({ query, genre: pool.label, requestedBy }));
}

function fallback(guildId, requestedBy, genre = 'NEXORA Global Picks') {
  const guild = store.guild(guildId);
  const seen = new Set(guild.recommendationHistory);
  const categoryMatches = CURATED_FALLBACKS.filter((item) => item.category === genre);
  const candidates = categoryMatches.length ? categoryMatches : CURATED_FALLBACKS;
  const track = candidates.find((item) => !seen.has(item.url)) || CURATED_FALLBACKS.find((item) => !seen.has(item.url)) || candidates[Math.floor(Math.random() * candidates.length)];
  guild.recommendationHistory.push(track.url);
  guild.recommendationHistory = guild.recommendationHistory.slice(-500);
  store.save();
  return { track: { ...track, query: track.url, source: 'youtube', requestedBy }, genre: track.category || genre };
}

async function pick(guildId, requestedBy = '0', client = null) {
  const guild = store.guild(guildId);
  const seen = new Set(guild.recommendationHistory);
  let lastGenre = 'NEXORA Global Picks';
  for (const seed of buildSeeds(guildId, requestedBy, client)) {
    lastGenre = seed.genre;
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
  return fallback(guildId, requestedBy, lastGenre);
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
