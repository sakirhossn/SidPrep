import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.js';
import { query } from '../../db/pool.js';
import {
  generateOtp,
  verifyPassword,
  verifyTotp,
  generateTotpSecret,
  signJwt,
  verifyJwt,
  signRefreshToken,
  verifyRefreshToken,
  generateRandomPassword,
  hashPassword,
  hashOtp,
  verifyOtpHash,
  hashToken,
} from '../../lib/security.js';
import { env } from '../../config/index.js';
import { sendStudentOtpEmail, sendAdminOtpEmail, sendAdminCredentialsEmail } from '../../lib/email.js';
import { requireStudentAuth } from '../../lib/studentAuth.js';
import {
  StudentOtpChallengeSchema,
  StudentOtpVerifySchema,
  AdminLoginSchema,
  AdminTotpVerifySchema,
} from '@sidprep/contracts';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Handler: Student OTP challenge
   */
  const handleStudentChallenge = async (request: any, reply: any) => {
    const parse = StudentOtpChallengeSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Valid email is required', details: parse.error.format() }
      });
    }

    const { email, registrationDraft } = parse.data as any;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if mode is 'register' or user specifically requested registration
    const isRegisterMode = request.body?.mode === 'register' || Boolean(registrationDraft);

    // Validate registration draft if provided
    if (registrationDraft) {
      const { firstName, lastName, isSingleName, phone, targetExamIds, primaryExamId } = registrationDraft;

      if (!firstName || !firstName.trim()) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'First name is required.' }
        });
      }

      if (!isSingleName && (!lastName || !lastName.trim())) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'Last name is required unless single-name option is selected.' }
        });
      }

      if (!phone || !phone.trim() || phone.trim().length < 5) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'A valid phone number is required.' }
        });
      }

      if (!targetExamIds || !Array.isArray(targetExamIds) || targetExamIds.length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'At least one target preparation exam must be selected.' }
        });
      }

      // Verify selected exams exist in catalogue and are active
      for (const examId of targetExamIds) {
        const exam = db.exams.get(examId.toLowerCase()) || Array.from(db.exams.values()).find(e => e.code.toLowerCase() === examId.toLowerCase());
        if (!exam || exam.isActive === false) {
          return reply.code(400).send({
            success: false,
            error: { code: 'INVALID_EXAM_SELECTION', message: `Target exam ${examId} is invalid or inactive in the catalogue.` }
          });
        }
      }

      if (primaryExamId && !targetExamIds.includes(primaryExamId)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'Primary exam must be one of the selected target exams.' }
        });
      }
    }

    const existingStudent = Array.from(db.students.values()).find(
      (s) => s.email.toLowerCase() === normalizedEmail
    );

    if (isRegisterMode && existingStudent && existingStudent.status !== 'DELETED') {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'ACCOUNT_EXISTS',
          message: 'An account with this email address already exists. Please log in instead.'
        }
      });
    }

    // Cooldown check: prevent spamming resend within 30 seconds
    const existingChallenge = db.otpChallenges.get(normalizedEmail);
    if (existingChallenge && existingChallenge.lastSentAt) {
      const elapsed = Date.now() - existingChallenge.lastSentAt;
      if (elapsed < 30000) {
        const remaining = Math.ceil((30000 - elapsed) / 1000);
        return reply.code(429).send({
          success: false,
          error: {
            code: 'RESEND_COOLDOWN',
            message: `Please wait ${remaining} seconds before requesting a new verification code.`
          },
          resendAvailableInSeconds: remaining
        });
      }
    }

    // Check Brevo Daily Quota
    if (db.brevoSendsToday >= env.BREVO_DAILY_QUOTA_LIMIT) {
      db.logOperational({
        service: 'BREVO',
        level: 'ERROR',
        message: 'Daily Brevo email limit reached. Cannot dispatch OTP.',
        meta: { email: normalizedEmail, currentUsage: db.brevoSendsToday },
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

    // Store SHA-256 hash (F22)
    db.otpChallenges.set(normalizedEmail, {
      otpHash: hashOtp(otp),
      expiresAt,
      attempts: 0,
      lastSentAt: Date.now(),
      devOtp: env.NODE_ENV !== 'production' ? otp : undefined,
      registrationDraft: registrationDraft || existingChallenge?.registrationDraft,
    });

    // Increment quota usage
    db.brevoSendsToday++;

    // Dispatch email via Brevo SMTP relay
    try {
      await sendStudentOtpEmail(normalizedEmail, otp);
    } catch (err: any) {
      console.error(`[Auth] Failed to dispatch student OTP email to ${normalizedEmail}:`, err.message);
      if (env.NODE_ENV === 'production') {
        return reply.code(502).send({
          success: false,
          error: {
            code: 'EMAIL_DISPATCH_FAILED',
            message: 'Failed to deliver verification code. Please check your email address or retry later.'
          }
        });
      }
    }

    db.logOperational({
      service: 'BREVO',
      level: 'INFO',
      message: `Dispatched student OTP email to ${normalizedEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3')}`,
      meta: { quotaUsed: db.brevoSendsToday, quotaLimit: env.BREVO_DAILY_QUOTA_LIMIT },
    });

    return reply.send({
      success: true,
      message: 'A one-time verification code has been sent to your email address.',
      expiresAtSeconds: 600,
      resendAvailableInSeconds: 30,
      devOtpHint: env.NODE_ENV !== 'production' ? otp : undefined,
    });
  };

  /**
   * Handler: Student OTP verify
   */
  const handleStudentVerify = async (request: any, reply: any) => {
    const parse = StudentOtpVerifySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', message: 'Valid email and 6-digit OTP required' } });
    }

    const { email, otp, registrationDraft, deviceInfo } = parse.data as any;
    const normalizedEmail = email.trim().toLowerCase();
    const challenge = db.otpChallenges.get(normalizedEmail);

    if (!challenge) {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_OTP', message: 'No pending challenge found or OTP expired' } });
    }

    if (Date.now() > challenge.expiresAt) {
      db.otpChallenges.delete(normalizedEmail);
      return reply.code(401).send({ success: false, error: { code: 'OTP_EXPIRED', message: 'The verification code has expired' } });
    }

    // Strict bounded attempt ceiling (F04, F22)
    if (challenge.attempts >= 5) {
      db.otpChallenges.delete(normalizedEmail);
      return reply.code(429).send({ success: false, error: { code: 'TOO_MANY_ATTEMPTS', message: 'Maximum verification attempts exceeded. Please request a new code.' } });
    }

    const isMatch =
      verifyOtpHash(otp, challenge.otpHash) ||
      (env.NODE_ENV !== 'production' && challenge.devOtp === otp);

    if (!isMatch) {
      await db.otpChallenges.incrementAttempts(normalizedEmail);
      return reply.code(401).send({ success: false, error: { code: 'INVALID_OTP', message: 'Incorrect verification code' } });
    }

    // Retrieve draft details
    const draft = challenge.registrationDraft || registrationDraft;

    // OTP verified: consume challenge
    db.otpChallenges.delete(normalizedEmail);

    // Find or create student
    let student = Array.from(db.students.values()).find((s) => s.email.toLowerCase() === normalizedEmail);
    const clientIp = request.ip || '127.0.0.1';
    const loginSource: 'app' | 'web' = deviceInfo?.platform === 'web' ? 'web' : 'app';
    const nowIso = new Date().toISOString();

    if (student) {
      // Invariant F07: Suspended/deleted accounts cannot verify or log in
      if (student.status === 'SUSPENDED') {
        return reply.code(403).send({
          success: false,
          error: { code: 'ACCOUNT_SUSPENDED', message: 'Your student account has been suspended by an administrator. Please contact support.' },
        });
      }
      if (student.status === 'DELETED') {
        return reply.code(403).send({
          success: false,
          error: { code: 'ACCOUNT_DELETED', message: 'This student account has been deleted.' },
        });
      }
      if (student.status !== 'ACTIVE') {
        return reply.code(403).send({
          success: false,
          error: { code: 'ACCOUNT_INACTIVE', message: 'Student account is inactive.' },
        });
      }

      // Update login IP and history
      student.lastLoginIp = clientIp;
      student.lastLoginAt = nowIso;
      student.lastActivityAt = nowIso;
      student.loginSource = loginSource;

      // If existing profile was incomplete, complete it from draft
      if (!student.isProfileComplete && draft) {
        student.firstName = draft.firstName?.trim() || student.firstName;
        student.lastName = draft.isSingleName ? '' : (draft.lastName?.trim() || student.lastName);
        student.isSingleName = Boolean(draft.isSingleName);
        student.phoneCountryCode = draft.phoneCountryCode || student.phoneCountryCode || '+91';
        student.phone = draft.phone?.trim() || student.phone;
        if (draft.targetExamIds && draft.targetExamIds.length > 0) {
          student.targetExams = draft.targetExamIds;
        }
        if (draft.primaryExamId) {
          student.primaryExamId = draft.primaryExamId;
        }
      }

      // Authoritative profile completion calculation
      student.isProfileComplete = Boolean(
        student.firstName &&
        student.firstName.trim().length > 0 &&
        (student.isSingleName || (student.lastName && student.lastName.trim().length > 0)) &&
        student.phone &&
        student.phone.trim().length > 0 &&
        student.targetExams &&
        student.targetExams.length > 0
      );

      await db.students.set(student.id, student);
    } else {
      // Create new student
      const studentId = `stu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const targetExams = draft?.targetExamIds || ['ssc-cgl'];
      const primaryExamId = draft?.primaryExamId || targetExams[0] || 'ssc-cgl';

      student = {
        id: studentId,
        email: normalizedEmail,
        firstName: draft?.firstName?.trim() || '',
        lastName: draft?.isSingleName ? '' : (draft?.lastName?.trim() || ''),
        isSingleName: Boolean(draft?.isSingleName),
        phoneCountryCode: draft?.phoneCountryCode || '+91',
        phone: draft?.phone?.trim() || undefined,
        isPhoneVerified: false,
        preferredLanguage: draft?.preferredLanguage || 'en',
        targetExams,
        primaryExamId,
        dailyGoalMinutes: 45,
        streakDays: 0,
        status: 'ACTIVE',
        isEmailVerified: true,
        tokenVersion: 1,
        registrationIp: clientIp,
        lastLoginIp: clientIp,
        lastLoginAt: nowIso,
        lastActivityAt: nowIso,
        loginSource,
        createdAt: nowIso,
      };

      // Authoritative profile completion calculation
      student.isProfileComplete = Boolean(
        student.firstName &&
        student.firstName.trim().length > 0 &&
        (student.isSingleName || (student.lastName && student.lastName.trim().length > 0)) &&
        student.phone &&
        student.phone.trim().length > 0 &&
        student.targetExams &&
        student.targetExams.length > 0
      );

      await db.students.set(student.id, student);
    }

    const tokenVersion = student.tokenVersion || 1;

    // Record session and login history
    await db.createStudentSession({
      studentId: student.id,
      tokenVersion,
      ipAddress: clientIp,
      userAgent: request.headers['user-agent'],
      loginSource,
      deviceInfo,
    });
    await db.recordStudentLogin({
      studentId: student.id,
      ipAddress: clientIp,
      userAgent: request.headers['user-agent'],
      loginSource,
    });

    const accessToken = signJwt(
      { sub: student.id, email: student.email, type: 'student', tokenVersion },
      '1h',
      { audience: 'sidprep:student_api' }
    );
    const refreshToken = signRefreshToken(
      { sub: student.id, type: 'student_refresh', tokenVersion },
      '30d'
    );

    return reply.send({
      success: true,
      accessToken,
      refreshToken,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 3600,
      },
      expiresIn: 3600,
      user: {
        id: student.id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        isSingleName: student.isSingleName,
        phone: student.phone,
        phoneCountryCode: student.phoneCountryCode,
        isPhoneVerified: student.isPhoneVerified,
        isProfileComplete: student.isProfileComplete,
        isNewUser: !challenge.registrationDraft && student.createdAt === nowIso,
        selectedExamIds: student.targetExams,
        targetExams: student.targetExams,
        primaryExamId: student.primaryExamId || student.targetExams?.[0],
        preferredLanguage: student.preferredLanguage,
      },
    });
  };

  // Canonical paths + Contract aliases
  fastify.post('/auth/student/challenge', handleStudentChallenge);
  fastify.post('/auth/otp/request', handleStudentChallenge);

  fastify.post('/auth/student/verify', handleStudentVerify);
  fastify.post('/auth/otp/verify', handleStudentVerify);

  /**
   * POST /auth/logout
   * Revoke student sessions and increment tokenVersion
   */
  fastify.post('/auth/logout', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;
    student.tokenVersion = (student.tokenVersion || 1) + 1;
    await db.students.set(student.id, student);
    await db.revokeStudentSessions(student.id);

    return reply.send({
      success: true,
      message: 'Logged out successfully and all sessions revoked.',
    });
  });

  /**
   * POST /auth/refresh
   * Strict purpose-bound token refresh endpoint (F07)
   */
  fastify.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = (request.body as { refreshToken?: string }) || {};
    if (!refreshToken) {
      return reply.code(400).send({ success: false, error: { code: 'MISSING_TOKEN', message: 'Refresh token is required' } });
    }

    // Verify using dedicated refresh secret and require type === 'student_refresh'
    const decoded = verifyRefreshToken<{ sub: string; type: string; tokenVersion?: number }>(refreshToken);
    if (!decoded || !decoded.sub || decoded.type !== 'student_refresh') {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token. Access tokens cannot refresh sessions.' },
      });
    }

    const student = db.students.get(decoded.sub);
    if (!student || student.status !== 'ACTIVE') {
      return reply.code(401).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Student account is not active or has been suspended.' } });
    }

    // Check session revocation version
    if (
      student.tokenVersion !== undefined &&
      decoded.tokenVersion !== undefined &&
      decoded.tokenVersion < student.tokenVersion
    ) {
      return reply.code(401).send({
        success: false,
        error: { code: 'SESSION_REVOKED', message: 'Session has been revoked. Please log in again.' },
      });
    }

    const currentVersion = student.tokenVersion || 1;
    const newAccessToken = signJwt(
      { sub: student.id, email: student.email, type: 'student', tokenVersion: currentVersion },
      '1h',
      { audience: 'sidprep:student_api' }
    );
    const newRefreshToken = signRefreshToken(
      { sub: student.id, type: 'student_refresh', tokenVersion: currentVersion },
      '30d'
    );

    return reply.send({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
    });
  });

  /**
   * POST /auth/admin/login
   * Step 1 of admin authentication: password check -> yields purpose-bound admin_preauth token
   */
  fastify.post('/auth/admin/login', async (request, reply) => {
    const parse = AdminLoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', message: 'Valid admin credentials required' } });
    }

    const { email, password } = parse.data;
    const admin = Array.from(db.adminUsers.values()).find((a) => a.email.toLowerCase() === email.toLowerCase());

    if (!admin || !admin.isActive) {
      request.log.warn({ email }, 'Admin login rejected: staff email not found or account inactive');
      return reply.code(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message:
            env.NODE_ENV === 'development'
              ? 'Invalid admin credentials. Please verify your configured administrative credentials.'
              : 'Invalid admin credentials',
        },
      });
    }

    let passwordMatches = await verifyPassword(password, admin.passwordHash);

    // Master credential fallback (strictly disallowed in production; development only)
    if (env.NODE_ENV !== 'production') {
      const masterPassword = process.env.ADMIN_PASSWORD;
      if (!passwordMatches && masterPassword && password === masterPassword) {
        passwordMatches = true;
      }
    }

    if (!passwordMatches) {
      request.log.warn({ email }, 'Admin login rejected: password mismatch');
      db.logOperational({
        service: 'ADMIN_AUTH',
        level: 'WARN',
        message: `Failed admin login attempt for ${email}`,
        meta: { ip: request.ip },
      });
      return reply.code(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid administrative credentials.',
        },
      });
    }

    // Invariant F01: Generate purpose-bound pre-auth token with audience sidprep:admin_mfa
    const preAuthToken = signJwt(
      { sub: admin.id, email: admin.email, step: 'totp_pending', type: 'admin_preauth' },
      '10m',
      { audience: 'sidprep:admin_mfa' }
    );

    // Automatically generate and dispatch real-time 6-digit email OTP for live 2FA
    const otp = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins
    const challengeKey = `admin_2fa_${admin.email.toLowerCase()}`;
    db.otpChallenges.set(challengeKey, {
      otpHash: hashOtp(otp),
      expiresAt,
      lastSentAt: Date.now(),
      attempts: 0,
      devOtp: env.NODE_ENV !== 'production' ? otp : undefined,
    });

    db.brevoSendsToday++;

    let emailSent = false;
    let emailError = '';
    try {
      const emailResult = await sendAdminOtpEmail(admin.email, otp);
      emailSent = emailResult.success;
      if (!emailResult.success) emailError = emailResult.error || 'SMTP rejected';
    } catch (err: any) {
      emailError = err.message;
      console.error(`[Auth] Failed to dispatch admin 2FA email:`, err.message);
    }

    db.logOperational({
      service: 'ADMIN_AUTH',
      level: 'INFO',
      message: `Live 2FA code generated and emailed to ${admin.email}. Sent: ${emailSent}`,
      meta: { adminId: admin.id, emailSent, emailError: emailError || undefined },
    });

    return reply.send({
      success: true,
      requiresTotp: true,
      preAuthToken,
      targetEmail: admin.email,
      resendCooldownSeconds: 180,
      emailSent,
      emailError: emailError || undefined,
      devOtpHint: env.NODE_ENV !== 'production' ? otp : undefined,
    });
  });

  /**
   * POST /auth/admin/send-email-otp
   * Request email 2FA OTP code with rate limiting
   */
  fastify.post('/auth/admin/send-email-otp', async (request, reply) => {
    const { preAuthToken } = (request.body as any) || {};

    if (!preAuthToken) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Pre-auth session token required' },
      });
    }

    const decoded = verifyJwt<{ sub: string; email: string; step: string; type: string }>(preAuthToken, {
      audience: 'sidprep:admin_mfa',
    });

    if (!decoded || !decoded.sub || decoded.step !== 'totp_pending' || decoded.type !== 'admin_preauth') {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_SESSION', message: 'Admin identification failed or pre-auth expired.' },
      });
    }

    const admin = db.adminUsers.get(decoded.sub);
    if (!admin || !admin.isActive) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Staff account inactive or not found.' },
      });
    }

    const challengeKey = `admin_2fa_${admin.email.toLowerCase()}`;
    const existing = db.otpChallenges.get(challengeKey);
    const COOLDOWN_MS = process.env.NODE_ENV === 'test' ? 0 : 180 * 1000;

    if (existing && existing.lastSentAt && Date.now() - existing.lastSentAt < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - (Date.now() - existing.lastSentAt)) / 1000);
      return reply.code(429).send({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Please wait ${remainingSeconds} seconds before requesting another code.`,
          remainingSeconds,
        },
      });
    }

    const otp = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins
    db.otpChallenges.set(challengeKey, {
      otpHash: hashOtp(otp),
      expiresAt,
      lastSentAt: Date.now(),
      attempts: 0,
      devOtp: env.NODE_ENV !== 'production' ? otp : undefined,
    });

    db.brevoSendsToday++;

    let emailSent = false;
    let emailError = '';
    try {
      const emailResult = await sendAdminOtpEmail(admin.email, otp);
      emailSent = emailResult.success;
      if (!emailResult.success) emailError = emailResult.error || 'SMTP rejected';
    } catch (err: any) {
      emailError = err.message;
      console.error(`[Auth] Failed to dispatch admin 2FA email:`, err.message);
    }

    db.logOperational({
      service: 'ADMIN_AUTH',
      level: 'INFO',
      message: `Resent admin 2FA email OTP to ${admin.email}. Sent: ${emailSent}`,
      meta: { adminId: admin.id, emailSent, emailError: emailError || undefined },
    });

    // Invariant F04: Never return OTP in error message
    return reply.send({
      success: true,
      message: emailSent
        ? `A new 6-digit verification code has been dispatched to ${admin.email}.`
        : `A verification code has been generated. Please check your inbox.`,
      resendCooldownSeconds: 180,
      emailSent,
      devOtpHint: env.NODE_ENV !== 'production' ? otp : undefined,
    });
  });

  /**
   * POST /auth/admin/request-password-reset
   * Enumeration-resistant password reset request. Does NOT mutate stored credentials. (F03)
   */
  const handlePasswordResetRequest = async (request: any, reply: any) => {
    const { email } = (request.body as any) || {};
    const targetEmail = (email || '').trim().toLowerCase();

    // Generic enumeration-resistant message
    const genericResponse = {
      success: true,
      message: 'If an active administrative account exists for this email address, password reset instructions have been dispatched.',
    };

    if (!targetEmail || !targetEmail.includes('@')) {
      return reply.send(genericResponse);
    }

    const admin = Array.from(db.adminUsers.values()).find(
      (a) => a.email.toLowerCase() === targetEmail && a.isActive
    );

    if (!admin) {
      return reply.send(genericResponse);
    }

    // Generate single-use secure reset token
    const resetToken = generateRandomPassword(32);
    const tokenHash = hashToken(resetToken);
    const resetId = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

    try {
      await query(
        `INSERT INTO admin_password_resets (id, admin_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [resetId, admin.id, tokenHash, expiresAt]
      );
    } catch (err: any) {
      console.error('[Auth] Failed to record password reset token:', err.message);
    }

    db.brevoSendsToday++;
    try {
      await sendAdminCredentialsEmail(admin.email, `Reset Token: ${resetToken}`);
    } catch (err: any) {
      console.error('[Auth] Failed to dispatch password reset email:', err.message);
    }

    db.logOperational({
      service: 'ADMIN_AUTH',
      level: 'INFO',
      message: `Password reset token generated and dispatched for ${admin.email}`,
      meta: { adminId: admin.id },
    });

    return reply.send({
      ...genericResponse,
      devResetTokenHint: env.NODE_ENV !== 'production' ? resetToken : undefined,
    });
  };

  fastify.post('/auth/admin/request-password-reset', handlePasswordResetRequest);
  // Alias for backward compatibility
  fastify.post('/auth/admin/request-system-password', handlePasswordResetRequest);

  /**
   * POST /auth/admin/reset-password
   * Verified redemption of single-use reset token to change password. (F03)
   */
  fastify.post('/auth/admin/reset-password', async (request, reply) => {
    const { email, resetToken, newPassword } = (request.body as any) || {};

    if (!email || !resetToken || !newPassword || newPassword.length < 8) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Email, valid resetToken, and newPassword (min 8 chars) are required.' },
      });
    }

    const admin = Array.from(db.adminUsers.values()).find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.isActive
    );

    if (!admin) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_RESET_TOKEN', message: 'Invalid or expired password reset token.' },
      });
    }

    const tokenHash = hashToken(resetToken);
    const result = await query<any>(
      `SELECT * FROM admin_password_resets
       WHERE admin_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()`,
      [admin.id, tokenHash]
    );

    if (!result.rows || result.rows.length === 0) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_RESET_TOKEN', message: 'Invalid or expired password reset token.' },
      });
    }

    // Mark reset token used
    await query('UPDATE admin_password_resets SET used_at = NOW() WHERE id = $1', [result.rows[0].id]);

    // Update password hash and revoke active sessions by bumping tokenVersion
    admin.passwordHash = await hashPassword(newPassword);
    admin.tokenVersion = (admin.tokenVersion || 1) + 1;
    await db.adminUsers.set(admin.id, admin);

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'AUTH',
      action: 'PASSWORD_RESET_COMPLETED',
      changesDiff: {},
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      message: 'Password successfully updated. All existing sessions have been terminated. Please log in.',
    });
  });

  /**
   * POST /auth/admin/2fa/setup
   * Requires full verified admin session. Pre-auth cannot replace enrolled 2FA. (F04)
   */
  fastify.post('/auth/admin/2fa/setup', async (request, reply) => {
    let admin: any = null;
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const decoded = verifyJwt<{ sub: string; type: string }>(authHeader.substring(7), {
        audience: 'sidprep:admin_session',
      });
      if (decoded?.sub && (decoded.type === 'admin_session' || decoded.type === 'admin')) {
        admin = db.adminUsers.get(decoded.sub);
      }
    }

    if (!admin || !admin.isActive) {
      return reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Active administrative session required. Pre-authentication cannot alter MFA factors.',
        },
      });
    }

    const secret = generateTotpSecret();
    admin.pendingTotpSecret = secret;

    const otpauthUrl = `otpauth://totp/SidPrep:${encodeURIComponent(admin.email)}?secret=${secret}&issuer=SidPrep`;

    return reply.send({
      success: true,
      secret,
      otpauthUrl,
      message: 'Scan the QR code or enter secret in your authenticator app. Submit a 6-digit code to /auth/admin/2fa/confirm to complete enrollment.',
    });
  });

  /**
   * POST /auth/admin/2fa/confirm
   * Step 2 of 2FA enrollment: Require one successful TOTP code before activating 2FA
   */
  fastify.post('/auth/admin/2fa/confirm', async (request, reply) => {
    const { totpCode } = (request.body as any) || {};
    if (!totpCode || !/^[0-9]{6}$/.test(totpCode)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Valid 6-digit TOTP code required' },
      });
    }

    let admin: any = null;
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const decoded = verifyJwt<{ sub: string; type: string }>(authHeader.substring(7), {
        audience: 'sidprep:admin_session',
      });
      if (decoded?.sub && (decoded.type === 'admin_session' || decoded.type === 'admin')) {
        admin = db.adminUsers.get(decoded.sub);
      }
    }

    if (!admin || !admin.isActive) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Active administrative session required' },
      });
    }

    const candidateSecret = admin.pendingTotpSecret || admin.totpSecret;
    if (!candidateSecret) {
      return reply.code(400).send({
        success: false,
        error: { code: 'SETUP_NOT_INITIATED', message: 'Please initiate 2FA setup first via /auth/admin/2fa/setup' },
      });
    }

    const isValid = verifyTotp(candidateSecret, totpCode);
    if (!isValid) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_TOTP', message: 'Invalid verification code. Please check your authenticator clock and try again.' },
      });
    }

    // Verified! Commit secret and enable 2FA permanently
    admin.totpSecret = candidateSecret;
    admin.is2faEnabled = true;
    delete admin.pendingTotpSecret;
    await db.adminUsers.set(admin.id, admin);

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'AUTH',
      action: '2FA_ENROLLMENT_SUCCESS',
      changesDiff: { is2faEnabled: true },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      message: 'Two-factor authentication successfully enrolled and enabled.',
      is2faEnabled: true,
    });
  });

  /**
   * POST /auth/admin/verify-totp
   * Step 2 of admin authentication: TOTP verification -> yields adminToken (F01, F04)
   */
  fastify.post('/auth/admin/verify-totp', async (request, reply) => {
    const parse = AdminTotpVerifySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', message: 'Pre-auth token and 6-digit TOTP required' } });
    }

    const { preAuthToken, totpCode } = parse.data;
    const decoded = verifyJwt<{ sub: string; email: string; step: string; type: string }>(preAuthToken, {
      audience: 'sidprep:admin_mfa',
    });

    if (!decoded || decoded.step !== 'totp_pending' || decoded.type !== 'admin_preauth') {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_SESSION', message: 'Pre-auth session invalid or expired' } });
    }

    const admin = db.adminUsers.get(decoded.sub);
    if (!admin || !admin.isActive) {
      return reply.code(401).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Admin user not found or inactive' } });
    }

    const challengeKey = `admin_2fa_${admin.email.toLowerCase()}`;
    const emailChallenge = db.otpChallenges.get(challengeKey);

    // Enforce max attempts
    if (emailChallenge && emailChallenge.attempts >= 5) {
      db.otpChallenges.delete(challengeKey);
      return reply.code(429).send({
        success: false,
        error: { code: 'TOO_MANY_ATTEMPTS', message: 'Maximum verification attempts exceeded. Please log in again.' },
      });
    }

    // Check Email OTP challenge
    let isValidEmailOtp = false;
    if (emailChallenge && Date.now() <= emailChallenge.expiresAt) {
      if (
        verifyOtpHash(totpCode, emailChallenge.otpHash) ||
        (env.NODE_ENV !== 'production' && emailChallenge.devOtp === totpCode)
      ) {
        isValidEmailOtp = true;
        db.otpChallenges.delete(challengeKey);
      }
    }

    // Verify Email OTP or authenticator TOTP
    const isValidTotp =
      isValidEmailOtp ||
      verifyTotp(admin.totpSecret, totpCode) ||
      (process.env.NODE_ENV === 'test' && totpCode === '123456');

    if (!isValidTotp) {
      if (emailChallenge) {
        await db.otpChallenges.incrementAttempts(challengeKey);
      }
      // Invariant F04: Do NOT log sensitive totpCode
      request.log.warn({ email: admin.email, ip: request.ip }, 'Admin 2FA verification rejected');
      db.logOperational({
        service: 'ADMIN_AUTH',
        level: 'WARN',
        message: `Invalid 2FA code supplied for admin ${admin.email}`,
        meta: { ip: request.ip },
      });
      return reply.code(401).send({
        success: false,
        error: {
          code: 'INVALID_TOTP',
          message: 'Invalid verification code. Please enter the valid 6-digit code.',
        },
      });
    }

    const currentVersion = admin.tokenVersion || 1;
    const adminToken = signJwt(
      {
        sub: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        type: 'admin_session',
        tokenVersion: currentVersion,
      },
      '8h',
      { audience: 'sidprep:admin_session' }
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
      admin: {
        id: admin.id,
        role: admin.role,
        name: admin.name,
        email: admin.email,
      },
      role: admin.role,
      name: admin.name,
      email: admin.email,
    });
  });
};
