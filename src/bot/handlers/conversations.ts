import { Bot } from 'grammy';
import { runAgent, confirmarTransaccion } from '../../services/ai-agent';
import { parseAmount } from '../../services/nlp-parser';
import { transactionRepository } from '../../data/repositories/transaction.repository';
import { categoryRepository } from '../../data/repositories/category.repository';
import { confirmKeyboard, categoryKeyboard } from '../keyboards';

interface ConversationSession {
  state: 'idle' | 'waiting_amount' | 'waiting_category' | 'confirming';
  type?: 'gasto' | 'ingreso';
  amount?: number;
  category?: string;
  description?: string;
  rawMessage?: string;
}

const sessions = new Map<number, ConversationSession>();

export function registerConversations(bot: Bot) {
  // Manejar mensajes de texto para parsing NLP
  bot.on('message:text', async (ctx: any) => {
    // Ignorar comandos
    if (ctx.message?.text?.startsWith('/')) {
      return;
    }
    
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const messageText = ctx.message?.text;
    if (!messageText) return;
    
    // Obtener o crear sesión
    let session = sessions.get(telegramId);
    if (!session) {
      session = { state: 'idle' };
      sessions.set(telegramId, session);
    }
    
    // Si está esperando cantidad
    if (session.state === 'waiting_amount') {
      const amount = parseAmount(messageText);
      
      if (amount <= 0) {
        await ctx.reply('Monto inválido. Por favor ingresa un número válido.');
        return;
      }
      
      session.amount = amount;
      session.state = 'waiting_category';
      
      await ctx.reply(
        `Monto: $${amount.toLocaleString('es-CL')}\n\n¿Qué categoría?`,
        { reply_markup: categoryKeyboard(session.type!) }
      );
      return;
    }
    
    // Si está esperando categoría
    if (session.state === 'waiting_category') {
      const categoryMap: Record<string, string> = {
        'cat_comida': 'comida', 'cat_transporte': 'transporte', 'cat_mercado': 'mercado',
        'cat_servicios': 'servicios', 'cat_salud': 'salud', 'cat_entretenimiento': 'entretenimiento',
        'cat_educacion': 'educación', 'cat_diezmos': 'diezmos', 'cat_ofrendas': 'ofrendas', 'cat_otros': 'otros',
        'cat_salario': 'salario', 'cat_freelance': 'freelance', 'cat_inversion': 'inversión',
        'cat_regalo': 'regalo', 'cat_otro': 'otro',
      };
      
      const categoryName = categoryMap[messageText] || messageText;
      session.category = categoryName;
      session.state = 'confirming';
      
      await ctx.reply(
        `*Confirmar transacción:*\n\n`
        + `Tipo: ${session.type === 'gasto' ? '💸 Gasto' : '💵 Ingreso'}\n`
        + `Monto: $${session.amount?.toLocaleString('es-CL')}\n`
        + `Categoría: ${session.category}\n\n`
        + `¿Confirmar?`,
        { parse_mode: 'Markdown', reply_markup: confirmKeyboard() }
      );
      return;
    }
    
    // Estado idle: usar AI Agent
    try {
      const telegramUserId = ctx.from?.id;
      const user = ctx.config?.user;
      
      if (!user) {
        await ctx.reply('Error: usuario no identificado');
        return;
      }
      
      // Check if user said "sí" or "confirmar" to confirm pending transaction
      const confirmationWords = ['sí', 'si', 'confirmar', 'si claro', 'dale', 'ok', 'sí confirmo'];
      if (session.state === 'confirming' && confirmationWords.some(w => messageText.toLowerCase().includes(w))) {
        if (session.type && session.amount) {
          const result = await confirmarTransaccion(
            user.telegram_id,
            session.type,
            session.amount,
            session.description
          );
          await ctx.reply(result.message);
          sessions.delete(telegramId);
          return;
        }
      }
      
      // Usar AI Agent
      const response = await runAgent(messageText, user.telegram_id);
      
      // Si requiere confirmación, guardar en sesión para el callback
      if (response.requiresConfirmation && response.data) {
        session.type = response.data.tipo;
        session.amount = response.data.monto;
        session.description = response.data.descripcion;
        session.state = 'confirming';
      }
      
      await ctx.reply(response.message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('AI Agent error:', error);
      await ctx.reply('Tuve un problema al procesar. Probá de nuevo.');
    }
  });
  
  // Manejar TODOS los callback queries en un solo lugar
  bot.on('callback_query:data', async (ctx: any) => {
    const callbackData = ctx.callbackQuery?.data;
    const telegramId = ctx.from?.id;
    
    if (!telegramId || !callbackData) return;
    
    console.log('Callback received:', callbackData);
    
    // Responder al callback inmediatamente
    await ctx.answerCallbackQuery();
    
    const session = sessions.get(telegramId);
    
    // Manejar callbacks de confirmación de transacción
    if (callbackData === 'confirm_yes') {
      if (!session || session.state !== 'confirming') {
        await ctx.reply('No hay transacción pendiente para confirmar.');
        return;
      }
      
      try {
        const user = ctx.config?.user;
        if (!user) {
          await ctx.reply('Error: usuario no identificado');
          return;
        }
        
        // Buscar categoría en DB
        let categoryId: string | undefined;
        if (session.category) {
          const category = await categoryRepository.findByName(session.category, session.type!);
          categoryId = category?.id;
        }
        
        await transactionRepository.create({
          user_id: user.telegram_id,
          type: session.type!,
          amount: session.amount!,
          category_id: categoryId,
          description: session.description || session.rawMessage,
        });
        
        await ctx.editMessageText(
          `✅ *Transacción registrada!*\n\n`
          + `${session.type === 'gasto' ? '💸 Gasto' : '💵 Ingreso'}: $${session.amount?.toLocaleString('es-CL')}\n`
          + `Categoría: ${session.category || 'otros'}`,
          { parse_mode: 'Markdown' }
        );
        
        // Limpiar sesión
        sessions.delete(telegramId);
      } catch (error) {
        console.error('Save transaction error:', error);
        await ctx.reply('❌ Error al guardar. Intenta de nuevo.');
      }
      return;
    }
    
    if (callbackData === 'confirm_no') {
      if (session) {
        await ctx.editMessageText('❌ Transacción cancelada.');
        sessions.delete(telegramId);
      } else {
        await ctx.reply('No hay transacción pendiente para cancelar.');
      }
      return;
    }
    
    // Manejar callbacks de acciones del menú
    switch (callbackData) {
      case 'action_gasto':
        sessions.set(telegramId, { state: 'waiting_amount', type: 'gasto' });
        await ctx.reply('¿Cuánto gastaste? (Ej: 25000)');
        break;
      case 'action_ingreso':
        sessions.set(telegramId, { state: 'waiting_amount', type: 'ingreso' });
        await ctx.reply('¿Cuánto recibiste? (Ej: 500000)');
        break;
      case 'action_balance':
        await ctx.reply('Usa el comando /balance para ver tu balance.');
        break;
      case 'action_reporte':
        await ctx.reply('Usa el comando /reporte para ver el reporte mensual.');
        break;
      case 'action_help':
        await ctx.reply('Usa /help para ver los comandos disponibles.');
        break;
      
      // Categorías de GASTOS
      case 'cat_comida':
      case 'cat_transporte':
      case 'cat_mercado':
      case 'cat_servicios':
      case 'cat_salud':
      case 'cat_entretenimiento':
      case 'cat_educacion':
      case 'cat_diezmos':
      case 'cat_ofrendas':
      case 'cat_otros':
      // Categorías de INGRESOS
      case 'cat_salario':
      case 'cat_freelance':
      case 'cat_inversion':
      case 'cat_regalo':
      case 'cat_otro': {
        // El usuario seleccionó una categoría del menú
        if (!session || session.state !== 'waiting_category') {
          await ctx.reply('No estoy esperando una categoría. Usa /menu para comenzar.');
          break;
        }
        
        const categoryMap: Record<string, string> = {
          'cat_comida': 'comida',
          'cat_transporte': 'transporte',
          'cat_mercado': 'mercado',
          'cat_servicios': 'servicios',
          'cat_salud': 'salud',
          'cat_entretenimiento': 'entretenimiento',
          'cat_educacion': 'educación',
          'cat_diezmos': 'diezmos',
          'cat_ofrendas': 'ofrendas',
          'cat_otros': 'otros',
          'cat_salario': 'salario',
          'cat_freelance': 'freelance',
          'cat_inversion': 'inversión',
          'cat_regalo': 'regalo',
          'cat_otro': 'otro',
        };
        
        session.category = categoryMap[callbackData] || 'otros';
        session.state = 'confirming';
        
        await ctx.reply(
          `*Confirmar transacción:*\n\n`
          + `Tipo: ${session.type === 'gasto' ? '💸 Gasto' : '💵 Ingreso'}\n`
          + `Monto: $${session.amount?.toLocaleString('es-CL')}\n`
          + `Categoría: ${session.category}\n\n`
          + `¿Confirmar?`,
          { parse_mode: 'Markdown', reply_markup: confirmKeyboard() }
        );
        break;
      }
    }
  });
}
