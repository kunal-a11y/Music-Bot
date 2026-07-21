const { SlashCommandBuilder } = require('discord.js');
const { base, error } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder().setName('lyrics').setDescription('Find lyrics for a song')
    .addStringOption((o) => o.setName('song').setDescription('Song and artist; defaults to current track')),
  async execute(i) {
    await i.deferReply();
    const q = i.client.music.get(i.guildId);
    const input = i.options.getString('song') || (q?.current ? `${q.current.artist} - ${q.current.title}` : null);
    if (!input) return i.editReply({ embeds: [error('Provide a song name or start playback first.')] });
    const [artist, ...titleParts] = input.includes(' - ') ? input.split(' - ') : ['', input];
    try {
      const url = artist
        ? `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(titleParts.join(' - '))}`
        : `https://api.lyrics.ovh/suggest/${encodeURIComponent(input)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('not found');
      const data = await response.json();
      let lyrics = data.lyrics;
      let heading = input;
      if (!lyrics && data.data?.[0]) {
        const hit = data.data[0];
        const second = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(hit.artist.name)}/${encodeURIComponent(hit.title)}`);
        lyrics = (await second.json()).lyrics;
        heading = `${hit.artist.name} — ${hit.title}`;
      }
      if (!lyrics) throw new Error('not found');
      const chunks = lyrics.trim().match(/[\s\S]{1,3900}/g) || [];
      await i.editReply({ embeds: [base(`Lyrics • ${heading}`, chunks[0])] });
      for (const chunk of chunks.slice(1, 3)) await i.followUp({ embeds: [base('Lyrics continued', chunk)] });
    } catch { await i.editReply({ embeds: [error(`Lyrics were not found for **${input}**.`)] }); }
  }
};
