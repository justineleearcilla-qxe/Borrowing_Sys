import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ApiError, asyncHandler } from "../utils/http";

const router = Router();

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Invalid id");
  return id;
}

// ---------------------------------------------------------------------------
// LIST - the signed-in user's own notifications (newest first, capped)
// ---------------------------------------------------------------------------
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(notifications);
  }),
);

// ---------------------------------------------------------------------------
// READ - one notification (clicking it in the bell) or all of them
// ---------------------------------------------------------------------------
router.patch(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    // Scoped to the caller's own rows: a stranger's id simply matches nothing.
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new ApiError(404, "Notification not found");
    res.json({ updated: result.count });
  }),
);

router.patch(
  "/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: result.count });
  }),
);

export default router;
