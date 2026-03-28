import { Context, NextFunction } from 'grammy';
import { userRepository } from '../data/repositories/user.repository';

export async function authMiddleware(ctx: Context, next: NextFunction) {
  if (!ctx.from) {
    return next();
  }
  
  const telegramId = ctx.from.id;
  const { username, first_name, last_name } = ctx.from;
  
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
    (ctx as any).config = (ctx as any).config || {};
    (ctx as any).config.user = user;
    
    await next();
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    
    // Si el error es de clave duplicada, intentar obtener el usuario existente
    if (error?.code === '23505') {
      try {
        const existingUser = await userRepository.findByTelegramId(telegramId);
        if (existingUser) {
          (ctx as any).config = (ctx as any).config || {};
          (ctx as any).config.user = existingUser;
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
