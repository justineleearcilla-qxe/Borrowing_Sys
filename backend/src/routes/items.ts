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

const router = Router();

const ACTIVE_STATUSES: RequestStatus[] = [
  "PENDING",
  "APPROVED",
  "BORROWED",
  "OVERDUE",
];

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Invalid id");
  return id;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q, categoryId, status, department, available } =
      req.query as Record<string, string | undefined>;
    const where: Prisma.ItemWhereInput = {};
    if (q)
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
      ];
    if (categoryId) where.categoryId = Number(categoryId);
    if (status) where.status = status as ItemStatus;
    if (department) where.department = department;
    if (available === "true")
      where.AND = [{ status: "AVAILABLE" }, { availableQuantity: { gt: 0 } }];
    const items = await prisma.item.findMany({
      where,
      include: { category: true },
      orderBy: { name: "asc" },
    });
    res.json(items);
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
  if (v === undefined || v === null || v === "") return undefined;
  if (v === "NEW" || v === "GOOD" || v === "DAMAGED") return v;
  throw new ApiError(400, "Condition must be NEW, GOOD or DAMAGED");
}

function validateStatus(v: unknown): ItemStatus | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (v === "AVAILABLE" || v === "MAINTENANCE" || v === "RETIRED") return v;
  throw new ApiError(400, "Status must be AVAILABLE, MAINTENANCE or RETIRED");
}

function parseQuantity(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0)
    throw new ApiError(400, `${field} must be a non-negative integer`);
  return n;
}

router.post(
  "/",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const b = (req.body ?? {}) as ItemBody;
    if (!b.name || String(b.name).trim().length < 2)
      throw new ApiError(400, "Item name is required");
    const categoryId = Number(b.categoryId);
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new ApiError(400, "Valid category is required");

    const totalQuantity = parseQuantity(b.totalQuantity ?? 1, "Total quantity");
    let availableQuantity =
      b.availableQuantity === undefined || b.availableQuantity === ""
        ? totalQuantity
        : parseQuantity(b.availableQuantity, "Available quantity");
    availableQuantity = Math.min(availableQuantity, totalQuantity);

    const created = await prisma.item.create({
      data: {
        code: "PENDING",
        name: String(b.name).trim(),
        description: b.description ? String(b.description).trim() : null,
        categoryId,
        totalQuantity,
        availableQuantity,
        condition: validateCondition(b.condition) ?? "GOOD",
        status: validateStatus(b.status) ?? "AVAILABLE",
        department: b.department ? String(b.department).trim() : null,
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
      if (String(b.name).trim().length < 2)
        throw new ApiError(400, "Item name is required");
      data.name = String(b.name).trim();
    }
    if (b.description !== undefined)
      data.description = b.description ? String(b.description).trim() : null;
    if (b.department !== undefined)
      data.department = b.department ? String(b.department).trim() : null;

    if (b.categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: Number(b.categoryId) },
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
