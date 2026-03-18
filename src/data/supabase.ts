import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import type { Transaction, Category, Profile } from "../types";

// =============================================================================
// Cliente de Supabase
// =============================================================================

export const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// =============================================================================
// Funciones de base de datos
// =============================================================================

// ----- Perfiles -----

export async function getOrCreateProfile(
  telegramId: number,
  username?: string,
  firstName?: string,
  lastName?: string
): Promise<Profile> {
  // Intentar obtener perfil existente
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("telegram_id", telegramId)
    .single();

  if (existingProfile) {
    return existingProfile as Profile;
  }

  // Crear nuevo perfil
  const { data: newProfile, error } = await supabase
    .from("profiles")
    .insert({
      telegram_id: telegramId,
      username: username || null,
      first_name: firstName || "Usuario",
      last_name: lastName || null,
      preferences: {},
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating profile:", error);
    throw new Error(`Failed to create profile: ${error.message}`);
  }

  return newProfile as Profile;
}

// ----- Categorías -----

export async function getCategories(
  userId: number,
  type?: "gasto" | "ingreso"
): Promise<Category[]> {
  let query = supabase
    .from("categories")
    .select("*")
    .or(`user_id.eq.${userId},is_default.eq.true`);

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching categories:", error);
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return (data as Category[]) || [];
}

// ----- Transacciones -----

export async function createTransaction(
  userId: number,
  transaction: {
    type: "gasto" | "ingreso";
    amount: number;
    category_id?: string;
    description?: string;
    transaction_date?: string;
  }
): Promise<Transaction> {
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: transaction.type,
      amount: transaction.amount,
      category_id: transaction.category_id || null,
      description: transaction.description || null,
      transaction_date: transaction.transaction_date || new Date().toISOString().split("T")[0],
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating transaction:", error);
    throw new Error(`Failed to create transaction: ${error.message}`);
  }

  return data as Transaction;
}

export async function getTransactions(
  userId: number,
  options?: {
    startDate?: string;
    endDate?: string;
    type?: "gasto" | "ingreso";
    limit?: number;
  }
): Promise<Transaction[]> {
  let query = supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false });

  if (options?.startDate) {
    query = query.gte("transaction_date", options.startDate);
  }
  if (options?.endDate) {
    query = query.lte("transaction_date", options.endDate);
  }
  if (options?.type) {
    query = query.eq("type", options.type);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching transactions:", error);
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  return (data as Transaction[]) || [];
}

export async function getBalance(
  userId: number,
  month: number,
  year: number
): Promise<{
  ingresos: number;
  gastos: number;
  balance: number;
}> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // Último día del mes

  const { data, error } = await supabase
    .from("transactions")
    .select("type, amount")
    .eq("user_id", userId)
    .gte("transaction_date", startDate)
    .lte("transaction_date", endDate);

  if (error) {
    console.error("Error calculating balance:", error);
    throw new Error(`Failed to calculate balance: ${error.message}`);
  }

  const result = { ingresos: 0, gastos: 0, balance: 0 };
  for (const tx of data || []) {
    if (tx.type === "ingreso") {
      result.ingresos += Number(tx.amount);
    } else {
      result.gastos += Number(tx.amount);
    }
  }
  result.balance = result.ingresos - result.gastos;

  return result;
}
