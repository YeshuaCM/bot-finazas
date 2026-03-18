import { supabase } from '../supabase';
import type { Category } from '../../types';

export const categoryRepository = {
  // Crear categoría
  async create(data: {
    user_id?: number;
    name: string;
    type: 'gasto' | 'ingreso';
    emoji?: string;
  }): Promise<Category> {
    const { data: created, error } = await supabase
      .from('categories')
      .insert({
        user_id: data.user_id,
        name: data.name,
        type: data.type,
        emoji: data.emoji,
        is_default: !data.user_id,
      })
      .select()
      .single();
    
    if (error) throw error;
    return created;
  },

  // Buscar categorías por usuario
  async findByUserId(userId: number, type?: 'gasto' | 'ingreso'): Promise<Category[]> {
    let query = supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${userId},is_default.eq.true`);

    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Buscar por ID
  async findById(id: string): Promise<Category | null> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  // Buscar por nombre
  async findByName(name: string, type: 'gasto' | 'ingreso'): Promise<Category | null> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .ilike('name', name)
      .eq('type', type)
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  // Actualizar categoría
  async update(id: string, updates: Partial<Category>): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Eliminar categoría
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};
