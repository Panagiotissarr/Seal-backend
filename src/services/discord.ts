import { Client } from 'discord.js';

// Gateway intents as numeric values
const Guilds = 1, GuildMessages = 512, MessageContent = 32768, GuildPresences = 256, GuildMembers = 2;

export const client = new Client({
  intents: [
    Guilds,
    GuildMessages,
    MessageContent,
    GuildPresences,
    GuildMembers,
  ],
});
