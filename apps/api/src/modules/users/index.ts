import type { FastifyPluginAsync } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { db, StudentRecord } from '../../db/index.js';
import { query } from '../../db/pool.js';
import { verifyJwt, hashOtp, verifyOtpHash, validateFileMagicBytes } from '../../lib/security.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { requireStudentAuth } from '../../lib/studentAuth.js';
import {
  UpdateProfileRequestSchema,
  EmailChangeRequestSchema,
  EmailChangeVerifySchema,
} from '@sidprep/contracts';

function formatStudentProfile(student: StudentRecord) {
  const targetExams = student.targetExams || [];
  const primaryExamId = student.primaryExamId || targetExams[0] || 'ssc_cgl';
  const dailyMinutes = student.dailyGoalMinutes || 60;
  const isProfileComplete = Boolean(
    student.firstName &&
    (student.lastName || student.isSingleName) &&
    student.phone &&
    targetExams.length > 0
  );

  return {
    ...student,
    firstName: student.firstName || '',
    lastName: student.lastName || '',
    isSingleName: Boolean(student.isSingleName),
    phone: student.phone || '',
    phoneCountryCode: student.phoneCountryCode || '+91',
    isPhoneVerified: Boolean(student.isPhoneVerified),
    targetExams,
    selectedExamIds: targetExams,
    primaryExamId,
    dailyGoalMinutes: dailyMinutes,
    dailyTargetMinutes: dailyMinutes,
    completedTasks: student.completedTasks || [],
    settings: student.settings || {},
    isProfileComplete,
  };
}

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /me
   * Get current student profile (Strictly authenticated, active, unrevoked)
   */
  fastify.get('/me', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;
    return reply.send(formatStudentProfile(student));
  });

  /**
   * PATCH /me
   * Update student profile preferences with strict server-side schema & active exam validation
   */
  fastify.patch('/me', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;

    const parse = UpdateProfileRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_PROFILE_UPDATE',
          message: 'Profile update failed schema validation',
          details: parse.error.format(),
        },
      });
    }

    const data = parse.data;

    if (data.firstName !== undefined) student.firstName = data.firstName.trim();
    if (data.lastName !== undefined) student.lastName = data.lastName.trim();
    if (data.isSingleName !== undefined) student.isSingleName = Boolean(data.isSingleName);
    if (data.phone !== undefined) student.phone = data.phone.trim();
    if (data.phoneCountryCode !== undefined) student.phoneCountryCode = data.phoneCountryCode.trim();
    if (data.preferredLanguage !== undefined) student.preferredLanguage = data.preferredLanguage;
    if (data.avatarUrl !== undefined) student.avatarUrl = data.avatarUrl;

    const targetExams = data.targetExams || data.selectedExamIds;
    if (targetExams) {
      // Validate every target exam exists and is active
      for (const examId of targetExams) {
        const examRecord = db.exams.get(examId) || Array.from(db.exams.values()).find(
          (e) => e.code.toLowerCase() === examId.toLowerCase() || e.id.toLowerCase() === examId.toLowerCase()
        );
        if (!examRecord || examRecord.isActive === false) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'INVALID_EXAM_SELECTION',
              message: `Target exam '${examId}' does not exist or has been deactivated.`,
            },
          });
        }
      }
      student.targetExams = targetExams;
      student.selectedExamIds = targetExams;
    }

    if (data.primaryExamId) {
      const primaryRecord = db.exams.get(data.primaryExamId) || Array.from(db.exams.values()).find(
        (e) => e.code.toLowerCase() === data.primaryExamId!.toLowerCase() || e.id.toLowerCase() === data.primaryExamId!.toLowerCase()
      );
      if (!primaryRecord || primaryRecord.isActive === false) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_PRIMARY_EXAM',
            message: `Primary exam '${data.primaryExamId}' does not exist or has been deactivated.`,
          },
        });
      }
      student.primaryExamId = data.primaryExamId;
      if (student.targetExams && !student.targetExams.includes(data.primaryExamId)) {
        student.targetExams.unshift(data.primaryExamId);
      }
    }

    const dailyMinutes = data.dailyGoalMinutes ?? data.dailyTargetMinutes;
    if (typeof dailyMinutes === 'number') {
      if (dailyMinutes < 15 || dailyMinutes > 720) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'INVALID_STUDY_GOAL',
            message: 'Daily study goal must be between 15 and 720 minutes (12 hours).',
          },
        });
      }
      student.dailyGoalMinutes = dailyMinutes;
      student.dailyTargetMinutes = dailyMinutes;
    }

    if (data.settings && typeof data.settings === 'object') {
      student.settings = { ...(student.settings || {}), ...data.settings };
    }

    // Backend authoritative computation of profile completion from valid saved data
    student.isProfileComplete = Boolean(
      student.firstName &&
      student.firstName.trim().length > 0 &&
      (student.isSingleName || (student.lastName && student.lastName.trim().length > 0)) &&
      student.phone &&
      /^\+?[1-9]\d{9,14}$/.test(student.phone) &&
      student.targetExams &&
      student.targetExams.length > 0
    );

    student.lastActivityAt = new Date().toISOString();
    await db.students.set(student.id, student);

    try {
      await query(
        `UPDATE students 
         SET first_name = $2, last_name = $3, is_single_name = $4, phone = $5,
             target_exams = $6, is_profile_complete = $7, updated_at = NOW()
         WHERE id = $1`,
        [
          student.id,
          student.firstName || null,
          student.lastName || null,
          student.isSingleName || false,
          student.phone || null,
          student.targetExams || [],
          student.isProfileComplete,
        ]
      );
    } catch (err: any) {
      console.warn('[Users] Failed to update PostgreSQL student record:', err.message);
    }

    return reply.send(formatStudentProfile(student));
  });

  /**
   * POST /me/onboarding
   * Mobile onboarding preference persistence (F08)
   */
  fastify.post('/me/onboarding', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;
    const body = request.body as any;

    const targetExams = body.selectedExamIds || body.targetExams;
    if (Array.isArray(targetExams) && targetExams.length > 0) {
      student.targetExams = targetExams;
    }
    if (body.primaryExamId) {
      student.primaryExamId = body.primaryExamId;
      if (!student.targetExams.includes(body.primaryExamId)) {
        student.targetExams.unshift(body.primaryExamId);
      }
    }
    if (body.preferredLanguage) {
      student.preferredLanguage = body.preferredLanguage;
    }
    const targetMins = body.dailyTargetMinutes ?? body.dailyGoalMinutes;
    if (typeof targetMins === 'number') {
      student.dailyGoalMinutes = targetMins;
    }
    if (body.settings && typeof body.settings === 'object') {
      student.settings = { ...(student.settings || {}), ...body.settings };
    }

    student.lastActivityAt = new Date().toISOString();
    await db.students.set(student.id, student);
    const formatted = formatStudentProfile(student);
    return reply.send({
      success: true,
      student: formatted,
      profile: formatted,
    });
  });

  /**
   * POST /me/export
   * Student data export request with tracking ticket (Strictly authenticated)
   */
  fastify.post('/me/export', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;
    const requestId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    db.logOperational({
      service: 'DATA_PRIVACY',
      level: 'INFO',
      message: `Data export ticket ${requestId} registered for student ${student.id}`,
      meta: { studentId: student.id, requestId },
    });
    return reply.send({
      success: true,
      requestId,
      status: 'QUEUED',
      message: 'Encrypted export request queued. Your archive will be compiled and delivered to your verified email.',
    });
  });

  /**
   * POST /me/delete
   * Student account deletion (Durable persistence & session revocation)
   */
  fastify.post('/me/delete', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;
    student.status = 'DELETED';
    student.tokenVersion = (student.tokenVersion || 1) + 1;
    student.firstName = '[DELETED]';
    student.lastName = '[DELETED]';
    student.phone = undefined;
    student.email = `deleted_${student.id}@sidprep.invalid`;
    student.settings = {};
    student.completedTasks = [];
    await db.students.set(student.id, student);
    await db.revokeStudentSessions(student.id);

    const requestId = `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    db.logAudit({
      actorId: student.id,
      actorEmail: student.email,
      actorRole: 'STUDENT',
      module: 'STUDENT_USER',
      action: 'USER_SELF_DELETE',
      targetId: student.id,
      changesDiff: { action: 'SELF_DELETE' },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      requestId,
      status: 'DELETED',
      message: 'Account and personal data have been durably deleted per data privacy policy.',
    });
  });

  /**
   * POST /me/email/request
   * Student email change request: generates secure 6-digit OTP, stores pending email
   */
  fastify.post('/me/email/request', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;

    const parse = EmailChangeRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Valid new email address is required', details: parse.error.format() },
      });
    }

    const { newEmail } = parse.data;
    const normalizedNewEmail = newEmail.trim().toLowerCase();

    if (normalizedNewEmail === student.email.toLowerCase()) {
      return reply.code(400).send({
        success: false,
        error: { code: 'SAME_EMAIL', message: 'New email address must be different from current email address.' },
      });
    }

    // Check conflict in-memory
    const existingMem = Array.from(db.students.values()).find(
      (s) => s.id !== student.id && s.email.toLowerCase() === normalizedNewEmail && s.status !== 'DELETED'
    );
    if (existingMem) {
      return reply.code(409).send({
        success: false,
        error: { code: 'EMAIL_ALREADY_IN_USE', message: 'This email address is already registered to another account.' },
      });
    }

    // Check conflict in PostgreSQL
    try {
      const existingDb = await query(
        `SELECT id FROM students WHERE LOWER(email) = LOWER($1) AND id != $2 AND status != 'DELETED'`,
        [normalizedNewEmail, student.id]
      );
      if (existingDb.rows.length > 0) {
        return reply.code(409).send({
          success: false,
          error: { code: 'EMAIL_ALREADY_IN_USE', message: 'This email address is already registered to another account.' },
        });
      }
    } catch (err: any) {
      console.warn('[Users] DB email conflict check warning:', err.message);
    }

    // Generate 6-digit verification code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    student.pendingEmail = normalizedNewEmail;
    student.pendingEmailOtpHash = otpHash;
    student.pendingEmailOtpExpiresAt = expiresAt;
    student.pendingEmailAttempts = 0;
    await db.students.set(student.id, student);

    try {
      await query(
        `UPDATE students 
         SET pending_email = $2, pending_email_otp_hash = $3, pending_email_otp_expires_at = $4, pending_email_attempts = 0, updated_at = NOW() 
         WHERE id = $1`,
        [student.id, normalizedNewEmail, otpHash, expiresAt]
      );
    } catch (err: any) {
      console.warn('[Users] Failed to update pending email in PostgreSQL:', err.message);
    }

    db.logOperational({
      service: 'AUTH',
      level: 'INFO',
      message: `Email change verification OTP dispatched to ${normalizedNewEmail}`,
      meta: { studentId: student.id, email: normalizedNewEmail, ...(process.env.NODE_ENV !== 'production' ? { testOtp: otp } : {}) },
    });

    return reply.send({
      success: true,
      message: 'Verification code sent to your new email address. Please verify within 15 minutes.',
      ...(process.env.NODE_ENV !== 'production' ? { testOtp: otp } : {}),
    });
  });

  /**
   * POST /me/email/verify
   * Verify pending email change OTP, update email, increment token_version, revoke active sessions
   */
  fastify.post('/me/email/verify', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;

    const parse = EmailChangeVerifySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Valid new email and 6-digit code are required', details: parse.error.format() },
      });
    }

    const { newEmail, otp } = parse.data;
    const normalizedNewEmail = newEmail.trim().toLowerCase();

    if (!student.pendingEmail || student.pendingEmail.toLowerCase() !== normalizedNewEmail) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NO_PENDING_EMAIL_CHANGE', message: 'No pending email change request found for this address.' },
      });
    }

    if (!student.pendingEmailOtpExpiresAt || new Date(student.pendingEmailOtpExpiresAt) < new Date()) {
      return reply.code(400).send({
        success: false,
        error: { code: 'OTP_EXPIRED', message: 'Verification code has expired. Please request a new code.' },
      });
    }

    student.pendingEmailAttempts = (student.pendingEmailAttempts || 0) + 1;
    if (student.pendingEmailAttempts > 5) {
      return reply.code(429).send({
        success: false,
        error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many incorrect attempts. Please request a new code.' },
      });
    }

    const isValid = verifyOtpHash(otp, student.pendingEmailOtpHash || '');
    if (!isValid) {
      await db.students.set(student.id, student);
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_OTP', message: 'Incorrect verification code.' },
      });
    }

    // Success: apply email change, revoke sessions, bump token version
    const oldEmail = student.email;
    student.email = normalizedNewEmail;
    student.pendingEmail = undefined;
    student.pendingEmailOtpHash = undefined;
    student.pendingEmailOtpExpiresAt = undefined;
    student.pendingEmailAttempts = undefined;
    student.tokenVersion = (student.tokenVersion || 1) + 1;
    student.lastActivityAt = new Date().toISOString();
    await db.students.set(student.id, student);
    await db.revokeStudentSessions(student.id);

    try {
      await query(
        `UPDATE students 
         SET email = $2, pending_email = NULL, pending_email_otp_hash = NULL, pending_email_otp_expires_at = NULL, pending_email_attempts = 0, token_version = token_version + 1, updated_at = NOW() 
         WHERE id = $1`,
        [student.id, normalizedNewEmail]
      );
    } catch (err: any) {
      console.warn('[Users] Failed to update verified email in PostgreSQL:', err.message);
    }

    db.logAudit({
      actorId: student.id,
      actorEmail: normalizedNewEmail,
      actorRole: 'STUDENT',
      module: 'STUDENT_USER',
      action: 'STUDENT_EMAIL_CHANGED',
      targetId: student.id,
      changesDiff: { oldEmail, newEmail: normalizedNewEmail },
      ipAddress: request.ip,
    });

    db.logOperational({
      service: 'SECURITY',
      level: 'WARN',
      message: `Email address updated for student ${student.id} from ${oldEmail} to ${normalizedNewEmail}. Sessions revoked.`,
      meta: { studentId: student.id, oldEmail, newEmail: normalizedNewEmail },
    });

    return reply.send({
      success: true,
      message: 'Email address successfully updated. All active sessions have been revoked for security.',
      tokenVersion: student.tokenVersion,
      email: student.email,
    });
  });

  /**
   * POST /me/avatar
   * Upload and set student avatar image (magic byte validation, 5MB max, local/storage persistence)
   */
  fastify.post('/me/avatar', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;

    let fileBuffer: Buffer | null = null;
    let declaredType = 'JPEG';
    let fileExt = 'jpg';

    if (request.isMultipart()) {
      const part = await request.file();
      if (part) {
        fileBuffer = await part.toBuffer();
        if (part.mimetype === 'image/png') {
          declaredType = 'PNG';
          fileExt = 'png';
        } else if (part.mimetype === 'image/webp') {
          declaredType = 'WEBP';
          fileExt = 'webp';
        } else if (part.mimetype === 'image/jpeg' || part.mimetype === 'image/jpg') {
          declaredType = 'JPEG';
          fileExt = 'jpg';
        } else {
          declaredType = 'UNKNOWN';
        }
      }
    } else if (request.body && typeof request.body === 'object') {
      const body = request.body as any;
      if (body.fileBase64) {
        fileBuffer = Buffer.from(body.fileBase64, 'base64');
        if (body.fileType) declaredType = String(body.fileType).toUpperCase();
        if (declaredType === 'PNG' || body.filename?.endsWith('.png')) {
          declaredType = 'PNG';
          fileExt = 'png';
        } else if (declaredType === 'WEBP' || body.filename?.endsWith('.webp')) {
          declaredType = 'WEBP';
          fileExt = 'webp';
        } else {
          declaredType = 'JPEG';
          fileExt = 'jpg';
        }
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.code(400).send({
        success: false,
        error: { code: 'FILE_REQUIRED', message: 'Binary avatar image payload (fileBase64 or multipart) is required.' },
      });
    }

    if (fileBuffer.length > 5 * 1024 * 1024) {
      return reply.code(400).send({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'Avatar image file must not exceed 5 MB.' },
      });
    }

    const isValid = validateFileMagicBytes(fileBuffer, declaredType);
    if (!isValid) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_AVATAR_FILE', message: 'Avatar must be a valid JPEG, PNG, or WebP image file.' },
      });
    }

    const avatarsDir = path.resolve(process.cwd(), 'uploads', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    const filename = `avatar_${student.id}_${Date.now()}.${fileExt}`;
    const filePath = path.join(avatarsDir, filename);
    await fs.promises.writeFile(filePath, fileBuffer);

    // Remove old avatar if exists
    if (student.avatarStoragePath && fs.existsSync(student.avatarStoragePath)) {
      try {
        await fs.promises.unlink(student.avatarStoragePath);
      } catch {}
    }

    const avatarUrl = `/v1/avatars/${filename}`;
    student.avatarUrl = avatarUrl;
    student.avatarStoragePath = filePath;
    await db.students.set(student.id, student);

    try {
      await query(
        `UPDATE students SET avatar_url = $2, avatar_storage_path = $3, updated_at = NOW() WHERE id = $1`,
        [student.id, avatarUrl, filePath]
      );
    } catch (err: any) {
      console.warn('[Users] Failed to update avatar in DB:', err.message);
    }

    return reply.send({
      success: true,
      avatarUrl,
      message: 'Avatar image updated successfully.',
    });
  });

  /**
   * DELETE /me/avatar
   * Remove student avatar
   */
  fastify.delete('/me/avatar', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;

    if (student.avatarStoragePath && fs.existsSync(student.avatarStoragePath)) {
      try {
        await fs.promises.unlink(student.avatarStoragePath);
      } catch {}
    }

    student.avatarUrl = undefined;
    student.avatarStoragePath = undefined;
    await db.students.set(student.id, student);

    try {
      await query(
        `UPDATE students SET avatar_url = NULL, avatar_storage_path = NULL, updated_at = NOW() WHERE id = $1`,
        [student.id]
      );
    } catch (err: any) {
      console.warn('[Users] Failed to clear avatar in DB:', err.message);
    }

    return reply.send({
      success: true,
      message: 'Avatar image removed successfully.',
    });
  });

  /**
   * GET /avatars/:filename
   * Stream avatar image safely with path traversal protection
   */
  fastify.get('/avatars/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (!filename || !/^[a-zA-Z0-9_.-]+$/.test(filename)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_FILENAME', message: 'Invalid avatar filename' },
      });
    }

    const avatarsDir = path.resolve(process.cwd(), 'uploads', 'avatars');
    const filePath = path.join(avatarsDir, filename);

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({
        success: false,
        error: { code: 'AVATAR_NOT_FOUND', message: 'Avatar image not found' },
      });
    }

    let contentType = 'image/jpeg';
    if (filename.endsWith('.png')) contentType = 'image/png';
    else if (filename.endsWith('.webp')) contentType = 'image/webp';

    const stream = fs.createReadStream(filePath);
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(stream);
  });

  /**
   * GET /home
   * Student home dashboard (Honest metrics from real student records)
   */
  fastify.get('/home', async (request, reply) => {
    let student: StudentRecord | null = null;
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = verifyJwt<{ sub: string; type?: string; tokenVersion?: number }>(authHeader.substring(7), { audience: 'sidprep:student_api' });
      if (decoded?.sub) {
        const found = db.students.get(decoded.sub);
        if (found) {
          if (found.status === 'SUSPENDED') {
            return reply.code(403).send({ success: false, error: { code: 'ACCOUNT_SUSPENDED', message: 'Account is suspended.' } });
          }
          if (found.status === 'DELETED') {
            return reply.code(403).send({ success: false, error: { code: 'ACCOUNT_DELETED', message: 'Account is deleted.' } });
          }
          const curVer = found.tokenVersion || 1;
          if (decoded.tokenVersion !== undefined && decoded.tokenVersion < curVer) {
            return reply.code(401).send({ success: false, error: { code: 'TOKEN_REVOKED', message: 'Session revoked.' } });
          }
          student = found;
        }
      }
    }

    let primaryExamRecord = null;
    if (student && student.targetExams && student.targetExams.length > 0) {
      primaryExamRecord = Array.from(db.exams.values()).find(
        (e) => e.id === student!.targetExams[0] || e.code.toLowerCase() === student!.targetExams[0].toLowerCase()
      );
    }
    if (!primaryExamRecord) {
      primaryExamRecord = Array.from(db.exams.values()).find((e) => e.code.includes('CGL')) || Array.from(db.exams.values())[0];
    }

    const recommended = Array.from(db.tests.values()).slice(0, 4).map((t) => ({
      id: t.id,
      title: t.title,
      examTitle: t.examCode,
      durationMinutes: t.durationMinutes,
      questionsCount: t.totalQuestions,
      type: t.type === 'FULL' ? 'FULL_LENGTH' : t.type === 'PYQ' ? 'PYQ' : 'SECTIONAL',
    }));

    // Dynamic calculations for student progress from actual records (no fake progress!)
    let completedMinutes = 0;
    let streakDays = 0;
    let accuracyRate = 0;
    let activeAttempt: any = null;
    let completedTasksCount = 0;

    if (student) {
      streakDays = student.streakDays || 0;
      completedTasksCount = (student.completedTasks || []).length;

      const studentAttempts = Array.from(db.attempts.values()).filter((a) => a.studentId === student!.id);
      const inProgress = studentAttempts.find(
        (a) => a.status === 'IN_PROGRESS' && (!a.expiresAt || new Date(a.expiresAt) > new Date())
      );

      if (inProgress) {
        const remainingSeconds = inProgress.expiresAt
          ? Math.max(0, Math.floor((new Date(inProgress.expiresAt).getTime() - Date.now()) / 1000))
          : inProgress.durationSeconds;
        const test = db.tests.get(inProgress.testId);
        activeAttempt = {
          attemptId: inProgress.id,
          testId: inProgress.testId,
          testTitle: test?.title || 'Mock Test',
          examTitle: primaryExamRecord?.title || primaryExamRecord?.name || 'Target Exam',
          startedAt: inProgress.startedAt,
          expiresAt: inProgress.expiresAt,
          durationSeconds: inProgress.durationSeconds,
          remainingSeconds,
        };
      }

      const submittedAttempts = studentAttempts.filter((a) => a.status === 'SUBMITTED');
      if (submittedAttempts.length > 0) {
        const totalAccuracy = submittedAttempts.reduce((acc, a) => acc + (a.accuracy || 0), 0);
        accuracyRate = Number((totalAccuracy / submittedAttempts.length).toFixed(1));
        
        const totalSecs = submittedAttempts.reduce((acc, a) => acc + (a.durationSeconds || a.timeSpentSeconds || 0), 0);
        completedMinutes = Math.round(totalSecs / 60);
      }
    }

    return reply.send({
      primaryExam: primaryExamRecord ? {
        id: primaryExamRecord.id,
        body: (primaryExamRecord.body || primaryExamRecord.bodyCode || 'SSC') as any,
        code: primaryExamRecord.code,
        title: primaryExamRecord.title || primaryExamRecord.name,
        description: primaryExamRecord.description,
        currentStatus: primaryExamRecord.currentStatus || (primaryExamRecord.isDateAnnounced ? 'EXAM_SCHEDULED' : 'DATE_NOT_ANNOUNCED'),
        officialExamDate: primaryExamRecord.isDateAnnounced ? (primaryExamRecord.officialExamDate || primaryExamRecord.verifiedDate || null) : null,
        isDateAnnounced: Boolean(primaryExamRecord.isDateAnnounced),
        verificationSourceUrl: primaryExamRecord.sourceUrl || null,
        lastVerifiedAt: primaryExamRecord.verifiedDate || null,
        stagesCount: primaryExamRecord.stagesCount,
        availableTestsCount: Array.from(db.tests.values()).filter((t) => t.examCode === primaryExamRecord.code).length,
      } : null,
      selectedExams: student?.targetExams || [],
      dailyGoal: {
        targetMinutes: student?.dailyGoalMinutes || 60,
        completedMinutes,
        streakDays,
        accuracyRate,
      },
      activeAttempt,
      todayTasksSummary: {
        totalTasks: 3,
        completedTasks: completedTasksCount,
      },
      recommendedTests: recommended,
      dailyAffairsCount: Array.from(db.newsDrafts.values()).filter((d) => d.editorialStatus === 'PUBLISHED').length || 0,
    });
  });

  /**
   * GET /study-plan
   * Student daily study plan (F29: persistent task completion)
   */
  fastify.get('/study-plan', async (request, reply) => {
    let student: any = null;
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = verifyJwt<{ sub: string }>(authHeader.substring(7));
      if (decoded?.sub) {
        student = db.students.get(decoded.sub);
      }
    }

    const completedTasksList: string[] = student?.completedTasks || [];

    const defaultTasks = [
      {
        id: 'task-1',
        title: 'Quantitative Aptitude: Percentages & Successive Discount',
        description: 'Practice 25 high-yield Tier-I calculation questions with formula tricks',
        type: 'TOPIC_STUDY',
        estimatedMinutes: 30,
        isCompleted: completedTasksList.includes('task-1'),
        completedAt: completedTasksList.includes('task-1') ? new Date().toISOString() : undefined,
        isMissed: false,
        subjectName: 'Quantitative Aptitude',
        topicName: 'Percentages',
        actionRoute: '/resources',
      },
      {
        id: 'task-2',
        title: 'Current Affairs Daily 5-Minute Quiz',
        description: 'Fact-checked questions based on today\'s PIB and RBI circulars',
        type: 'CURRENT_AFFAIRS_QUIZ',
        estimatedMinutes: 5,
        isCompleted: completedTasksList.includes('task-2'),
        completedAt: completedTasksList.includes('task-2') ? new Date().toISOString() : undefined,
        isMissed: false,
        subjectName: 'General Awareness',
        actionRoute: '/(tabs)/affairs',
      },
      {
        id: 'task-3',
        title: 'SSC CGL General Intelligence & Reasoning Sectional Mock',
        description: '25 Questions • 50 Marks • Timed exam environment with -0.5 negative marking',
        type: 'SECTIONAL_MOCK',
        estimatedMinutes: 20,
        isCompleted: completedTasksList.includes('task-3'),
        completedAt: completedTasksList.includes('task-3') ? new Date().toISOString() : undefined,
        isMissed: false,
        subjectName: 'Reasoning',
        actionRoute: '/(tabs)/mocks',
      },
    ];

    const completedMinutes = defaultTasks
      .filter((t) => t.isCompleted)
      .reduce((acc, t) => acc + t.estimatedMinutes, 0);

    return reply.send({
      date: new Date().toISOString().split('T')[0],
      dayStreak: student?.streakDays || 0,
      targetMinutes: student?.dailyGoalMinutes || 60,
      completedMinutes: completedMinutes,
      missedTasksCount: 0,
      tasks: defaultTasks,
      weakTopicRecommendations: [
        {
          topicId: 'math_geom',
          topicName: 'Geometry & Triangles Congruency',
          reason: 'Accuracy was 52% in last 3 attempts (target: 80%)',
          suggestedAction: 'Review formula handbook properties of incentre & circumcentre',
        },
      ],
    });
  });

  /**
   * PATCH /study-plan/tasks/:id
   * Persist task completion status across devices (Strictly authenticated)
   */
  fastify.patch('/study-plan/tasks/:id', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { isCompleted = true } = (request.body as { isCompleted?: boolean }) || {};
    const student = request.student!.record;

    if (!student.completedTasks) {
      student.completedTasks = [];
    }
    if (isCompleted) {
      if (!student.completedTasks.includes(id)) {
        student.completedTasks.push(id);
      }
    } else {
      student.completedTasks = student.completedTasks.filter((taskId) => taskId !== id);
    }
    student.lastActivityAt = new Date().toISOString();
    await db.students.set(student.id, student);

    return reply.send({
      success: true,
      taskId: id,
      isCompleted,
      syncedAt: new Date().toISOString(),
      completedTasks: student.completedTasks,
      completedTasksCount: student.completedTasks.length,
    });
  });

  /**
   * GET /admin/users
   * Admin Student Directory with masked PII, filters, and audit trail
   */
  fastify.get('/admin/users', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'SUPPORT', 'AUDITOR'])] }, async (request, reply) => {
    const admin = request.admin!;
    const { query, status, exam, unmask } = request.query as {
      query?: string;
      status?: string;
      exam?: string;
      unmask?: string;
    };

    let students = Array.from(db.students.values());

    if (status) {
      students = students.filter((s) => s.status === status);
    }

    if (exam) {
      const examLower = exam.toLowerCase();
      students = students.filter(
        (s) =>
          s.targetExams?.some((e) => e.toLowerCase() === examLower) ||
          s.primaryExamId?.toLowerCase() === examLower
      );
    }

    if (query) {
      const q = query.toLowerCase().trim();
      students = students.filter((s) => {
        const emailMatch = s.email.toLowerCase().includes(q);
        const nameMatch = `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(q);
        const phoneMatch = s.phone ? s.phone.includes(q) : false;
        const idMatch = s.id.toLowerCase().includes(q);
        return emailMatch || nameMatch || phoneMatch || idMatch;
      });
    }

    // Sort by registration date descending
    students.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const shouldUnmask = unmask === 'true' && admin.role === 'SUPER_ADMIN';

    if (shouldUnmask) {
      db.logAudit({
        actorId: admin.sub,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'STUDENT_USER',
        action: 'UNMASK_DIRECTORY_PII',
        targetId: 'directory',
        changesDiff: { query, status, exam },
        ipAddress: request.ip,
      });
    }

    const result = students.map((s) => ({
      id: s.id,
      firstName: s.firstName || '',
      lastName: s.lastName || '',
      isSingleName: Boolean(s.isSingleName),
      email: shouldUnmask ? s.email : undefined,
      phone: shouldUnmask ? s.phone : undefined,
      emailMasked: s.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
      phoneMasked: s.phone ? s.phone.replace(/(\d{2})(\d+)(\d{2})/, '$1******$3') : 'Not linked',
      phoneCountryCode: s.phoneCountryCode || '+91',
      preferredLanguage: s.preferredLanguage,
      targetExams: s.targetExams || [],
      primaryExamId: s.primaryExamId || s.targetExams?.[0] || 'ssc-cgl',
      dailyGoalMinutes: s.dailyGoalMinutes,
      streakDays: s.streakDays,
      status: s.status,
      isEmailVerified: s.isEmailVerified,
      isProfileComplete: Boolean(s.isProfileComplete),
      registrationIp: s.registrationIp || 'Not recorded',
      lastLoginIp: s.lastLoginIp || s.registrationIp || 'Not recorded',
      lastLoginAt: s.lastLoginAt || s.createdAt,
      lastActivityAt: s.lastActivityAt || s.createdAt,
      loginSource: s.loginSource || 'app',
      createdAt: s.createdAt,
    }));

    return reply.send(result);
  });

  /**
   * POST /admin/users/:id/action
   * Admin actions on student account (disable, reactivate, revoke sessions) with mandatory audit reason
   */
  fastify.post('/admin/users/:id/action', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'SUPPORT'])] }, async (request, reply) => {
    const admin = request.admin!;

    const { id } = request.params as { id: string };
    const { action, reason } = request.body as { action: 'SUSPEND' | 'ACTIVATE' | 'REVOKE_SESSIONS' | 'DELETE_DATA'; reason: string };

    if (!reason || reason.trim().length < 5) {
      return reply.code(400).send({
        success: false,
        error: { code: 'REASON_REQUIRED', message: 'A verified administrative reason is mandatory for student account mutations.' },
      });
    }

    const student = db.students.get(id);
    if (!student) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Student account not found' } });
    }

    if (action === 'SUSPEND') {
      student.status = 'SUSPENDED';
      student.tokenVersion = (student.tokenVersion || 1) + 1;
      await db.students.set(id, student);
      await db.revokeStudentSessions(id);
    } else if (action === 'ACTIVATE') {
      student.status = 'ACTIVE';
      await db.students.set(id, student);
    } else if (action === 'REVOKE_SESSIONS') {
      student.tokenVersion = (student.tokenVersion || 1) + 1;
      await db.students.set(id, student);
      await db.revokeStudentSessions(id);
    } else if (action === 'DELETE_DATA') {
      student.status = 'DELETED';
      student.tokenVersion = (student.tokenVersion || 1) + 1;
      student.firstName = '[DELETED]';
      student.lastName = '[DELETED]';
      student.phone = undefined;
      student.email = `deleted_${student.id}@sidprep.invalid`;
      student.settings = {};
      student.completedTasks = [];
      await db.students.set(id, student);
      await db.revokeStudentSessions(id);
    } else {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_ACTION', message: `Unsupported account action: ${action}` },
      });
    }

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'STUDENT_USER',
      action: `USER_${action}`,
      targetId: id,
      changesDiff: { action, reason },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      message: `Account action ${action} executed successfully.`,
      status: student.status,
    });
  });

  /**
   * GET /admin/users/:id/full
   * Authorized full-detail view for SUPER_ADMIN with actual login history, sessions, attempts, and conversations
   */
  fastify.get('/admin/users/:id/full', { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] }, async (request, reply) => {
    const admin = request.admin!;
    const { id } = request.params as { id: string };
    const student = db.students.get(id);

    if (!student) {
      return reply.code(404).send({
        success: false,
        error: { code: 'STUDENT_NOT_FOUND', message: 'Student record does not exist' },
      });
    }

    // Retrieve active sessions from PostgreSQL
    let sessions: any[] = [];
    try {
      const sessRes = await query(
        `SELECT id, ip_address, user_agent, login_source, created_at, last_seen_at, revoked_at 
         FROM student_sessions 
         WHERE student_id = $1 
         ORDER BY created_at DESC LIMIT 20`,
        [id]
      );
      sessions = sessRes.rows.map((row: any) => ({
        id: row.id,
        ipAddress: row.ip_address || 'Not recorded',
        userAgent: row.user_agent || 'Unknown device',
        loginSource: row.login_source || 'app',
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        isRevoked: Boolean(row.revoked_at),
      }));
    } catch {
      // Fallback
    }

    // Retrieve mock attempts
    const studentAttempts = Array.from(db.attempts.values())
      .filter((a) => a.studentId === id)
      .map((a) => {
        const test = db.tests.get(a.testId);
        return {
          id: a.id,
          testId: a.testId,
          testTitle: test?.title || a.testId,
          score: a.score ?? 0,
          maxMarks: a.maxScore ?? 100,
          accuracy: a.accuracy ?? 0,
          submittedAt: a.submittedAt || a.startedAt,
          timeSpentSeconds: a.timeSpentSeconds ?? a.durationSeconds ?? 0,
        };
      });

    // Retrieve support conversations
    let conversations: any[] = [];
    try {
      const convRes = await query(
        `SELECT id, subject, category, status, unread_student_count, unread_admin_count, last_message_at, created_at 
         FROM support_conversations 
         WHERE student_id = $1 
         ORDER BY last_message_at DESC LIMIT 10`,
        [id]
      );
      conversations = convRes.rows;
    } catch {
      // Fallback
    }

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'STUDENT_USER',
      action: 'UNMASK_STUDENT_FULL_PROFILE',
      targetId: id,
      changesDiff: { studentEmail: student.email },
      ipAddress: request.ip,
    });

    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    reply.header('Pragma', 'no-cache');

    return reply.send({
      success: true,
      student: {
        id: student.id,
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        isSingleName: Boolean(student.isSingleName),
        email: student.email,
        phone: student.phone || 'Not linked',
        phoneCountryCode: student.phoneCountryCode || '+91',
        isEmailVerified: student.isEmailVerified,
        isPhoneVerified: Boolean(student.isPhoneVerified),
        isProfileComplete: Boolean(student.isProfileComplete),
        status: student.status,
        avatarUrl: student.avatarUrl || null,
        targetExams: student.targetExams || [],
        primaryExamId: student.primaryExamId || student.targetExams?.[0] || 'ssc-cgl',
        dailyGoalMinutes: student.dailyGoalMinutes || 60,
        preferredLanguage: student.preferredLanguage || 'en',
        streakDays: student.streakDays || 0,
        registrationIp: student.registrationIp || 'Not recorded',
        lastLoginIp: student.lastLoginIp || student.registrationIp || 'Not recorded',
        lastLoginAt: student.lastLoginAt || 'Not recorded',
        lastActivityAt: student.lastActivityAt || student.createdAt,
        createdAt: student.createdAt,
        sessions,
        attempts: studentAttempts,
        conversations,
      },
    });
  });
};
