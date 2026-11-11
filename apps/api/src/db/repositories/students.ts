import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { StudentRecord } from '../index.js';

export class StudentRepository extends BaseRepository<StudentRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM students');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const student: StudentRecord = {
          id: row.id,
          email: row.email,
          passwordHash: row.password_hash || undefined,
          firstName: row.first_name || undefined,
          lastName: row.last_name || undefined,
          isSingleName: Boolean(row.is_single_name),
          phone: row.phone || undefined,
          phoneCountryCode: row.phone_country_code || '+91',
          isPhoneVerified: Boolean(row.is_phone_verified),
          preferredLanguage: (row.preferred_language as any) || 'en',
          targetExams: Array.isArray(row.target_exams) ? row.target_exams : [],
          primaryExamId: row.primary_exam_id || (Array.isArray(row.target_exams) && row.target_exams[0] ? row.target_exams[0] : undefined),
          dailyGoalMinutes: Number(row.daily_goal_minutes) || 45,
          streakDays: Number(row.streak_days) || 0,
          status: (row.status as any) || 'ACTIVE',
          isEmailVerified: Boolean(row.is_email_verified),
          isProfileComplete: Boolean(row.is_profile_complete),
          tokenVersion: Number(row.token_version) || 1,
          completedTasks: typeof row.completed_tasks === 'string' ? JSON.parse(row.completed_tasks) : (Array.isArray(row.completed_tasks) ? row.completed_tasks : []),
          settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings || {},
          registrationIp: row.registration_ip || undefined,
          lastLoginIp: row.last_login_ip || undefined,
          lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : undefined,
          lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : undefined,
          loginSource: row.login_source || 'app',
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        };
        this.cache[student.id] = student;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[StudentRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: StudentRecord): Promise<void> {
    await query(
      `INSERT INTO students (
        id, email, password_hash, first_name, last_name, is_single_name, phone, phone_country_code,
        is_phone_verified, preferred_language, target_exams, primary_exam_id,
        daily_goal_minutes, streak_days, status, is_email_verified, is_profile_complete,
        token_version, completed_tasks, settings, registration_ip, last_login_ip,
        last_login_at, last_activity_at, login_source, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = COALESCE(EXCLUDED.password_hash, students.password_hash),
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        is_single_name = EXCLUDED.is_single_name,
        phone = EXCLUDED.phone,
        phone_country_code = EXCLUDED.phone_country_code,
        is_phone_verified = EXCLUDED.is_phone_verified,
        preferred_language = EXCLUDED.preferred_language,
        target_exams = EXCLUDED.target_exams,
        primary_exam_id = EXCLUDED.primary_exam_id,
        daily_goal_minutes = EXCLUDED.daily_goal_minutes,
        streak_days = EXCLUDED.streak_days,
        status = EXCLUDED.status,
        is_email_verified = EXCLUDED.is_email_verified,
        is_profile_complete = EXCLUDED.is_profile_complete,
        token_version = EXCLUDED.token_version,
        completed_tasks = EXCLUDED.completed_tasks,
        settings = EXCLUDED.settings,
        registration_ip = EXCLUDED.registration_ip,
        last_login_ip = EXCLUDED.last_login_ip,
        last_login_at = EXCLUDED.last_login_at,
        last_activity_at = EXCLUDED.last_activity_at,
        login_source = EXCLUDED.login_source,
        updated_at = NOW()`,
      [
        record.id,
        record.email,
        record.passwordHash || null,
        record.firstName || null,
        record.lastName || null,
        record.isSingleName || false,
        record.phone || null,
        record.phoneCountryCode || '+91',
        record.isPhoneVerified || false,
        record.preferredLanguage,
        record.targetExams,
        record.primaryExamId || record.targetExams?.[0] || null,
        record.dailyGoalMinutes,
        record.streakDays,
        record.status,
        record.isEmailVerified,
        record.isProfileComplete || false,
        record.tokenVersion || 1,
        JSON.stringify(record.completedTasks || []),
        JSON.stringify(record.settings || {}),
        record.registrationIp || null,
        record.lastLoginIp || null,
        record.lastLoginAt ? new Date(record.lastLoginAt) : null,
        record.lastActivityAt ? new Date(record.lastActivityAt) : null,
        record.loginSource || 'app',
        record.createdAt,
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM students WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM students');
  }
}
