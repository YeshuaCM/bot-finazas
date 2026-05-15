import { transactionRepository } from "../data/repositories/transaction.repository";
import { getBogotaDateString } from "../utils/date.utils";
import { getGroqClient } from "./groq-client";
import { categorize } from "./categorizer";
import { categoryRepository } from "../data/repositories/category.repository";

// =============================================================================
// CONSTANTS
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MAX_MESSAGE_LENGTH = 500;
const MAX_LOG_LENGTH = 100;
const MAX_DAYS_TO_SHOW = 15;
const DEFAULT_RECENT_LIMIT = 5;
const MAX_MESSAGE_SIZE = MAX_MESSAGE_LENGTH * 2;

const GROQ_INTENT_CONFIG = {
  temperature: 0.1,
  max_tokens: 50,
} as const;

// =============================================================================
// INTENTS DEFINITION
// =============================================================================

type Intent = 
  | "registrar_gasto"
  | "registrar_ingreso"
  | "consultar_gastos_hoy"
  | "consultar_gastos_ayer"
  | "consultar_gastos_semana"
  | "resumen_diario"
  | "resumen_semanal"
  | "consultar_gastos_mes"
  | "consultar_balance"
  | "consultar_balance_mes"
  | "consultar_por_categoria"
  | "saludar"
  | "ayuda"
  | "desconocido";

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const INTENT_SYSTEM_PROMPT = `Eres un clasificador de intents para un bot financiero.

Tu lavoro es ANALIZAR el mensaje del usuario y devolver SOLO un intent de los siguientes:

- "registrar_gasto": Cuando el usuario quiere registrar un gasto (compró, gasté, pagué, etc.)
- "registrar_ingreso": Cuando el usuario quiere registrar un ingreso (recibi, me pagaron, gané, etc.)
- "consultar_gastos_hoy": Pregunta sobre gastos de HOY (cuánto gasté hoy, qué compré hoy)
- "consultar_gastos_ayer": Pregunta sobre gastos de AYER (cuánto gasté ayer, qué compré ayer)
- "consultar_gastos_semana": Pregunta sobre gastos de la semana
- "consultar_gastos_mes": Pregunta sobre gastos del MES (este mes, mes pasado)
- "consultar_balance": Pregunta sobre balance TOTAL (cuánto tengo, balance)
- "consultar_balance_mes": Pregunta sobre balance del MES (este mes, mes pasado)
- "consultar_por_categoria": Pregunta breakdown por categoría
- "resumen_diario": Pide resumen del día (qué tal el día, cómo estuvo hoy)
- "resumen_semanal": Pide resumen de la semana
- "saludar": Saludos (hola, buenas, hello, qué tal)
- "ayuda": Pide ayuda o comandos
- "desconocido": No sabes qué quiere

Responde SOLO con el intent, nada más.`;

// =============================================================================
// RESPONSE FORMATTING — single generic formatter with thin wrappers
// =============================================================================

type TxType = "gasto" | "ingreso";

interface TxInput {
  amount: number;
  description?: string;
  type?: TxType;
  transaction_date?: string;
}

