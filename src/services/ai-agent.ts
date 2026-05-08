import Groq from "groq-sdk";
import { config } from "../config";
import { transactionRepository } from "../data/repositories/transaction.repository";

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
// RESPONSE TEMPLATES
// =============================================================================

interface TransactionWithTime {
  amount: number;
  description?: string;
  created_at?: string;
  transaction_date?: string;
}

/**
 * Extrae la hora de una transacción desde created_at
 * @returns Formato HH:MM o "--:--" si no hay fecha
 */
function extractTime(createdAt?: string): string {
  if (!createdAt) return "--:--";
  try {
    const date = new Date(createdAt);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  } catch {
    return "--:--";
  }
}

/**
 * Formatea una transacción individual con hora
 */
function formatTransactionLine(
  transaction: TransactionWithTime,
  type: "gasto" | "ingreso"
): string {
  const time = extractTime(transaction.created_at);
  const emoji = type === "gasto" ? "•" : "•";
  return `${time} - $${transaction.amount.toLocaleString("es-CL")}${transaction.description ? ` (${transaction.description})` : ""}`;
}

/**
 * Formatea lista de transacciones con hora (para ingresos o gastos)
 */
function formatTransactionList(
  transactions: TransactionWithTime[],
  type: "gasto" | "ingreso"
): string {
  if (transactions.length === 0) {
    return type === "gasto" ? "No hay gastos registrados." : "No hay ingresos registrados.";
  }

  const lines = transactions.map((t) => formatTransactionLine(t, type));
  return lines.join("\n");
}

/**
 * Formatea lista de transacciones (genérica para cualquier tipo)
 * Útil para resúmenes cuando se mezclan ingresos y gastos
 */
function formatTransactions(
  transactions: Array<TransactionWithTime & { type: "gasto" | "ingreso" }>
): string {
  if (transactions.length === 0) {
    return "No hay transacciones registradas.";
  }

  const lines = transactions.map((t) => {
    const emoji = t.type === "gasto" ? "💸" : "💵";
    const time = extractTime(t.created_at);
    return `${emoji} ${time} - $${t.amount.toLocaleString("es-CL")}${t.description ? ` (${t.description})` : ""}`;
  });

  return lines.join("\n");
}

function formatGastos(transactions: Array<{ amount: number; description?: string }>): string {
  if (transactions.length === 0) {
    return "No tienes gastos registrados hoy.";
  }
  
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  const lines = transactions.map(t => 
    `• $${t.amount.toLocaleString("es-CL")}${t.description ? ` - ${t.description}` : ""}`
  );
  
  return `💸 *Gastos de hoy:*\n\n${lines.join("\n")}\n\n*Total:* $${total.toLocaleString("es-CL")}`;
}

function formatBalance(data: { total_gastos: number; total_ingresos: number; balance: number }): string {
  const emoji = data.balance >= 0 ? "💰" : "⚠️";
  return `${emoji} *Balance:*\n\n`
    + `Ingresos: $${data.total_ingresos.toLocaleString("es-CL")}\n`
    + `Gastos: $${data.total_gastos.toLocaleString("es-CL")}\n`
    + `*Disponible:* $${data.balance.toLocaleString("es-CL")}`;
}

/**
 * Formatea resumen diario con TODAS las transacciones listadas con hora
 */
function formatResumenDiario(
  gastos: Array<{ amount: number; description?: string; created_at?: string }>,
  ingresos: Array<{ amount: number; description?: string; created_at?: string }>
): string {
  const totalGastos = gastos.reduce((sum, t) => sum + t.amount, 0);
  const totalIngresos = ingresos.reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIngresos - totalGastos;

  const today = new Date();
  const day = today.getDate();
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const month = monthNames[today.getMonth()];
  const year = today.getFullYear();

  let mensaje = `📊 Resumen de HOY - ${day} ${month} ${year}\n\n`;

  // Sección de INGRESOS
  mensaje += `💵 INGRESOS:\n`;
  if (ingresos.length === 0) {
    mensaje += `  No hay ingresos registrados\n`;
  } else {
    // Ordenar por hora (más reciente primero)
    const sortedIngresos = [...ingresos].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
    sortedIngresos.forEach(i => {
      mensaje += `  • ${formatTransactionLine(i, "ingreso")}\n`;
    });
  }

  mensaje += `\n💸 GASTOS:\n`;
  if (gastos.length === 0) {
    mensaje += `  No hay gastos registrados\n`;
  } else {
    // Ordenar por hora (más reciente primero)
    const sortedGastos = [...gastos].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
    sortedGastos.forEach(g => {
      mensaje += `  • ${formatTransactionLine(g, "gasto")}\n`;
    });
  }

  mensaje += `\n─────────────────────\n`;
  mensaje += `💵 Total ingresos: $${totalIngresos.toLocaleString("es-CL")}\n`;
  mensaje += `💸 Total gastos: $${totalGastos.toLocaleString("es-CL")}\n`;

  const emojiBalance = balance >= 0 ? "📈" : "📉";
  mensaje += `${emojiBalance} Balance: $${balance.toLocaleString("es-CL")}`;

  return mensaje;
}

