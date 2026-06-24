import { client } from "./discord.js";
import { getState, updateState } from "./botState.js";

const Playing = 0;

const TOKEN = process.env.DISCORD_BOT_TOKEN;

export async function startDiscordBot(): Promise<boolean> {
  if (client.isReady()) return true;

  // Validate token via REST API before attempting WebSocket connection
  console.log("Validating Discord token via REST API...");
  const userData = await getDiscordUserViaRest();
  if (!userData) {
    console.error("Invalid Discord token: REST API authentication failed");
    try {
      await updateState({ status: "error" });
    } catch (stateErr) {
      console.error("Failed to update state:", stateErr);
    }
    return false;
  }
  console.log(`Token valid: Bot user ID ${userData.id}`);

  try {
    // Add connection timeout of 30 seconds
    const loginPromise = client.login(TOKEN);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Discord connection timeout after 30 seconds")),
        30000,
      ),
    );
    await Promise.race([loginPromise, timeoutPromise]);

    // Wait for ready event with timeout
    await Promise.race([
      new Promise<void>((resolve) => {
        if (client.isReady()) return resolve();
        client.once("ready", () => resolve());
      }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Ready event timeout after 30 seconds")),
          30000,
        ),
      ),
    ]);
    console.log(`Logged in as ${client.user?.tag}`);

    await updateState({
      status: "online",
      bot_id: client.user?.id || null,
      bot_username: client.user?.username || null,
    });

    const state = await getState();
    if (state?.custom_status) {
      client.user?.setActivity(state.custom_status, { type: Playing });
    }

    return true;
  } catch (err) {
    console.error("Failed to login:", err);
    try {
      await updateState({ status: "error" });
    } catch (stateErr) {
      console.error("Failed to update state:", stateErr);
    }
    return false;
  }
}

export async function stopDiscordBot() {
  if (!client.isReady()) return;
  // Don't destroy the client — keep WebSocket alive so REST API still works.
  // Just clear the activity and update state so the bot stops responding to messages.
  client.user?.setActivity();
  await updateState({
    status: "offline",
    bot_id: client.user?.id || null,
    bot_username: client.user?.username || null,
  });
}

export async function getDiscordUserViaRest(): Promise<{
  id: string;
  username: string;
  avatar: string | null;
  discriminator: string;
} | null> {
  if (!TOKEN) {
    console.error("DEBUG: DISCORD_BOT_TOKEN is empty or undefined");
    return null;
  }

  console.error(
    `DEBUG: Token exists, length=${TOKEN.length}, starts with=${TOKEN.substring(0, 8)}...`,
  );

  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${TOKEN}` },
    });

    console.error(`DEBUG: Discord API status=${res.status} ${res.statusText}`);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "unknown error");
      console.error(`DEBUG: Discord API error response: ${errorText}`);
      return null;
    }

    const data = await res.json();
    console.error(
      `DEBUG: Discord API success, authenticated as: ${data.username}#${data.discriminator}`,
    );
    return {
      id: data.id,
      username: data.username,
      avatar: data.avatar,
      discriminator: data.discriminator || "0",
    };
  } catch (err) {
    console.error(`DEBUG: Fetch to Discord API failed: ${err}`);
    return null;
  }
}

export async function getGuildsViaRest(): Promise<
  { id: string; name: string; icon: string | null }[]
> {
  if (!TOKEN) return [];
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bot ${TOKEN}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
