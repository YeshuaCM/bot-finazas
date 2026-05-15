import { Bot, webhookCallback } from 'grammy';
import { config } from '../config';
import type { BotContext } from '../types';
import { registerCommands } from './handlers/commands';
import { registerConversations } from './handlers/conversations';
import { authMiddleware } from './middleware';

const bot = new Bot(config.telegram.botToken);

// Middleware de autenticación
bot.use(authMiddleware);

// Registrar handlers
registerCommands(bot);
registerConversations(bot);

// Manejo de errores
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Comando /start
bot.command('start', async (ctx: BotContext) => {
  const user = ctx.config?.user;
  
  if (user) {
    // Usuario ya registrado - mensaje de bienvenida de vuelta
    await ctx.reply(
      '¡Bienvenido de vuelta! 👋\n\n'
      + 'Tu asistente financiero está listo para ayudarte.\n\n'
      + '¿Qué quieres hacer hoy?\n'
      + '• Registrar un gasto o ingreso\n'
      + '• Consultar tu /balance\n'
      + '• Ver tu /reporte mensual\n\n'
      + 'También puedes escribir directamente:\n'
      + '• "Gasté 25000 en comida"\n'
      + '• "Me pagaron 500000"'
    );
  } else {
    // Nuevo usuario - mensaje de bienvenida
    await ctx.reply(
      '¡Bienvenido a tu Asistente Financiero! 🎉\n\n'
      + 'Puedo ayudarte a:\n'
      + '• registrar gastos e ingresos\n'
      + '• Consultar tu balance\n'
      + '• Ver reportes mensuales\n\n'
      + 'Escribe un mensaje como "Gasté 25000 en comida" o usa los comandos.'
    );
  }
});

// Iniciar bot
const startBot = async (): Promise<void> => {
  console.log('Starting bot...');
  
  // Configurar webhook en desarrollo
  if (config.server.env === 'development') {
    // En desarrollo usamos long polling
    await bot.start();
    console.log('Bot started in polling mode');
  } else {
    // En producción el servidor debe llamar a webhookCallback
    console.log('Bot ready for webhook');
  }
};

export { bot, webhookCallback, startBot };
