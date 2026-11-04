import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt } from './security.js';
import { db, AdminUserRecord } from '../db/index.js';

export interface AuthenticatedAdmin {
  id: string;
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
 * Fails closed: Rejects requests missing Bearer token, expired tokens, or inactive staff accounts.
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
    const decoded = verifyJwt<{ sub: string; email: string; role?: string; type?: string }>(token);

    if (!decoded || !decoded.sub) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired administrative session token.',
        },
      });
    }

    // Look up staff member in database
    const staffUser =
      db.adminUsers.get(decoded.sub) ||
      Array.from(db.adminUsers.values()).find((u) => u.email.toLowerCase() === decoded.email?.toLowerCase());

    if (!staffUser || !staffUser.isActive) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Administrative account does not exist or has been deactivated.',
        },
      });
    }

    const userRole = decoded.role || staffUser.role;

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
      email: staffUser.email,
      role: userRole,
      name: staffUser.name,
    };
  };
}
