import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { Events } from "discord.js";

const Playing = 0;
import { client } from "./services/discord.js";
import {
  getState,
  updateState,
  subscribeToState,
  type BotState,
} from "./services/botState.js";
import { startDiscordBot, stopDiscordBot } from "./services/lifecycle.js";
import { createRouter } from "./api/routes.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const PORT = parseInt(process.env.PORT || "3001", 10);

if (!TOKEN) {
  console.error(
    "Missing DISCORD_BOT_TOKEN in .env - please set this environment variable with your Discord bot token",
  );
  process.exit(1);
}

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

let currentState: BotState | null = null;

export function getCurrentState(): BotState | null {
  return currentState;
}

async function syncMemoryState(): Promise<void> {
  const fresh = await getState();
  if (fresh) currentState = fresh;
}

async function syncStateFromDb() {
  currentState = await getState();
  if (currentState) {
    console.log(
      `State loaded: status=${currentState.status}, kill=${currentState.kill_switch}`,
    );
    if (currentState.status === "error") {
      console.log("Resetting stale error state to offline");
      await updateState({
        status: "offline",
        bot_id: null,
        bot_username: null,
      });
      currentState = {
        ...currentState,
        status: "offline",
        bot_id: null,
        bot_username: null,
      };
    }
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Discord bot ready: ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!currentState) return;
  const lcContent = message.content.trim().toLowerCase();
  const isStartCmd = lcContent === 'seal!start' || lcContent === 'seal!startup';
  if (currentState.kill_switch && !isStartCmd) return;
  if (currentState.conv_mode && !message.content.startsWith("seal!")) return;

  const { handleMessage } = await import("./handlers/messageHandler.js");
  await handleMessage(message, currentState!);
});

const app = express();
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

app.use("/api", createRouter(syncMemoryState));

app.get("/health", (_req, res) => {
  res.json({
    status: client.isReady() ? "online" : "offline",
    bot: client.user?.tag || null,
    uptime: process.uptime(),
  });
});

async function main() {
  await syncStateFromDb();

  // Always start discord.js on boot (persistent 24/7 behavior)
  console.log("Auto-connecting: starting discord.js...");
  startDiscordBot()
    .then(async (success) => {
      console.log(
        `Discord bot auto-start: ${success ? "connected" : "failed (will retry on demand)"}`,
      );
      // Sync in-memory state immediately (don't wait for Realtime subscription)
      if (success) {
        try {
          const fresh = await getState();
          if (fresh) currentState = fresh;
        } catch (err) {
          console.error("Failed to sync state after Discord connection:", err);
        }
      }
    })
    .catch((err) => {
      console.error("Unhandled error in Discord bot auto-start:", err);
    });

  subscribeToState(async (newState) => {
    try {
      currentState = newState;

      if (
        newState.status === "online" &&
        !client.isReady() &&
        !newState.kill_switch
      ) {
        await startDiscordBot();
      } else if (newState.status === "offline" && client.isReady()) {
        // Don't destroy the client - just mark activity as offline
        client.user?.setActivity();
      } else if (newState.kill_switch && client.isReady()) {
        client.user?.setActivity();
      } else if (
        !newState.kill_switch &&
        client.isReady() &&
        newState.custom_status
      ) {
        client.user?.setActivity(newState.custom_status, { type: Playing });
      }
    } catch (err) {
      console.error("Error in state subscription callback:", err);
    }
  });

  app.listen(PORT, () => {
    console.log(`Seal Bot API listening on port ${PORT}`);
    console.log(
      `API auth: ${process.env.API_KEY ? "enabled" : "disabled (set API_KEY for security)"}`,
    );
  });
}

main().catch(console.error);

export { startDiscordBot, stopDiscordBot };
