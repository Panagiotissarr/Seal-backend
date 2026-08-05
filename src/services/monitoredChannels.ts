import { supabase } from './supabase.js';

export interface MonitoredChannel {
  id?: string;
  guild_id: string;
  channel_id: string;
  created_at?: string;
}

const CACHE_TTL_MS = 30_000;

let cache: Set<string> | null = null;
let cacheExpiresAt = 0;

async function loadChannelIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now < cacheExpiresAt) return cache;
  const { data } = await supabase
    .from('monitored_channels')
    .select('channel_id');
  cache = new Set((data || []).map((row: any) => row.channel_id));
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cache;
}

function invalidateCache(): void {
  cache = null;
  cacheExpiresAt = 0;
}

export async function isChannelMonitored(channelId: string): Promise<boolean> {
  const ids = await loadChannelIds();
  return ids.has(channelId);
}

export async function getMonitoredChannels(): Promise<MonitoredChannel[]> {
  const { data } = await supabase
    .from('monitored_channels')
    .select('*')
    .order('created_at', { ascending: true });
  return (data as MonitoredChannel[]) || [];
}

export async function addMonitoredChannel(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('monitored_channels')
    .upsert(
      { guild_id: guildId, channel_id: channelId },
      { onConflict: 'channel_id', ignoreDuplicates: false },
    );
  if (error) {
    console.error('addMonitoredChannel error:', error.message);
    return false;
  }
  invalidateCache();
  return true;
}

export async function removeMonitoredChannel(channelId: string): Promise<boolean> {
  const { error } = await supabase
    .from('monitored_channels')
    .delete()
    .eq('channel_id', channelId);
  if (error) {
    console.error('removeMonitoredChannel error:', error.message);
    return false;
  }
  invalidateCache();
  return true;
}
