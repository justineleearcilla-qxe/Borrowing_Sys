import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { ApiError, asyncHandler } from "../utils/http";
import { sanitizeUser } from "../utils/serialize";
import { asEmail, asEnum, asPassword, optStr, reqStr } from "../utils/validate";

const router = Router();

// Brute-force protection. Generous enough that a legitimate user mistyping a
// password a few times never notices, but it stops scripted guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
});

function signToken(user: { id: number; role: string }): string {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password, role, department } = (req.body ??
      {}) as Record<string, unknown>;

    // --- validation: format, length, whitelist ---
    const normalizedEmail = asEmail(email);
    if (!normalizedEmail.endsWith(env.SCHOOL_EMAIL_DOMAIN)) {
      throw new ApiError(
        400,
        `Registration is limited to ${env.SCHOOL_EMAIL_DOMAIN} email addresses`,
      );
    }
    const displayName = reqStr(name, "Name", { min: 2, max: 120 });
    // asPassword enforces 8..128 chars; bcrypt only ever hashes 72 bytes.
    const plainPassword = asPassword(password);
    // Whitelist - the public form can never create an ADMIN, and a bogus
    // value now fails loudly instead of being silently coerced.
    const requested = role === undefined || role === null || role === "" ? "STUDENT" : role;
    const selectedRole: Role = asEnum(requested, "Role", ["STUDENT", "FACULTY"] as const);
    const departmentName = optStr(department, "Department", 80);

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing)
      throw new ApiError(409, "An account with this email already exists");

    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const user = await prisma.user.create({
      data: {
        name: displayName,
        email: normalizedEmail,
        passwordHash,
        role: selectedRole,
        department: departmentName,
      },
    });

    res.status(201).json({ token: signToken(user), user: sanitizeUser(user) });
  }),
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = (req.body ?? {}) as Record<string, unknown>;

    // Reject non-strings and blanks before touching the database. Passwords
    // are intentionally NOT trimmed - whitespace can be part of a password.
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      throw new ApiError(400, "Email and password are required");
    }

    const normalizedEmail = asEmail(email);
    if (!normalizedEmail.endsWith(env.SCHOOL_EMAIL_DOMAIN)) {
      throw new ApiError(401, "Use your school email address to sign in");
    }
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    // Same message for "no such user" and "wrong password" so the endpoint
    // cannot be used to enumerate which school addresses have accounts.
    if (!user) throw new ApiError(401, "Invalid email or password");
    const ok = await bcrypt.compare(password, user.passwordHash);
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
