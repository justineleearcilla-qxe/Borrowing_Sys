import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/http";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { items: true } } },
    });
    res.json(
      categories.map(({ _count, ...c }) => ({ ...c, itemCount: _count.items })),
    );
  }),
);

export default router;
