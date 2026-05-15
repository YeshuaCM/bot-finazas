import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN es requerido"),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  SUPABASE_URL: z.string().url("SUPABASE_URL debe ser una URL válida"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY es requerido"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY es requerido"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  ALLOWED_USERS: z.string().optional(),
  API_KEY: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Error de validación de variables de entorno:");
  console.error(parsedEnv.error.flatten().fieldErrors);
  throw new Error("Faltan o son inválidas las variables de entorno requeridas");
}

const allowedUsers = parsedEnv.data.ALLOWED_USERS
  ? parsedEnv.data.ALLOWED_USERS.split(',').map(id => parseInt(id.trim(), 10))
  : null;

export const config = {
  telegram: {
    botToken: parsedEnv.data.TELEGRAM_BOT_TOKEN,
    webhookSecret: parsedEnv.data.TELEGRAM_WEBHOOK_SECRET,
  },
  supabase: {
    url: parsedEnv.data.SUPABASE_URL,
    anonKey: parsedEnv.data.SUPABASE_ANON_KEY,
    serviceRoleKey: parsedEnv.data.SUPABASE_SERVICE_ROLE_KEY,
  },
  groq: {
    apiKey: parsedEnv.data.GROQ_API_KEY,
  },
  server: {
    env: parsedEnv.data.NODE_ENV,
    port: parsedEnv.data.PORT,
  },
  api: {
    apiKey: parsedEnv.data.API_KEY,
    rateLimitMax: parsedEnv.data.RATE_LIMIT_MAX,
  },
  allowedUsers,
} as const;

export type Config = typeof config;
