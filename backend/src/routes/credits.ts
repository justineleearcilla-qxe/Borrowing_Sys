import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/http";
import { creditSummary } from "../services/credits";

const router = Router();

// ---------------------------------------------------------------------------
// MINE - the signed-in borrower's credits, tier and supporting stats
// ---------------------------------------------------------------------------
router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await creditSummary(req.user!));
  }),
);

export default router;
