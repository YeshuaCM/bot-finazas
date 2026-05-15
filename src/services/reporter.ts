import { balanceRepository } from '../data/repositories/balance.repository';
import { transactionRepository } from '../data/repositories/transaction.repository';
import { categoryRepository } from '../data/repositories/category.repository';
import type { BalanceResponse, Transaction } from '../types';

export interface MonthlyReport {
  mes: number;
  año: number;
  totalIngresos: number;
  totalGastos: number;
  balance: number;
  topGastos: Array<{
    categoria: string;
    total: number;
    cantidad: number;
  }>;
  comparacionMesAnterior: {
    ingresos: number;
    gastos: number;
    cambioIngresos: number;
    cambioGastos: number;
  };
}

export async function generateMonthlyReport(
  userId: number,
  month: number,
  year: number
): Promise<MonthlyReport> {
  // Balance actual
  const balance = await balanceRepository.getMonthlyBalance(userId, month, year);
  
  // Transacciones del mes
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  
  const transactions = await transactionRepository.findByUserId(userId, {
    dateFrom: startDate,
    dateTo: endDate,
  });
  
  // Top gastos por categoría
  const gastosPorCategoria = new Map<string, { total: number; cantidad: number }>();
  
  transactions
    .filter(t => t.type === 'gasto')
    .forEach(t => {
      const key = t.description || 'otros';
      const existing = gastosPorCategoria.get(key) || { total: 0, cantidad: 0 };
      gastosPorCategoria.set(key, {
        total: existing.total + Number(t.amount),
        cantidad: existing.cantidad + 1,
      });
    });
  
  const topGastos = Array.from(gastosPorCategoria.entries())
    .map(([categoria, data]) => ({
      categoria,
      total: data.total,
      cantidad: data.cantidad,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  
  // Comparación con mes anterior
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevBalance = await balanceRepository.getMonthlyBalance(userId, prevMonth, prevYear);
  
  return {
    mes: month,
    año: year,
    totalIngresos: balance.ingresos,
    totalGastos: balance.gastos,
    balance: balance.balance,
    topGastos,
    comparacionMesAnterior: {
      ingresos: prevBalance.ingresos,
      gastos: prevBalance.gastos,
      cambioIngresos: prevBalance.ingresos > 0 
        ? ((balance.ingresos - prevBalance.ingresos) / prevBalance.ingresos) * 100 
        : 0,
      cambioGastos: prevBalance.gastos > 0 
        ? ((balance.gastos - prevBalance.gastos) / prevBalance.gastos) * 100 
        : 0,
    },
  };
}

export function formatReportForTelegram(report: MonthlyReport): string {
  const mesNombre = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ][report.mes - 1];
  
  const formatCurrency = (amount: number) => 
    amount.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
  
  let message = `📊 *Reporte ${mesNombre} ${report.año}*\n\n`;
  
  message += `💰 *Ingresos:* ${formatCurrency(report.totalIngresos)}\n`;
  message += `💸 *Gastos:* ${formatCurrency(report.totalGastos)}\n`;
  message += `📈 *Balance:* ${formatCurrency(report.balance)}\n\n`;
  
  if (report.topGastos.length > 0) {
    message += `🏆 *Top Gastos:*\n`;
    report.topGastos.forEach((g, i) => {
      message += `${i + 1}. ${g.categoria}: ${formatCurrency(g.total)} (${g.cantidad} transacciones)\n`;
    });
  }
  
  if (report.comparacionMesAnterior) {
    const { cambioIngresos, cambioGastos } = report.comparacionMesAnterior;
    message += `\n📉 *vs Mes Anterior:*\n`;
    message += `Ingresos: ${cambioIngresos >= 0 ? '↑' : '↓'} ${Math.abs(cambioIngresos).toFixed(1)}%\n`;
    message += `Gastos: ${cambioGastos >= 0 ? '↑' : '↓'} ${Math.abs(cambioGastos).toFixed(1)}%`;
  }
  
  return message;
}

export async function getCategoryReport(
  userId: number,
  categoryName: string,
  month?: number,
  year?: number,
  type?: 'gasto' | 'ingreso'
): Promise<{ total: number; cantidad: number; transactions: Transaction[] }> {
  const now = new Date();
  const targetMonth = month || now.getMonth() + 1;
  const targetYear = year || now.getFullYear();
  
  const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
  const endDate = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];
  
  // Buscar categoría por nombre para obtener su ID (probar el type dado o ambos)
  const typesToTry: ('gasto' | 'ingreso')[] = type ? [type] : ['gasto', 'ingreso'];
  let category = null;
  for (const t of typesToTry) {
    category = await categoryRepository.findByName(categoryName, t);
    if (category) break;
  }
  
  if (!category) {
    return { total: 0, cantidad: 0, transactions: [] };
  }
  
  // Filtrar por category_id (correcto, no por descripción como antes)
  const transactions = await transactionRepository.findByUserId(userId, {
    category_id: category.id,
    dateFrom: startDate,
    dateTo: endDate,
  });
  
  const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
  
  return {
    total,
    cantidad: transactions.length,
    transactions,
  };
}