interface FormatOptions {
  title?: string;
  showTotal?: boolean;
  showBalance?: boolean;
  groupByDay?: boolean;
  maxDays?: number;
  emptyMessage?: string;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function localeAmount(n: number): string {
  return `$${n.toLocaleString("es-CL")}`;
}

function formatTxLine(t: TxInput, withEmoji = false): string {
  const prefix = withEmoji ? (t.type === "gasto" ? "💸 " : "💵 ") : "• ";
  return `${prefix}${localeAmount(t.amount)}${t.description ? ` - ${t.description}` : ""}`;
}

/**
 * Generic transaction formatter. All specific formatters delegate here.
 */
function formatTransactions(
  transactions: TxInput[],
  options: FormatOptions = {}
): string {
  if (transactions.length === 0) {
    return options.emptyMessage || "No hay transacciones registradas.";
  }

  let result = options.title ? `${options.title}\n\n` : "";

  if (options.groupByDay) {
    const byDay: Record<string, TxInput[]> = {};
    for (const t of transactions) {
      const day = t.transaction_date || "sin fecha";
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(t);
    }

    const sortedDays = Object.keys(byDay).sort();
    const showReverse = options.maxDays !== undefined;
    const daysToShow = showReverse ? sortedDays.reverse().slice(0, options.maxDays) : sortedDays;

    for (const day of daysToShow) {
      const dayTxs = byDay[day];
      const dayDate = new Date(day);
      const dayLabel = options.maxDays
        ? `📅 ${dayDate.getDate()}`
        : `📅 ${DAY_NAMES[dayDate.getDay()]} ${dayDate.getDate()}/${dayDate.getMonth() + 1}`;

      result += `${dayLabel}\n─────────────────────\n`;

      for (const t of dayTxs) {
        result += `${formatTxLine(t, true)}\n`;
      }

      const dayGastos = dayTxs.filter(t => t.type === "gasto").reduce((s, t) => s + t.amount, 0);
      const dayIngresos = dayTxs.filter(t => t.type === "ingreso").reduce((s, t) => s + t.amount, 0);
      result += `\n💵: ${localeAmount(dayIngresos)}  💸: ${localeAmount(dayGastos)}\n\n`;
    }

    if (showReverse && Object.keys(byDay).length > options.maxDays!) {
      result += `... y ${Object.keys(byDay).length - options.maxDays!} días más\n\n`;
    }
  } else {
    for (const t of transactions) {
      result += `${formatTxLine(t, false)}\n`;
    }
  }

  if (options.showTotal) {
    const total = transactions.reduce((s, t) => s + t.amount, 0);
    result += `\n*Total:* ${localeAmount(total)}`;
  }

  if (options.showBalance) {
    const gastos = transactions.filter(t => t.type === "gasto").reduce((s, t) => s + t.amount, 0);
    const ingresos = transactions.filter(t => t.type === "ingreso").reduce((s, t) => s + t.amount, 0);
    const balance = ingresos - gastos;
    const emoji = balance >= 0 ? "📈" : "📉";

    result += `\n─────────────────────\n`;
    result += `💵 Total ingresos: ${localeAmount(ingresos)} (${transactions.filter(t => t.type === "ingreso").length} transacción${transactions.filter(t => t.type === "ingreso").length !== 1 ? "es" : ""})\n`;
    result += `💸 Total gastos: ${localeAmount(gastos)} (${transactions.filter(t => t.type === "gasto").length} transacción${transactions.filter(t => t.type === "gasto").length !== 1 ? "es" : ""})\n`;
    result += `${emoji} Balance: ${localeAmount(balance)}`;
  }

  return result;
}

/** Thin wrapper: just gastos list with total */
function formatGastos(transactions: Array<{ amount: number; description?: string }>): string {
  if (transactions.length === 0) return "No tienes gastos registrados hoy.";
  return formatTransactions(transactions, {
    title: "💸 *Gastos de hoy:*",
    showTotal: true,
  });
}

/** Thin wrapper: balance summary */
function formatBalance(data: { total_gastos: number; total_ingresos: number; balance: number }): string {
  const emoji = data.balance >= 0 ? "💰" : "⚠️";
  return `${emoji} *Balance:*\n\n`
    + `Ingresos: ${localeAmount(data.total_ingresos)}\n`
    + `Gastos: ${localeAmount(data.total_gastos)}\n`
    + `*Disponible:* ${localeAmount(data.balance)}`;
}

/** Thin wrapper: daily breakdown */
function formatResumenDiario(
  gastos: Array<{ amount: number; description?: string }>,
  ingresos: Array<{ amount: number; description?: string }>
): string {
  const today = new Date();
  const title = `📊 Resumen de HOY - ${today.getDate()} ${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`;
  const gastosConTipo = gastos.map(g => ({ ...g, type: "gasto" as TxType }));
  const ingresosConTipo = ingresos.map(i => ({ ...i, type: "ingreso" as TxType }));

  let msg = `${title}\n\n`;
  msg += `💵 INGRESOS:\n${formatTransactions(ingresosConTipo, { emptyMessage: "  No hay ingresos registrados" })}\n\n`;
  msg += `💸 GASTOS:\n${formatTransactions(gastosConTipo, { emptyMessage: "  No hay gastos registrados" })}`;

  const totalGastos = gastos.reduce((s, t) => s + t.amount, 0);
  const totalIngresos = ingresos.reduce((s, t) => s + t.amount, 0);
  const balance = totalIngresos - totalGastos;

  msg += `\n\n─────────────────────\n`;
  msg += `💵 Total ingresos: ${localeAmount(totalIngresos)}\n`;
  msg += `💸 Total gastos: ${localeAmount(totalGastos)}\n`;
  msg += `${balance >= 0 ? "📈" : "📉"} Balance: ${localeAmount(balance)}`;

  return msg;
}

/** Thin wrapper: weekly breakdown by day */
function formatResumenSemanal(
  gastos: Array<{ amount: number; description?: string; transaction_date?: string }>,
  ingresos: Array<{ amount: number; description?: string; transaction_date?: string }>
): string {
  const all = [
    ...gastos.map(g => ({ ...g, type: "gasto" as TxType })),
    ...ingresos.map(i => ({ ...i, type: "ingreso" as TxType })),
  ];
  return formatTransactions(all, {
    title: "📊 *Resumen de la SEMANA*",
    groupByDay: true,
    showBalance: true,
    emptyMessage: "No hay transacciones esta semana.",
  });
}

/** Thin wrapper: monthly breakdown by day */
function formatResumenMensual(
  gastos: Array<{ amount: number; description?: string; transaction_date?: string }>,
  ingresos: Array<{ amount: number; description?: string; transaction_date?: string }>
): string {
  const today = new Date();
  const monthName = MONTH_NAMES[today.getMonth()];
  const all = [
    ...gastos.map(g => ({ ...g, type: "gasto" as TxType })),
    ...ingresos.map(i => ({ ...i, type: "ingreso" as TxType })),
  ];
  return formatTransactions(all, {
    title: `📊 *Resumen de ${monthName} ${today.getFullYear()}`,
    groupByDay: true,
    maxDays: MAX_DAYS_TO_SHOW,
    showBalance: true,
    emptyMessage: "No hay transacciones este mes.",
  });
}

function getSaludo(): string {
  const saludos = [
    "¡Hola! 👋 Soy FinBot, tu asistente financiero.",
    "¡Hey! 😄 ¿En qué te puedo ayudar hoy?",
    "¡Buen día! 💵 ¿Qué necesitas?",
  ];
  return saludos[Math.floor(Math.random() * saludos.length)];
}

function getAyuda(): string {
  return `* comandos disponibles:*

/menu - Abrir menú principal
/gasto - Registrar un gasto
/ingreso - Registrar un ingreso
/balance - Ver mi balance
/reporte - Ver reporte mensual

También podés hablarme naturalmente:
- "Gasté 25k en almuerzo"
- "¿Cuánto gasté hoy?"
- "¿Cuánto tengo?"`;
}

// =============================================================================
// PARSE INTENT
// =============================================================================

async function detectIntent(message: string): Promise<Intent> {
  try {
    const client = getGroqClient();
    
    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      model: "llama-3.1-8b-instant",
      ...GROQ_INTENT_CONFIG,
    });
    
