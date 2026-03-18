import { Router, Request, Response } from "express";
import { generateMonthlyReport, formatReportForTelegram, getCategoryReport } from "../../services/reporter";

const router = Router();

// GET /monthly/:userId/:month/:year
router.get("/monthly/:userId/:month/:year", async (req: Request, res: Response) => {
  try {
    const { userId, month, year } = req.params;

    const report = await generateMonthlyReport(
      parseInt(userId),
      parseInt(month),
      parseInt(year)
    );

    res.json(report);
  } catch (error) {
    console.error("Error generando reporte:", error);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// GET /monthly/:userId - Reporte del mes actual
router.get("/monthly/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const now = new Date();

    const report = await generateMonthlyReport(
      parseInt(userId),
      now.getMonth() + 1,
      now.getFullYear()
    );

    res.json(report);
  } catch (error) {
    console.error("Error generando reporte:", error);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// GET /telegram/:userId/:month/:year - Reporte formateado para Telegram
router.get("/telegram/:userId/:month/:year", async (req: Request, res: Response) => {
  try {
    const { userId, month, year } = req.params;

    const report = await generateMonthlyReport(
      parseInt(userId),
      parseInt(month),
      parseInt(year)
    );

    const formatted = formatReportForTelegram(report);
    res.json({ markdown: formatted });
  } catch (error) {
    console.error("Error generando reporte:", error);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// GET /scheduled/:userId - Endpoint para cron-job.org
router.get("/scheduled/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const now = new Date();

    const report = await generateMonthlyReport(
      parseInt(userId),
      now.getMonth() + 1,
      now.getFullYear()
    );

    const formatted = formatReportForTelegram(report);

    res.json({
      success: true,
      userId: parseInt(userId),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      report: formatted,
    });
  } catch (error) {
    console.error("Error en reporte programado:", error);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

// GET /category/:userId/:category
router.get("/category/:userId/:category", async (req: Request, res: Response) => {
  try {
    const { userId, category } = req.params;
    const month = parseInt(req.query.month as string);
    const year = parseInt(req.query.year as string);

    const report = await getCategoryReport(
      parseInt(userId),
      category,
      month,
      year
    );

    res.json(report);
  } catch (error) {
    console.error("Error generando reporte de categoría:", error);
    res.status(500).json({ error: "Error al generar reporte" });
  }
});

export default router;
