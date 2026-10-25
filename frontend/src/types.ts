export type Role = 'STUDENT' | 'FACULTY' | 'ADMIN'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE'
export type LoanStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BORROWED' | 'RETURNED' | 'OVERDUE'
export type ReservationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'COMPLETED'
export type ItemStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED'
export type ItemCondition = 'NEW' | 'GOOD' | 'DAMAGED'
export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'CLAIMED' | 'CANCELLED' | 'EXPIRED'
export type AppNotificationType = 'WAITLIST_OFFER' | 'WAITLIST_CLAIMED' | 'WAITLIST_MISSED'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  status: UserStatus
  department: string | null
  isBlacklisted: boolean
  penaltyPoints: number
  overdueLoanCount?: number
}

export interface Category {
  id: number
  name: string
  slug: string
  icon: string
  description: string | null
  itemCount: number
}

export interface Item {
  id: number
  code: string
  name: string
  description: string | null
  categoryId: number
  category: Category
  totalQuantity: number
  availableQuantity: number
  lowStockThreshold: number
  condition: ItemCondition
  status: ItemStatus
  department: string | null
  imageUrl: string | null
  createdAt: string
  /** Populated only when availableQuantity is 0 (see items.ts). */
  nextAvailableDate?: string | null
}

export interface Loan {
  id: number
  userId: number
  user?: User
  itemId: number
  item: Item
  quantity: number
  purpose: string
  dateNeeded: string
  returnDate: string
  status: LoanStatus
  remarks: string | null
  outcome: string | null
  decidedById: number | null
  decidedBy?: User | null
  borrowedAt: string | null
  returnedAt: string | null
  reminderSentAt: string | null
  createdAt: string
  /** Shared across every loan from one multi-item cart checkout; null otherwise. */
  batchId: string | null
}

/** A line in the client-side cart (persisted to localStorage). */
export interface CartLine {
  itemId: number
  code: string
  name: string
  imageUrl: string | null
  categorySlug: string
  maxQty: number
  quantity: number
}

/** Response of POST /loans/batch - one grouped cart checkout. */
export interface BatchCheckoutResponse {
  batchId: string
  count: number
  loans: Loan[]
}

/**
 * A hold on an item. reservationDate is the pickup day, returnDate the day it
 * must come back (stored at the end of that day). pickupTime is "HH:MM" or null.
 */
export interface Reservation {
  id: number
  userId: number
  user?: User
  itemId: number
  item: Item
  quantity: number
  reservationDate: string
  pickupTime: string | null
  returnDate: string
  purpose: string
  status: ReservationStatus
  remarks: string | null
  decidedById: number | null
  decidedBy?: User | null
  loanId: number | null
  pickedUpAt: string | null
  createdAt: string
}

/**
 * A spot in line for a reservation window. wantedDate/wantedReturn mirror
 * Reservation.reservationDate/returnDate; position is the live FIFO rank
 * among WAITING entries on that item (null once the status is anything else).
 */
export interface WaitlistEntry {
  id: number
  userId: number
  itemId: number
  item: Item
  quantity: number
  wantedDate: string
  pickupTime: string | null
  wantedReturn: string
  purpose: string
  status: WaitlistStatus
  offeredAt: string | null
  /** Offered slots must be claimed before this instant. */
  offerExpiresAt: string | null
  reservationId: number | null
  createdAt: string
  position?: number | null
}

/** In-app notification shown by the bell in the layout. */
export interface AppNotification {
  id: number
  userId: number
  type: AppNotificationType
  title: string
  body: string
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface StudentDashboard {
  role: 'BORROWER'
  activeLoans: number
  overdueCount: number
  totalRequests: number
  dueSoonCount: number
  dueSoon: Loan[]
  recent: Loan[]
}

export interface AdminDashboard {
  role: 'ADMIN'
  totalItems: number
  totalUsers: number
  totalCategories: number
  pendingRequests: number
  borrowedCount: number
  overdueCount: number
  pendingQueue: Loan[]
  dueLoans: Loan[]
  pendingReservations: Reservation[]
  categoryBreakdown: Array<{ name: string; units: number; count: number }>
  borrowingHistory: Array<{ month: string; units: number }>
  lowStockCount: number
  lowStock: Item[]
}

export type CreditTierKey =
  | 'full'
  | 'good'
  | 'probation'
  | 'suspended'
  | 'blacklisted'

/** One band on the 0-100 borrowing-credit ladder (see backend services/credits.ts). */
export interface CreditTier {
  key: CreditTierKey
  min: number
  max: number
  label: string
  tone: 'green' | 'blue' | 'yellow' | 'red' | 'gray'
  description: string
  privileges: string[]
}

export interface CreditsSummary {
  credits: number
  penaltyPoints: number
  isBlacklisted: boolean
  canBorrow: boolean
  suspendBelow: number
  formula: string
  tier: CreditTier
  tiers: CreditTier[]
  stats: {
    totalLoans: number
    overdueCount: number
    returnedLoans: number
    onTimeReturns: number
    lateReturns: number
  }
}