/**
 * Formatea resumen semanal con TODAS las transacciones agrupadas por día
 */
function formatResumenSemanal(
  gastos: Array<{ amount: number; description?: string; transaction_date?: string; created_at?: string }>,
  ingresos: Array<{ amount: number; description?: string; transaction_date?: string; created_at?: string }>
): string {
  const totalGastos = gastos.reduce((sum, t) => sum + t.amount, 0);
  const totalIngresos = ingresos.reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIngresos - totalGastos;

  let mensaje = `📊 *Resumen de la SEMANA*\n\n`;

  // Combinar todas las transacciones para agrupar por día
  const allTransactions = [
    ...gastos.map((g) => ({ ...g, type: "gasto" as const })),
    ...ingresos.map((i) => ({ ...i, type: "ingreso" as const })),
  ];

  if (allTransactions.length === 0) {
    mensaje += `No hay transacciones esta semana.`;
    return mensaje;
  }

  // Agrupar por día (transaction_date)
  const byDay: Record<string, typeof allTransactions> = {};
  for (const t of allTransactions) {
    const day = t.transaction_date || "sin fecha";
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(t);
  }

  // Ordenar días cronológicamente
  const sortedDays = Object.keys(byDay).sort();

  // Formatear cada día
  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  for (const day of sortedDays) {
    const transactions = byDay[day];
    const dayDate = new Date(day);
    const dayName = dayNames[dayDate.getDay()];
    const dayNum = dayDate.getDate();
    const month = dayDate.getMonth() + 1;

    const dayTotalGastos = transactions
      .filter((t) => t.type === "gasto")
      .reduce((sum, t) => sum + t.amount, 0);
    const dayTotalIngresos = transactions
      .filter((t) => t.type === "ingreso")
      .reduce((sum, t) => sum + t.amount, 0);

    mensaje += `📅 ${dayName} ${dayNum}/${month}\n`;
    mensaje += `─────────────────────\n`;

    // Ordenar transacciones por hora dentro del día
    const sortedByTime = [...transactions].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });

    for (const t of sortedByTime) {
      const emoji = t.type === "gasto" ? "💸" : "💵";
      const time = extractTime(t.created_at);
      mensaje += `${emoji} ${time} - $${t.amount.toLocaleString("es-CL")}${t.description ? ` (${t.description})` : ""}\n`;
    }

    mensaje += `\n💵 Ingresos: $${dayTotalIngresos.toLocaleString("es-CL")}  💸 Gastos: $${dayTotalGastos.toLocaleString("es-CL")}\n\n`;
  }

  // Totales de la semana
  mensaje += `─────────────────────\n`;
  mensaje += `💵 Total semana ingresos: $${totalIngresos.toLocaleString("es-CL")} (${ingresos.length} transacción${ingresos.length !== 1 ? "es" : ""})\n`;
  mensaje += `💸 Total semana gastos: $${totalGastos.toLocaleString("es-CL")} (${gastos.length} transacción${gastos.length !== 1 ? "es" : ""})\n`;

  const emojiBalance = balance >= 0 ? "📈" : "📉";
  mensaje += `${emojiBalance} Balance: $${balance.toLocaleString("es-CL")}`;

  return mensaje;
}

/**
 * Formatea resumen mensual con TODAS las transacciones agrupadas por día
 */
