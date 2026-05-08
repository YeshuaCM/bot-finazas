import { supabase } from '../supabase';
import type { Transaction } from '../../types';
import { getBogotaDateString } from '../../utils/date.utils';

export const transactionRepository = {
  // Crear transacción
  async create(data: {
    user_id: number;
    type: 'gasto' | 'ingreso';
    amount: number;
    category_id?: string;
    description?: string;
    transaction_date?: string;
  }): Promise<Transaction> {
    const { data: created, error } = await supabase
      .from('transactions')
      .insert({
        user_id: data.user_id,
        type: data.type,
        amount: data.amount,
        category_id: data.category_id,
        description: data.description,
        transaction_date: data.transaction_date || getBogotaDateString(),
      })
      .select()
      .single();
    
    if (error) throw error;
    return created;
  },

  // Buscar transacciones por usuario
  async findByUserId(userId: number, filters?: {
    type?: 'gasto' | 'ingreso';
    category_id?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]> {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false });

    if (filters?.type) query = query.eq('type', filters.type);
    if (filters?.category_id) query = query.eq('category_id', filters.category_id);
    if (filters?.dateFrom) query = query.gte('transaction_date', filters.dateFrom);
    if (filters?.dateTo) query = query.lte('transaction_date', filters.dateTo);
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Buscar por ID
  async findById(id: string): Promise<Transaction | null> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  // Actualizar transacción
  async update(id: string, updates: Partial<Transaction>): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Eliminar transacción
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};
