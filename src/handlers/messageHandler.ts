import { Message } from 'discord.js';
import { client } from '../services/discord.js';
import { updateState, type BotState } from '../services/botState.js';
import { supabase } from '../services/supabase.js';
import { getDefaultPrompt } from '../services/configLoader.js';
import {
  handleImageSearch, handleImageGeneration, handleWebSearch, handleNews,
  getUserMemories, storeMemory, storeUserMessage, getUserInfo, parseMemoryStore,
  needsNewsSearch, needsWebSearch, needsImageSearch, needsImageGeneration, extractUserQuery,
} from './tools.js';

const CLOUD_API_KEY = process.env.CLOUD_API_KEY;
const CLOUD_API_URL = process.env.CLOUD_API_URL || 'https://fpxtucteydpmuswitebs.supabase.co/functions/v1/api';

async function acquireReplyLock(messageId: string, channelId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('bot_reply_log')
      .upsert({ message_id: messageId, channel_id: channelId }, { onConflict: 'message_id', ignoreDuplicates: true })
      .select('message_id');
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch { return false; }
}

export async function handleMessage(message: Message, state: BotState) {
  const rawContent = message.content.trim();
  const hasAttachments = message.attachments.some(a => a.contentType?.startsWith('image/'));

  if (!rawContent && !hasAttachments) return;
  if (state.status !== 'online') return;
  if (state.selected_guild && message.guild?.id && message.guild.id !== state.selected_guild) return;

  const locked = await acquireReplyLock(message.id, message.channelId);
  if (!locked) return;

  // ─── Counting Game ───
  if (!rawContent.startsWith('seal!') && state.counting_channel && message.channelId === state.counting_channel) {
    const num = parseInt(rawContent);
    const expectedNext = (state.counting_number || 0) + 1;

    if (!isNaN(num) && num > 0) {
      if (num === expectedNext) {
        if (message.author.id === state.counting_last_user) {
          await (message.channel as any).send({
            content: `❌ ARF! *blows whistle* **${message.author.displayName}**, you can't count twice in a row! Someone else needs to say **${expectedNext}**! 🦭🚫`,
            reply: { messageReference: message.id },
          });
          return;
        }

        await updateState({ counting_number: num, counting_last_user: message.author.id });
        await message.react('✅');

        const milestones = [10, 25, 50, 69, 100, 200, 420, 500, 1000];
        if (milestones.includes(num)) {
          const celebrations: Record<number, string> = {
            10: '🎉 Double digits! This seal is impressed! *claps flippers* 🦭',
            25: '🎉 Quarter century of counting! You humans are smarter than fish! 🐟🦭',
            50: '🎉 FIFTY!! *does a barrel roll on the ice* HALFWAY TO 100! 🦭🌟',
            69: '🎉 Nice. *wiggles eyebrows with flippers* 🦭😏',
            100: '🎉🎉🎉 ONE HUNDRED!! *shoots confetti out of blowhole* INCREDIBLE! 🦭🏆🐟',
            200: '🎉 TWO HUNDRED! *faints on ice from excitement* 🦭🤯',
            420: '🎉 Arf arf! *puts on tiny sunglasses* Groovy number, dude! 🦭😎',
            500: '🎉 FIVE HUNDRED! *builds an ice trophy* You all deserve fish! 🦭🏆🐟🐟🐟',
            1000: '🎉🎉🎉 ONE THOUSAND!!! *explodes into confetti* THIS IS THE GREATEST ACHIEVEMENT IN SEAL HISTORY! 🦭👑🏆🐟🐟🐟🐟🐟',
          };
          await (message.channel as any).send(celebrations[num] || `🎉 Milestone: **${num}**! ARF ARF! 🦭`);
        }
        return;
      } else {
        await message.react('❌');
        await (message.channel as any).send({
          content: `💥 ARF ARF!! **${message.author.displayName}** said **${num}** but it should have been **${expectedNext}**! *slaps flipper on forehead* The count resets... Starting over!\n\n**1**\n\nNext person, say **2**! 🦭😤`,
          reply: { messageReference: message.id },
        });
        await updateState({ counting_number: 1, counting_last_user: client.user?.id || 'seal_bot' });
        return;
      }
    }
  }

  // ─── Command Handling ───
  if (rawContent.startsWith('seal!')) {
    const { handleCommand } = await import('./commandHandler.js');
    await handleCommand(message, rawContent, state);
    return;
  }

  // ─── Natural Language / AI Auto-reply (via Cloud API) ───
  if (state.selected_channel && message.channelId !== state.selected_channel) return;
  if (!state.auto_reply || state.kill_switch || !CLOUD_API_KEY) return;

  await storeUserMessage(message.author.id, message.author.username, rawContent);

  const authorName = message.author.displayName || message.author.username;
  const userMemories = await getUserMemories(message.author.id);

  let extraContext = '';
  const newsCheck = needsNewsSearch(rawContent);
  if (newsCheck) {
    extraContext = await handleNews(CLOUD_API_KEY);
  }

  const webQuery = needsWebSearch(rawContent);
  if (webQuery) {
    const result = await handleWebSearch(webQuery, CLOUD_API_KEY);
    if (result) extraContext += `\n\nWEB SEARCH RESULT for "${webQuery}":\n${result}`;
  }

  const memoryStore = parseMemoryStore(rawContent);
  if (memoryStore) {
    await storeMemory(message.author.id, message.author.username, memoryStore.key, memoryStore.value);
    await (message.channel as any).send({
      content: `Arf arf! I've stored that in my seal brain! *taps tiny head* 🦭🧠\n> **${memoryStore.key}**: ${memoryStore.value}`,
      reply: { messageReference: message.id },
    });
    return;
  }

  const imageQuery = needsImageSearch(rawContent);
  if (imageQuery) {
    const imgUrl = await handleImageSearch(imageQuery);
    if (imgUrl) {
      await (message.channel as any).send({
        content: `Arf arf! I found a picture of **${imageQuery}**! 🦭🐟`,
        files: [imgUrl],
        reply: { messageReference: message.id },
      });
      return;
    }
  }

  const genQuery = needsImageGeneration(rawContent);
  if (genQuery) {
    const imgUrl = await handleImageGeneration(genQuery);
    if (imgUrl) {
      await (message.channel as any).send({
        content: `Arf! I used my seal flippers to paint *${genQuery}* 🦭🎨`,
        files: [imgUrl],
        reply: { messageReference: message.id },
      });
      return;
    }
  }

  const userQuery = extractUserQuery(rawContent);
  if (userQuery) {
    const info = await getUserInfo(userQuery);
    if (info) extraContext += info;
  }

  const defaultPrompt = getDefaultPrompt() || `You are a cute seal. Reply in character (1-3 sentences). Respond in seal character:`;
  const systemPrompt = state.personality || `${defaultPrompt}\n\n${extraContext}\n\n${userMemories}`;

  (message.channel as any).sendTyping();

  try {
    const res = await fetch(`${CLOUD_API_URL}/chat`, {
      method: 'POST',
      headers: { 'x-api-key': CLOUD_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `${authorName}: ${rawContent}`,
        system_prompt: systemPrompt,
        use_data_feed: false,
      }),
    });

    if (!res.ok) {
      console.error('Cloud API error:', res.status, await res.text());
      return;
    }

    const data = await res.json();
    const reply = data.answer || 'Arf! *tilts head* I have no idea what to say about that! 🦭';

    await (message.channel as any).send({ content: reply, reply: { messageReference: message.id } });
    await updateState({ messages_sent: (state.messages_sent || 0) + 1 });
  } catch (err) {
    console.error('AI reply error:', err);
  }
}
