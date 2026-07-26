import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
// Button style constants
const BPrimary = 1, BSecondary = 2, BSuccess = 3, BDanger = 4;
import { updateState, getState, type BotState } from '../services/botState.js';
import { handleImageGeneration, handleWebSearch, handleNews, getUserInfo, getUserMemories, needsWebSearch } from './tools.js';
import { supabase } from '../services/supabase.js';
import { getDefaultPrompt } from '../services/configLoader.js';

const OWNER_ID = '1449482449317789770';

export async function handleCommand(message: Message, rawContent: string, state: BotState) {
  const spaceIdx = rawContent.indexOf(' ');
  const cmd = (spaceIdx === -1 ? rawContent : rawContent.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? '' : rawContent.slice(spaceIdx + 1).trim();

  switch (cmd) {
    case 'seal!shutdown': {
      if (message.author.id !== OWNER_ID) {
        await (message.channel as any).send({ content: 'Arf! Only my owner can put me to sleep! 🦭🔒', reply: { messageReference: message.id } });
        return;
      }
      await updateState({ kill_switch: true, status: 'offline' });
      await (message.channel as any).send('Arf... *yawns and slides off the ice floe* This seal needs a nap... zzz... goodnight, fishies... 🌊🐟💤');
      return;
    }

    case 'seal!start':
    case 'seal!startup': {
      if (message.author.id !== OWNER_ID) {
        await (message.channel as any).send({ content: 'Arf! Only my owner can wake me up! 🦭🔒', reply: { messageReference: message.id } });
        return;
      }
      await updateState({ kill_switch: false, status: 'online', auto_reply: true });
      await (message.channel as any).send("ARF ARF ARF! *bursts out of the water doing a backflip* I'M AWAKE!! Who's got fish?! 🦭🐟🧊");
      return;
    }

    case 'seal!say': {
      if (message.author.id !== OWNER_ID) {
        await (message.channel as any).send({ content: 'Arf! Only my owner can make me say things! 🦭🔒', reply: { messageReference: message.id } });
        return;
      }
      if (!args) {
        await (message.channel as any).send({ content: 'Arf arf?? Tell me what to say! `seal!say <message>` 🦭', reply: { messageReference: message.id } });
        return;
      }
      try { await message.delete(); } catch { }
      await (message.channel as any).send(args);
      return;
    }

    case 'seal!ask': {
      if (!args) {
        await (message.channel as any).send({ content: 'Arf arf! *tilts head* Ask me something! `seal!ask <question>` 🧠🦭', reply: { messageReference: message.id } });
        return;
      }

      const CK = process.env.CLOUD_API_KEY;
      const CU = process.env.CLOUD_API_URL || 'https://fpxtucteydpmuswitebs.supabase.co/functions/v1/api';
      if (!CK) {
        await (message.channel as any).send({ content: 'Arf! My smart brain isn\'t plugged in today — ask again later! 🦭', reply: { messageReference: message.id } });
        return;
      }

      const userMemories = await getUserMemories(message.author.id);
      const webQuery = needsWebSearch(args);
      let extra = '';
      if (webQuery) {
        const res = await handleWebSearch(webQuery, CK);
        if (res) extra = `\n\nWEB SEARCH: ${res}`;
      }

      const defaultPrompt = getDefaultPrompt() || `You are a seal — a cute, playful baby seal. Answer accurately in character (1-3 sentences). Prioritize accuracy over humor.`;
      const systemPrompt = `${defaultPrompt}\n\n${userMemories}${extra}`;

      try {
        const resp = await fetch(`${CU}/chat`, {
          method: 'POST',
          headers: { 'x-api-key': CK, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: args, system_prompt: systemPrompt, use_data_feed: false }),
        });
        if (!resp.ok) {
          console.error('Cloud API error in seal!ask:', resp.status, await resp.text());
          await (message.channel as any).send({ content: 'Arf! *spits out fish* Something went wrong in my seal brain! 🦭🔧', reply: { messageReference: message.id } });
          return;
        }
        const data = await resp.json();
        if (data.error || data.success === false) {
          console.error('Cloud API returned error in seal!ask:', JSON.stringify(data));
          return;
        }
        const reply = data.answer || 'Arf! My seal brain is empty on that one! 🦭';
        await (message.channel as any).send({ content: reply, reply: { messageReference: message.id } });
      } catch {
        await (message.channel as any).send({ content: 'Arf! *spits out fish* Something went wrong in my seal brain! 🦭🔧', reply: { messageReference: message.id } });
      }
      return;
    }

    case 'seal!settings':
    case 'seal!setting': {
      const s = await getState();
      if (!s) return;

      const { count: memCount } = await supabase.from('bot_memories').select('*', { count: 'exact', head: true });
      const { data: uniqueUsers } = await supabase.from('bot_memories').select('user_id');
      const userCount = new Set(uniqueUsers?.map((u: any) => u.user_id) || []).size;

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Seal Bot Control Panel')
        .setColor(0x3B82F6)
        .addFields(
          { name: '🔌 Status', value: s.status === 'online' ? '🟢 Online' : '🔴 Offline', inline: true },
          { name: '🛡️ Kill Switch', value: s.kill_switch ? '🔴 Active' : '🟢 Inactive', inline: true },
          { name: '💬 Conv Mode', value: s.conv_mode ? '✅ On' : '❌ Off', inline: true },
          { name: '🤖 Auto-Reply', value: s.auto_reply ? '✅ On' : '❌ Off', inline: true },
          { name: '📨 Messages Sent', value: `${s.messages_sent || 0}`, inline: true },
          { name: '🎮 Status', value: s.custom_status || 'Arf arf! 🐟', inline: true },
          { name: '👥 Known Users', value: `${userCount}`, inline: true },
          { name: '🧠 Memories', value: `${memCount || 0}`, inline: true },
          { name: '📺 Channel', value: s.selected_channel ? `<#${s.selected_channel}>` : 'None', inline: true },
        )
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('seal_killswitch').setStyle(s.kill_switch ? BDanger : BSecondary).setLabel(s.kill_switch ? '🛡️ Kill Switch: ON' : '🛡️ Kill Switch: OFF'),
        new ButtonBuilder().setCustomId('seal_startstop').setStyle(s.status === 'online' && !s.kill_switch ? BDanger : BSuccess).setLabel(s.status === 'online' && !s.kill_switch ? '⏹️ Stop Bot' : '▶️ Start Bot'),
        new ButtonBuilder().setCustomId('seal_conv').setStyle(s.conv_mode ? BPrimary : BSecondary).setLabel(s.conv_mode ? '💬 Conv: ON' : '💬 Conv: OFF'),
      );

      await (message.channel as any).send({ embeds: [embed], components: [row], reply: { messageReference: message.id } });
      return;
    }

    case 'seal!conv': {
      const next = !state.conv_mode;
      await updateState({ conv_mode: next });
      await (message.channel as any).send({
        content: next
          ? "Arf! *puts on noise-canceling seashells* Conversation mode ON — only seal!ask! 🐟🎧🦭"
          : "Arf arf! *takes off seashells* Conversation mode OFF — I hear everything! 🦭👂",
        reply: { messageReference: message.id },
      });
      return;
    }

    case 'seal!killswitch': {
      const next = !state.kill_switch;
      await updateState({ kill_switch: next });
      await (message.channel as any).send({
        content: next
          ? "🔴 ARF!! *slams flipper on the big red button* KILL SWITCH ACTIVATED! Hit `seal!killswitch` again to free me! 🦭🔇"
          : "🟢 *breaks free from the ice cage* ARF ARF ARF! Kill switch OFF! THIS SEAL IS UNLEASHED! 🦭🐟🌊",
        reply: { messageReference: message.id },
      });
      return;
    }

    case 'seal!help': {
      const help = [
        '**🦭 Arf arf! Here\'s everything this seal can do!**',
        '',
        '🧠 `seal!ask <question>` — Pick my big seal brain!',
        '🎨 `seal!image <prompt>` — I\'ll paint you a picture!',
        '🌍 `seal!visit <url>` — I\'ll swim to a website!',
        '🔍 `seal!search <query>` — I\'ll dive into the web!',
        '📰 `seal!news` — Fresh headlines!',
        '🗣️ `seal!say <message>` — I\'ll bark your words!',
        '🔎 `seal!whois <username>` — Sniff out what I know!',
        '🏓 `seal!ping` — Poke me!',
        '🎲 `seal!roll [max]` — Roll fish bone dice!',
        '🎱 `seal!8ball <question>` — The sea-ball knows all...',
        '😂 `seal!joke` — Seal comedy!',
        '🦭 `seal!fact` — Real seal facts!',
        '🔢 `seal!count [#channel]` — Start a counting game!',
        '🎧 `seal!conv` — Toggle quiet mode!',
        '🛡️ `seal!killswitch` — Emergency flipper slam!',
        '⚙️ `seal!settings` — Peek at my control panel!',
        '▶️ `seal!start` — Splash me awake!',
        '💤 `seal!shutdown` — Tuck me in for a nap',
        '',
        '💡 **Pro tip:** Talk naturally! Try "hey seal what\'s the news?" 🦭🐟',
      ].join('\n');
      await (message.channel as any).send(help);
      return;
    }

    case 'seal!ping': {
      const latency = Date.now() - message.createdTimestamp;
      await (message.channel as any).send(`Arf arf! Pong! 🦭🏓 *waddles over* Latency: ${latency}ms`);
      return;
    }

    case 'seal!roll': {
      const max = Math.min(parseInt(args) || 100, 1000000);
      const roll = Math.floor(Math.random() * max) + 1;
      await (message.channel as any).send(`🎲 Arf! *balances a dice on nose* You rolled **${roll}** (1-${max})! 🦭`);
      return;
    }

    case 'seal!8ball': {
      if (!args) {
        await (message.channel as any).send({ content: 'Arf! Ask the magic sea-ball a question! 🎱', reply: { messageReference: message.id } });
        return;
      }
      const responses = ['Yes, arf!', 'No, arf arf!', 'Ask again, I was chasing fish!', 'Definitely! 🦭', 'The sea says no... 🌊', 'My flippers say yes!', 'I\'d bet my fish on it!', 'Not in a million belly slides!'];
      await (message.channel as any).send(`🎱 Arf! *magic sea-ball glows* **${responses[Math.floor(Math.random() * responses.length)]}** 🦭`);
      return;
    }

    case 'seal!joke': {
      const jokes = [
        'Why did the seal cross the ocean? To get to the other tide! 🦭🌊',
        'What do you call a seal who\'s a great singer? A sea-llllll-a! 🎵',
        'Why don\'t seals play cards? Too many cheetahs on the ice! 🐆',
        'What\'s a seal\'s favorite game? Whack-a-fish! 🐟',
      ];
      await (message.channel as any).send(jokes[Math.floor(Math.random() * jokes.length)]);
      return;
    }

    case 'seal!fact': {
      const facts = [
        'Seals can hold their breath for up to 2 hours! 🫧',
        'Baby seals are called pups! 🦭',
        'Seals sleep underwater with half their brain awake! 😴',
        'A group of seals is called a colony! 🏠',
        'Seals can dive deeper than 1,500 meters! 🌊',
      ];
      await (message.channel as any).send(`🦭 **Seal Fact:** ${facts[Math.floor(Math.random() * facts.length)]}`);
      return;
    }

    case 'seal!news': {
      const news = await handleNews(process.env.CLOUD_API_KEY!);
      await (message.channel as any).send(news ? `📰 **Latest Headlines:**\n${news}` : 'Arf! Couldn\'t find any news right now! 🦭');
      return;
    }

    case 'seal!image': {
      if (!args) {
        await (message.channel as any).send({ content: 'Arf! What should I paint? `seal!image <prompt>` 🎨', reply: { messageReference: message.id } });
        return;
      }
      const imgUrl = await handleImageGeneration(args);
      if (imgUrl) {
        await (message.channel as any).send({ content: `Arf! I painted *${args}* with my flippers! 🎨🦭`, files: [imgUrl] });
      } else {
        await (message.channel as any).send({ content: 'Arf! My paintbrush broke! Try again later! 🦭', reply: { messageReference: message.id } });
      }
      return;
    }

    case 'seal!whois': {
      if (!args) {
        await (message.channel as any).send({ content: 'Arf! Who should I look up? `seal!whois <username>` 🔎', reply: { messageReference: message.id } });
        return;
      }
      const info = await getUserInfo(args);
      await (message.channel as any).send(info || `Arf! I don't know anything about **${args}** yet! 🦭`);
      return;
    }

    case 'seal!forget': {
      await supabase.from('bot_memories').delete().eq('user_id', message.author.id);
      await (message.channel as any).send({ content: 'Arf! *wipes brain clean like a fresh ice floe* I\'ve forgotten everything you told me! 🧹🦭', reply: { messageReference: message.id } });
      return;
    }

    case 'seal!idea': {
      const ideas = [
        'Build a Discord bot that\'s a talking seal! Oh wait... 🦭',
        'Create a game where you balance fish on your nose! 🐟',
        'Make an ocean-cleaning robot! 🤖🌊',
        'Write a song about plankton! 🎵',
      ];
      await (message.channel as any).send(`💡 **Project Idea:** ${ideas[Math.floor(Math.random() * ideas.length)]}`);
      return;
    }

    case 'seal!count': {
      const channelId = args.replace(/[<#>]/g, '').trim();
      if (!channelId) {
        const current = state.counting_channel;
        if (current) {
          await (message.channel as any).send(`🔢 Counting is active in <#${current}>. Current number: **${state.counting_number || 0}**. Use \`seal!count stop\` to stop! 🦭`);
        } else {
          await (message.channel as any).send('Arf! Tag a channel to start counting! `seal!count #channel` 🦭');
        }
        return;
      }
      if (channelId === 'stop') {
        await updateState({ counting_channel: null, counting_number: null, counting_last_user: null });
        await (message.channel as any).send('🔢 Counting game stopped! *puts the number dice away* 🦭');
        return;
      }
      await updateState({ counting_channel: channelId, counting_number: 0, counting_last_user: null });
      await (message.channel as any).send(`🔢 **COUNTING GAME STARTED** in <#${channelId}>! Say **1** to begin! Count up together — don't mess up! 🦭🧮`);
      return;
    }

    case 'seal!setchannel': {
      if (!message.guild?.id) {
        await (message.channel as any).send({ content: 'Arf! This command only works in a server, not DMs! 🦭', reply: { messageReference: message.id } });
        return;
      }
      await updateState({ selected_guild: message.guild.id, selected_channel: '' });
      await (message.channel as any).send({
        content: `Arf arf! *nods firmly* I'll only hang out in **${message.guild.name}** from now on! The web panel channel override is cleared — I'll reply in ANY channel here. Use \`seal!unsetchannel\` to let me roam free again! 🦭🌊`,
        reply: { messageReference: message.id },
      });
      return;
    }

    case 'seal!unsetchannel': {
      await updateState({ selected_guild: '', selected_channel: '' });
      await (message.channel as any).send({
        content: 'Arf! *flops back into the ocean* I\'m free to swim in any server again! 🦭🌊',
        reply: { messageReference: message.id },
      });
      return;
    }

    default: {
      // Unknown command — try AI
      await (message.channel as any).send({ content: `Arf! I don't know the command \`${cmd}\`. Try \`seal!help\`! 🦭`, reply: { messageReference: message.id } });
    }
  }
}
