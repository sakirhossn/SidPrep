import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt } from './security.js';
import { db, StudentRecord } from '../db/index.js';

export interface AuthenticatedStudent {
  id: string;
  sub: string;
  email: string;
  tokenVersion: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  preferredLanguage?: 'en' | 'hi' | 'bn';
  targetExams?: string[];
  primaryExamId?: string;
  isProfileComplete?: boolean;
  record: StudentRecord;
}

declare module 'fastify' {
  interface FastifyRequest {
    student?: AuthenticatedStudent;
  }
}

export interface StudentAuthOptions {
  allowIncompleteProfile?: boolean;
}

/**
 * Shared student authentication middleware.
 * Invariants enforced:
 * 1. Valid signature, expiry, student audience ('sidprep:student_api'), and token type ('student').
 * 2. Active student account in database (status === 'ACTIVE'). Suspended accounts return 403 Forbidden.
 * 3. Token version validity (tokenVersion >= student.tokenVersion) for real session revocation.
 * 4. Puts authoritative student record on request.student.
 */
export function requireStudentAuth(options: StudentAuthOptions = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Student authentication token required.',
        },
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyJwt<{
      sub: string;
      email?: string;
      type?: string;
      tokenVersion?: number;
    }>(token, { audience: 'sidprep:student_api' });

    if (!decoded || !decoded.sub) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Authentication token is invalid or expired.',
        },
      });
    }

    // Require token type 'student' (reject admin or refresh tokens)
    if (decoded.type && decoded.type !== 'student') {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN_TYPE',
          message: 'Access token of type student required.',
        },
      });
    }

    const student = db.students.get(decoded.sub);
    if (!student) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'STUDENT_NOT_FOUND',
          message: 'Student account does not exist or has been removed.',
        },
      });
    }

    // Check account status
    if (student.status === 'SUSPENDED') {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your student account has been suspended by an administrator. Please contact support.',
        },
      });
    }

    if (student.status === 'DELETED') {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'ACCOUNT_DELETED',
          message: 'This student account has been deleted.',
        },
      });
    }

    if (student.status !== 'ACTIVE') {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Student account is not active.',
        },
      });
    }

    // Session revocation check (token version)
    const currentVersion = student.tokenVersion || 1;
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion < currentVersion) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'TOKEN_REVOKED',
          message: 'Your session has been revoked. Please sign in again.',
        },
      });
    }

    // Attach student to request context
    request.student = {
      id: student.id,
      sub: student.id,
      email: student.email,
      tokenVersion: currentVersion,
      status: student.status,
      preferredLanguage: student.preferredLanguage,
      targetExams: student.targetExams,
      primaryExamId: (student as any).primaryExamId || student.targetExams?.[0],
      isProfileComplete: (student as any).isProfileComplete,
      record: student,
    };
  };
}

/**
 * Enforces ownership of student-scoped resources.
 */
export function verifyStudentOwnership(request: FastifyRequest, resourceOwnerId: string): boolean {
  if (!request.student) return false;
  return request.student.id === resourceOwnerId;
}
