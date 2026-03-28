import { categoryRepository } from '../data/repositories/category.repository';
import type { Category } from '../types';
import { CATEGORIES_KEYWORDS, getCategoryEmoji, getCategoriesForType, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../data/categories';

export async function categorize(
  userId: number,
  text: string,
  type: 'gasto' | 'ingreso'
): Promise<Category> {
  const lowerText = text.toLowerCase();
  
  // Buscar en categorías por defecto del usuario
  const userCategories = await categoryRepository.findByUserId(userId, type);
  
  // Buscar coincidencia por palabras clave
  const categoryMap = type === 'gasto' ? CATEGORIES_KEYWORDS : CATEGORIES_KEYWORDS;
  
  for (const [categoryName, keywords] of Object.entries(categoryMap)) {
    // Solo buscar en categorías válidas para este tipo
    const validCats = type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    if (!validCats.includes(categoryName)) continue;
    
    if (keywords.some((k: string) => lowerText.includes(k))) {
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
    emoji: getCategoryEmoji(type === 'gasto' ? 'otros' : 'otro'),
    is_default: true,
  };
}

export function getDefaultCategories(type: 'gasto' | 'ingreso'): Array<{ name: string; emoji: string }> {
  return getCategoriesForType(type);
}
