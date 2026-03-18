import { supabase } from '../supabase';
import type { Profile } from '../../types';

export const userRepository = {
  // Crear o obtener usuario
  async createOrGet(telegramId: number, data: {
    username?: string;
    first_name: string;
    last_name?: string;
  }): Promise<Profile> {
    // Buscar primero
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    
    if (existing) return existing;
    
    // Crear si no existe
    const { data: created, error } = await supabase
      .from('profiles')
      .insert({
        telegram_id: telegramId,
        username: data.username,
        first_name: data.first_name,
        last_name: data.last_name,
      })
      .select()
      .single();
    
    if (error) throw error;
    return created;
  },

  // Buscar por telegram ID
  async findByTelegramId(telegramId: number): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  // Actualizar perfil
  async update(telegramId: number, updates: Partial<Profile>): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('telegram_id', telegramId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Eliminar perfil
  async delete(telegramId: number): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('telegram_id', telegramId);
    
    if (error) throw error;
  }
};
