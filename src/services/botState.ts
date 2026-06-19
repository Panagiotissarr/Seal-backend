import { supabase } from './supabase.js';

export interface BotState {
  id: string;
  status: string;
  admin_pin: string;
  auto_reply: boolean;
  conv_mode: boolean;
  kill_switch: boolean;
  stay_online: boolean;
  personality: string;
  custom_status: string | null;
  selected_guild: string;
  selected_channel: string;
  bot_id: string | null;
  bot_username: string | null;
  messages_sent: number;
  counting_channel: string | null;
  counting_number: number | null;
  counting_last_user: string | null;
  last_worker_message_id: string | null;
  updated_at: string;
}

const STATE_ID = 'singleton';

export async function getState(): Promise<BotState | null> {
  const { data } = await supabase
    .from('bot_state')
    .select('*')
    .eq('id', STATE_ID)
    .single();
  return data as BotState | null;
}

export async function updateState(updates: Partial<BotState>): Promise<void> {
  await supabase
    .from('bot_state')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', STATE_ID);
}

export async function subscribeToState(callback: (state: BotState) => void): Promise<() => void> {
  const channel = supabase
    .channel('bot_state_changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'bot_state', filter: `id=eq.${STATE_ID}` },
      (payload) => callback(payload.new as BotState),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
