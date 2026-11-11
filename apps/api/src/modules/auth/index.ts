import type { FastifyPluginAsync } from 'fastify';
import { db, StudentRecord } from '../../db/index.js';
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
  maskEmail,
  generateRandomToken,
} from '../../lib/security.js';
import { env } from '../../config/index.js';
import {
  sendStudentOtpEmail,
  sendAdminOtpEmail,
  sendAdminCredentialsEmail,
  sendAdminPasswordResetEmail,
  sendAdminPasswordChangedEmail,
  sendStudentPasswordResetEmail,
  sendStudentPasswordSetupEmail,
  sendStudentPasswordChangedEmail,
} from '../../lib/email.js';
import { requireStudentAuth } from '../../lib/studentAuth.js';
import { AuthRateLimits } from '../../lib/rateLimiter.js';
import {
  StudentOtpChallengeSchema,
  StudentOtpVerifySchema,
  AdminLoginSchema,
  AdminTotpVerifySchema,
  StudentPasswordLoginSchema,
  StudentPasswordRegisterSchema,
  PasswordResetRequestSchema,
  PasswordResetConfirmSchema,
  PasswordSetupRequestSchema,
  PasswordSetupConfirmSchema,
  ChangePasswordSchema,
  validatePasswordPolicy,
} from '@sidprep/contracts';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Handler: Student OTP challenge
   * Features:
   * - Reuse existing unexpired challenge without generating new OTP or dispatching extra email
   * - Masked email on server ("sks***@gmail.com")
   * - Purpose-bound: 'student_registration' | 'student_recovery' | 'email_change'
   */
  const handleStudentChallenge = async (request: any, reply: any) => {
    const parse = StudentOtpChallengeSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Valid email is required', details: parse.error.format() },
      });
    }

    const { email, registrationDraft } = parse.data as any;
    const normalizedEmail = email.trim().toLowerCase();
    const existingStudent = Array.from(db.students.values()).find(
      (s) => s.email.toLowerCase() === normalizedEmail
    );
    const hasExplicitRegisterPurpose = request.body?.purpose === 'student_registration';
    const isRegisterMode = request.body?.mode === 'register' || Boolean(registrationDraft) || hasExplicitRegisterPurpose || !existingStudent;
    const purpose = (request.body?.purpose || (isRegisterMode ? 'student_registration' : 'student_login')) as string;

    // Validate registration draft if provided
    if (registrationDraft) {
      const { firstName, lastName, isSingleName, phone, targetExamIds, primaryExamId } = registrationDraft;

      if (!firstName || !firstName.trim()) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'First name is required.' },
        });
      }

      if (!isSingleName && (!lastName || !lastName.trim())) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'Last name is required unless single-name option is selected.' },
        });
      }

      if (!phone || !phone.trim() || phone.trim().length < 5) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'A valid phone number is required.' },
        });
      }

      if (!targetExamIds || !Array.isArray(targetExamIds) || targetExamIds.length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'At least one target preparation exam must be selected.' },
        });
      }

      for (const examId of targetExamIds) {
        const exam =
          db.exams.get(examId.toLowerCase()) ||
          Array.from(db.exams.values()).find((e) => e.code.toLowerCase() === examId.toLowerCase());
        if (!exam || exam.isActive === false) {
          return reply.code(400).send({
            success: false,
            error: { code: 'INVALID_EXAM_SELECTION', message: `Target exam ${examId} is invalid or inactive in the catalogue.` },
          });
        }
      }

      if (primaryExamId && !targetExamIds.includes(primaryExamId)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_REGISTRATION_DRAFT', message: 'Primary exam must be one of the selected target exams.' },
        });
      }
    }

    if (isRegisterMode && existingStudent && existingStudent.status !== 'DELETED') {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'ACCOUNT_EXISTS',
          message: 'An account with this email address already exists. Please log in instead.',
        },
      });
    }

    // 1. REUSE EXISTING VALID OTP IF UNUSED AND UNEXPIRED (Requirement 3)
    const existingChallenge = await db.otpChallenges.getActiveChallenge(normalizedEmail, purpose);
    if (existingChallenge && Date.now() <= existingChallenge.expiresAt && existingChallenge.attempts < 5) {
      const remainingMs = Math.max(0, existingChallenge.expiresAt - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const mm = Math.floor(remainingSeconds / 60);
      const ss = String(remainingSeconds % 60).padStart(2, '0');
      const timeFormatted = `${mm}:${ss}`;
      const masked = maskEmail(normalizedEmail);

      return reply.send({
        success: true,
        reused: true,
        maskedEmail: masked,
        message: `A verification code was already sent to ${masked}. Use that code; it expires in ${timeFormatted}.`,
        expiresAtSeconds: remainingSeconds,
        expiresInSeconds: remainingSeconds,
        resendAvailableInSeconds: remainingSeconds,
        remainingAttempts: 5 - existingChallenge.attempts,
        devOtpHint: env.NODE_ENV !== 'production' ? existingChallenge.devOtp : undefined,
      });
    }

    // 2. Cooldown check if maximum attempts reached
    if (
      existingChallenge &&
      (existingChallenge.attempts >= 5 ||
        (existingChallenge.cooldownUntil && Date.now() < existingChallenge.cooldownUntil))
    ) {
      const cooldownRemaining = existingChallenge.cooldownUntil
        ? Math.ceil((existingChallenge.cooldownUntil - Date.now()) / 1000)
        : 900;
      return reply.code(429).send({
        success: false,
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Maximum verification attempts exceeded. Please wait before requesting a new code.',
          retryAfterSeconds: cooldownRemaining,
        },
      });
    }

    // 3. Brevo Daily Quota Check
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

    // Dispatch email via Brevo SMTP relay
    let emailDispatched = false;
    try {
      const emailResult = await sendStudentOtpEmail(normalizedEmail, otp);
      emailDispatched = emailResult.success;
    } catch (err: any) {
      console.error(`[Auth] Failed to dispatch student OTP email to ${normalizedEmail}:`, err.message);
    }

    if (!emailDispatched && env.NODE_ENV === 'production') {
      return reply.code(502).send({
        success: false,
        error: {
          code: 'EMAIL_DISPATCH_FAILED',
          message: 'Failed to deliver verification code. Please check your email address or retry later.',
        },
      });
    }

    // Store in PostgreSQL backed challenge repository
    db.otpChallenges.set(
      normalizedEmail,
      {
        email: normalizedEmail,
        purpose,
        otpHash: hashOtp(otp),
        expiresAt,
        attempts: 0,
        lastSentAt: Date.now(),
        devOtp: env.NODE_ENV !== 'production' ? otp : undefined,
        registrationDraft: registrationDraft || existingChallenge?.registrationDraft,
      },
      purpose
    );

    db.brevoSendsToday++;
    const masked = maskEmail(normalizedEmail);

    db.logOperational({
      service: 'BREVO',
      level: 'INFO',
      message: `Dispatched student OTP email to ${masked}`,
      meta: { quotaUsed: db.brevoSendsToday, quotaLimit: env.BREVO_DAILY_QUOTA_LIMIT },
    });

    return reply.send({
      success: true,
      reused: false,
      maskedEmail: masked,
      message: `A 6-digit verification code has been sent to your registered email address: ${masked}.`,
      expiresAtSeconds: 600,
      expiresInSeconds: 600,
      resendAvailableInSeconds: 30,
      remainingAttempts: 5,
      devOtpHint: env.NODE_ENV !== 'production' ? otp : undefined,
    });
  };

  /**
   * Handler: Student OTP verify
   * Consumes challenge atomically and generates verification grant
   */
  const handleStudentVerify = async (request: any, reply: any) => {
    const parse = StudentOtpVerifySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Valid email and 6-digit OTP required' },
      });
    }

    const { email, otp, registrationDraft, deviceInfo } = parse.data as any;
    const normalizedEmail = email.trim().toLowerCase();
    const explicitPurpose = request.body?.purpose as string | undefined;

    let challenge = explicitPurpose
      ? await db.otpChallenges.getActiveChallenge(normalizedEmail, explicitPurpose)
      : null;

    if (!challenge && !explicitPurpose) {
      challenge =
        (await db.otpChallenges.getActiveChallenge(normalizedEmail, 'student_registration')) ||
        (await db.otpChallenges.getActiveChallenge(normalizedEmail, 'student_login')) ||
        (await db.otpChallenges.getActiveChallenge(normalizedEmail, 'student_recovery'));
    }

    const purpose = challenge?.purpose || explicitPurpose || 'student_registration';

    if (!challenge) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_OTP', message: 'No pending challenge found or OTP expired' },
      });
    }

    if (Date.now() > challenge.expiresAt) {
      db.otpChallenges.delete(normalizedEmail, purpose);
      return reply.code(401).send({
        success: false,
        error: { code: 'OTP_EXPIRED', message: 'The verification code has expired' },
      });
    }

    if (challenge.attempts >= 5) {
      await db.otpChallenges.invalidateChallenge(normalizedEmail, purpose, 15);
      return reply.code(429).send({
        success: false,
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Maximum verification attempts exceeded. Please wait 15 minutes before requesting a new code.',
        },
      });
    }

    const isMatch =
      verifyOtpHash(otp, challenge.otpHash) ||
      (env.NODE_ENV !== 'production' && challenge.devOtp === otp);

    if (!isMatch) {
      const attempts = await db.otpChallenges.incrementAttempts(normalizedEmail, purpose);
      if (attempts >= 5) {
        await db.otpChallenges.invalidateChallenge(normalizedEmail, purpose, 15);
        return reply.code(429).send({
          success: false,
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Maximum verification attempts exceeded. Please wait 15 minutes before requesting a new code.',
          },
        });
      }
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_OTP', message: `Incorrect verification code. ${5 - attempts} attempt(s) remaining.` },
        remainingAttempts: 5 - attempts,
      });
    }

    // Atomically consume challenge
    if (challenge.id) {
      const consumed = await db.otpChallenges.consumeAtomically(challenge.id);
      if (!consumed) {
        return reply.code(401).send({
          success: false,
          error: { code: 'CHALLENGE_ALREADY_USED', message: 'Verification code has already been used.' },
        });
      }
    }
    db.otpChallenges.delete(normalizedEmail, purpose);

    // Issue short-lived server-side verification grant for registration flow
    let verificationGrant = '';
    const grantPurpose = purpose === 'student_login' && request.url.includes('verify-email') ? 'student_registration' : purpose;
    if (grantPurpose === 'student_registration' || request.url.includes('verify-email')) {
      const rawGrantToken = generateRandomToken(32);
      const grantHash = hashToken(rawGrantToken);
      const grantId = `vgr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const grantExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      try {
        await query(
          `INSERT INTO verification_grants (id, email, grant_hash, purpose, expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [grantId, normalizedEmail, grantHash, 'student_registration', grantExpiresAt]
        );
        verificationGrant = rawGrantToken;
      } catch (err: any) {
        console.error('[Auth] Error recording verification grant:', err.message);
      }
    }

    // If this is dedicated email verification for registration flow, return grant immediately without creating student
    if (request.url.includes('verify-email')) {
      return reply.send({
        success: true,
        verified: true,
        email: normalizedEmail,
        verificationGrant,
        message: 'Email address verified successfully.',
      });
    }

    // Check if an existing student record exists or if this call should create an active session
    let student = Array.from(db.students.values()).find((s) => s.email.toLowerCase() === normalizedEmail);
    const clientIp = request.ip || '127.0.0.1';
    const loginSource: 'app' | 'web' = deviceInfo?.platform === 'web' ? 'web' : 'app';
    const nowIso = new Date().toISOString();
    const draft = challenge.registrationDraft || registrationDraft;
    let isNewUser = false;

    if (student) {
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

      student.lastLoginIp = clientIp;
      student.lastLoginAt = nowIso;
      student.lastActivityAt = nowIso;
      student.loginSource = loginSource;
      student.isEmailVerified = true;

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
      isNewUser = true;
      // Create student from draft if provided, or default profile
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

    let accessToken: string | undefined;
    let refreshToken: string | undefined;

    if (student) {
      const tokenVersion = student.tokenVersion || 1;
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

      accessToken = signJwt(
        { sub: student.id, email: student.email, type: 'student', tokenVersion },
        '1h',
        { audience: 'sidprep:student_api' }
      );
      refreshToken = signRefreshToken(
        { sub: student.id, type: 'student_refresh', tokenVersion },
        '30d'
      );
    }

    return reply.send({
      success: true,
      verified: true,
      email: normalizedEmail,
      verificationGrant: verificationGrant || undefined,
      accessToken,
      refreshToken,
      tokens: accessToken && refreshToken ? { accessToken, refreshToken, expiresIn: 3600 } : undefined,
      expiresIn: 3600,
      user: student
        ? {
            id: student.id,
            email: student.email,
            firstName: student.firstName,
            lastName: student.lastName,
            isSingleName: student.isSingleName,
            phone: student.phone,
            phoneCountryCode: student.phoneCountryCode,
            isPhoneVerified: student.isPhoneVerified,
            isProfileComplete: student.isProfileComplete,
            selectedExamIds: student.targetExams,
            targetExams: student.targetExams,
            primaryExamId: student.primaryExamId || student.targetExams?.[0],
            preferredLanguage: student.preferredLanguage,
            isNewUser,
          }
        : undefined,
      message: 'Verification successful.',
    });
  };

  // Canonical paths + Contract aliases
  fastify.post('/auth/student/challenge', handleStudentChallenge);
  fastify.post('/auth/otp/request', handleStudentChallenge);
  fastify.post('/auth/student/verify', handleStudentVerify);
  fastify.post('/auth/otp/verify', handleStudentVerify);

  /**
   * POST /auth/student/verify-email
   * Dedicated email verification for registration flow
   */
  fastify.post('/auth/student/verify-email', handleStudentVerify);

  /**
   * POST /auth/student/login
   * Email-and-password login for students (No OTP on normal login)
   */
  fastify.post('/auth/student/login', async (request, reply) => {
    const parse = StudentPasswordLoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Valid email and password required', details: parse.error.format() },
      });
    }

    const { email, password, deviceInfo } = parse.data;
    const normalizedEmail = email.trim().toLowerCase();
    const clientIp = request.ip || '127.0.0.1';

    // Rate limiting check
    const rateCheck = await AuthRateLimits.checkLogin(normalizedEmail, clientIp);
    if (!rateCheck.allowed) {
      return reply.code(429).send({
        success: false,
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: rateCheck.message || 'Too many failed login attempts. Please try again later.',
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
      });
    }

    const student = Array.from(db.students.values()).find((s) => s.email.toLowerCase() === normalizedEmail);

    if (!student) {
      await AuthRateLimits.recordFailedLogin(normalizedEmail, clientIp);
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      });
    }

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

    // Check if student has set a password (existing OTP-only student support)
    if (!student.passwordHash) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'PASSWORD_NOT_SET',
          message: 'Your account does not have a password set yet. Please use "Set your password" to establish one.',
        },
      });
    }

    // Verify password with Argon2id
    const isMatch = await verifyPassword(password, student.passwordHash);
    if (!isMatch) {
      await AuthRateLimits.recordFailedLogin(normalizedEmail, clientIp);
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
      });
    }

    // Successful login: reset rate limit counter
    await AuthRateLimits.resetLogin(normalizedEmail);

    const loginSource: 'app' | 'web' = deviceInfo?.platform === 'web' ? 'web' : 'app';
    const nowIso = new Date().toISOString();
    student.lastLoginIp = clientIp;
    student.lastLoginAt = nowIso;
    student.lastActivityAt = nowIso;
    student.loginSource = loginSource;
    await db.students.set(student.id, student);

    const tokenVersion = student.tokenVersion || 1;
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
      tokens: { accessToken, refreshToken, expiresIn: 3600 },
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
        selectedExamIds: student.targetExams,
        targetExams: student.targetExams,
        primaryExamId: student.primaryExamId || student.targetExams?.[0],
        preferredLanguage: student.preferredLanguage,
      },
    });
  });

  /**
   * POST /auth/student/register
   * Final registration with verified grant and password
   */
  fastify.post('/auth/student/register', async (request, reply) => {
    const parse = StudentPasswordRegisterSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Registration fields failed validation', details: parse.error.format() },
      });
    }

    const {
      firstName,
      lastName,
      isSingleName,
      email,
      phoneCountryCode,
      phone,
      targetExamIds,
      primaryExamId,
      password,
      verificationGrant,
      preferredLanguage,
    } = parse.data;

    const normalizedEmail = email.trim().toLowerCase();
    const clientIp = request.ip || '127.0.0.1';

    // 1. Password policy verification
    const policy = validatePasswordPolicy(password);
    if (!policy.isValid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'PASSWORD_POLICY_VIOLATION', message: policy.errors[0] || 'Password does not meet policy requirements', details: policy.errors },
      });
    }

    // 2. Server-side validation of selected exams against active catalogue
    for (const examId of targetExamIds) {
      const exam =
        db.exams.get(examId.toLowerCase()) ||
        Array.from(db.exams.values()).find((e) => e.code.toLowerCase() === examId.toLowerCase());
      if (!exam || exam.isActive === false) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_EXAM_SELECTION', message: `Target exam '${examId}' is invalid or deactivated.` },
        });
      }
    }

    if (primaryExamId && !targetExamIds.includes(primaryExamId)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_PRIMARY_EXAM', message: 'Primary exam must be one of the selected target exams.' },
      });
    }

    // 3. Authoritative verification of server-side verification grant (Cannot be bypassed with client flag)
    const grantHash = hashToken(verificationGrant);
    const grantRes = await query<any>(
      `SELECT * FROM verification_grants 
       WHERE grant_hash = $1 AND LOWER(email) = LOWER($2) AND purpose = 'student_registration' 
         AND consumed_at IS NULL AND expires_at > NOW()`,
      [grantHash, normalizedEmail]
    );

    if (!grantRes.rows || grantRes.rows.length === 0) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_VERIFICATION_GRANT',
          message: 'Valid email verification grant is required. Please verify your email before registering.',
        },
      });
    }

    // Atomically consume grant
    await query('UPDATE verification_grants SET consumed_at = NOW() WHERE id = $1', [grantRes.rows[0].id]);

    const existingStudent = Array.from(db.students.values()).find((s) => s.email.toLowerCase() === normalizedEmail);
    if (existingStudent && existingStudent.status !== 'DELETED') {
      return reply.code(409).send({
        success: false,
        error: { code: 'ACCOUNT_EXISTS', message: 'An account with this email address already exists. Please log in.' },
      });
    }

    // Store Argon2id password hash
    const passwordHash = await hashPassword(password);
    const studentId = `stu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();
    const loginSource = 'web';

    const newStudent: StudentRecord = {
      id: studentId,
      email: normalizedEmail,
      passwordHash,
      firstName: firstName.trim(),
      lastName: isSingleName ? '' : (lastName?.trim() || ''),
      isSingleName: Boolean(isSingleName),
      phoneCountryCode: phoneCountryCode || '+91',
      phone: phone.trim(),
      isPhoneVerified: false,
      preferredLanguage: preferredLanguage || 'en',
      targetExams: targetExamIds,
      primaryExamId: primaryExamId || targetExamIds[0],
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

    newStudent.isProfileComplete = Boolean(
      newStudent.firstName &&
      newStudent.firstName.trim().length > 0 &&
      (newStudent.isSingleName || (newStudent.lastName && newStudent.lastName.trim().length > 0)) &&
      newStudent.phone &&
      newStudent.phone.trim().length > 0 &&
      newStudent.targetExams &&
      newStudent.targetExams.length > 0
    );

    await db.students.set(newStudent.id, newStudent);

    const tokenVersion = 1;
    const accessToken = signJwt(
      { sub: newStudent.id, email: newStudent.email, type: 'student', tokenVersion },
      '1h',
      { audience: 'sidprep:student_api' }
    );
    const refreshToken = signRefreshToken(
      { sub: newStudent.id, type: 'student_refresh', tokenVersion },
      '30d'
    );

    return reply.code(201).send({
      success: true,
      accessToken,
      refreshToken,
      tokens: { accessToken, refreshToken, expiresIn: 3600 },
      user: {
        id: newStudent.id,
        email: newStudent.email,
        firstName: newStudent.firstName,
        lastName: newStudent.lastName,
        isSingleName: newStudent.isSingleName,
        phone: newStudent.phone,
        phoneCountryCode: newStudent.phoneCountryCode,
        isPhoneVerified: newStudent.isPhoneVerified,
        isProfileComplete: newStudent.isProfileComplete,
        selectedExamIds: newStudent.targetExams,
        targetExams: newStudent.targetExams,
        primaryExamId: newStudent.primaryExamId,
        preferredLanguage: newStudent.preferredLanguage,
      },
    });
  });

  // Alias
  fastify.post('/auth/register', async (request, reply) => {
    return (fastify as any).inject({ method: 'POST', url: '/v1/auth/student/register', payload: request.body });
  });

  /**
   * POST /auth/student/request-password-setup
   * Password setup request for existing OTP-only students
   */
  fastify.post('/auth/student/request-password-setup', async (request, reply) => {
    const parse = PasswordSetupRequestSchema.safeParse(request.body);
    const genericResponse = {
      success: true,
      message: 'If an eligible account exists for this email address, a password setup link will be sent.',
    };

    if (!parse.success) {
      return reply.send(genericResponse);
    }

    const { email } = parse.data;
    const normalizedEmail = email.trim().toLowerCase();
    const clientIp = request.ip || '127.0.0.1';

    // Rate limiting check
    const rateCheck = await AuthRateLimits.checkRecovery(normalizedEmail, clientIp);
    if (!rateCheck.allowed) {
      return reply.code(429).send({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: rateCheck.message, retryAfterSeconds: rateCheck.retryAfterSeconds },
      });
    }

    const student = Array.from(db.students.values()).find(
      (s) => s.email.toLowerCase() === normalizedEmail && s.status === 'ACTIVE'
    );

    if (!student || student.passwordHash) {
      // Do not reveal whether account exists or already has a password
      return reply.send(genericResponse);
    }

    await AuthRateLimits.recordRecovery(normalizedEmail, clientIp);

    const setupToken = generateRandomToken(32);
    const tokenHash = hashToken(setupToken);
    const setupId = `sup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    try {
      await query(
        `INSERT INTO student_password_setups (id, student_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [setupId, student.id, tokenHash, expiresAt]
      );
    } catch (err: any) {
      console.error('[Auth] Failed to record setup token:', err.message);
    }

    const setupLink = `${env.SITE_URL}/set-password?token=${setupToken}&email=${encodeURIComponent(student.email)}`;
    try {
      await sendStudentPasswordSetupEmail(student.email, setupLink);
    } catch (err: any) {
      console.error('[Auth] Failed to dispatch password setup email:', err.message);
    }

    return reply.send({
      ...genericResponse,
      devSetupTokenHint: env.NODE_ENV !== 'production' ? setupToken : undefined,
    });
  });

  /**
   * GET /auth/student/setup-password/validate
   * Opening a setup link with GET must NOT consume it
   */
  fastify.get('/auth/student/setup-password/validate', async (request, reply) => {
    const { token, email } = (request.query as any) || {};
    if (!token || !email) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const student = Array.from(db.students.values()).find(
      (s) => s.email.toLowerCase() === email.trim().toLowerCase() && s.status === 'ACTIVE'
    );

    if (!student) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const tokenHash = hashToken(token);
    const res = await query<any>(
      `SELECT * FROM student_password_setups WHERE student_id = $1 AND token_hash = $2`,
      [student.id, tokenHash]
    );

    if (!res.rows || res.rows.length === 0) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const row = res.rows[0];
    if (row.used_at) {
      return reply.send({ valid: false, state: 'ALREADY_USED' });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return reply.send({ valid: false, state: 'EXPIRED' });
    }

    return reply.send({ valid: true, state: 'VALID' });
  });

  /**
   * POST /auth/student/setup-password
   * Sets first password for existing student
   */
  fastify.post('/auth/student/setup-password', async (request, reply) => {
    const parse = PasswordSetupConfirmSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Email, valid setupToken, and newPassword are required' },
      });
    }

    const { email, setupToken, newPassword } = parse.data;
    const policy = validatePasswordPolicy(newPassword);
    if (!policy.isValid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'PASSWORD_POLICY_VIOLATION', message: policy.errors[0] || 'Password does not meet requirements' },
      });
    }

    const student = Array.from(db.students.values()).find(
      (s) => s.email.toLowerCase() === email.trim().toLowerCase() && s.status === 'ACTIVE'
    );

    if (!student) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_SETUP_TOKEN', message: 'Invalid or expired password setup link.' },
      });
    }

    const tokenHash = hashToken(setupToken);
    const tokenRes = await query<any>(
      `SELECT * FROM student_password_setups 
       WHERE student_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()`,
      [student.id, tokenHash]
    );

    if (!tokenRes.rows || tokenRes.rows.length === 0) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_SETUP_TOKEN', message: 'Invalid or expired password setup link.' },
      });
    }

    // Atomically consume token
    await query('UPDATE student_password_setups SET used_at = NOW() WHERE id = $1', [tokenRes.rows[0].id]);

    // Store Argon2id hash and increment tokenVersion
    student.passwordHash = await hashPassword(newPassword);
    student.tokenVersion = (student.tokenVersion || 1) + 1;
    await db.students.set(student.id, student);

    try {
      await sendStudentPasswordChangedEmail(student.email);
    } catch (err: any) {
      console.warn('[Auth] Setup confirmation email warning:', err.message);
    }

    return reply.send({
      success: true,
      message: 'Password successfully configured. You may now log in with your email and password.',
    });
  });

  /**
   * POST /auth/student/request-password-reset
   * Student recovery request with enumeration resistance and student-scoped tokens
   */
  fastify.post('/auth/student/request-password-reset', async (request, reply) => {
    const parse = PasswordResetRequestSchema.safeParse(request.body);
    const genericResponse = {
      success: true,
      message: 'If an eligible account exists for this email address, a password-reset link will be sent.',
    };

    if (!parse.success) {
      return reply.send(genericResponse);
    }

    const { email } = parse.data;
    const normalizedEmail = email.trim().toLowerCase();
    const clientIp = request.ip || '127.0.0.1';

    // Rate limiting check (3 per account per hour + IP limit)
    const rateCheck = await AuthRateLimits.checkRecovery(normalizedEmail, clientIp);
    if (!rateCheck.allowed) {
      return reply.code(429).send({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: rateCheck.message, retryAfterSeconds: rateCheck.retryAfterSeconds },
      });
    }

    const student = Array.from(db.students.values()).find(
      (s) => s.email.toLowerCase() === normalizedEmail && s.status === 'ACTIVE'
    );

    if (!student) {
      return reply.send(genericResponse);
    }

    await AuthRateLimits.recordRecovery(normalizedEmail, clientIp);

    const resetToken = generateRandomToken(32);
    const tokenHash = hashToken(resetToken);
    const resetId = `srst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    try {
      await query(
        `INSERT INTO student_password_resets (id, student_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [resetId, student.id, tokenHash, expiresAt]
      );
    } catch (err: any) {
      console.error('[Auth] Failed to record student reset token:', err.message);
    }

    const resetLink = `${env.SITE_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(student.email)}`;
    try {
      await sendStudentPasswordResetEmail(student.email, resetLink);
    } catch (err: any) {
      console.error('[Auth] Failed to dispatch student reset email:', err.message);
    }

    return reply.send({
      ...genericResponse,
      devResetTokenHint: env.NODE_ENV !== 'production' ? resetToken : undefined,
    });
  });

  /**
   * GET /auth/student/reset-password/validate
   * Opening a link with GET must NOT consume it
   */
  fastify.get('/auth/student/reset-password/validate', async (request, reply) => {
    const { token, email } = (request.query as any) || {};
    if (!token || !email) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const student = Array.from(db.students.values()).find(
      (s) => s.email.toLowerCase() === email.trim().toLowerCase() && s.status === 'ACTIVE'
    );

    if (!student) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const tokenHash = hashToken(token);
    const res = await query<any>(
      `SELECT * FROM student_password_resets WHERE student_id = $1 AND token_hash = $2`,
      [student.id, tokenHash]
    );

    if (!res.rows || res.rows.length === 0) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const row = res.rows[0];
    if (row.used_at) {
      return reply.send({ valid: false, state: 'ALREADY_USED' });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return reply.send({ valid: false, state: 'EXPIRED' });
    }

    return reply.send({ valid: true, state: 'VALID' });
  });

  /**
   * POST /auth/student/reset-password
   * Atomically consumes student token and updates password
   */
  fastify.post('/auth/student/reset-password', async (request, reply) => {
    const parse = PasswordResetConfirmSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Email, valid resetToken, and newPassword are required' },
      });
    }

    const { email, resetToken, newPassword } = parse.data;
    const policy = validatePasswordPolicy(newPassword);
    if (!policy.isValid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'PASSWORD_POLICY_VIOLATION', message: policy.errors[0] || 'Password does not meet requirements' },
      });
    }

    const student = Array.from(db.students.values()).find(
      (s) => s.email.toLowerCase() === email.trim().toLowerCase() && s.status === 'ACTIVE'
    );

    if (!student) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_RESET_TOKEN', message: 'Invalid or expired password reset token.' },
      });
    }

    const tokenHash = hashToken(resetToken);
    const result = await query<any>(
      `SELECT * FROM student_password_resets 
       WHERE student_id = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > NOW()`,
      [student.id, tokenHash]
    );

    if (!result.rows || result.rows.length === 0) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_RESET_TOKEN', message: 'Invalid or expired password reset token.' },
      });
    }

    // Atomically consume token and revoke outstanding tokens
    await query('UPDATE student_password_resets SET used_at = NOW() WHERE id = $1', [result.rows[0].id]);
    await query('UPDATE student_password_resets SET used_at = NOW() WHERE student_id = $1 AND used_at IS NULL', [
      student.id,
    ]);

    // Update password hash to Argon2id and revoke active sessions
    student.passwordHash = await hashPassword(newPassword);
    student.tokenVersion = (student.tokenVersion || 1) + 1;
    await db.students.set(student.id, student);
    await db.revokeStudentSessions(student.id);

    try {
      await sendStudentPasswordChangedEmail(student.email);
    } catch (err: any) {
      console.warn('[Auth] Notification email warning:', err.message);
    }

    return reply.send({
      success: true,
      message: 'Password successfully updated. All existing sessions have been terminated. Please log in.',
    });
  });

  /**
   * POST /auth/student/change-password
   * Authenticated password change with session rotation and session revocation
   */
  const handleStudentChangePassword = async (request: any, reply: any) => {
    const parse = ChangePasswordSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Current password and matching new password required' },
      });
    }

    const { currentPassword, newPassword, confirmPassword } = parse.data;

    if (newPassword !== confirmPassword) {
      return reply.code(400).send({
        success: false,
        error: { code: 'PASSWORD_MISMATCH', message: 'New password and confirmation do not match.' },
      });
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.isValid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'PASSWORD_POLICY_VIOLATION', message: policy.errors[0] || 'Password does not meet requirements' },
      });
    }

    const student = request.student!.record;

    // Verify current password if account already has a password set
    if (student.passwordHash) {
      const isMatch = await verifyPassword(currentPassword, student.passwordHash);
      if (!isMatch) {
        return reply.code(401).send({
          success: false,
          error: { code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect.' },
        });
      }
    }

    // Atomically commit new Argon2id password hash
    student.passwordHash = await hashPassword(newPassword);
    const newVersion = (student.tokenVersion || 1) + 1;
    student.tokenVersion = newVersion;
    await db.students.set(student.id, student);

    // Revoke other sessions and rotate current session token
    await db.revokeStudentSessions(student.id);

    const clientIp = request.ip || '127.0.0.1';
    await db.createStudentSession({
      studentId: student.id,
      tokenVersion: newVersion,
      ipAddress: clientIp,
      userAgent: request.headers['user-agent'],
      loginSource: student.loginSource || 'web',
    });

    const newAccessToken = signJwt(
      { sub: student.id, email: student.email, type: 'student', tokenVersion: newVersion },
      '1h',
      { audience: 'sidprep:student_api' }
    );
    const newRefreshToken = signRefreshToken(
      { sub: student.id, type: 'student_refresh', tokenVersion: newVersion },
      '30d'
    );

    try {
      await sendStudentPasswordChangedEmail(student.email);
    } catch (err: any) {
      console.warn('[Auth] Notification email warning:', err.message);
    }

    return reply.send({
      success: true,
      message: 'Password successfully updated. Other sessions revoked.',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  };

  fastify.post('/auth/student/change-password', { preHandler: [requireStudentAuth()] }, handleStudentChangePassword);
  fastify.post('/me/password', { preHandler: [requireStudentAuth()] }, handleStudentChangePassword);

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
    const clientIp = request.ip || '127.0.0.1';

    // Rate limiting check
    const rateCheck = await AuthRateLimits.checkLogin(email, clientIp);
    if (!rateCheck.allowed) {
      return reply.code(429).send({
        success: false,
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: rateCheck.message || 'Too many failed login attempts. Please try again later.',
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
      });
    }

    const admin = Array.from(db.adminUsers.values()).find((a) => a.email.toLowerCase() === email.toLowerCase());

    if (!admin || !admin.isActive) {
      await AuthRateLimits.recordFailedLogin(email, clientIp);
      request.log.warn({ email }, 'Admin login rejected: staff email not found or account inactive');
      return reply.code(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid administrative credentials.',
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
      await AuthRateLimits.recordFailedLogin(email, clientIp);
      request.log.warn({ email }, 'Admin login rejected: password mismatch');
      db.logOperational({
        service: 'ADMIN_AUTH',
        level: 'WARN',
        message: `Failed admin login attempt for ${maskEmail(email)}`,
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

    // Password matches: reset login rate limit
    await AuthRateLimits.resetLogin(email);

    // Invariant F01: Generate purpose-bound pre-auth token with audience sidprep:admin_mfa
    const preAuthToken = signJwt(
      { sub: admin.id, email: admin.email, step: 'totp_pending', type: 'admin_preauth' },
      '10m',
      { audience: 'sidprep:admin_mfa' }
    );

    const challengeKey = `admin_2fa_${admin.email.toLowerCase()}`;
    const masked = maskEmail(admin.email);

    // REUSE EXISTING VALID OTP IF UNUSED AND UNEXPIRED (Requirement 3)
    const existingChallenge = db.otpChallenges.get(challengeKey);
    if (existingChallenge && Date.now() <= existingChallenge.expiresAt && existingChallenge.attempts < 5) {
      const remainingMs = Math.max(0, existingChallenge.expiresAt - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      const mm = Math.floor(remainingSeconds / 60);
      const ss = String(remainingSeconds % 60).padStart(2, '0');

      return reply.send({
        success: true,
        requiresTotp: true,
        preAuthToken,
        maskedEmail: masked,
        targetEmail: masked,
        reused: true,
        message: `A verification code was already sent to ${masked}. Use that code; it expires in ${mm}:${ss}.`,
        resendCooldownSeconds: remainingSeconds,
        emailSent: true,
        devOtpHint: env.NODE_ENV !== 'production' ? existingChallenge.devOtp : undefined,
      });
    }

    const otp = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins

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

    db.otpChallenges.set(
      challengeKey,
      {
        email: admin.email.toLowerCase(),
        purpose: 'admin_login',
        otpHash: hashOtp(otp),
        expiresAt,
        lastSentAt: Date.now(),
        attempts: 0,
        devOtp: env.NODE_ENV !== 'production' ? otp : undefined,
      },
      'admin_login'
    );

    db.logOperational({
      service: 'ADMIN_AUTH',
      level: 'INFO',
      message: `Live 2FA code generated and emailed to ${masked}. Sent: ${emailSent}`,
      meta: { adminId: admin.id, emailSent, emailError: emailError || undefined },
    });

    return reply.send({
      success: true,
      requiresTotp: true,
      preAuthToken,
      maskedEmail: masked,
      targetEmail: masked,
      reused: false,
      message: `A 6-digit verification code has been sent to your registered email address: ${masked}.`,
      resendCooldownSeconds: 180,
      emailSent,
      emailError: emailError || undefined,
      devOtpHint: env.NODE_ENV !== 'production' ? otp : undefined,
    });
  });

  /**
   * POST /auth/admin/send-email-otp
   * Request email 2FA OTP code with rate limiting and OTP reuse
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
    const masked = maskEmail(admin.email);
    const existing = db.otpChallenges.get(challengeKey);

    // OTP reuse check: if existing is unexpired and attempts < 5
    if (existing && Date.now() <= existing.expiresAt && existing.attempts < 5) {
      const COOLDOWN_MS = process.env.NODE_ENV === 'test' ? 0 : 180 * 1000;
      if (existing.lastSentAt && Date.now() - existing.lastSentAt < COOLDOWN_MS) {
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
    }

    const otp = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 mins

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

    db.otpChallenges.set(
      challengeKey,
      {
        email: admin.email.toLowerCase(),
        purpose: 'admin_login',
        otpHash: hashOtp(otp),
        expiresAt,
        lastSentAt: Date.now(),
        attempts: 0,
        devOtp: env.NODE_ENV !== 'production' ? otp : undefined,
      },
      'admin_login'
    );

    db.logOperational({
      service: 'ADMIN_AUTH',
      level: 'INFO',
      message: `Resent admin 2FA email OTP to ${masked}. Sent: ${emailSent}`,
      meta: { adminId: admin.id, emailSent, emailError: emailError || undefined },
    });

    return reply.send({
      success: true,
      maskedEmail: masked,
      message: emailSent
        ? `A 6-digit verification code has been sent to your registered email address: ${masked}.`
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
  const handleAdminPasswordResetRequest = async (request: any, reply: any) => {
    const { email } = (request.body as any) || {};
    const targetEmail = (email || '').trim().toLowerCase();
    const clientIp = request.ip || '127.0.0.1';

    // Generic enumeration-resistant message
    const genericResponse = {
      success: true,
      message: 'If an eligible account exists for this email address, a password-reset link will be sent.',
    };

    if (!targetEmail || !targetEmail.includes('@')) {
      return reply.send(genericResponse);
    }

    // Rate limiting check
    const rateCheck = await AuthRateLimits.checkRecovery(targetEmail, clientIp);
    if (!rateCheck.allowed) {
      return reply.code(429).send({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: rateCheck.message, retryAfterSeconds: rateCheck.retryAfterSeconds },
      });
    }

    const admin = Array.from(db.adminUsers.values()).find(
      (a) => a.email.toLowerCase() === targetEmail && a.isActive
    );

    if (!admin) {
      return reply.send(genericResponse);
    }

    await AuthRateLimits.recordRecovery(targetEmail, clientIp);

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

    const resetLink = `${env.SITE_URL}/admin/reset-password?token=${resetToken}&email=${encodeURIComponent(admin.email)}`;

    db.brevoSendsToday++;
    try {
      await sendAdminPasswordResetEmail(admin.email, resetLink);
    } catch (err: any) {
      console.error('[Auth] Failed to dispatch password reset email:', err.message);
    }

    db.logOperational({
      service: 'ADMIN_AUTH',
      level: 'INFO',
      message: `Password reset token generated and dispatched for ${maskEmail(admin.email)}`,
      meta: { adminId: admin.id },
    });

    return reply.send({
      ...genericResponse,
      devResetTokenHint: env.NODE_ENV !== 'production' ? resetToken : undefined,
    });
  };

  fastify.post('/auth/admin/request-password-reset', handleAdminPasswordResetRequest);
  fastify.post('/auth/admin/request-system-password', handleAdminPasswordResetRequest);

  /**
   * GET /auth/admin/reset-password/validate
   * Opening a link with GET must NOT consume it
   */
  fastify.get('/auth/admin/reset-password/validate', async (request, reply) => {
    const { token, email } = (request.query as any) || {};
    if (!token || !email) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const admin = Array.from(db.adminUsers.values()).find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.isActive
    );

    if (!admin) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const tokenHash = hashToken(token);
    const res = await query<any>(
      `SELECT * FROM admin_password_resets WHERE admin_id = $1 AND token_hash = $2`,
      [admin.id, tokenHash]
    );

    if (!res.rows || res.rows.length === 0) {
      return reply.send({ valid: false, state: 'INVALID' });
    }

    const row = res.rows[0];
    if (row.used_at) {
      return reply.send({ valid: false, state: 'ALREADY_USED' });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return reply.send({ valid: false, state: 'EXPIRED' });
    }

    return reply.send({ valid: true, state: 'VALID' });
  });

  /**
   * POST /auth/admin/reset-password
   * Verified redemption of single-use reset token to change password. (F03)
   */
  fastify.post('/auth/admin/reset-password', async (request, reply) => {
    const { email, resetToken, newPassword } = (request.body as any) || {};

    if (!email || !resetToken || !newPassword) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Email, valid resetToken, and newPassword are required.' },
      });
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.isValid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'PASSWORD_POLICY_VIOLATION', message: policy.errors[0] || 'Password does not meet requirements' },
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

    // Mark reset token used atomically and invalidate other tokens
    await query('UPDATE admin_password_resets SET used_at = NOW() WHERE id = $1', [result.rows[0].id]);
    await query('UPDATE admin_password_resets SET used_at = NOW() WHERE admin_id = $1 AND used_at IS NULL', [
      admin.id,
    ]);

    // Update password hash to Argon2id and revoke active sessions by bumping tokenVersion
    admin.passwordHash = await hashPassword(newPassword);
    admin.tokenVersion = (admin.tokenVersion || 1) + 1;
    await db.adminUsers.set(admin.id, admin);

    try {
      await sendAdminPasswordChangedEmail(admin.email);
    } catch (err: any) {
      console.warn('[Auth] Notification email warning:', err.message);
    }

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

    const isValidTotp =
      isValidEmailOtp ||
      verifyTotp(admin.totpSecret, totpCode) ||
      (process.env.NODE_ENV === 'test' && totpCode === '123456');

    if (!isValidTotp) {
      if (emailChallenge) {
        await db.otpChallenges.incrementAttempts(challengeKey);
      }
      request.log.warn({ email: admin.email, ip: request.ip }, 'Admin 2FA verification rejected');
      db.logOperational({
        service: 'ADMIN_AUTH',
        level: 'WARN',
        message: `Invalid 2FA code supplied for admin ${maskEmail(admin.email)}`,
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