    const intent = completion.choices[0]?.message?.content?.trim().toLowerCase();
    
    // Mapear a tipo válido
    const intentMap: Record<string, Intent> = {
      "registrar_gasto": "registrar_gasto",
      "registrar_ingreso": "registrar_ingreso",
      "consultar_gastos_hoy": "consultar_gastos_hoy",
      "consultar_gastos_ayer": "consultar_gastos_ayer",
      "consultar_gastos_semana": "consultar_gastos_semana",
      "consultar_gastos_mes": "consultar_gastos_mes",
      "consultar_balance": "consultar_balance",
      "consultar_balance_mes": "consultar_balance_mes",
      "consultar_por_categoria": "consultar_por_categoria",
      "resumen_diario": "resumen_diario",
      "resumen_semanal": "resumen_semanal",
      "saludar": "saludar",
      "ayuda": "ayuda",
      "desconocido": "desconocido",
    };
    
    return intentMap[intent || ""] || "desconocido";
  } catch (error) {
    console.error("Error detecting intent:", error);
    return "desconocido";
  }
}

// =============================================================================
// EXECUTE ACTION
// =============================================================================

export interface AgentResponse {
  message: string;
  intent: Intent;
  requiresConfirmation?: boolean;
  data?: {
    tipo?: "gasto" | "ingreso";
    monto?: number;
    categoria?: string;
    categoriaId?: string;
    descripcion?: string;
  };
}

