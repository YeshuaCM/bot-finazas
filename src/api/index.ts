import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "../config";
import { apiKeyAuth } from "./middleware/auth";
import transactionsRouter from "./routes/transactions";
import balanceRouter from "./routes/balance";
import reportsRouter from "./routes/reports";
import webhookRouter from "./routes/webhook";

const app: Express = express();

// Trust proxy (Fly.io, render, etc. — necesario para rate limiter detrás de proxy)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.api.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en un minuto." },
});
app.use("/api", apiLimiter);

// API Key authentication (except health check)
app.use("/api", apiKeyAuth);

// Health check (public, no auth required)
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rutas API
app.use("/api/transactions", transactionsRouter);
app.use("/api/balance", balanceRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/webhook", webhookRouter);

// Error handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("API Error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Iniciar servidor
const PORT = config.server.port;

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

export { app, startServer };
