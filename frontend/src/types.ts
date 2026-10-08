export type Role = 'STUDENT' | 'FACULTY' | 'ADMIN'
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
  department: string | null
  isBlacklisted: boolean
  penaltyPoints: number
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
  categoryBreakdown: Array<{ name: string; units: number; count: number }>
  lowStock: Item[]
}

export interface ScanResult {
  item: Item
  openLoans: Loan[]
}
