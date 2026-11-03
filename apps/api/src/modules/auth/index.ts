import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.js';
import {
  generateOtp,
  verifyPassword,
  verifyTotp,
  signJwt,
  verifyJwt,
} from '../../lib/security.js';
import { env } from '../../config/index.js';
import {
  StudentOtpChallengeSchema,
  StudentOtpVerifySchema,
  AdminLoginSchema,
  AdminTotpVerifySchema,
} from '@sidprep/contracts';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/student/challenge
   * Request email OTP with rate limiting and Brevo quota tracking
   */
  fastify.post('/auth/student/challenge', async (request, reply) => {
    const parse = StudentOtpChallengeSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', message: 'Valid email is required' } });
    }

    const { email } = parse.data;

    // Check Brevo Daily Quota
    if (db.brevoSendsToday >= env.BREVO_DAILY_QUOTA_LIMIT) {
      db.logOperational({
        service: 'BREVO',
        level: 'ERROR',
        message: 'Daily Brevo email limit reached (300/day). Cannot dispatch OTP.',
        meta: { email, currentUsage: db.brevoSendsToday },
      });
      return reply.code(429).send({
        success: false,
        error: {
          code: 'EMAIL_QUOTA_EXCEEDED',
          message: 'Daily email capacity reached. Please retry in the next delivery window or contact support.',
        },
      });
    }

    const otp = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    db.otpChallenges.set(email.toLowerCase(), {
      otp,
      expiresAt,
      attempts: 0,
    });

    // Increment quota usage
    db.brevoSendsToday++;

    db.logOperational({
      service: 'BREVO',
      level: 'INFO',
      message: `Dispatched student OTP email to ${email.replace(/(.{2})(.*)(@.*)/, '$1***$3')}`,
      meta: { quotaUsed: db.brevoSendsToday, quotaLimit: env.BREVO_DAILY_QUOTA_LIMIT },
    });

    // Enumeration-resistant response
    return reply.send({
      success: true,
      message: 'If an account exists or is eligible, a one-time verification code has been sent.',
      expiresAtSeconds: 600,
      devOtpHint: env.NODE_ENV === 'development' ? otp : undefined,
    });
  });

  /**
   * POST /auth/student/verify
   * Verify email OTP and create or return student session
   */
  fastify.post('/auth/student/verify', async (request, reply) => {
    const parse = StudentOtpVerifySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', message: 'Valid email and 6-digit OTP required' } });
    }

    const { email, otp } = parse.data;
    const challenge = db.otpChallenges.get(email.toLowerCase());

    if (!challenge) {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_OTP', message: 'No pending challenge found or OTP expired' } });
    }

    if (Date.now() > challenge.expiresAt) {
      db.otpChallenges.delete(email.toLowerCase());
      return reply.code(401).send({ success: false, error: { code: 'OTP_EXPIRED', message: 'The verification code has expired' } });
    }

    if (challenge.attempts >= 3) {
      db.otpChallenges.delete(email.toLowerCase());
      return reply.code(429).send({ success: false, error: { code: 'TOO_MANY_ATTEMPTS', message: 'Maximum verification attempts exceeded' } });
    }

    challenge.attempts++;

    if (challenge.otp !== otp) {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_OTP', message: 'Incorrect verification code' } });
    }

    // OTP verified: consume challenge
    db.otpChallenges.delete(email.toLowerCase());

    // Find or create student
    let student = Array.from(db.students.values()).find((s) => s.email.toLowerCase() === email.toLowerCase());
    if (!student) {
      student = {
        id: `stu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        email: email.toLowerCase(),
        preferredLanguage: 'en',
        targetExams: ['SSC_CGL'],
        dailyGoalMinutes: 45,
        streakDays: 1,
        status: 'ACTIVE',
        isEmailVerified: true,
        createdAt: new Date().toISOString(),
      };
      db.students.set(student.id, student);
    }

    const accessToken = signJwt({ sub: student.id, email: student.email, type: 'student' }, '1h');
    const refreshToken = signJwt({ sub: student.id, type: 'student_refresh' }, '30d');

    return reply.send({
      success: true,
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: student,
    });
  });

  /**
   * POST /auth/admin/login
   * Step 1 of admin authentication: password check -> yields preAuthToken
   */
  fastify.post('/auth/admin/login', async (request, reply) => {
    const parse = AdminLoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', message: 'Valid admin credentials required' } });
    }

    const { email, password } = parse.data;
    const admin = Array.from(db.adminUsers.values()).find((a) => a.email.toLowerCase() === email.toLowerCase());

    if (!admin || !admin.isActive) {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials' } });
    }

    const passwordMatches = await verifyPassword(password, admin.passwordHash);
    if (!passwordMatches) {
      db.logOperational({
        service: 'ADMIN_AUTH',
        level: 'WARN',
        message: `Failed admin login attempt for ${email}`,
        meta: { ip: request.ip },
      });
      return reply.code(401).send({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials' } });
    }

    // Generate short-lived pre-auth token for 2FA TOTP step (valid for 5 minutes)
    const preAuthToken = signJwt({ sub: admin.id, email: admin.email, step: 'totp_pending' }, '5m');

    return reply.send({
      success: true,
      requiresTotp: true,
      preAuthToken,
      devTotpSecret: env.NODE_ENV === 'development' ? admin.totpSecret : undefined,
    });
  });

  /**
   * POST /auth/admin/verify-totp
   * Step 2 of admin authentication: TOTP verification -> yields adminToken
   */
  fastify.post('/auth/admin/verify-totp', async (request, reply) => {
    const parse = AdminTotpVerifySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', message: 'Pre-auth token and 6-digit TOTP required' } });
    }

    const { preAuthToken, totpCode } = parse.data;
    const decoded = verifyJwt<{ sub: string; email: string; step: string }>(preAuthToken);

    if (!decoded || decoded.step !== 'totp_pending') {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_SESSION', message: 'Pre-auth session invalid or expired' } });
    }

    const admin = db.adminUsers.get(decoded.sub);
    if (!admin) {
      return reply.code(401).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Admin user not found' } });
    }

    // Verify TOTP code (RFC 6238 compliant)
    // In dev mode allow standard bypass or live verification
    const isValidTotp = verifyTotp(admin.totpSecret, totpCode) || (env.NODE_ENV === 'development' && totpCode === '123456');

    if (!isValidTotp) {
      db.logOperational({
        service: 'ADMIN_AUTH',
        level: 'WARN',
        message: `Invalid TOTP code supplied for admin ${admin.email}`,
        meta: { ip: request.ip },
      });
      return reply.code(401).send({ success: false, error: { code: 'INVALID_TOTP', message: 'Invalid two-factor authentication code' } });
    }

    const adminToken = signJwt(
      {
        sub: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        type: 'admin',
      },
      '8h'
    );

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'AUTH',
      action: 'LOGIN_SUCCESS_2FA',
      changesDiff: { ip: request.ip },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      adminToken,
      role: admin.role,
      name: admin.name,
      email: admin.email,
    });
  });
};
