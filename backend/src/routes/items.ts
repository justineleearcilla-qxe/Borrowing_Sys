import fs from "fs";
import path from "path";
import { Router } from "express";
import QRCode from "qrcode";
import {
  ItemCondition,
  ItemStatus,
  Prisma,
  RequestStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { uploadImage } from "../middleware/upload";
import { ApiError, asyncHandler } from "../utils/http";
import { sanitizeUser } from "../utils/serialize";
import { asInt, optEnum, optStr, reqStr, startOfDay } from "../utils/validate";

const router = Router();

const ACTIVE_STATUSES: RequestStatus[] = [
  "PENDING",
  "APPROVED",
  "BORROWED",
  "OVERDUE",
];

/** Item statuses accepted on the wire - anything else is a 400, not a 500. */
const ITEM_STATUSES = ["AVAILABLE", "MAINTENANCE", "RETIRED"] as const;
const ITEM_CONDITIONS = ["NEW", "GOOD", "DAMAGED"] as const;

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Invalid id");
  return id;
}

/**
 * For items that are fully checked out, the first day a unit can actually be
 * borrowed again.
 *
 * Every loan and reservation for the item becomes a day-granular block
 * [pickup day, day after the return day]; overlapping or back-to-back blocks
 * are walked as one continuous block, and the first gap we hit walking
 * forward from today is the answer. That matters: a unit that comes back on
 * the 25th but is re-booked from the 26th is NOT free on the 25th, so it
 * reports the 29th - the same "Next available date" we quote when a
 * conflicting reservation is rejected.
 *
 * Returns a Map keyed by itemId; items with stock (or that are under
 * maintenance / retired) simply get no entry, because for those the answer
 * is "available now" or "not bookable" rather than a date.
 */
async function nextAvailableByItem(
  items: Array<{ id: number; status: string; availableQuantity: number }>,
): Promise<Map<number, Date>> {
  const out = new Map<number, Date>();
  const zeroIds = items
    .filter((i) => i.status === "AVAILABLE" && i.availableQuantity === 0)
    .map((i) => i.id);
  if (zeroIds.length === 0) return out;

  const now = new Date();
  const today = startOfDay(now).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const [loans, reservations] = await Promise.all([
    prisma.loan.findMany({
      where: {
        itemId: { in: zeroIds },
        status: { in: ["APPROVED", "BORROWED", "OVERDUE"] },
        returnDate: { gt: now },
      },
      select: { itemId: true, dateNeeded: true, returnDate: true },
    }),
    prisma.reservation.findMany({
      where: {
        itemId: { in: zeroIds },
        status: { in: ["PENDING", "APPROVED"] },
        returnDate: { gt: now },
      },
      select: { itemId: true, reservationDate: true, returnDate: true },
    }),
  ]);

  const blocks = new Map<number, Array<[number, number]>>();
  const addBlock = (itemId: number, start: Date, end: Date) => {
    const from = startOfDay(start).getTime();
    const to = startOfDay(end).getTime() + DAY_MS;
    if (to <= today) return; // already back in the cupboard
    const list = blocks.get(itemId) ?? [];
    list.push([from, to]);
    blocks.set(itemId, list);
  };
  for (const loan of loans) addBlock(loan.itemId, loan.dateNeeded, loan.returnDate);
  for (const res of reservations) addBlock(res.itemId, res.reservationDate, res.returnDate);

  for (const [itemId, list] of blocks) {
    list.sort((a, b) => a[0] - b[0]);
    let freeFrom = today;
    for (const [from, to] of list) {
      if (from > freeFrom) break; // a genuine gap opens before this block
      freeFrom = Math.max(freeFrom, to);
    }
    out.set(itemId, new Date(freeFrom));
  }
  return out;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, categoryId, status, department, available } =
      req.query as Record<string, string | undefined>;

    const where: Prisma.ItemWhereInput = {};
    if (q) {
      // `contains` binds the needle as a parameter - never concatenated SQL.
      const needle = reqStr(q, "Search", { min: 1, max: 100 });
      where.OR = [
        { name: { contains: needle, mode: "insensitive" } },
        { code: { contains: needle, mode: "insensitive" } },
      ];
    }
    // Previously `Number(categoryId)`: the string "abc" produced NaN and Prisma
    // rejected the query, surfacing as an unhelpful HTTP 500. Now it is a 400.
    const catId = asInt(categoryId, "Category id", { min: 1, required: false });
    if (catId) where.categoryId = catId;
    const itemStatus = optEnum(status, "Status", ITEM_STATUSES);
    if (itemStatus) where.status = itemStatus;
    const dept = optStr(department, "Department", 80);
    if (dept) where.department = dept;
    if (available === "true")
      where.AND = [{ status: "AVAILABLE" }, { availableQuantity: { gt: 0 } }];

    const items = await prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { name: "asc" },
    });

    const nextAvailable = await nextAvailableByItem(items);
    res.json(
      items.map((item) => ({
        ...item,
        nextAvailableDate: nextAvailable.get(item.id)?.toISOString() ?? null,
      })),
    );
  }),
);

router.get(
  "/code/:code",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const item = await prisma.item.findUnique({
      where: { code: req.params.code.trim().toUpperCase() },
      include: { category: true },
    });
    if (!item)
      throw new ApiError(404, `No item found with code "${req.params.code}"`);
    const openLoans = await prisma.loan.findMany({
      where: { itemId: item.id, status: { in: ACTIVE_STATUSES } },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({
      item,
      openLoans: openLoans.map(({ user, ...l }) => ({
        ...l,
        user: sanitizeUser(user),
      })),
    });
  }),
);

