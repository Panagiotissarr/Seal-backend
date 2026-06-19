# Seal Bot — Standalone Backend

This is the standalone Node.js/TypeScript backend for the Seal Discord bot.
It replaces the Supabase Edge Functions with a persistent 24/7 process.

## Architecture

```
bot/
├── src/
│   ├── index.ts              # Entry: Express API + discord.js client
│   ├── api/
│   │   └── routes.ts         # REST API endpoints (mirrors discord-bot function)
│   ├── handlers/
│   │   ├── messageHandler.ts # Message event handler (AI reply, counting, intents)
│   │   ├── commandHandler.ts # seal! command processing
│   │   └── tools.ts          # Web search, image search, memory helpers
│   └── services/
│       ├── botState.ts       # Supabase bot_state read/write + realtime
│       └── supabase.ts       # Supabase client singleton
├── .env.example
├── package.json
└── tsconfig.json
```

## How it differs from the Supabase Edge Function version

| Aspect | Old (Supabase Edge) | New (Standalone) |
|--------|-------------------|------------------|
| Runtime | Deno (stateless) | Node.js (persistent) |
| Discord | Manual WebSocket | discord.js (handles gateway) |
| API | Supabase Functions | Express REST on `:3001` |
| State | Supabase DB | Supabase DB (same tables) |
| Deployment | Supabase | Wispbyte / Pterodactyl / any VPS |

## Quick Start

```bash
cd bot
cp .env.example .env
# Edit .env with your tokens and keys
npm install
npm run dev          # Development with hot reload
npm run build        # Compile to dist/
npm start            # Run compiled dist/index.js
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | ✅ | Your Discord bot token |
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `PORT` | ❌ | API port (default: `3001`) |
| `API_KEY` | ❌ | Shared secret used by the server-side proxy/backend |
| `LOVABLE_API_KEY` | ❌ | For AI auto-reply |
| `CLOUD_API_KEY` | ❌ | For web search context |
| `CLOUD_API_URL` | ❌ | Cloud API base URL |

## REST API Endpoints

The frontend communicates with the bot via these endpoints:

### Bot Control
- `POST /api/start` — Start Discord bot
- `POST /api/stop` — Stop Discord bot
- `GET /api/state` — Get current bot state
- `PATCH /api/state` — Update bot state
- `GET /health` — Health check

### Discord Data
- `GET /api/me` — Bot user info
- `GET /api/guilds` — List servers
- `GET /api/guilds/:id/channels` — List channels
- `GET /api/guilds/:id/members` — List members
- `GET /api/channels/:id/messages?limit=20&after=msg_id` — Read messages
- `POST /api/channels/:id/messages` — Send message `{ "message": "..." }`
- `POST /api/channels/:id/invite` — Create invite
- `POST /api/dm/:userId` — Send DM `{ "message": "..." }`

### Database
- `GET /api/memories/:userId` — Get user memories
- `POST /api/memories` — Insert memory
- `DELETE /api/memories/:userId` — Clear user memories
- `GET /api/monitored-channels` — List monitored channels
- `GET /api/custom-commands` — List custom commands
- `POST /api/purge` — Purge all bot messages

## Deploying to Pterodactyl / Wispbyte

1. **Upload**: Copy the entire `bot/` folder to your host (or use Git).
2. **Install**: Run `npm install` in the bot directory.
3. **Config**: Create `.env` with your Discord token and Supabase credentials.
4. **Start**: Use `npm start` as the startup command.

For a Pterodactyl egg, use:
- **Startup Command**: `npm start`
- **JS File**: `dist/index.js`
- **Install Command**: `npm install && npm run build`

## Frontend Communication

The frontend (React/Vite on Vercel) calls same-origin `/api/*` routes. In production, a server-side proxy injects `API_KEY` before forwarding to the standalone backend, so the browser never sees the secret.

```ts
await fetch('/api/guilds');
```

Set `API_KEY` only on the backend/proxy side. Do not expose it in browser env vars.
