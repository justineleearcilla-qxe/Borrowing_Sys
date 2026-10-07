import { Router } from "express";
import { Prisma, RequestStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { runMaintenanceSweep } from "../services/cron";
import { sendMail } from "../services/mailer";
import { ApiError, asyncHandler } from "../utils/http";
import { sanitizeUser } from "../utils/serialize";
import { asAnyDate, asInt, reqStr } from "../utils/validate";

const router = Router();

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Invalid id");
  return id;
}

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.isBlacklisted) {
      throw new ApiError(
        403,
        "Your borrowing privileges are suspended due to repeated late returns. Please contact the equipment office.",
      );
    }

    const { itemId, quantity, purpose, dateNeeded, returnDate } = (req.body ??
      {}) as Record<string, unknown>;

    // Typed + range-checked up front. `Number("abc")` used to reach here as
    // NaN and later hit Prisma with a malformed id => HTTP 500.
    const requestedItemId = asInt(itemId, "Equipment", { min: 1 })!;
    const qty = asInt(quantity, "Quantity", { min: 1, max: 500 })!;
    const cleanPurpose = reqStr(purpose, "Purpose", { min: 5, max: 300 });

    const needed = asAnyDate(dateNeeded, "Date needed");
    const ret = asAnyDate(returnDate, "Return date");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (needed < today)
      throw new ApiError(400, "Date needed cannot be in the past");
    if (ret <= needed)
      throw new ApiError(400, "Return date must be after the date needed");

    const item = await prisma.item.findUnique({
      where: { id: requestedItemId },
    });
    if (!item) throw new ApiError(404, "Item not found");
    if (item.status !== "AVAILABLE")
      throw new ApiError(409, "This item is not available for borrowing");
    if (item.availableQuantity < qty)
      throw new ApiError(
        409,
        `Only ${item.availableQuantity} unit(s) currently available`,
      );

    const loan = await prisma.loan.create({
      data: {
        userId: user.id,
        itemId: item.id,
        quantity: qty,
        purpose: cleanPurpose,
        dateNeeded: needed,
        returnDate: ret,
      },
      include: { item: { include: { category: true } } },
    });
    res.status(201).json(loan);
  }),
);

router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const loans = await prisma.loan.findMany({
      where: { userId: req.user!.id },
      include: { item: { include: { category: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(loans);
  }),
);

router.get(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = req.query as Record<string, string | undefined>;
    const where: Prisma.LoanWhereInput = {};
    if (
      status &&
      [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "BORROWED",
        "RETURNED",
        "OVERDUE",
      ].includes(status)
    ) {
      where.status = status as RequestStatus;
    }
    let loans = await prisma.loan.findMany({
      where,
      include: {
        user: true,
        item: { include: { category: true } },
        decidedBy: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if ((status ?? "PENDING") === "PENDING") loans = loans.slice().reverse();
    res.json(
      loans.map(({ user, decidedBy, ...l }) => ({
        ...l,
        user: sanitizeUser(user),
        decidedBy: decidedBy ? sanitizeUser(decidedBy) : null,
      })),
    );
  }),
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan || loan.userId !== req.user!.id)
      throw new ApiError(404, "Request not found");
    if (loan.status !== "PENDING")
      throw new ApiError(409, "Only pending requests can be cancelled");
    const updated = await prisma.loan.update({
      where: { id },
      data: {
        status: "REJECTED",
        remarks: `${loan.remarks ? loan.remarks + " | " : ""}Cancelled by borrower`,
      },
      include: { item: { include: { category: true } } },
    });
    res.json(updated);
  }),
);

