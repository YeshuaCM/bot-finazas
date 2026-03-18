import { startServer } from './api';
import { startBot } from './bot';
import { config } from './config';

const start = async () => {
  console.log('🚀 Starting Financial Bot...');
  console.log(`Environment: ${config.server.env}`);
  console.log(`Port: ${config.server.port}`);
  
  // Iniciar servidor API
  startServer();
  
  // Iniciar bot
  startBot();
};

start().catch((error) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
