import { Bot } from 'grammy';
import type { BotContext, Transaction } from '../../types';
import { runAgent, confirmarTransaccion } from '../../services/ai-agent';
import { parseAmount } from '../../services/nlp-parser';
import { transactionRepository } from '../../data/repositories/transaction.repository';
import { categoryRepository } from '../../data/repositories/category.repository';
import { sessionRepository } from '../../data/repositories/session.repository';
import { confirmKeyboard, categoryKeyboard } from '../keyboards';
import { CATEGORY_MAP } from './category-map';

interface ConversationSession {
  state: 'idle' | 'waiting_amount' | 'waiting_category' | 'confirming'
    | 'delete_confirming' | 'edit_amount' | 'edit_description' | 'edit_confirming';
  type?: 'gasto' | 'ingreso';
  amount?: number;
  category?: string;
  categoryId?: string;
  description?: string;
  rawMessage?: string;
  deleteTransactionId?: string;
  editTransactionId?: string;
  editNewAmount?: number;
  editNewDescription?: string;
}

// In-memory cache with expiration (5 min) + Supabase persistence
const CACHE_TTL = 5 * 60 * 1000;
const sessions = new Map<number, { session: ConversationSession; expiresAt: number }>();

async function loadSession(telegramId: number): Promise<ConversationSession> {
  const cached = sessions.get(telegramId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.session;
  }

  try {
    const stored = await sessionRepository.get(telegramId);
    if (stored) {
      const session: ConversationSession = {
        state: stored.state as ConversationSession['state'],
        ...(stored.data as unknown as Omit<ConversationSession, 'state'>),
      };
      sessions.set(telegramId, { session, expiresAt: Date.now() + CACHE_TTL });
      return session;
    }
  } catch (error) {
    console.warn('Session load failed (table may not exist yet), using idle session:', (error as Error)?.message);
    // Degradado graceful: si la tabla no existe, sesión fresca
  }

  const fresh: ConversationSession = { state: 'idle' };
  sessions.set(telegramId, { session: fresh, expiresAt: Date.now() + CACHE_TTL });
  return fresh;
}

async function saveSession(telegramId: number, session: ConversationSession): Promise<void> {
  sessions.set(telegramId, { session, expiresAt: Date.now() + CACHE_TTL });
  const { state, ...data } = session;
  try {
    await sessionRepository.upsert(telegramId, { state, data: data as Record<string, unknown> });
  } catch (error) {
    console.warn('Session save failed (table may not exist):', (error as Error)?.message);
  }
}

async function deleteSession(telegramId: number): Promise<void> {
  sessions.delete(telegramId);
  try {
    await sessionRepository.delete(telegramId);
  } catch (error) {
    console.warn('Session delete failed (table may not exist):', (error as Error)?.message);
  }
}

