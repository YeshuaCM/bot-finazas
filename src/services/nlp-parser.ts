import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import type { ParsedTransaction } from "../types";

// =============================================================================
// CONSTANTES - Keywords para categorización
// =============================================================================

const CATEGORIES = {
  // Categorías de GASTO
  comida: [
    "comida", "almuerzo", "cena", "desayuno", "restaurante", "pizza", 
    "hamburguesa", "queso", "pan", "leche", "carne", "pollo", "pescado",
    "empanada", "sándwich", "torta", "fruta", "verdura", "huevo", "café"
  ],
  transporte: [
    "taxi", "uber", "lyft", "transporte", "combustible", "nafta", "gasolina",
    "bencina", "camión", "metro", "bus", "colectivo", "pasaje", "tiquete"
  ],
  servicios: [
    "internet", "luz", "agua", "teléfono", "celular", "netflix", "spotify",
    "amazon", "servicio", "mantenimiento", "arriendo"
  ],
  mercado: [
    "mercado", "supermercado", "tienda", "bodega", "jumbo", "lider", "exito"
  ],
  salud: [
    "doctor", "médico", "medicamento", "hospital", "farmacia", "consulta", "clínica"
  ],
  entretenimiento: [
    "cine", "juego", "fiesta", "concierto", "bar", "gimnasio", "netflix", "spotify"
  ],
  educación: [
    "curso", "libro", "escuela", "universidad", "estudio", "carrera"
  ],
  // Categorías de INGRESO
  salario: [
    "salario", "sueldo", "pago", "nómina", "prima", "bonificación", "pagado"
  ],
  freelance: [
    "freelance", "freelance", "proyecto", "cliente", "consultoría"
  ],
  inversión: [
    "inversión", "rendimiento", "dividendo", "ganancia", "interés"
  ],
  regalo: ["regalo", "premio", "sorteo"],
};

// Keywords que indican que es un INGRESO
const INCOME_KEYWORDS = [
  "recibí", "recibido", "recibio", "me pagaron", "pagaron", "pago", 
  "transferencia", "depósito", "deposito", "ingreso", "gané", "gane"
];

// Categorías válidas por tipo de transacción
const VALID_CATEGORIES = {
  gasto: ["comida", "transporte", "servicios", "mercado", "salud", "entretenimiento", "educación", "otros"],
  ingreso: ["salario", "freelance", "inversión", "regalo", "otro"]
};

// =============================================================================
// PROMPT PARA GEMINI
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
// CLIENTE GEMINI
// =============================================================================

let genAI: GoogleGenerativeAI;

const getGenAI = () => {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return genAI;
};

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
 * Detecta la categoría basándose en keywords
 */
function detectCategory(message: string, tipo: 'gasto' | 'ingreso'): string {
  const lower = message.toLowerCase();
  const validCats = VALID_CATEGORIES[tipo];
  let bestMatch = 'otros';
  let maxLength = 0;

  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    // Solo buscar en categorías válidas para este tipo
    if (!validCats.includes(category)) continue;
    
    for (const keyword of keywords) {
      if (lower.includes(keyword) && keyword.length >= maxLength) {
        bestMatch = category;
        maxLength = keyword.length;
      }
    }
  }

  return bestMatch;
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
  const categoria = detectCategory(message, tipo);
  
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
    // Usar Gemini para interpretar
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const fullPrompt = `${NLP_SYSTEM_PROMPT}\n\nMensaje del usuario: "${message}"`;
    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();
    
    console.log('Gemini response:', responseText);

    // Parsear respuesta JSON
    const cleanedText = responseText
      .replace(/```json|```/g, "")
      .replace(/```/g, "")
      .trim();
    
    const parsed = JSON.parse(cleanedText);
    
    // Si la categoría es inválida o falta, usar categorizador local
    let categoria = parsed.categoria;
    const tipoKey = parsed.tipo as 'gasto' | 'ingreso';
    const validCats = VALID_CATEGORIES[tipoKey] || VALID_CATEGORIES.gasto;
    if (!categoria || !validCats.includes(categoria)) {
      console.log('Categoría inválida, usando categorizador local');
      categoria = detectCategory(message, parsed.tipo);
    }
    
    return {
      tipo: parsed.tipo,
      monto: Number(parsed.monto),
      categoria,
      descripcion: parsed.descripcion,
      confianza: parsed.confianza || 0.8,
      requiereConfirmacion: parsed.confianza < 0.7,
    };
    
  } catch (error) {
    // Fallback local si Gemini falla
    console.error('Gemini failed, using local parser:', error);
    return parseLocally(message);
  }
}

/**
 * Parsear monto de string (para input manual)
 */
export function parseAmount(amountStr: string): number {
  return extractAmount(amountStr);
}
