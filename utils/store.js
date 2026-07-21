const fs = require('fs');
const path = require('path');
const config = require('../config');

class Store {
  constructor() {
    this.file = path.join(config.dataDir, 'nexora.json');
    fs.mkdirSync(config.dataDir, { recursive: true });
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { this.data = { guilds: {}, users: {} }; }
    this.timer = null;
  }
  user(id) {
    return (this.data.users[id] ||= { favorites: [], history: [] });
  }
  guild(id) {
    const guild = (this.data.guilds[id] ||= { twentyFourSeven: false, queue: [] });
    guild.settings ||= {};
    guild.recommendationHistory ||= [];
    return guild;
  }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const temp = `${this.file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.data, null, 2));
      fs.renameSync(temp, this.file);
    }, 100);
  }
  addHistory(userId, track) {
    const user = this.user(userId);
    user.history.unshift({ title: track.title, url: track.url, at: Date.now() });
    user.history = user.history.slice(0, 50);
    this.save();
  }
}

module.exports = new Store();
