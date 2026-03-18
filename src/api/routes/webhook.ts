import { Router, Request, Response } from "express";
import { Bot, webhookCallback } from "grammy";
import { config } from "../../config";

const router = Router();

const bot = new Bot(config.telegram.botToken);

// Webhook de Telegram
router.post("/telegram", async (req: Request, res: Response) => {
  try {
    await webhookCallback(bot, "express", {
      secretToken: config.telegram.webhookSecret,
    })(req, res);
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send();
  }
});

export default router;