function formatResumenMensual(
  gastos: Array<{ amount: number; description?: string; transaction_date?: string; created_at?: string }>,
  ingresos: Array<{ amount: number; description?: string; transaction_date?: string; created_at?: string }>
): string {
  const totalGastos = gastos.reduce((sum, t) => sum + t.amount, 0);
  const totalIngresos = ingresos.reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIngresos - totalGastos;

  const today = new Date();
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const monthName = monthNames[today.getMonth()];

  let mensaje = `📊 *Resumen de ${monthName} ${today.getFullYear()}*\n\n`;

  // Combinar todas las transacciones para agrupar por día
  const allTransactions = [
    ...gastos.map((g) => ({ ...g, type: "gasto" as const })),
    ...ingresos.map((i) => ({ ...i, type: "ingreso" as const })),
  ];

  if (allTransactions.length === 0) {
    mensaje += `No hay transacciones este mes.`;
    return mensaje;
  }

  // Agrupar por día (transaction_date)
  const byDay: Record<string, typeof allTransactions> = {};
  for (const t of allTransactions) {
    const day = t.transaction_date || "sin fecha";
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(t);
  }

  // Ordenar días cronológicamente
  const sortedDays = Object.keys(byDay).sort().reverse(); // más recientes primero

  // Mostrar máximo días configurados para no exceder límites de mensaje
  const daysToShow = sortedDays.slice(0, MAX_DAYS_TO_SHOW);

  // Formatear cada día
  for (const day of daysToShow) {
    const transactions = byDay[day];
    const dayDate = new Date(day);
    const dayNum = dayDate.getDate();

    const dayTotalGastos = transactions
      .filter((t) => t.type === "gasto")
      .reduce((sum, t) => sum + t.amount, 0);
    const dayTotalIngresos = transactions
      .filter((t) => t.type === "ingreso")
      .reduce((sum, t) => sum + t.amount, 0);

    mensaje += `📅 ${dayNum}\n`;
    mensaje += `─────────────────────\n`;

    // Ordenar transacciones por hora dentro del día
    const sortedByTime = [...transactions].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });

    for (const t of sortedByTime) {
      const emoji = t.type === "gasto" ? "💸" : "💵";
      const time = extractTime(t.created_at);
      mensaje += `${emoji} ${time} - $${t.amount.toLocaleString("es-CL")}${t.description ? ` (${t.description})` : ""}\n`;
    }

    mensaje += `\n💵: $${dayTotalIngresos.toLocaleString("es-CL")}  💸: $${dayTotalGastos.toLocaleString("es-CL")}\n\n`;
  }

  if (sortedDays.length > MAX_DAYS_TO_SHOW) {
    mensaje += `... y ${sortedDays.length - MAX_DAYS_TO_SHOW} días más\n\n`;
  }

  // Totales del mes
  mensaje += `─────────────────────\n`;
  mensaje += `💵 Total mes ingresos: $${totalIngresos.toLocaleString("es-CL")} (${ingresos.length} transacción${ingresos.length !== 1 ? "es" : ""})\n`;
  mensaje += `💸 Total mes gastos: $${totalGastos.toLocaleString("es-CL")} (${gastos.length} transacción${gastos.length !== 1 ? "es" : ""})\n`;

  const emojiBalance = balance >= 0 ? "📈" : "📉";
  mensaje += `${emojiBalance} Balance: $${balance.toLocaleString("es-CL")}`;

  return mensaje;
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

let groqClient: Groq;

const getGroqClient = () => {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: config.groq.apiKey });
  }
  return groqClient;
};

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
        const today = new Date().toISOString().split("T")[0];
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
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];
        
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
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
          .toISOString().split("T")[0];
        
        const gastos = await transactionRepository.findByUserId(userId, {
          type: "gasto",
          dateFrom: firstDayOfMonth,
          dateTo: today.toISOString().split("T")[0],
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
        const today = new Date().toISOString().split("T")[0];
        
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
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
          .toISOString().split("T")[0];
        
        const [gastos, ingresos] = await Promise.all([
          transactionRepository.findByUserId(userId, { 
            type: "gasto", 
            dateFrom: firstDayOfMonth, 
            dateTo: today.toISOString().split("T")[0] 
          }),
          transactionRepository.findByUserId(userId, { 
            type: "ingreso", 
            dateFrom: firstDayOfMonth, 
            dateTo: today.toISOString().split("T")[0] 
          }),
        ]);
        
        // Usar el formato de resumen mensual que lista todas las transacciones
        return { 
          message: formatResumenMensual(gastos, ingresos), 
          intent 
        };
      }
      
      case "resumen_diario": {
        const today = new Date().toISOString().split("T")[0];
        
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
        
        return {
          message: `¿Confirmás este ${tipo}?\n\n`
            + `💰 Monto: $${parsed.monto.toLocaleString("es-CL")}\n`
            + `📝 Descripción: ${parsed.descripcion || userMessage}\n\n`
            + `Si está correcto, decí "sí" o "confirmar"`,
          intent,
          requiresConfirmation: true,
          data: {
            tipo,
            monto: parsed.monto,
            descripcion: parsed.descripcion,
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
  descripcion?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await transactionRepository.create({
      user_id: userId,
      type: tipo,
      amount: monto,
      description: descripcion,
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