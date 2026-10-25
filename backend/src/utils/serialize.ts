import type { User } from '@prisma/client'

export function sanitizeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    department: user.department,
    isBlacklisted: user.isBlacklisted,
    penaltyPoints: user.penaltyPoints,
  }
}

export type SafeUser = ReturnType<typeof sanitizeUser>
