import Groq from "groq-sdk";
import { config } from "../config";
import { transactionRepository } from "../data/repositories/transaction.repository";
import { categoryRepository } from "../data/repositories/category.repository";

// =============================================================================
// INTENTS DEFINITION
// =============================================================================

type Intent = 
  | "registrar_gasto"
  | "registrar_ingreso"
  | "consultar_gastos_hoy"
  | "consultar_gastos_semana"
  | "consultar_balance"
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
- "registrar_ingreso": Cuando el usuario quiere registrar un ingreso (recibí, me pagaron, gané, etc.)
- "consultar_gastos_hoy": Pregunta sobre gastos de HOY (cuánto gasté hoy, qué compré hoy)
- "consultar_gastos_semana": Pregunta sobre gastos de la semana
- "consultar_balance": Pregunta sobre cuánto tiene (balance, cuánto me queda, total)
- "consultar_por_categoria": Pregunta breakdown por categoría
- "saludar": Saludos (hola, buenas, hello, qué tal)
- "ayuda": Pide ayuda o comandos
- "desconocido": No sabes qué quiere

Responde SOLO con el intent, nada más.`;

// =============================================================================
// RESPONSE TEMPLATES
// =============================================================================

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
  const client = getGroqClient();
  
  const completion = await client.chat.completions.create({
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
    model: "llama-3.1-8b-instant",
    temperature: 0.1,
    max_tokens: 50,
  });
  
  const intent = completion.choices[0]?.message?.content?.trim().toLowerCase();
  
  // Mapear a tipo válido
  const intentMap: Record<string, Intent> = {
    "registrar_gasto": "registrar_gasto",
    "registrar_ingreso": "registrar_ingreso",
    "consultar_gastos_hoy": "consultar_gastos_hoy",
    "consultar_gastos_semana": "consultar_gastos_semana",
    "consultar_balance": "consultar_balance",
    "consultar_por_categoria": "consultar_por_categoria",
    "saludar": "saludar",
    "ayuda": "ayuda",
    "desconocido": "desconocido",
  };
  
  return intentMap[intent || ""] || "desconocido";
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
  const intent = await detectIntent(userMessage);
  console.log("AI Intent detected:", intent, "message:", userMessage);
  
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
      
      case "consultar_gastos_semana": {
        const today = new Date();
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
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
          transactionRepository.findByUserId(userId, { type: "gasto", dateTo: today }),
          transactionRepository.findByUserId(userId, { type: "ingreso", dateTo: today }),
        ]);
        
        const totalGastos = gastos.reduce((sum, t) => sum + t.amount, 0);
        const totalIngresos = ingresos.reduce((sum, t) => sum + t.amount, 0);
        
        return { 
          message: formatBalance({ total_gastos: totalGastos, total_ingresos: totalIngresos, balance: totalIngresos - totalGastos }), 
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
    console.error("AI Agent error:", error);
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