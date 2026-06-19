import { client } from './discord.js';
import { getState, updateState } from './botState.js';

const Playing = 0;

const TOKEN = process.env.DISCORD_BOT_TOKEN;

export async function startDiscordBot(): Promise<boolean> {
  if (client.isReady()) return true;

  try {
    await client.login(TOKEN);
    await new Promise<void>(resolve => {
      if (client.isReady()) return resolve();
      client.once('ready', () => resolve());
    });
    console.log(`Logged in as ${client.user?.tag}`);

    await updateState({
      status: 'online',
      bot_id: client.user?.id || null,
      bot_username: client.user?.username || null,
    });

    const state = await getState();
    if (state?.custom_status) {
      client.user?.setActivity(state.custom_status, { type: Playing });
    }

    return true;
  } catch (err) {
    console.error('Failed to login:', err);
    await updateState({ status: 'error' });
    return false;
  }
}

export async function stopDiscordBot() {
  if (!client.isReady()) return;
  // Don't destroy the client — keep WebSocket alive so REST API still works.
  // Just clear the activity and update state so the bot stops responding to messages.
  client.user?.setActivity();
  await updateState({ status: 'offline', bot_id: client.user?.id || null, bot_username: client.user?.username || null });
}

export async function getDiscordUserViaRest(): Promise<{ id: string; username: string; avatar: string | null; discriminator: string } | null> {
  if (!TOKEN) return null;
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, username: data.username, avatar: data.avatar, discriminator: data.discriminator || '0' };
  } catch {
    return null;
  }
}

export async function getGuildsViaRest(): Promise<{ id: string; name: string; icon: string | null }[]> {
  if (!TOKEN) return [];
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bot ${TOKEN}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
