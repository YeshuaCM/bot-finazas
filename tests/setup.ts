// Setup file for Jest tests
// Mock environment variables
process.env.TELEGRAM_BOT_TOKEN = 'test_token';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test_key';
process.env.GEMINI_API_KEY = 'test_gemini_key';
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
