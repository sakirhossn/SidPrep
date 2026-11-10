import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt } from './security.js';
import { db, AdminUserRecord } from '../db/index.js';

export interface AuthenticatedAdmin {
  id: string;
  sub: string;
  email: string;
  role: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AuthenticatedAdmin;
  }
}

/**
 * Fastify preHandler hook for securing /admin endpoints.
 * Invariants enforced (F01, F05, F07):
 * 1. Requires valid Bearer JWT.
 * 2. Token MUST have type === 'admin_session' (or 'admin') and cannot be 'admin_preauth' or 'student'.
 * 3. Looks up staff member strictly by sub ID (NO email-based fallback).
 * 4. Account must exist and be active (isActive === true).
 * 5. Token version must be >= current database tokenVersion (session revocation support).
 * 6. Authorization checks use authoritative database role (not untrusted token payload claim).
 */
export function requireAdminAuth(allowedRoles?: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Administrative authentication token required.',
        },
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyJwt<{
      sub: string;
      email?: string;
      role?: string;
      type?: string;
      step?: string;
      tokenVersion?: number;
    }>(token);

    if (!decoded || !decoded.sub) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired administrative session token.',
        },
      });
    }

    // INVARIANT F01: Reject pre-auth / TOTP-pending tokens and non-admin tokens
    if (decoded.step === 'totp_pending' || decoded.type === 'admin_preauth') {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'MFA_REQUIRED',
          message: 'Two-factor authentication step incomplete. Pre-auth tokens cannot access administrative routes.',
        },
      });
    }

    if (decoded.type !== 'admin_session' && decoded.type !== 'admin') {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Valid administrative session token required. Incorrect token type presented.',
        },
      });
    }

    // INVARIANT F01: Strict ID-only lookup. Do NOT fall back to email matching.
    const staffUser = db.adminUsers.get(decoded.sub);

    if (!staffUser || !staffUser.isActive) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Administrative account does not exist or has been deactivated.',
        },
      });
    }

    // INVARIANT F07: Check session revocation
    if (
      staffUser.tokenVersion !== undefined &&
      decoded.tokenVersion !== undefined &&
      decoded.tokenVersion < staffUser.tokenVersion
    ) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'SESSION_REVOKED',
          message: 'Administrative session has been revoked. Please log in again.',
        },
      });
    }

    // INVARIANT F01 & F05: Use authoritative database role, never trust decoded.role blindly
    const userRole = staffUser.role;

    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Action requires one of the following roles: ${allowedRoles.join(', ')}. Current role: ${userRole}.`,
        },
      });
    }

    request.admin = {
      id: staffUser.id,
      sub: staffUser.id,
      email: staffUser.email,
      role: userRole,
      name: staffUser.name,
    };
  };
}
