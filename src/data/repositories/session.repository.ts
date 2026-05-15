import { supabase } from '../supabase';

export interface SessionData {
  state: string;
  data: Record<string, unknown>;
}

export const sessionRepository = {
  async get(telegramId: number): Promise<SessionData | null> {
    const { data, error } = await supabase
      .from('conversation_sessions')
      .select('state, data')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (error) throw error;
    return data as SessionData | null;
  },

  async upsert(telegramId: number, session: SessionData): Promise<void> {
    const { error } = await supabase
      .from('conversation_sessions')
      .upsert({
        telegram_id: telegramId,
        state: session.state,
        data: session.data,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
  },

  async delete(telegramId: number): Promise<void> {
    const { error } = await supabase
      .from('conversation_sessions')
      .delete()
      .eq('telegram_id', telegramId);

    if (error) throw error;
  },

  async cleanExpired(expireMinutes: number = 30): Promise<void> {
    const cutoff = new Date(Date.now() - expireMinutes * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('conversation_sessions')
      .delete()
      .lt('updated_at', cutoff);

    if (error) throw error;
  },
};
