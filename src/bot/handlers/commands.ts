import { Bot, InputFile } from 'grammy';
import type { BotContext } from '../../types';
import { balanceRepository } from '../../data/repositories/balance.repository';
import { transactionRepository } from '../../data/repositories/transaction.repository';
import { generateMonthlyReport, formatReportForTelegram } from '../../services/reporter';
import { mainMenuKeyboard } from '../keyboards';

const MAX_LIST_TRANSACTIONS = 10;
const MAX_EXPORT_TRANSACTIONS = 10000;

export function registerCommands(bot: Bot): void {
  // Comando /help
  bot.command('help', async (ctx: BotContext) => {
    await ctx.reply(
      '📖 *Ayuda - Comandos disponibles:*\n\n'
      + '/start - Iniciar el bot\n'
      + '/help - Mostrar esta ayuda\n'
      + '/balance - Ver balance actual\n'
      + '/reporte - Ver reporte mensual\n\n'
      + '*También puedes escribir directamente:*\n'
      + '• "Gasté 25000 en comida"\n'
      + '• "Me pagaron 500000"\n'
      + '• "¿Cuánto gasté este mes?"',
      { parse_mode: 'Markdown' }
    );
  });
  
  // Comando /balance
  bot.command('balance', async (ctx: BotContext) => {
    const user = ctx.config?.user;
    if (!user) {
      await ctx.reply('Error: usuario no identificado');
      return;
    }
    
    const now = new Date();
    
    try {
      const [daily, weekly, monthly] = await Promise.all([
        balanceRepository.getDailyBalance(user.telegram_id),
        balanceRepository.getWeeklyBalance(user.telegram_id),
        balanceRepository.getMonthlyBalance(
          user.telegram_id,
          now.getMonth() + 1,
          now.getFullYear()
        ),
      ]);
      
      const fmt = (n: number) => 
        `$${n.toLocaleString('es-CL')}`;
      const fmtSigned = (n: number) =>
        n >= 0 ? `+${fmt(n)}` : fmt(n);
      
      let message = `📊 *Balance General*\n\n`;
      
      // Hoy
      message += `*Hoy* — ${fmt(daily.ingresos)} ingresos / ${fmt(daily.gastos)} gastos\n`;
      message += `Balance: ${fmtSigned(daily.balance)}\n\n`;
      
      // Semana
      message += `*Esta semana* — ${fmt(weekly.ingresos)} ingresos / ${fmt(weekly.gastos)} gastos\n`;
      message += `Balance: ${fmtSigned(weekly.balance)}\n\n`;
      
      // Mes
      message += `*${getMonthName(monthly.mes)} ${monthly.año}* — ${fmt(monthly.ingresos)} ingresos / ${fmt(monthly.gastos)} gastos\n`;
      message += `Balance: *${fmtSigned(monthly.balance)}*\n\n`;
      
      if (monthly.porCategoria.length > 0) {
        message += '*Gastos por categoría (mes):*\n';
        monthly.porCategoria.forEach((c) => {
          message += `• ${c.categoria}: ${fmt(c.total)} (${c.porcentaje.toFixed(1)}%)\n`;
        });
      }
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Balance error:', error);
      await ctx.reply('Error al obtener el balance. Intenta de nuevo.');
    }
  });
  
  // Comando /reporte
  bot.command('reporte', async (ctx: BotContext) => {
    const user = ctx.config?.user;
    if (!user) {
      await ctx.reply('Error: usuario no identificado');
      return;
    }
    
    const now = new Date();
    
    try {
      const report = await generateMonthlyReport(
        user.telegram_id,
        now.getMonth() + 1,
        now.getFullYear()
      );
      
      const message = formatReportForTelegram(report);
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Reporte error:', error);
      await ctx.reply('Error al generar el reporte. Intenta de nuevo.');
    }
  });
  
  // Comando /menu
  bot.command('menu', async (ctx: BotContext) => {
    await ctx.reply('Selecciona una opción:', {
      reply_markup: mainMenuKeyboard(),
    });
  });

  // Comando /list - últimas transacciones
  bot.command('list', async (ctx: BotContext) => {
    const user = ctx.config?.user;
    if (!user) {
      await ctx.reply('Error: usuario no identificado');
      return;
    }

    try {
      const transactions = await transactionRepository.findByUserId(user.telegram_id, { limit: MAX_LIST_TRANSACTIONS });
      if (transactions.length === 0) {
        await ctx.reply('No hay transacciones registradas.');
        return;
      }

      for (const t of transactions) {
        const emoji = t.type === 'gasto' ? '💸' : '💵';
        const fecha = t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('es-CL') : 'sin fecha';
        await ctx.reply(
          `${emoji} *${t.type === 'gasto' ? 'Gasto' : 'Ingreso'}* - ${fecha}\n`
          + `💰 Monto: $${Number(t.amount).toLocaleString('es-CL')}\n`
          + `${t.description ? `📝 ${t.description}\n` : ''}`
          + `${t.category_id ? `🏷️ ID: ${t.category_id}\n` : ''}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✏️ Editar', callback_data: `edit_${t.id}` },
                  { text: '🗑️ Eliminar', callback_data: `delete_${t.id}` },
                ],
              ],
            },
          }
        );
      }
    } catch (error) {
      console.error('List error:', error);
      await ctx.reply('Error al listar transacciones.');
    }
  });

  // Comando /export - exportar a CSV
  bot.command('export', async (ctx: BotContext) => {
    const user = ctx.config?.user;
    if (!user) {
      await ctx.reply('Error: usuario no identificado');
      return;
    }

    try {
      const transactions = await transactionRepository.findByUserId(user.telegram_id, { limit: MAX_EXPORT_TRANSACTIONS });
      if (transactions.length === 0) {
        await ctx.reply('No hay transacciones para exportar.');
        return;
      }

      const headers = 'fecha,tipo,monto,categoria_id,descripcion\n';
      const rows = transactions.map(t =>
        `${t.transaction_date || ''},${t.type},${t.amount},${t.category_id || ''},"${(t.description || '').replace(/"/g, '""')}"`
      ).join('\n');

      const csv = `\uFEFF${headers}${rows}`; // BOM para Excel
      const buffer = Buffer.from(csv, 'utf-8');

      await ctx.replyWithDocument(
        new InputFile(buffer, `transacciones-${new Date().toISOString().split('T')[0]}.csv`),
        { caption: '📊 Exportación de transacciones' }
      );
    } catch (error) {
      console.error('Export error:', error);
      await ctx.reply('Error al exportar transacciones.');
    }
  });
}

function getMonthName(month: number): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1] || 'Unknown';
}
