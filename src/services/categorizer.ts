import { categoryRepository } from '../data/repositories/category.repository';
import type { Category } from '../types';

const DEFAULT_CATEGORIES: Record<string, string[]> = {
  comida: ['almuerzo', 'cena', 'desayuno', 'comida', 'restaurante', 'pizza', 'hamburguesa', 'sándwich', 'café'],
  transporte: ['taxi', 'uber', 'lyft', 'transporte', 'combustible', 'nafta', 'gasolina', 'camión', 'metro', 'bus', 'avión'],
  servicios: ['internet', 'luz', 'agua', 'teléfono', 'celular', 'netflix', 'spotify', 'netflix', 'amazon', 'servicio'],
  mercado: ['mercado', 'supermercado', 'tienda', 'bodega', 'compras', 'mercadería'],
  salud: ['doctor', 'médico', 'medicamento', 'hospital', 'clínica', 'salud', 'farmacia', 'psicólogo'],
  entretenimiento: ['cine', 'juego', 'fiesta', 'concierto', 'evento', 'bar', 'pub'],
  educación: ['curso', 'libro', 'escuela', 'universidad', 'educación', 'estudio', 'carrera'],
  otros: ['otro', 'otros', 'varios', 'misc'],
};

const INCOME_CATEGORIES: Record<string, string[]> = {
  salary: ['salario', 'sueldo', 'pago', 'nómina', 'payroll'],
  freelance: ['freelance', 'proyecto', 'cliente', 'contrato'],
  inversión: ['inversión', 'rendimiento', 'dividendo', 'interés', 'ganancia'],
  regalo: ['regalo', 'premio', 'bono'],
  otro: ['otro', 'ingreso', 'extra'],
};

export async function categorize(
  userId: number,
  text: string,
  type: 'gasto' | 'ingreso'
): Promise<Category> {
  const lowerText = text.toLowerCase();
  
  // Buscar en categorías por defecto del usuario
  const userCategories = await categoryRepository.findByUserId(userId, type);
  
  // Buscar coincidencia por palabras clave
  const categoryMap = type === 'gasto' ? DEFAULT_CATEGORIES : INCOME_CATEGORIES;
  
  for (const [categoryName, keywords] of Object.entries(categoryMap)) {
    if (keywords.some(k => lowerText.includes(k))) {
      // Buscar categoría en DB
      const dbCategory = userCategories.find(c => 
        c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (dbCategory) return dbCategory;
    }
  }
  
  // Devolver categoría por defecto
  const defaultCategory = userCategories.find(c => c.is_default && c.name === (type === 'gasto' ? 'otros' : 'otro'));
  if (defaultCategory) return defaultCategory;
  
  // Si no hay en DB, crear objeto temporal
  return {
    id: '',
    name: type === 'gasto' ? 'otros' : 'otro',
    type,
    emoji: type === 'gasto' ? '📦' : '💵',
    is_default: true,
  };
}

export function getDefaultCategories(type: 'gasto' | 'ingreso'): Array<{ name: string; emoji: string }> {
  const categories = type === 'gasto' 
    ? DEFAULT_CATEGORIES 
    : INCOME_CATEGORIES;
  
  return Object.entries(categories).map(([name, _]) => ({
    name,
    emoji: type === 'gasto' ? getEmoji(name) : '💰',
  }));
}

function getEmoji(category: string): string {
  const emojis: Record<string, string> = {
    comida: '🍔',
    transporte: '🚗',
    servicios: '💡',
    mercado: '🛒',
    salud: '💊',
    entretenimiento: '🎬',
    educación: '📚',
    otros: '📦',
  };
  return emojis[category] || '📦';
}
