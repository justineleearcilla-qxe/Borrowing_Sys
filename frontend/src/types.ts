export type Role = 'STUDENT' | 'FACULTY' | 'ADMIN'
export type LoanStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'BORROWED' | 'RETURNED' | 'OVERDUE'
export type ItemStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED'
export type ItemCondition = 'NEW' | 'GOOD' | 'DAMAGED'

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
