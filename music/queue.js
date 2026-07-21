class MusicQueue {
  constructor(guildId, volume) {
    this.guildId = guildId;
    this.tracks = [];
    this.history = [];
    this.current = null;
    this.connection = null;
    this.player = null;
    this.textChannelId = null;
    this.voiceChannelId = null;
    this.volume = volume;
    this.loop = 'off';
    this.autoplay = false;
    this.twentyFourSeven = false;
    this.filters = [];
    this.shuffled = false;
    this.startedAt = 0;
    this.pausedAt = 0;
    this.pauseStarted = 0;
    this.leaveTimer = null;
    this.votes = new Set();
    this.stopping = false;
  }
  get elapsed() {
    if (!this.startedAt) return 0;
    const now = this.pauseStarted || Date.now();
    return Math.max(0, Math.floor((now - this.startedAt - this.pausedAt) / 1000));
  }
  add(items) { this.tracks.push(...items); }
  shuffle() {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
    this.shuffled = true;
  }
}
module.exports = MusicQueue;
