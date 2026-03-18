import { Context, NextFunction } from 'grammy';
import { userRepository } from '../data/repositories/user.repository';

export async function authMiddleware(ctx: Context, next: NextFunction) {
  if (!ctx.from) {
    return next();
  }
  
  const telegramId = ctx.from.id;
  const { username, first_name, last_name } = ctx.from;
  
  try {
    // Crear u obtener usuario
    const user = await userRepository.createOrGet(telegramId, {
      username,
      first_name,
      last_name,
    });
    
    // Guardar usuario en contexto (como any para evitar problemas de tipos)
    (ctx as any).config = (ctx as any).config || {};
    (ctx as any).config.user = user;
    
    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    await ctx.reply('Hubo un error al procesar tu solicitud. Intenta de nuevo.');
  }
}
