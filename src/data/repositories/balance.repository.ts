import { supabase } from '../supabase';
import type { BalanceResponse } from '../../types';

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
    gastos?.forEach((g: any) => {
      const catName = g.categories?.name || 'otros';
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
  }
};
