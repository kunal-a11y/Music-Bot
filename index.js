const dns = require('dns');
dns.setDefaultResultOrder?.('ipv4first');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const MusicManager = require('./music/player');

if (!config.token || !config.clientId) {
  console.error('Missing TOKEN or CLIENT_ID. Copy .env.example to .env and fill in both values.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  allowedMentions: { parse: [], repliedUser: false }
});
client.commands = new Collection();
client.music = new MusicManager(client);

for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter((name) => name.endsWith('.js'))) {
  const command = require(path.join(__dirname, 'commands', file));
  if (!command.data?.name || !command.execute) throw new Error(`Invalid command module: ${file}`);
  client.commands.set(command.data.name, command);
}
for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter((name) => name.endsWith('.js'))) {
  const event = require(path.join(__dirname, 'events', file));
  client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args));
}

process.on('unhandledRejection', (cause) => console.error('[Unhandled rejection]', cause));
process.on('uncaughtException', (cause) => console.error('[Uncaught exception]', cause));
async function shutdown(signal) {
  console.log(`${signal}: shutting down cleanly`);
  for (const guildId of client.music.queues.keys()) client.music.destroy(guildId);
  client.destroy();
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

client.login(config.token).catch((cause) => {
  console.error('Discord login failed:', cause.message);
  process.exit(1);
});
