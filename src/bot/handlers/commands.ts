import { Bot } from 'grammy';
import { balanceRepository } from '../../data/repositories/balance.repository';
import { generateMonthlyReport, formatReportForTelegram } from '../../services/reporter';
import { mainMenuKeyboard } from '../keyboards';

export function registerCommands(bot: Bot) {
  // Comando /help
  bot.command('help', async (ctx: any) => {
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
  bot.command('balance', async (ctx: any) => {
    const user = ctx.config?.user;
    if (!user) {
      await ctx.reply('Error: usuario no identificado');
      return;
    }
    
    const now = new Date();
    
    try {
      const balance = await balanceRepository.getMonthlyBalance(
        user.telegram_id,
        now.getMonth() + 1,
        now.getFullYear()
      );
      
      const formatCurrency = (n: number) => 
        n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
      
      let message = `📊 *Balance ${getMonthName(balance.mes)} ${balance.año}*\n\n`;
      message += `💰 Ingresos: ${formatCurrency(balance.ingresos)}\n`;
      message += `💸 Gastos: ${formatCurrency(balance.gastos)}\n`;
      message += `📈 Balance: *${formatCurrency(balance.balance)}*\n\n`;
      
      if (balance.porCategoria.length > 0) {
        message += '*Gastos por categoría:*\n';
        balance.porCategoria.forEach((c: any) => {
          message += `• ${c.categoria}: ${formatCurrency(c.total)} (${c.porcentaje.toFixed(1)}%)\n`;
        });
      }
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Balance error:', error);
      await ctx.reply('Error al obtener el balance. Intenta de nuevo.');
    }
  });
  
  // Comando /reporte
  bot.command('reporte', async (ctx: any) => {
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
  bot.command('menu', async (ctx: any) => {
    await ctx.reply('Selecciona una opción:', {
      reply_markup: mainMenuKeyboard(),
    });
  });
}

function getMonthName(month: number): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1] || 'Unknown';
}
