import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { ApiError, asyncHandler } from "../utils/http";
import { sanitizeUser } from "../utils/serialize";

const router = Router();

function signToken(user: { id: number; role: string }): string {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, role, department } = (req.body ??
      {}) as Record<string, unknown>;
    if (!name || !email || !password)
      throw new ApiError(400, "Name, email and password are required");
    if (typeof password !== "string" || password.length < 8)
      throw new ApiError(400, "Password must be at least 8 characters");

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      throw new ApiError(400, "Invalid email address");
    if (!normalizedEmail.endsWith(env.SCHOOL_EMAIL_DOMAIN)) {
      throw new ApiError(
        400,
        `Registration is limited to ${env.SCHOOL_EMAIL_DOMAIN} email addresses`,
      );
    }

    const selectedRole: Role = role === "FACULTY" ? "FACULTY" : "STUDENT";
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing)
      throw new ApiError(409, "An account with this email already exists");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash,
        role: selectedRole,
        department: department ? String(department).trim() : null,
      },
    });

    res.status(201).json({ token: signToken(user), user: sanitizeUser(user) });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = (req.body ?? {}) as Record<string, unknown>;
    if (!email || !password)
      throw new ApiError(400, "Email and password are required");
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail.endsWith(env.SCHOOL_EMAIL_DOMAIN)) {
      throw new ApiError(401, "Use your school email address to sign in");
    }
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) throw new ApiError(401, "Invalid email or password");
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) throw new ApiError(401, "Invalid email or password");
    res.json({ token: signToken(user), user: sanitizeUser(user) });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(sanitizeUser(req.user!));
  }),
);

export default router;
