// Shared TypeScript types and interfaces
// Example: export type User = { id: string; name: string }

/**
 * Member type used for organization membership tables
 */
export type Member = {
  id: string
  name: string
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  imageUrl?: string
  username?: string
  role: string
  status: string
  createdAt: Date | string | number
  birthDate?: Date | string | number
  joinedAt?: Date | string | number
}

/**
 * Type for membership data returned from Convex query
 */
export type MembershipData = {
  userId: string
  role: string
  status: string
  createdAt: number
  joinedAt: number
  // User fields from users table
  firstName?: string
  lastName?: string
  fullName?: string
  email?: string
  imageUrl?: string
  username?: string
  birthDate?: number | string | Date
}

/**
 * Class types for class reservation system
 */
export type RecurrencePattern = {
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly'
  interval: number
  daysOfWeek?: number[] // 0-6
  endDate?: number
}

export type Class = {
  _id: string
  organizationId: string
  name: string
  description?: string
  capacity: number
  trainerId?: string
  isRecurring: boolean
  recurrencePattern?: RecurrencePattern
  bookingWindowDays: number
  cancellationWindowHours: number
  isActive: boolean
  createdBy: string
  createdAt: number
  updatedAt: number
}

export type ClassSchedule = {
  _id: string
  classId: string
  organizationId: string
  startTime: number
  endTime: number
  capacity: number
  currentReservations: number
  status: 'scheduled' | 'cancelled' | 'completed'
  notes?: string
  createdAt: number
  updatedAt: number
}

export type ClassReservation = {
  _id: string
  scheduleId: string
  classId: string
  organizationId: string
  userId: string
  status: 'confirmed' | 'cancelled' | 'attended' | 'no_show'
  cancelledAt?: number
  checkedInAt?: number
  notes?: string
  createdAt: number
  updatedAt: number
}