export async function runAgent(userMessage: string, userId: number): Promise<AgentResponse> {
  const safeMessage = userMessage.length > MAX_LOG_LENGTH 
    ? `${userMessage.substring(0, MAX_LOG_LENGTH)}...` 
    : userMessage;
  
  // Validar longitud del mensaje
  if (userMessage.length > MAX_MESSAGE_SIZE) {
    return {
      message: "El mensaje es demasiado largo. Intentá con algo más corto.",
      intent: "desconocido",
    };
  }
  
  const intent = await detectIntent(userMessage);
  console.log(`AI Intent: ${intent} | User: ${userId} | Msg: ${safeMessage}`);
  
  const client = getGroqClient();
  
  try {
    switch (intent) {
      case "saludar": {
        return { message: getSaludo(), intent };
      }
      
      case "ayuda": {
        return { message: getAyuda(), intent };
      }
      
      case "consultar_gastos_hoy": {
        const today = getBogotaDateString();
        const gastos = await transactionRepository.findByUserId(userId, {
          type: "gasto",
          dateFrom: today,
          dateTo: today,
        });
        
        return { 
          message: formatGastos(gastos), 
          intent 
        };
      }
      
      case "consultar_gastos_ayer": {
        const today = new Date();
        today.setDate(today.getDate() - 1);
        const yesterdayStr = today.toISOString().split("T")[0];
        
        const gastos = await transactionRepository.findByUserId(userId, {
          type: "gasto",
          dateFrom: yesterdayStr,
          dateTo: yesterdayStr,
        });
        
        return { 
          message: formatGastos(gastos), 
          intent 
        };
      }
      
      case "consultar_gastos_mes": {
        const today = getBogotaDateString();
        const firstDay = new Date();
        firstDay.setDate(1);
        const firstDayStr = firstDay.toISOString().split("T")[0];
        
        const gastos = await transactionRepository.findByUserId(userId, {
          type: "gasto",
          dateFrom: firstDayStr,
          dateTo: today,
        });
        
        return { 
          message: formatGastos(gastos), 
          intent 
        };
      }
      
      case "consultar_gastos_semana": {
        const today = new Date();
        const weekAgo = new Date(today.getTime() - MS_PER_WEEK);
        
        const gastos = await transactionRepository.findByUserId(userId, {
          type: "gasto",
          dateFrom: weekAgo.toISOString().split("T")[0],
          dateTo: today.toISOString().split("T")[0],
        });
        
        return { 
          message: formatGastos(gastos), 
          intent 
        };
      }
      
      case "consultar_balance": {
        const today = getBogotaDateString();
        
        const [gastos, ingresos] = await Promise.all([
          transactionRepository.findByUserId(userId, { 
            type: "gasto", 
            dateFrom: today, 
            dateTo: today 
          }),
          transactionRepository.findByUserId(userId, { 
            type: "ingreso", 
            dateFrom: today, 
            dateTo: today 
          }),
        ]);
        
        const totalGastos = gastos.reduce((sum, t) => sum + t.amount, 0);
        const totalIngresos = ingresos.reduce((sum, t) => sum + t.amount, 0);
        
        // Si no hay transacciones hoy, buscar las últimas
        if (gastos.length === 0 && ingresos.length === 0) {
          const ultimasTransacciones = await transactionRepository.findByUserId(userId, { limit: DEFAULT_RECENT_LIMIT });
          if (ultimasTransacciones.length > 0) {
            return { 
              message: "No hay transacciones registradas HOY. "
                + "Tu última transacción fue: " 
                + `${ultimasTransacciones[0].type === "gasto" ? "💸" : "💵"} $${ultimasTransacciones[0].amount.toLocaleString("es-CL")} ${ultimasTransacciones[0].description ? `- ${ultimasTransacciones[0].description}` : ""}`,
              intent 
            };
          }
        }
        
        return { 
          message: formatBalance({ total_gastos: totalGastos, total_ingresos: totalIngresos, balance: totalIngresos - totalGastos }), 
          intent 
        };
      }
      
      case "consultar_balance_mes": {
        const today = getBogotaDateString();
        const firstDay = new Date();
        firstDay.setDate(1);
        const firstDayStr = firstDay.toISOString().split("T")[0];
        
        const [gastos, ingresos] = await Promise.all([
          transactionRepository.findByUserId(userId, { 
            type: "gasto", 
            dateFrom: firstDayStr, 
            dateTo: today
          }),
          transactionRepository.findByUserId(userId, { 
            type: "ingreso", 
            dateFrom: firstDayStr, 
            dateTo: today
          }),
        ]);
        
        // Usar el formato de resumen mensual que lista todas las transacciones
        return { 
          message: formatResumenMensual(gastos, ingresos), 
          intent 
        };
      }
      
      case "resumen_diario": {
        const today = getBogotaDateString();
        
        const [gastos, ingresos] = await Promise.all([
          transactionRepository.findByUserId(userId, { 
            type: "gasto", 
            dateFrom: today, 
            dateTo: today 
          }),
          transactionRepository.findByUserId(userId, { 
            type: "ingreso", 
            dateFrom: today, 
            dateTo: today 
          }),
        ]);
        
        return { 
          message: formatResumenDiario(gastos, ingresos), 
          intent 
        };
      }
      
      case "resumen_semanal": {
        const today = new Date();
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const [gastos, ingresos] = await Promise.all([
          transactionRepository.findByUserId(userId, { 
            type: "gasto", 
            dateFrom: weekAgo.toISOString().split("T")[0], 
            dateTo: today.toISOString().split("T")[0] 
          }),
          transactionRepository.findByUserId(userId, { 
            type: "ingreso", 
            dateFrom: weekAgo.toISOString().split("T")[0], 
            dateTo: today.toISOString().split("T")[0] 
          }),
        ]);
        
        return { 
          message: formatResumenSemanal(gastos, ingresos), 
          intent 
        };
      }
      
      case "consultar_por_categoria": {
        const today = new Date();
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const gastos = await transactionRepository.findByUserId(userId, {
          type: "gasto",
          dateFrom: weekAgo.toISOString().split("T")[0],
          dateTo: today.toISOString().split("T")[0],
        });
        
        // Agrupar por categoría
        const grouped: Record<string, number> = {};
        for (const t of gastos) {
          const cat = t.category_id || "otros";
          grouped[cat] = (grouped[cat] || 0) + t.amount;
        }
        
        const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) {
          return { message: "No hay gastos esta semana.", intent };
        }
        
        const total = entries.reduce((s, [, v]) => s + v, 0);
        const lines = entries.map(([cat, amount]) => {
          const pct = ((amount / total) * 100).toFixed(1);
          return `${cat}: $${amount.toLocaleString("es-CL")} (${pct}%)`;
        });
        
        return { 
          message: `📊 *Gastos por categoría (semana):*\n\n${lines.join("\n")}`, 
          intent 
        };
      }
      
      case "registrar_gasto":
      case "registrar_ingreso": {
        // Usar NLP para extraer detalles
        const { parseTransactionMessage } = await import("./nlp-parser");
        const parsed = await parseTransactionMessage(userMessage);
        
        const tipo = intent === "registrar_gasto" ? "gasto" : "ingreso";
        
        // Usar categorizer para clasificar automáticamente
        let categoria: string = "otros";
        let categoriaBD = null;
        try {
          const categoriaObj = await categorize(userId, parsed.descripcion || userMessage, tipo);
          categoria = categoriaObj.name;
          categoriaBD = categoriaObj;
        } catch (error) {
          console.error("Error categorizing:", error);
          // Fallback a "otros"
          categoria = tipo === "gasto" ? "otros" : "otro";
        }
        
        return {
          message: `¿Confirmás este ${tipo}?\n\n`
            + `💰 Monto: $${parsed.monto.toLocaleString("es-CL")}\n`
            + `📝 Descripción: ${parsed.descripcion || userMessage}\n`
            + `🏷️ Categoría: ${categoria}\n\n`
            + `Si está correcto, decí "sí" o "confirmar"`,
          intent,
          requiresConfirmation: true,
          data: {
            tipo,
            monto: parsed.monto,
            descripcion: parsed.descripcion,
            categoria,
            categoriaId: categoriaBD?.id,
          },
        };
      }
      
      case "desconocido": {
        return {
          message: "No entendí tu mensaje. ¿Podés reformularlo o usar /menu para comenzar?",
          intent,
        };
      }
      
      default: {
        return {
          message: "Algo salió mal. Probá usar /menu para comenzar.",
          intent: "desconocido",
        };
      }
    }
  } catch (error) {
    console.error(`AI Agent error (user ${userId}):`, error);
    return {
      message: "Tuve un problema al procesar tu solicitud. Probá de nuevo.",
      intent: "desconocido",
    };
  }
}

// =============================================================================
// CONFIRM TRANSACTION (para usar después de intent)
// =============================================================================

export async function confirmarTransaccion(
  userId: number,
  tipo: "gasto" | "ingreso",
  monto: number,
  descripcion?: string,
  categoryId?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await transactionRepository.create({
      user_id: userId,
      type: tipo,
      amount: monto,
      description: descripcion,
      category_id: categoryId,
    });
    
    return {
      success: true,
      message: `✅ ${tipo === "gasto" ? "Gasto" : "Ingreso"} registrado: $${monto.toLocaleString("es-CL")}`,
    };
  } catch (error) {
    console.error("Confirm error:", error);
    return {
      success: false,
      message: "❌ Error al registrar. Probá de nuevo.",
    };
  }
}