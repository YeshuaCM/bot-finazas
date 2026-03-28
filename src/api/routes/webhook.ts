import { Router, Request, Response } from "express";
import { webhookCallback } from "grammy";
import { config } from "../../config";
import { bot } from "../../bot";

const router = Router();

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
