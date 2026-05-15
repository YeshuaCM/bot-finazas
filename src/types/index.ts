// =============================================================================
// Tipos para el Bot de Finanzas Personales
// =============================================================================

// Tipos de transacción
export type TransactionType = "gasto" | "ingreso";

// Transacción parseada del NLP
export interface ParsedTransaction {
  tipo: TransactionType;
  monto: number;
  categoria?: string;
  descripcion?: string;
  confianza: number;
  requiereConfirmacion: boolean;
}

// Transacción en DB
export interface Transaction {
  id: string;
  user_id: number;
  type: TransactionType;
  amount: number;
  category_id?: string;
  description?: string;
  transaction_date: string;
  created_at: string;
}

// Categoría
export interface Category {
  id: string;
  user_id?: number;
  name: string;
  type: TransactionType;
  emoji?: string;
  is_default: boolean;
}

// Perfil de usuario
export interface Profile {
  telegram_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  preferences: Record<string, unknown>;
  created_at: string;
}

// Estados de conversación
export const ConversationState = {
  IDLE: "idle",
  AWAITING_GASTO_AMOUNT: "awaiting_gasto_amount",
  AWAITING_GASTO_CATEGORY: "awaiting_gasto_category",
  AWAITING_INGRESO_AMOUNT: "awaiting_ingreso_amount",
  AWAITING_INGRESO_CATEGORY: "awaiting_ingreso_category",
  CONFIRMING_TRANSACTION: "confirming_transaction",
} as const;

export type ConversationStateType =
  (typeof ConversationState)[keyof typeof ConversationState];

// Sesión de usuario
export interface UserSession {
  telegramId: number;
  state: ConversationStateType;
  pendingTransaction?: {
    tipo: TransactionType;
    monto?: number;
    categoria?: string;
    descripcion?: string;
  };
}

// Balance response
export interface BalanceResponse {
  mes: number;
  año: number;
  ingresos: number;
  gastos: number;
  balance: number;
  porCategoria: {
    categoria: string;
    total: number;
    porcentaje: number;
  }[];
}

// Tablas de Supabase
export const Tables = {
  PROFILES: "profiles",
  CATEGORIES: "categories",
  TRANSACTIONS: "transactions",
} as const;

// =============================================================================
// Bot Context (GrammY)
// =============================================================================
import type { Context } from 'grammy';

export interface BotConfig {
  user: Profile;
}

export type BotContext = Context & {
  config?: BotConfig;
};
