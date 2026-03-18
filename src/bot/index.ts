import { Bot, webhookCallback } from 'grammy';
import { config } from '../config';
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
bot.command('start', async (ctx: any) => {
  await ctx.reply('¡Bienvenido a tu Asistente Financiero! 🎉\n\n'
    + 'Puedo ayudarte a:\n'
    + '• Registrar gastos e ingresos\n'
    + '• Consultar tu balance\n'
    + '• Ver reportes mensuales\n\n'
    + 'Escribe un mensaje como "Gasté 25000 en comida" o usa los comandos.');
});

// Iniciar bot
const startBot = async () => {
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
