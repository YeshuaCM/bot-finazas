import { Bot } from 'grammy';
import { parseTransactionMessage, parseAmount } from '../../services/nlp-parser';
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
        'cat_educacion': 'educación', 'cat_otros': 'otros',
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
    
    // Estado idle: intentar parsear con NLP
    try {
      const parsed = await parseTransactionMessage(messageText);
      
      if (parsed.monto <= 0) {
        await ctx.reply('No entendí el monto. ¿Podés ser más específico?\n\n'
          + 'Ejemplo: "Gasté 25000 en comida"');
        return;
      }
      
      // Guardar en sesión
      session.type = parsed.tipo;
      session.amount = parsed.monto;
      session.category = parsed.categoria;
      session.description = parsed.descripcion;
      session.rawMessage = messageText;
      session.state = 'confirming';
      
      const emoji = parsed.tipo === 'gasto' ? '💸' : '💵';
      await ctx.reply(
        `${emoji} *Transacción detectada:*\n\n`
        + `Tipo: ${parsed.tipo}\n`
        + `Monto: $${parsed.monto.toLocaleString('es-CL')}\n`
        + `Categoría: ${parsed.categoria || 'sin categoría'}\n`
        + `Descripción: ${parsed.descripcion || 'sin descripción'}\n\n`
        + `¿Confirmar?`,
        { parse_mode: 'Markdown', reply_markup: confirmKeyboard() }
      );
    } catch (error) {
      console.error('NLP parse error:', error);
      await ctx.reply('No entendí el mensaje. Intenta usar el formato:\n'
        + '• "Gasté 25000 en comida"\n'
        + '• "Me pagaron 500000"');
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