router.patch(
  "/:id/decide",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { action, remarks } = (req.body ?? {}) as Record<string, unknown>;
    if (action !== "approve" && action !== "reject")
      throw new ApiError(400, 'Action must be "approve" or "reject"');
    // Remarks are free text stored in the DB and mailed back to the borrower,
    // so cap the length and normalise whitespace before either happens.
    const cleanRemarks =
      remarks === undefined || remarks === null || remarks === ""
        ? null
        : reqStr(remarks, "Remarks", { min: 1, max: 300 });

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: { user: true, item: true },
    });
    if (!loan) throw new ApiError(404, "Request not found");
    if (loan.status !== "PENDING")
      throw new ApiError(409, "Only pending requests can be decided");

    if (action === "approve") {
      const fresh = await prisma.item.findUnique({
        where: { id: loan.itemId },
      });
      if (
        !fresh ||
        fresh.status !== "AVAILABLE" ||
        fresh.availableQuantity < loan.quantity
      ) {
        throw new ApiError(
          409,
          "Not enough stock to approve this request. Consider rejecting it with a remark.",
        );
      }
    }

    const status: RequestStatus =
      action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await prisma.loan.update({
      where: { id },
      data: {
        status,
        decidedById: req.user!.id,
        remarks: cleanRemarks ?? loan.remarks,
      },
      include: { item: { include: { category: true } }, user: true },
    });

    await sendMail(
      updated.user.email,
      action === "approve"
        ? "Your equipment request was approved"
        : "Your equipment request was rejected",
      `Dear ${updated.user.name},\n\nYour request for "${updated.item.name}" x${updated.quantity} has been ${status.toLowerCase()}.${
        cleanRemarks
          ? `\n\nRemarks from the equipment desk: ${cleanRemarks}`
          : ""
      }\n\nEquipment Desk`,
    );

    const { user, ...rest } = updated;
    res.json({ ...rest, user: sanitizeUser(user) });
  }),
);

router.patch(
  "/:id/checkout",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const loan = await prisma.loan.findUnique({ where: { id } });
    if (!loan) throw new ApiError(404, "Request not found");
    if (loan.status !== "APPROVED")
      throw new ApiError(409, "Only approved requests can be checked out");

    const result = await prisma.$transaction(async (tx) => {
      const decremented = await tx.item.updateMany({
        where: { id: loan.itemId, availableQuantity: { gte: loan.quantity } },
        data: { availableQuantity: { decrement: loan.quantity } },
      });
      if (decremented.count === 0)
        throw new ApiError(
          409,
          "Not enough stock available to check out this loan",
        );
      return tx.loan.update({
        where: { id },
        data: { status: "BORROWED", borrowedAt: new Date() },
      });
    });

    res.json(result);
  }),
);

router.patch(
  "/:id/return",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { outcome, note } = (req.body ?? {}) as Record<string, unknown>;
    const isAdmin = req.user!.role === "ADMIN";
    const finalOutcome =
      isAdmin && (outcome === "DAMAGED" || outcome === "LOST") ? outcome : "OK";
    // Non-admins can never set a negative outcome (forced to "OK" above), but
    // the note they write still needs the same length cap as everyone else's.
    const cleanNote =
      note === undefined || note === null || note === ""
        ? null
        : reqStr(note, "Note", { min: 1, max: 300 });

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: { item: true },
    });
    if (!loan) throw new ApiError(404, "Loan not found");
    if (!isAdmin && loan.userId !== req.user!.id)
      throw new ApiError(404, "Loan not found");
    if (loan.status !== "BORROWED" && loan.status !== "OVERDUE") {
      throw new ApiError(409, "Only borrowed or overdue loans can be returned");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (finalOutcome === "LOST") {
        await tx.item.update({
          where: { id: loan.itemId },
          data: { totalQuantity: { decrement: loan.quantity } },
        });
      } else {
        await tx.item.update({
          where: { id: loan.itemId },
          data: { availableQuantity: { increment: loan.quantity } },
        });
      }
      if (finalOutcome === "DAMAGED") {
        await tx.item.update({
          where: { id: loan.itemId },
          data: { condition: "DAMAGED" },
        });
      }

      const item = await tx.item.findUnique({ where: { id: loan.itemId } });
      if (item) {
        if (item.availableQuantity > item.totalQuantity) {
          await tx.item.update({
            where: { id: item.id },
            data: { availableQuantity: item.totalQuantity },
          });
        }
        if (item.totalQuantity < 0) {
          await tx.item.update({
            where: { id: item.id },
            data: { totalQuantity: 0 },
          });
        }
      }

      const remarks = cleanNote
        ? `${loan.remarks ? loan.remarks + " | " : ""}Return note (${finalOutcome}): ${cleanNote}`
        : loan.remarks;

      return tx.loan.update({
        where: { id },
        data: {
          status: "RETURNED",
          returnedAt: new Date(),
          outcome: finalOutcome,
          remarks,
        },
      });
    });

    res.json(updated);
  }),
);

router.post(
  "/maintenance/run",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const result = await runMaintenanceSweep();
    res.json(result);
  }),
);

export default router;
