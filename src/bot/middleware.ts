import { NextFunction } from 'grammy';
import type { BotContext } from '../types';
import { userRepository } from '../data/repositories/user.repository';
import { config } from '../config';

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) {
    return next();
  }
  
  const telegramId = ctx.from.id;
  const { username, first_name, last_name } = ctx.from;
  
  // Verificar si el acceso está restringido
  if (config.allowedUsers && !config.allowedUsers.includes(telegramId)) {
    await ctx.reply(
      '⛔ *Acceso Denegado*\n\n'
      + 'Este bot es de uso privado.\n'
      + 'Si crees que esto es un error, contacta al administrador.',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  try {
    // Primero buscar si el usuario ya existe
    let user = await userRepository.findByTelegramId(telegramId);
    
    // Si no existe, crearlo
    if (!user) {
      user = await userRepository.createOrGet(telegramId, {
        username,
        first_name,
        last_name,
      });
    }
    
    // Guardar usuario en contexto
    ctx.config = { user };

    await next();
  } catch (error: unknown) {
    console.error('Auth middleware error:', error);

    const dbError = error as { code?: string };
    // Si el error es de clave duplicada, intentar obtener el usuario existente
    if (dbError?.code === '23505') {
      try {
        const existingUser = await userRepository.findByTelegramId(telegramId);
        if (existingUser) {
          ctx.config = { user: existingUser };
          await next();
          return;
        }
      } catch (retryError) {
        console.error('Retry error:', retryError);
      }
    }

    await ctx.reply('Hubo un error al procesar tu solicitud. Intenta de nuevo.');
  }
}
