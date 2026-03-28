// =============================================================================
// CATEGORÍAS CENTRALIZADAS
// =============================================================================
// Todas las definiciones de categorías en un solo lugar
// para evitar duplicación de código

export const CATEGORY_EMOJIS: Record<string, string> = {
  // Gastos
  comida: '🍔',
  transporte: '🚗',
  servicios: '💡',
  mercado: '🛒',
  salud: '💊',
  entretenimiento: '🎬',
  educación: '📚',
  diezmos: '⛪',
  ofrendas: '🕊️',
  otros: '📦',
  // Ingresos
  salario: '💰',
  freelance: '💻',
  inversión: '📈',
  regalo: '🎁',
  otro: '💵',
};

export const CATEGORIES_KEYWORDS: Record<string, string[]> = {
  // Gastos
  comida: [
    'comida', 'almuerzo', 'cena', 'desayuno', 'restaurante', 'pizza',
    'hamburguesa', 'queso', 'pan', 'leche', 'carne', 'pollo', 'pescado',
    'empanada', 'sándwich', 'torta', 'fruta', 'verdura', 'huevo', 'café'
  ],
  transporte: [
    'taxi', 'uber', 'lyft', 'transporte', 'combustible', 'nafta', 'gasolina',
    'bencina', 'camión', 'metro', 'bus', 'colectivo', 'pasaje', 'tiquete', 'avión'
  ],
  servicios: [
    'internet', 'luz', 'agua', 'teléfono', 'celular', 'netflix', 'spotify',
    'amazon', 'servicio', 'mantenimiento', 'arriendo'
  ],
  mercado: [
    'mercado', 'supermercado', 'tienda', 'bodega', 'jumbo', 'lider', 'exito'
  ],
  salud: [
    'doctor', 'médico', 'medicamento', 'hospital', 'farmacia', 'consulta', 'clínica'
  ],
  entretenimiento: [
    'cine', 'juego', 'fiesta', 'concierto', 'bar', 'gimnasio', 'netflix', 'spotify'
  ],
  educación: [
    'curso', 'libro', 'escuela', 'universidad', 'estudio', 'carrera'
  ],
  diezmos: [
    'diezmo', 'diezmos', 'diezma', 'ofrenda', 'ofrendas', 'iglesia', 'oferta'
  ],
  ofrendas: [
    'ofrenda', 'ofrendas', 'oferta', 'ofertario', 'donación', 'donacion', 'iglesia'
  ],
  otros: ['otro', 'otros', 'varios', 'misc'],
  // Ingresos
  salario: [
    'salario', 'sueldo', 'pago', 'nómina', 'prima', 'bonificación', 'pagado', 'payroll'
  ],
  freelance: [
    'freelance', 'freelance', 'proyecto', 'cliente', 'consultoría', 'contrato'
  ],
  inversión: [
    'inversión', 'rendimiento', 'dividendo', 'ganancia', 'interés'
  ],
  regalo: ['regalo', 'premio', 'sorteo', 'bono'],
  otro: ['otro', 'ingreso', 'extra'],
};

export const VALID_CATEGORIES = {
  gasto: [
    'comida', 'transporte', 'servicios', 'mercado', 'salud', 
    'entretenimiento', 'educación', 'diezmos', 'ofrendas', 'otros'
  ],
  ingreso: ['salario', 'freelance', 'inversión', 'regalo', 'otro'],
};

export const EXPENSE_CATEGORIES = VALID_CATEGORIES.gasto;
export const INCOME_CATEGORIES = VALID_CATEGORIES.ingreso;

// =============================================================================
// UTILIDADES
// =============================================================================

export function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJIS[category] || '📦';
}

export function getCategoriesForType(type: 'gasto' | 'ingreso'): Array<{ name: string; emoji: string }> {
  const categories = type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  return categories.map(name => ({
    name,
    emoji: getCategoryEmoji(name),
  }));
}

export function detectCategoryByKeyword(message: string, type: 'gasto' | 'ingreso'): string {
  const lower = message.toLowerCase();
  const validCats = VALID_CATEGORIES[type];
  let bestMatch = type === 'gasto' ? 'otros' : 'otro';
  let maxLength = 0;

  for (const [category, keywords] of Object.entries(CATEGORIES_KEYWORDS)) {
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
