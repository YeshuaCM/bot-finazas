import { InlineKeyboard } from 'grammy';
import { getCategoriesForType } from '../data/categories';

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text('💰 Registrar Gasto', 'action_gasto')
    .text('💵 Registrar Ingreso', 'action_ingreso')
    .row()
    .text('📊 Mi Balance', 'action_balance')
    .text('📈 Reporte Mensual', 'action_reporte')
    .row()
    .text('❓ Ayuda', 'action_help');
}

export function categoryKeyboard(type: 'gasto' | 'ingreso') {
  const categories = getCategoriesForType(type);
  
  const keyboard = new InlineKeyboard();
  
  categories.forEach(({ name, emoji }) => {
    const callback = `cat_${name}`;
    const label = `${emoji} ${capitalize(name)}`;
    keyboard.text(label, callback).row();
  });
  
  return keyboard;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function confirmKeyboard() {
  return new InlineKeyboard()
    .text('✅ Confirmar', 'confirm_yes')
    .text('❌ Cancelar', 'confirm_no');
}

export function amountKeyboard() {
  return new InlineKeyboard()
    .text('❌ Cancelar', 'amount_cancel');
}