export function registerConversations(bot: Bot): void {
  // Manejar mensajes de texto para parsing NLP
  bot.on('message:text', async (ctx: BotContext) => {
    // Ignorar comandos
    if (ctx.message?.text?.startsWith('/')) {
      return;
    }
    
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    
    const messageText = ctx.message?.text;
    if (!messageText) return;
    
    // Obtener o crear sesión (cache + persistencia)
    const session = await loadSession(telegramId);
    
    // Si está esperando cantidad
    if (session.state === 'waiting_amount') {
      const amount = parseAmount(messageText);
      
      if (amount <= 0) {
        await ctx.reply('Monto inválido. Por favor ingresa un número válido.');
        return;
      }
      
      session.amount = amount;
      session.state = 'waiting_category';
      await saveSession(telegramId, session);
      
      await ctx.reply(
        `Monto: $${amount.toLocaleString('es-CL')}\n\n¿Qué categoría?`,
        { reply_markup: categoryKeyboard(session.type!) }
      );
      return;
    }
    
    // Si está esperando categoría
    if (session.state === 'waiting_category') {
      const categoryName = CATEGORY_MAP[messageText] || messageText;
      session.category = categoryName;
      session.state = 'confirming';
      await saveSession(telegramId, session);
      
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
    
    // --- Edit flow ---
    if (session.state === 'edit_amount') {
      const amount = parseAmount(messageText);
      if (amount <= 0) {
        await ctx.reply('Monto inválido. Ingresa un número válido.');
        return;
      }
      session.editNewAmount = amount;
      session.state = 'edit_description';
      await saveSession(telegramId, session);
      await ctx.reply(
        `Nuevo monto: $${amount.toLocaleString('es-CL')}\n\n`
        + `Envía la *nueva descripción* (o escribí "ninguna" para dejarla vacía):`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (session.state === 'edit_description') {
      session.editNewDescription = messageText.toLowerCase() === 'ninguna' ? '' : messageText;
      session.state = 'edit_confirming';
      await saveSession(telegramId, session);

      await ctx.reply(
        `✏️ *Confirmar cambios:*\n\n`
        + `Nuevo monto: $${session.editNewAmount?.toLocaleString('es-CL')}\n`
        + `Nueva descripción: ${session.editNewDescription || '(vacía)'}\n\n`
        + `¿Aplicar cambios?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Sí, aplicar', callback_data: 'edit_confirm' }],
              [{ text: '❌ Cancelar', callback_data: 'edit_cancel' }],
            ],
          },
        }
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
            session.description,
            session.categoryId
          );
          await ctx.reply(result.message);
          await deleteSession(telegramId);
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
        session.category = response.data.categoria;
        session.categoryId = response.data.categoriaId;
        session.state = 'confirming';
        await saveSession(telegramId, session);
      }
      
      await ctx.reply(response.message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('AI Agent error:', error);
      await ctx.reply('Tuve un problema al procesar. Probá de nuevo.');
    }
  });
  
  // Manejar TODOS los callback queries en un solo lugar
  bot.on('callback_query:data', async (ctx: BotContext) => {
    const callbackData = ctx.callbackQuery?.data;
    const telegramId = ctx.from?.id;
    
    if (!telegramId || !callbackData) return;
    
    console.log('Callback received:', callbackData);
    
    // Responder al callback inmediatamente
    await ctx.answerCallbackQuery();
    
    const cached = sessions.get(telegramId);
    const session = cached?.session;
    
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
        await deleteSession(telegramId);
      } catch (error) {
        console.error('Save transaction error:', error);
        await ctx.reply('❌ Error al guardar. Intenta de nuevo.');
      }
      return;
    }
    
    if (callbackData === 'confirm_no') {
      if (session) {
        await ctx.editMessageText('❌ Transacción cancelada.');
        await deleteSession(telegramId);
      }
      return;
    }
    
    // Manejar callbacks de acciones del menú
    switch (callbackData) {
      case 'action_gasto':
        await saveSession(telegramId, { state: 'waiting_amount', type: 'gasto' });
        await ctx.reply('¿Cuánto gastaste? (Ej: 25000)');
        break;
      case 'action_ingreso':
        await saveSession(telegramId, { state: 'waiting_amount', type: 'ingreso' });
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
        
          const categoryMap: Record<string, string> = CATEGORY_MAP;
        session.category = categoryMap[callbackData] || 'otros';
        session.state = 'confirming';
        await saveSession(telegramId, session);
        
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
      
      // --- Delete transaction flow ---
      case 'delete_confirm': {
        if (!session || session.state !== 'delete_confirming') {
          await ctx.reply('No hay ninguna eliminación pendiente.');
          break;
        }
        try {
          // Ownership check (defense-in-depth)
          const tx = await transactionRepository.findById(session.deleteTransactionId!);
          if (!tx) {
            await ctx.reply('Transacción no encontrada.');
            await deleteSession(telegramId);
            break;
          }
          const user = ctx.config?.user;
          if (tx.user_id !== user?.telegram_id) {
            await ctx.reply('⛔ No autorizado: esta transacción no te pertenece.');
            await deleteSession(telegramId);
            break;
          }
          await transactionRepository.delete(session.deleteTransactionId!);
          await ctx.editMessageText('✅ Transacción eliminada correctamente.');
          await deleteSession(telegramId);
        } catch (error) {
          console.error('Delete error:', error);
          await ctx.reply('❌ Error al eliminar la transacción.');
        }
        break;
      }
      case 'delete_cancel': {
        if (session && session.state === 'delete_confirming') {
          await ctx.editMessageText('❌ Eliminación cancelada.');
          await deleteSession(telegramId);
        }
        break;
      }
      
      // --- Edit transaction: apply changes ---
      case 'edit_confirm': {
        if (!session || session.state !== 'edit_confirming' || !session.editTransactionId || !session.editNewAmount) {
          await ctx.reply('No hay ninguna edición pendiente.');
          break;
        }
        try {
          const existing = await transactionRepository.findById(session.editTransactionId);
          if (!existing) {
            await ctx.reply('Transacción no encontrada (posiblemente ya fue eliminada).');
            await deleteSession(telegramId);
            break;
          }
          // Ownership check (defense-in-depth)
          const user = ctx.config?.user;
          if (existing.user_id !== user?.telegram_id) {
            await ctx.reply('⛔ No autorizado: esta transacción no te pertenece.');
            await deleteSession(telegramId);
            break;
          }
          await transactionRepository.update(session.editTransactionId, {
            amount: session.editNewAmount,
            description: session.editNewDescription ?? existing.description,
          });
          await ctx.editMessageText(
            `✅ *Transacción actualizada*\n\n`
            + `💰 Nuevo monto: $${session.editNewAmount.toLocaleString('es-CL')}\n`
            + `📝 Descripción: ${session.editNewDescription || '(sin descripción)'}`
          );
          await deleteSession(telegramId);
        } catch (error) {
          console.error('Edit apply error:', error);
          await ctx.reply('❌ Error al actualizar la transacción.');
        }
        break;
      }
      case 'edit_cancel': {
        if (session && (session.state === 'edit_confirming' || session.state === 'edit_amount' || session.state === 'edit_description')) {
          await ctx.editMessageText('❌ Edición cancelada.');
          await deleteSession(telegramId);
        }
        break;
      }
      default: {
        // Transaction ID actions: edit_{id} or delete_{id}
        if (callbackData.startsWith('delete_') && !['delete_confirm', 'delete_cancel'].includes(callbackData)) {
          const txId = callbackData.replace('delete_', '');
          try {
            const tx = await transactionRepository.findById(txId);
            if (!tx) {
              await ctx.reply('Transacción no encontrada.');
              break;
            }
            // Ownership check
            const user = ctx.config?.user;
            if (tx.user_id !== user?.telegram_id) {
              await ctx.reply('⛔ No autorizado: no podés eliminar una transacción que no te pertenece.');
              break;
            }
            await saveSession(telegramId, {
              state: 'delete_confirming',
              deleteTransactionId: txId,
            });
            await ctx.reply(
              `¿Eliminar esta transacción?\n\n`
              + `${tx.type === 'gasto' ? '💸' : '💵'} $${Number(tx.amount).toLocaleString('es-CL')}\n`
              + `${tx.description ? `📝 ${tx.description}\n` : ''}`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '✅ Sí, eliminar', callback_data: 'delete_confirm' }],
                    [{ text: '❌ Cancelar', callback_data: 'delete_cancel' }],
                  ],
                },
              }
            );
          } catch (error) {
            console.error('Delete fetch error:', error);
            await ctx.reply('Error al buscar la transacción.');
          }
          break;
        }
        
        if (callbackData.startsWith('edit_')) {
          const txId = callbackData.replace('edit_', '');
          try {
            const tx = await transactionRepository.findById(txId);
            if (!tx) {
              await ctx.reply('Transacción no encontrada.');
              break;
            }
            // Ownership check
            const user = ctx.config?.user;
            if (tx.user_id !== user?.telegram_id) {
              await ctx.reply('⛔ No autorizado: no podés editar una transacción que no te pertenece.');
              break;
            }
            await saveSession(telegramId, {
              state: 'edit_amount',
              editTransactionId: txId,
            });
            await ctx.reply(
              `✏️ *Editando transacción*\n\n`
              + `Monto actual: $${Number(tx.amount).toLocaleString('es-CL')}\n`
              + `Descripción actual: ${tx.description || '(sin descripción)'}\n\n`
              + `Envía el *nuevo monto* (solo números):`,
              { parse_mode: 'Markdown' }
            );
          } catch (error) {
            console.error('Edit fetch error:', error);
            await ctx.reply('Error al buscar la transacción.');
          }
          break;
        }
        
        await ctx.reply('No entendí esa opción. Usa /menu para comenzar.');
        break;
      }
    }
  });
}
