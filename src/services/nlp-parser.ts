import type { ParsedTransaction } from "../types";
import { VALID_CATEGORIES, detectCategoryByKeyword } from "../data/categories";
import { getGroqClient } from "./groq-client";

// Keywords que indican que es un INGRESO
const INCOME_KEYWORDS = [
  "recibí", "recibido", "recibio", "me pagaron", "pagaron", "pago", 
  "transferencia", "depósito", "deposito", "ingreso", "gané", "gane"
];

// =============================================================================
// PROMPT PARA GROQ
// =============================================================================

const NLP_SYSTEM_PROMPT = `Eres un asistente financiero personal. 
Tu tarea es extraer información de transacciones de mensajes en español.

REGLAS:
1. Detecta si es un GASTO o INGRESO
2. Extrae el MONTO (acepta: 25000, 25k, 25.000, $25.000, 25mil)
3. Infiere la CATEGORÍA basándote en palabras clave
4. Genera una DESCRIPCIÓN corta

CATEGORÍAS DE GASTO: comida, transporte, servicios, mercado, salud, entretenimiento, educación, otros
CATEGORÍAS DE INGRESO: salario, freelance, inversión, regalo, otro

Ejemplos:
- "Compré almuerzo 25000" → {"tipo":"gasto","monto":25000,"categoria":"comida","descripcion":"almuerzo"}
- "Me pagaron 500000" → {"tipo":"ingreso","monto":500000,"categoria":"salario","descripcion":"pago"}
- "Gasté 20k en taxi" → {"tipo":"gasto","monto":20000,"categoria":"transporte","descripcion":"taxi"}

Responde SOLO con JSON válido, sin texto adicional.`;

// =============================================================================
// FUNCIONES AUXILIARES
// =============================================================================

/**
 * Detecta si el mensaje indica un ingreso basado en keywords
 */
function isIncomeMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return INCOME_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Extrae el monto del mensaje
 */
function extractAmount(message: string): number {
  const lower = message.toLowerCase();
  
  // Primero buscar formato "k" o "mil" (ej: 5k, 5mil)
  const kMatch = lower.match(/(\d+)\s*(k|mil)/);
  if (kMatch) {
    return Number(kMatch[1]) * 1000;
  }
  
  // Buscar números normales (25000, 25.000, $25.000)
  const numMatch = message.match(/(\d+(?:[.,]\d+)*)/);
  if (numMatch) {
    let numStr = numMatch[1].replace(/\./g, '').replace(',', '.');
    return Number(numStr) || 0;
  }
  
  return 0;
}

/**
 * Parsing local (fallback cuando IA falla o para completar datos)
 */
function parseLocally(message: string): ParsedTransaction {
  const tipo = isIncomeMessage(message) ? 'ingreso' : 'gasto';
  const monto = extractAmount(message);
  const categoria = detectCategoryByKeyword(message, tipo);
  
  return {
    tipo,
    monto,
    categoria,
    descripcion: message.substring(0, 50),
    confianza: 0.3,
    requiereConfirmacion: true,
  };
}

// =============================================================================
// FUNCIÓN PRINCIPAL
// =============================================================================

export async function parseTransactionMessage(
  message: string,
): Promise<ParsedTransaction> {
  try {
    // Usar Groq para interpretar
    const client = getGroqClient();

    
    const fullPrompt = `${NLP_SYSTEM_PROMPT}\n\nMensaje del usuario: "${message}"`;
    
    const chatCompletion = await client.chat.completions.create({
      messages: [
        {
          role: "user",
          content: fullPrompt,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });
    
    const responseText = chatCompletion.choices[0]?.message?.content || "";
    
    console.log('Groq response:', responseText);

    // Parsear respuesta JSON
    const cleanedText = responseText
      .replace(/```json|```/g, "")
      .replace(/```/g, "")
      .trim();
    
    const parsed = JSON.parse(cleanedText);
    
    // Si el tipo es null/undefined, detectar localmente
    let tipo = parsed.tipo as 'gasto' | 'ingreso' | null;
    if (!tipo) {
      console.log('Tipo inválido, detectando localmente');
      tipo = isIncomeMessage(message) ? 'ingreso' : 'gasto';
    }
    
    // Si la categoría es inválida o falta, usar categorizador local
    let categoria = parsed.categoria;
    const validCats = VALID_CATEGORIES[tipo] || VALID_CATEGORIES.gasto;
    if (!categoria || !validCats.includes(categoria)) {
      console.log('Categoría inválida, usando categorizador local');
      categoria = detectCategoryByKeyword(message, tipo);
    }
    
    return {
      tipo,
      monto: Number(parsed.monto),
      categoria,
      descripcion: parsed.descripcion || message.substring(0, 50),
      confianza: parsed.confianza ?? 0.8,
      requiereConfirmacion: (parsed.confianza ?? 0.8) < 0.7,
    };
    
  } catch (error) {
    // Fallback local si Groq falla
    console.error('Groq failed, using local parser:', error);
    return parseLocally(message);
  }
}

/**
 * Parsear monto de string (para input manual)
 */
export function parseAmount(amountStr: string): number {
  return extractAmount(amountStr);
}