router.get(
  "/:id/qrcode",
  asyncHandler(async (req, res) => {
    const item = await prisma.item.findUnique({
      where: { id: parseId(req.params.id) },
    });
    if (!item) throw new ApiError(404, "Item not found");
    const buf = await QRCode.toBuffer(item.code, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.item.findUnique({
      where: { id: parseId(req.params.id) },
      include: { category: true },
    });
    if (!item) throw new ApiError(404, "Item not found");
    res.json(item);
  }),
);

interface ItemBody {
  name?: unknown;
  description?: unknown;
  categoryId?: unknown;
  totalQuantity?: unknown;
  availableQuantity?: unknown;
  condition?: unknown;
  status?: unknown;
  department?: unknown;
}

function validateCondition(v: unknown): ItemCondition | undefined {
  // Whitelist check instead of an `as ItemCondition` cast, so a bogus value
  // is a readable 400 rather than an invalid enum reaching PostgreSQL.
  return optEnum(v, "Condition", ITEM_CONDITIONS) ?? undefined;
}

function validateStatus(v: unknown): ItemStatus | undefined {
  return optEnum(v, "Status", ITEM_STATUSES) ?? undefined;
}

function parseQuantity(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0)
    throw new ApiError(400, `${field} must be a non-negative integer`);
  if (n > 100000)
    throw new ApiError(400, `${field} must be 100000 or fewer`);
  return n;
}

router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = (req.body ?? {}) as ItemBody;
    const name = reqStr(b.name, "Item name", { min: 2, max: 120 });
    const categoryId = asInt(b.categoryId, "Category", { min: 1 })!;
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new ApiError(400, "Valid category is required");
    const description = optStr(b.description, "Description", 2000);
    const department = optStr(b.department, "Department", 80);

    const totalQuantity = parseQuantity(b.totalQuantity ?? 1, "Total quantity");
    let availableQuantity =
      b.availableQuantity === undefined || b.availableQuantity === ""
        ? totalQuantity
        : parseQuantity(b.availableQuantity, "Available quantity");
    availableQuantity = Math.min(availableQuantity, totalQuantity);

    const created = await prisma.item.create({
      data: {
        code: "PENDING",
        name,
        description,
        categoryId,
        totalQuantity,
        availableQuantity,
        condition: validateCondition(b.condition) ?? "GOOD",
        status: validateStatus(b.status) ?? "AVAILABLE",
        department,
      },
    });

    const item = await prisma.item.update({
      where: { id: created.id },
      data: { code: `EQ-${String(created.id).padStart(4, "0")}` },
      include: { category: true },
    });
    res.status(201).json(item);
  }),
);

router.put(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Item not found");

    const b = (req.body ?? {}) as ItemBody;
    const data: Prisma.ItemUpdateInput = {};

    if (b.name !== undefined) {
      // reqStr throws if the trimmed value is under 2 or over 120 chars.
      data.name = reqStr(b.name, "Item name", { min: 2, max: 120 });
    }
    if (b.description !== undefined)
      data.description = optStr(b.description, "Description", 2000);
    if (b.department !== undefined)
      data.department = optStr(b.department, "Department", 80);

    if (b.categoryId !== undefined) {
      const catId = asInt(b.categoryId, "Category", { min: 1 });
      const category = await prisma.category.findUnique({
        where: { id: catId! },
      });
      if (!category) throw new ApiError(400, "Valid category is required");
      data.category = { connect: { id: category.id } };
    }

    const condition = validateCondition(b.condition);
    if (condition) data.condition = condition;
    const status = validateStatus(b.status);
    if (status) data.status = status;

    let total = existing.totalQuantity;
    if (b.totalQuantity !== undefined && b.totalQuantity !== "") {
      total = parseQuantity(b.totalQuantity, "Total quantity");
      data.totalQuantity = total;
    }

    if (b.availableQuantity !== undefined && b.availableQuantity !== "") {
      const avail = Math.min(
        parseQuantity(b.availableQuantity, "Available quantity"),
        total,
      );
      data.availableQuantity = avail;
    } else if (total < existing.availableQuantity) {
      data.availableQuantity = total;
    }

    const item = await prisma.item.update({
      where: { id },
      data,
      include: { category: true },
    });
    res.json(item);
  }),
);

router.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Item not found");

    const activeLoans = await prisma.loan.count({
      where: { itemId: id, status: { in: ACTIVE_STATUSES } },
    });
    if (activeLoans > 0)
      throw new ApiError(
        409,
        "This item has active loans and cannot be deleted",
      );

    if (existing.imageUrl) {
      const file = path.resolve(
        process.cwd(),
        env.UPLOAD_DIR,
        path.basename(existing.imageUrl),
      );
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore missing file */
      }
    }

    await prisma.item.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

router.post(
  "/:id/image",
  requireAuth,
  requireAdmin,
  uploadImage,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const file = req.file;
    if (!file)
      throw new ApiError(
        400,
        'No image file received (field name must be "image")',
      );

    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Item not found");

    if (existing.imageUrl) {
      const old = path.resolve(
        process.cwd(),
        env.UPLOAD_DIR,
        path.basename(existing.imageUrl),
      );
      try {
        fs.unlinkSync(old);
      } catch {
        /* ignore */
      }
    }

    const item = await prisma.item.update({
      where: { id },
      data: { imageUrl: `/uploads/${file.filename}` },
      include: { category: true },
    });
    res.json(item);
  }),
);

export default router;
