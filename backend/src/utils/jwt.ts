import jwt from 'jsonwebtoken'
import { authConfig } from '../config/auth'
import { JWTPayload } from '../types'

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, authConfig.jwtSecret, {
    expiresIn: authConfig.jwtExpiresIn,
  } as jwt.SignOptions)
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, authConfig.jwtSecret) as JWTPayload
}
