import { supabase } from '../services/supabase.js';
import { getState } from '../services/botState.js';

// ─── Image Search ───

export async function handleImageSearch(query: string): Promise<string | null> {
  try {
    const tokenRes = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!tokenRes.ok) return null;
    const html = await tokenRes.text();
    const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
    const vqd = vqdMatch?.[1] || html.match(/vqd=([\d-]+)/)?.[1];
    if (!vqd) return null;

    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,,,&p=1`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://duckduckgo.com/' } },
    );
    if (!imgRes.ok) return null;
    const data = await imgRes.json();
    if (data.results?.length > 0) {
      const maxIdx = Math.min(data.results.length, 5);
      return data.results[Math.floor(Math.random() * maxIdx)].image || data.results[0].thumbnail || null;
    }
    return null;
  } catch { return null; }
}

// ─── Image Generation (via Cloud API) ───

export async function handleImageGeneration(prompt: string): Promise<string | null> {
  try {
    const CLOUD_API_KEY = process.env.CLOUD_API_KEY;
    if (!CLOUD_API_KEY) return null;
    const res = await fetch(`${process.env.CLOUD_API_URL || 'https://fpxtucteydpmuswitebs.supabase.co/functions/v1/api'}/generate`, {
      method: 'POST',
      headers: { 'x-api-key': CLOUD_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.image_url || null;
  } catch { return null; }
}

// ─── Web Search ───

export async function handleWebSearch(query: string, apiKey?: string): Promise<string> {
  if (!apiKey) return '';
  try {
    const res = await fetch(`${process.env.CLOUD_API_URL || 'https://fpxtucteydpmuswitebs.supabase.co/functions/v1/api'}/search`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.answer || '';
  } catch { return ''; }
}

// ─── News ───

export async function handleNews(apiKey?: string): Promise<string> {
  if (!apiKey) return '';
  try {
    const res = await fetch(`${process.env.CLOUD_API_URL || 'https://fpxtucteydpmuswitebs.supabase.co/functions/v1/api'}/search`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'top news headlines today' }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.answer || '';
  } catch { return ''; }
}

// ─── Memory Functions ───

export async function getUserMemories(userId: string): Promise<string> {
  try {
    const [memoriesRes, messagesRes] = await Promise.all([
      supabase.from('bot_memories').select('key, value').eq('user_id', userId).not('key', 'like', 'msg_%').limit(30),
      supabase.from('bot_memories').select('key, value').eq('user_id', userId).like('key', 'msg_%').order('created_at', { ascending: false }).limit(20),
    ]);
    const memories = memoriesRes.data || [];
    const messages = messagesRes.data || [];
    if (memories.length === 0 && messages.length === 0) return '';
    let result = '\n\nUSER MEMORIES:';
    if (memories.length > 0) result += '\n' + memories.map(m => `- ${m.key}: ${m.value}`).join('\n');
    if (messages.length > 0) result += '\nRecent messages:\n' + messages.map(m => `- "${m.value}"`).join('\n');
    return result;
  } catch { return ''; }
}

export async function storeUserMessage(userId: string, username: string, content: string) {
  if (!content || content.length < 3) return;
  const key = `msg_${Date.now()}`;
  await supabase.from('bot_memories').insert({ user_id: userId, username, key, value: content.slice(0, 500) });

  const { data: allMsgs } = await supabase.from('bot_memories')
    .select('id').eq('user_id', userId).like('key', 'msg_%')
    .order('created_at', { ascending: false });

  if (allMsgs && allMsgs.length > 20) {
    const toDelete = allMsgs.slice(20).map(m => m.id);
    await supabase.from('bot_memories').delete().in('id', toDelete);
  }
}

export async function storeMemory(userId: string, username: string, key: string, value: string) {
  const { data: existing } = await supabase.from('bot_memories')
    .select('id').eq('user_id', userId).eq('key', key).limit(1);
  if (existing && existing.length > 0) {
    await supabase.from('bot_memories').update({ value, username }).eq('id', existing[0].id);
  } else {
    await supabase.from('bot_memories').insert({ user_id: userId, username, key, value });
  }
}

export async function getUserInfo(username: string): Promise<string> {
  try {
    const { data } = await supabase.from('bot_memories')
      .select('key, value, created_at, username')
      .ilike('username', username)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!data || data.length === 0) return '';
    const messages = data.filter(m => m.key.startsWith('msg_'));
    const memories = data.filter(m => !m.key.startsWith('msg_'));

    let result = `\n\nINFO ABOUT USER "${data[0].username}":\n`;
    if (memories.length > 0) result += 'Stored memories:\n' + memories.map(m => `- ${m.key}: ${m.value}`).join('\n') + '\n';
    if (messages.length > 0) result += 'Recent messages:\n' + messages.map(m => `- "${m.value}"`).join('\n');
    return result;
  } catch { return ''; }
}

export function parseMemoryStore(text: string): { key: string; value: string } | null {
  const numMatch = text.match(/remember (?:the )?(?:number|#) ?(\d+)/i);
  if (numMatch) return { key: `number_${numMatch[1]}`, value: numMatch[1] };

  const kvMatch = text.match(/remember (?:that |the )?(?:(?:my |the )?(\w[\w\s]*?) (?:is|are|=) (.+))/i);
  if (kvMatch) return { key: kvMatch[1].trim().toLowerCase(), value: kvMatch[2].trim() };

  const genericMatch = text.match(/remember (.+)/i);
  if (genericMatch) return { key: `memo_${Date.now()}`, value: genericMatch[1].trim() };

  return null;
}

// ─── Intent Detection ───

export function needsImageSearch(text: string): string | null {
  const patterns = [
    /(?:find|get|show|give|send)(?: me)? (?:a |an )?(?:image|picture|pic|photo|img) (?:of |about |for )?(.+?)(?:\?|!|$)/i,
    /(?:search|look up)(?: for)? (?:a |an )?(?:image|picture|pic|photo) (?:of |about )?(.+?)(?:\?|!|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].trim().length > 1) return m[1].trim();
  }
  return null;
}

export function needsImageGeneration(text: string): string | null {
  const patterns = [
    /(?:generate|create|make|draw|paint)(?: me)? (?:a |an )?(?:image|picture|pic|photo|art|drawing) (?:of |about |for )?(.+?)(?:\?|!|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].trim().length > 1) return m[1].trim();
  }
  return null;
}

export function needsWebSearch(text: string): string | null {
  const lowerText = text.toLowerCase();
  const searchPatterns = [
    /who (?:is|are) (?:the )?(?:youtuber |streamer |tiktoker |influencer |celebrity |person )?(.+?)(?:\?|$)/i,
    /what (?:is|are) (.+?)(?:\?|$)/i,
    /tell me about (.+?)(?:\?|$)/i,
    /do you know (?:about |who )?(.+?)(?:\?|$)/i,
    /search (?:for |up )?(.+?)(?:\?|$)/i,
    /look up (.+?)(?:\?|$)/i,
  ];
  const searchKeywords = ['youtuber', 'streamer', 'tiktoker', 'celebrity', 'influencer', 'channel', 'video', 'latest', 'trending', 'popular'];
  const hasSearchKeyword = searchKeywords.some(kw => lowerText.includes(kw));

  for (const pattern of searchPatterns) {
    const match = text.match(pattern);
    if (match?.[1] && match[1].trim().length > 2 && !['i', 'you', 'we', 'they', 'it', 'that', 'this', 'me', 'us'].includes(match[1].trim().toLowerCase())) {
      return match[1].trim();
    }
  }

  if (hasSearchKeyword && lowerText.includes('?')) {
    return text.replace(/[?!.]+$/, '').trim();
  }
  return null;
}

export function needsNewsSearch(text: string): boolean {
  const lowerText = text.toLowerCase();
  const newsPatterns = [
    /what(?:'s| is| are) the news/i,
    /tell me the news/i,
    /what(?:'s| is) happening (?:today|now|in the world)/i,
    /any news/i,
    /latest news/i,
    /headlines/i,
  ];
  return newsPatterns.some(p => p.test(lowerText));
}

export function extractUserQuery(text: string): string | null {
  const patterns = [
    /what (?:did|has|does) (?:the user )?(\w+) (?:say|said|do|done|tell|told)/i,
    /what do you know about (\w+)/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match?.[1] && !['i', 'you', 'we', 'they', 'it', 'that', 'this', 'someone'].includes(match[1].toLowerCase())) {
      return match[1];
    }
  }
  return null;
}
