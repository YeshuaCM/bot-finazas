import { InlineKeyboard } from 'grammy';

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
  const categories = type === 'gasto' 
    ? [
        ['🍔 Comida', 'cat_comida'],
        ['🚗 Transporte', 'cat_transporte'],
        ['🛒 Mercado', 'cat_mercado'],
        ['💡 Servicios', 'cat_servicios'],
        ['💊 Salud', 'cat_salud'],
        ['🎬 Entretenimiento', 'cat_entretenimiento'],
        ['📚 Educación', 'cat_educacion'],
        ['📦 Otros', 'cat_otros'],
      ]
    : [
        ['💰 Salario', 'cat_salario'],
        ['💻 Freelance', 'cat_freelance'],
        ['📈 Inversión', 'cat_inversion'],
        ['🎁 Regalo', 'cat_regalo'],
        ['💵 Otro', 'cat_otro'],
      ];
  
  const keyboard = new InlineKeyboard();
  
  categories.forEach(([label, callback]) => {
    keyboard.text(label, callback).row();
  });
  
  return keyboard;
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
