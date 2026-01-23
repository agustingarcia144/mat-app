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
  createdAt: string
}
