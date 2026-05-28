import { Request } from 'express'
import { UserRole } from '@prisma/client'

export interface JWTPayload {
  userId: string
  email: string
  role: UserRole
}

export interface AuthRequest extends Request {
  user?: JWTPayload
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface PaginationQuery {
  page?: string
  limit?: string
  search?: string
}

export interface SocketUser {
  userId: string
  socketId: string
}
