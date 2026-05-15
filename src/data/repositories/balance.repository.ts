import { supabase } from '../supabase';
import type { BalanceResponse } from '../../types';

import { getBogotaDate, getBogotaDateString } from '../../utils/date.utils';

export const balanceRepository = {
  // Obtener balance mensual
  async getMonthlyBalance(userId: number, month: number, year: number): Promise<BalanceResponse> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    // Obtener ingresos
    const { data: ingresos } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'ingreso')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    // Obtener gastos
    const { data: gastos } = await supabase
      .from('transactions')
      .select('amount, category_id, categories(name)')
      .eq('user_id', userId)
      .eq('type', 'gasto')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    const totalIngresos = ingresos?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const totalGastos = gastos?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    // Breakdown por categoría
    const categoryMap = new Map<string, { total: number; cantidad: number }>();
    gastos?.forEach((g: { amount: number; categories: { name: string }[] | null }) => {
      const catName = g.categories?.[0]?.name || 'otros';
      const current = categoryMap.get(catName) || { total: 0, cantidad: 0 };
      categoryMap.set(catName, {
        total: current.total + Number(g.amount),
        cantidad: current.cantidad + 1,
      });
    });

    const porCategoria = Array.from(categoryMap.entries()).map(([categoria, data]) => ({
      categoria,
      total: data.total,
      porcentaje: totalGastos > 0 ? (data.total / totalGastos) * 100 : 0,
    }));

    return {
      mes: month,
      año: year,
      ingresos: totalIngresos,
      gastos: totalGastos,
      balance: totalIngresos - totalGastos,
      porCategoria,
    };
  },

  // Obtener balance del día (hoy en Bogotá)
  async getDailyBalance(userId: number): Promise<{ ingresos: number; gastos: number; balance: number }> {
    const dateStr = getBogotaDateString();

    const { data: ingresos } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'ingreso')
      .eq('transaction_date', dateStr);

    const { data: gastos } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'gasto')
      .eq('transaction_date', dateStr);

    const totalIngresos = ingresos?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const totalGastos = gastos?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    return { ingresos: totalIngresos, gastos: totalGastos, balance: totalIngresos - totalGastos };
  },

  // Obtener balance de la semana (lunes a domingo en Bogotá)
  async getWeeklyBalance(userId: number): Promise<{ ingresos: number; gastos: number; balance: number }> {
    const today = getBogotaDate();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startStr = monday.toISOString().split('T')[0];
    const endStr = sunday.toISOString().split('T')[0];

    const { data: ingresos } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'ingreso')
      .gte('transaction_date', startStr)
      .lte('transaction_date', endStr);

    const { data: gastos } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'gasto')
      .gte('transaction_date', startStr)
      .lte('transaction_date', endStr);

    const totalIngresos = ingresos?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const totalGastos = gastos?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

    return { ingresos: totalIngresos, gastos: totalGastos, balance: totalIngresos - totalGastos };
  },
};
