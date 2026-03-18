import { Router, Request, Response } from "express";
import { transactionRepository } from "../../data/repositories/transaction.repository";

const router = Router();

// GET / - Listar transacciones
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string);
    const type = req.query.type as "gasto" | "ingreso";
    const categoryId = req.query.category as string;
    const dateFrom = req.query.dateFrom as string;
    const dateTo = req.query.dateTo as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!userId) {
      return res.status(400).json({ error: "userId es requerido" });
    }

    const transactions = await transactionRepository.findByUserId(userId, {
      type,
      category_id: categoryId,
      dateFrom,
      dateTo,
      limit,
      offset,
    });

    res.json(transactions);
  } catch (error) {
    console.error("Error listando transacciones:", error);
    res.status(500).json({ error: "Error al listar transacciones" });
  }
});

// POST / - Crear transacción
router.post("/", async (req: Request, res: Response) => {
  try {
    const { user_id, type, amount, category_id, description, transaction_date } = req.body;

    if (!user_id || !type || !amount) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    const transaction = await transactionRepository.create({
      user_id,
      type,
      amount,
      category_id,
      description,
      transaction_date,
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error("Error creando transacción:", error);
    res.status(500).json({ error: "Error al crear transacción" });
  }
});

// GET /:id - Obtener transacción por ID
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const transaction = await transactionRepository.findById(id);

    if (!transaction) {
      return res.status(404).json({ error: "Transacción no encontrada" });
    }

    res.json(transaction);
  } catch (error) {
    console.error("Error obteniendo transacción:", error);
    res.status(500).json({ error: "Error al obtener transacción" });
  }
});

// PUT /:id - Actualizar transacción
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const transaction = await transactionRepository.update(id, updates);
    res.json(transaction);
  } catch (error) {
    console.error("Error actualizando transacción:", error);
    res.status(500).json({ error: "Error al actualizar transacción" });
  }
});

// DELETE /:id - Eliminar transacción
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await transactionRepository.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error eliminando transacción:", error);
    res.status(500).json({ error: "Error al eliminar transacción" });
  }
});

export default router;
