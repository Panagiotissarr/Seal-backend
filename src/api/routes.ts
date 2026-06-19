import { Router, Request, Response } from 'express';
import { client } from '../services/discord.js';
import { startDiscordBot, stopDiscordBot, getDiscordUserViaRest, getGuildsViaRest } from '../services/lifecycle.js';
import { updateState, getState } from '../services/botState.js';
import { supabase } from '../services/supabase.js';

const API_KEY = process.env.API_KEY;

// Discord API type constants (avoiding discord-api-types import issues)
const GuildText = 0, GuildVoice = 2, GuildCategory = 4, GuildAnnouncement = 5, AnnouncementThread = 10;

function requireAuth(req: Request, res: Response): boolean {
  if (!API_KEY) return true;
  const key = req.headers['x-api-key'] as string;
  if (key !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

function requireBot(req: Request, res: Response): boolean {
  if (!client.isReady()) {
    res.status(503).json({ error: 'Bot not connected' });
    return false;
  }
  return true;
}

export function createRouter(syncMemoryState?: () => Promise<void>): Router {
  const router = Router();
  // ─── Bot Control ───

  router.post('/start', async (req, res) => {
    if (!requireAuth(req, res)) return;
    try {
      const ok = await startDiscordBot();
      if (syncMemoryState) await syncMemoryState();
      if (ok && client.isReady()) {
        const data = { id: client.user?.id, username: client.user?.username, discriminator: client.user?.discriminator, avatar: client.user?.avatar };
        return res.json({ success: true, data });
      }
      // Fallback: try REST
      const restData = await getDiscordUserViaRest();
      res.json({ success: true, data: restData || { id: null, username: 'seal-bot' } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/stop', async (req, res) => {
    if (!requireAuth(req, res)) return;
    await stopDiscordBot();
    if (syncMemoryState) await syncMemoryState();
    res.json({ success: true });
  });

  // ─── Discord API Proxies ───

  router.get('/me', async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (client.isReady()) {
      return res.json({ success: true, data: { id: client.user?.id, username: client.user?.username, discriminator: client.user?.discriminator, avatar: client.user?.avatar } });
    }
    const data = await getDiscordUserViaRest();
    if (!data) return res.status(503).json({ error: 'Bot not connected and REST fallback failed' });
    res.json({ success: true, data });
  });

  router.get('/guilds', async (req, res) => {
    if (!requireAuth(req, res)) return;
    if (client.isReady()) {
      return res.json({ success: true, data: (client.guilds.cache as any).map((g: any) => ({ id: g.id, name: g.name, icon: g.icon })) });
    }
    const guilds = await getGuildsViaRest();
    res.json({ success: true, data: guilds });
  });

  router.get('/guilds/:guildId/channels', async (req, res) => {
    if (!requireAuth(req, res) || !requireBot(req, res)) return;
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const channels = (guild.channels.cache as any)
      .filter((c: any) => [GuildText, GuildVoice, GuildCategory, GuildAnnouncement, AnnouncementThread].includes(c.type))
      .map((c: any) => ({ id: c.id, name: c.name, type: c.type, position: c.position ?? 0, parent_id: c.parentId }))
      .sort((a: any, b: any) => a.position - b.position);

    res.json({ success: true, data: channels });
  });

  router.get('/guilds/:guildId/members', async (req, res) => {
    if (!requireAuth(req, res) || !requireBot(req, res)) return;
    try {
      const guild = client.guilds.cache.get(req.params.guildId);
      if (!guild) return res.status(404).json({ error: 'Guild not found' });

      const limit = parseInt(req.query.limit as string) || 100;
      const fetched: any = await guild.members.fetch({ limit, withPresences: true });

      const members = fetched.map((m: any) => ({
        id: m.id,
        username: m.user.username,
        global_name: m.user.globalName,
        avatar: m.user.avatar,
        bot: m.user.bot,
        nick: m.nickname,
        joined_at: m.joinedAt?.toISOString(),
        roles: m.roles.cache.map((r: any) => r.id),
        status: m.presence?.status || 'offline',
      }));

      res.json({ success: true, data: members });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/channels/:channelId/messages', async (req, res) => {
    if (!requireAuth(req, res) || !requireBot(req, res)) return;
    try {
      const channel: any = await client.channels.fetch(req.params.channelId);
      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: 'Channel not found or not text-based' });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const options: any = { limit: Math.min(limit, 100) };
      if (req.query.after) options.after = req.query.after as string;

      const messages = await channel.messages.fetch(options);
      const mapped = [...messages.values()].map((m: any) => ({
        id: m.id,
        content: m.content,
        author: { id: m.author.id, username: m.author.username, avatar: m.author.avatar, bot: m.author.bot, global_name: m.author.globalName },
        timestamp: m.createdAt.toISOString(),
        attachments: m.attachments.map((a: any) => ({ id: a.id, filename: a.name, url: a.url, proxy_url: a.proxyURL, content_type: a.contentType, size: a.size, width: a.width, height: a.height })),
        mentions: m.mentions.users.map((u: any) => ({ id: u.id, username: u.username, global_name: u.globalName })),
      }));

      res.json({ success: true, data: mapped });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/channels/:channelId/messages', async (req, res) => {
    if (!requireAuth(req, res) || !requireBot(req, res)) return;
    try {
      const channel: any = await client.channels.fetch(req.params.channelId);
      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: 'Channel not found or not text-based' });
      }

      const msg = await channel.send(req.body.message);
      res.json({ success: true, data: { id: msg.id, content: msg.content } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/channels/:channelId/invite', async (req, res) => {
    if (!requireAuth(req, res) || !requireBot(req, res)) return;
    try {
      const channel: any = await client.channels.fetch(req.params.channelId);
      if (!channel || !channel.isTextBased()) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      const invite = await channel.createInvite({ maxAge: 86400, maxUses: 0, unique: false });
      res.json({ success: true, data: { code: invite.code, url: invite.url } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/dm/:userId', async (req, res) => {
    if (!requireAuth(req, res) || !requireBot(req, res)) return;
    try {
      const user = await client.users.fetch(req.params.userId);
      const dm: any = await user.createDM();
      const msg = await dm.send(req.body.message);
      res.json({ success: true, data: { id: msg.id } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Bot State ───

  router.get('/state', async (_req, res) => {
    if (!requireAuth(_req, res)) return;
    const state = await getState();
    res.json({ success: true, data: state });
  });

  router.patch('/state', async (req, res) => {
    if (!requireAuth(req, res)) return;
    await updateState(req.body);
    res.json({ success: true });
  });

  // ─── Memories ───

  router.get('/memories/:userId', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const { data } = await supabase.from('bot_memories').select('*').eq('user_id', req.params.userId).limit(50);
    res.json({ success: true, data });
  });

  router.post('/memories', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const { data } = await supabase.from('bot_memories').insert(req.body).select();
    res.json({ success: true, data });
  });

  router.delete('/memories/:userId', async (req, res) => {
    if (!requireAuth(req, res)) return;
    await supabase.from('bot_memories').delete().eq('user_id', req.params.userId);
    res.json({ success: true });
  });

  // ─── Monitored Channels ───

  router.get('/monitored-channels', async (_req, res) => {
    if (!requireAuth(_req, res)) return;
    const { data } = await supabase.from('monitored_channels').select('*');
    res.json({ success: true, data });
  });

  // ─── Custom Commands ───

  router.get('/custom-commands', async (_req, res) => {
    if (!requireAuth(_req, res)) return;
    const { data } = await supabase.from('custom_commands').select('*');
    res.json({ success: true, data });
  });

  // ─── Purge Bot Messages ───

  router.post('/purge', async (req, res) => {
    if (!requireAuth(req, res) || !requireBot(req, res)) return;
    try {
      const { data: logs } = await supabase.from('bot_reply_log').select('message_id, channel_id').order('created_at', { ascending: false }).limit(500);
      if (!logs || logs.length === 0) return res.json({ success: true, deleted: 0, failed: 0 });

      let deleted = 0, failed = 0;
      for (const log of logs) {
        try {
          const channel: any = await client.channels.fetch(log.channel_id);
          if (channel?.isTextBased()) {
            const msg = await channel.messages.fetch(log.message_id).catch(() => null);
            if (msg) { await msg.delete(); deleted++; }
            else { deleted++; }
          } else { deleted++; }
          await supabase.from('bot_reply_log').delete().eq('message_id', log.message_id);
        } catch { failed++; }
      }
      res.json({ success: true, deleted, failed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Auto-reply (AI) ───

  router.post('/auto-reply', async (req, res) => {
    if (!requireAuth(req, res) || !requireBot(req, res)) return;
    res.json({ success: true, replied: 0, message: 'Auto-reply is handled via message events' });
  });

  // ─── Action proxy (for legacy callBot pattern) ───
  // Maps { action: 'guild_members', channel_id: '...' } to proper REST routes
  router.post('/action', async (req, res) => {
    if (!requireAuth(req, res)) return;
    const { action, channel_id, message, limit, after, personality, incoming_messages, guild_id } = req.body;

    try {
      switch (action) {
        case 'me': {
          if (!requireBot(req, res)) return;
          const data = { id: client.user?.id, username: client.user?.username, discriminator: client.user?.discriminator, avatar: client.user?.avatar };
          return res.json({ success: true, data });
        }

        case 'guilds': {
          if (!requireBot(req, res)) return;
          const guilds = (client.guilds.cache as any).map((g: any) => ({ id: g.id, name: g.name, icon: g.icon }));
          return res.json({ success: true, data: guilds });
        }

        case 'channels': {
          if (!requireBot(req, res)) return;
          const gId = channel_id || guild_id;
          if (!gId) return res.status(400).json({ error: 'guild_id required' });
          const guild = client.guilds.cache.get(gId);
          if (!guild) return res.json({ success: true, data: [] });
          const channels = (guild.channels.cache as any)
            .filter((c: any) => [GuildText, GuildVoice, GuildCategory, GuildAnnouncement, AnnouncementThread].includes(c.type))
            .map((c: any) => ({ id: c.id, name: c.name, type: c.type, position: c.position ?? 0, parent_id: c.parentId }))
            .sort((a: any, b: any) => a.position - b.position);
          return res.json({ success: true, data: channels });
        }

        case 'guild_members': {
          if (!requireBot(req, res)) return;
          const gId2 = channel_id || guild_id;
          if (!gId2) return res.status(400).json({ error: 'guild_id required' });
          const guild2 = client.guilds.cache.get(gId2);
          if (!guild2) return res.json({ success: true, data: [] });
          const fetched: any = await guild2.members.fetch({ limit: Math.min(limit || 100, 100), withPresences: true });
          const members = fetched.map((m: any) => ({
            id: m.id, username: m.user.username, global_name: m.user.globalName,
            avatar: m.user.avatar, bot: m.user.bot, nick: m.nickname,
            joined_at: m.joinedAt?.toISOString(), roles: m.roles.cache.map((r: any) => r.id),
            status: m.presence?.status || 'offline',
          }));
          return res.json({ success: true, data: members });
        }

        case 'read_messages': {
          if (!requireBot(req, res)) return;
          if (!channel_id) return res.status(400).json({ error: 'channel_id required' });
          const channel: any = await client.channels.fetch(channel_id);
          if (!channel || !channel.isTextBased()) return res.json({ success: true, data: [] });
          const opts: any = { limit: Math.min(limit || 20, 100) };
          if (after) opts.after = after;
          const msgs = await channel.messages.fetch(opts);
          const mapped = [...msgs.values()].map((m: any) => ({
            id: m.id, content: m.content,
            author: { id: m.author.id, username: m.author.username, avatar: m.author.avatar, bot: m.author.bot, global_name: m.author.globalName },
            timestamp: m.createdAt.toISOString(),
            attachments: m.attachments.map((a: any) => ({ id: a.id, filename: a.name, url: a.url, proxy_url: a.proxyURL, content_type: a.contentType, size: a.size, width: a.width, height: a.height })),
            mentions: m.mentions.users.map((u: any) => ({ id: u.id, username: u.username, global_name: u.globalName })),
          }));
          return res.json({ success: true, data: mapped });
        }

        case 'send_message': {
          if (!requireBot(req, res)) return;
          if (!channel_id || !message) return res.status(400).json({ error: 'channel_id and message required' });
          const ch: any = await client.channels.fetch(channel_id);
          if (!ch || !ch.isTextBased()) return res.status(404).json({ error: 'Channel not found' });
          const msg = await ch.send(message);
          return res.json({ success: true, data: { id: msg.id, content: msg.content } });
        }

        case 'dm_user': {
          if (!requireBot(req, res)) return;
          if (!channel_id || !message) return res.status(400).json({ error: 'user_id and message required' });
          const user = await client.users.fetch(channel_id);
          const dm: any = await user.createDM();
          const dmMsg = await dm.send(message);
          return res.json({ success: true, data: { id: dmMsg.id } });
        }

        case 'create_invite': {
          if (!requireBot(req, res)) return;
          if (!channel_id) return res.status(400).json({ error: 'channel_id required' });
          const ch2: any = await client.channels.fetch(channel_id);
          if (!ch2 || !ch2.isTextBased()) return res.status(404).json({ error: 'Cannot create invite for this channel' });
          const invite = await ch2.createInvite({ maxAge: 86400, maxUses: 0, unique: false });
          return res.json({ success: true, data: { code: invite.code, url: invite.url } });
        }

        case 'auto_reply': {
          return res.json({ success: true, replied: 0, message: 'Auto-reply is handled via Discord message events' });
        }

        case 'purge': {
          if (!requireBot(req, res)) return;
          try {
            const { data: logs } = await supabase.from('bot_reply_log').select('message_id, channel_id').order('created_at', { ascending: false }).limit(500);
            if (!logs || logs.length === 0) return res.json({ success: true, deleted: 0, failed: 0 });
            let deleted = 0, failed = 0;
            for (const log of logs) {
              try {
                const channel: any = await client.channels.fetch(log.channel_id);
                if (channel?.isTextBased()) {
                  const msg = await channel.messages.fetch(log.message_id).catch(() => null);
                  if (msg) { await msg.delete(); deleted++; }
                  else { deleted++; }
                } else { deleted++; }
                await supabase.from('bot_reply_log').delete().eq('message_id', log.message_id);
              } catch { failed++; }
            }
            return res.json({ success: true, deleted, failed });
          } catch (err: any) {
            return res.status(500).json({ error: err.message });
          }
        }

        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
