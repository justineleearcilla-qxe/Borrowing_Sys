import { Prisma, UserStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { ApiError, asyncHandler } from "../utils/http";
import { sanitizeUser } from "../utils/serialize";
import { asEnum, optStr } from "../utils/validate";

const router = Router();
const USER_STATUSES = ["PENDING", "ACTIVE", "INACTIVE"] as const;

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Invalid user id");
  return id;
}

router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, unknown>;
    const status =
      query.status === undefined
        ? undefined
        : asEnum(query.status, "Status", USER_STATUSES);
    const search = optStr(query.q, "Search", 100);
    const where: Prisma.UserWhereInput = {};
    if (status) where.status = status as UserStatus;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const [users, overdueCounts] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ status: "asc" }, { name: "asc" }],
      }),
      prisma.loan.groupBy({
        by: ["userId"],
        where: { status: "OVERDUE" },
        _count: { _all: true },
      }),
    ]);
    const overdueByUser = new Map(
      overdueCounts.map((row) => [row.userId, row._count._all]),
    );
    res.json(
      users.map((user) => ({
        ...sanitizeUser(user),
        overdueLoanCount: overdueByUser.get(user.id) ?? 0,
      })),
    );
  }),
);

router.patch(
  "/:id/approve",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, "User not found");
    if (user.status !== "PENDING") {
      throw new ApiError(409, "Only pending accounts can be approved");
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
    res.json(sanitizeUser(updated));
  }),
);

router.patch(
  "/:id/deactivate",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === req.user!.id) {
      throw new ApiError(400, "You cannot deactivate your own account");
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, "User not found");
    if (user.status === "INACTIVE") {
      throw new ApiError(409, "This account is already inactive");
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { status: "INACTIVE" },
    });
    res.json(sanitizeUser(updated));
  }),
);

router.patch(
  "/:id/reactivate",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, "User not found");
    if (user.status !== "INACTIVE") {
      throw new ApiError(409, "Only inactive accounts can be reactivated");
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
    res.json(sanitizeUser(updated));
  }),
);

router.patch(
  "/:id/clear-blacklist",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new ApiError(404, "User not found");
    const updated = await prisma.user.update({
      where: { id },
      data: { isBlacklisted: false, penaltyPoints: 0 },
    });
    res.json(sanitizeUser(updated));
  }),
);

export default router;
