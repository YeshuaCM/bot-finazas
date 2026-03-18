import { startBot } from '../src/bot';
import { generateMonthlyReport, formatReportForTelegram } from '../src/services/reporter';
import { Api } from 'grammy';
import { config } from '../src/config';

const sendMonthlyReport = async (telegramId: number) => {
  // Inicializar bot
  const bot = new Api(config.telegram.botToken);
  
  const now = new Date();
  const report = await generateMonthlyReport(
    telegramId,
    now.getMonth() + 1,
    now.getFullYear()
  );
  
  const formatted = formatReportForTelegram(report);
  
  await bot.sendMessage(telegramId, formatted, { parse_mode: 'Markdown' });
  
  console.log(`Report sent to ${telegramId}`);
};

// Usage: npx ts-node scripts/send-report.ts 123456789
const telegramId = parseInt(process.argv[2]);

if (!telegramId) {
  console.log('Usage: npx ts-node scripts/send-report.ts <telegram_id>');
  process.exit(1);
}

sendMonthlyReport(telegramId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
