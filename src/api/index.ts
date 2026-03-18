import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { config } from "../config";
import transactionsRouter from "./routes/transactions";
import balanceRouter from "./routes/balance";
import reportsRouter from "./routes/reports";
import webhookRouter from "./routes/webhook";

const app: Express = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
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
