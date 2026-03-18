import { Router, Request, Response } from "express";
import { balanceRepository } from "../../data/repositories/balance.repository";

const router = Router();

// GET /:userId/:month/:year
router.get("/:userId/:month/:year", async (req: Request, res: Response) => {
  try {
    const { userId, month, year } = req.params;

    const balance = await balanceRepository.getMonthlyBalance(
      parseInt(userId),
      parseInt(month),
      parseInt(year)
    );

    res.json(balance);
  } catch (error) {
    console.error("Error obteniendo balance:", error);
    res.status(500).json({ error: "Error al obtener balance" });
  }
});

// GET /:userId - Balance del mes actual
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const now = new Date();

    const balance = await balanceRepository.getMonthlyBalance(
      parseInt(userId),
      now.getMonth() + 1,
      now.getFullYear()
    );

    res.json(balance);
  } catch (error) {
    console.error("Error obteniendo balance:", error);
    res.status(500).json({ error: "Error al obtener balance" });
  }
});

export default router;
