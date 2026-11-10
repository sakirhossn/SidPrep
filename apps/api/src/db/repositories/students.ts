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
          phone: row.phone || undefined,
          preferredLanguage: (row.preferred_language as any) || 'en',
          targetExams: Array.isArray(row.target_exams) ? row.target_exams : [],
          dailyGoalMinutes: Number(row.daily_goal_minutes) || 45,
          streakDays: Number(row.streak_days) || 0,
          status: (row.status as any) || 'ACTIVE',
          isEmailVerified: Boolean(row.is_email_verified),
          tokenVersion: Number(row.token_version) || 1,
          completedTasks: typeof row.completed_tasks === 'string' ? JSON.parse(row.completed_tasks) : (Array.isArray(row.completed_tasks) ? row.completed_tasks : []),
          settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings || {},
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
        id, email, phone, preferred_language, target_exams,
        daily_goal_minutes, streak_days, status, is_email_verified, token_version,
        completed_tasks, settings, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        preferred_language = EXCLUDED.preferred_language,
        target_exams = EXCLUDED.target_exams,
        daily_goal_minutes = EXCLUDED.daily_goal_minutes,
        streak_days = EXCLUDED.streak_days,
        status = EXCLUDED.status,
        is_email_verified = EXCLUDED.is_email_verified,
        token_version = EXCLUDED.token_version,
        completed_tasks = EXCLUDED.completed_tasks,
        settings = EXCLUDED.settings,
        updated_at = NOW()`,
      [
        record.id,
        record.email,
        record.phone || null,
        record.preferredLanguage,
        record.targetExams,
        record.dailyGoalMinutes,
        record.streakDays,
        record.status,
        record.isEmailVerified,
        record.tokenVersion || 1,
        JSON.stringify(record.completedTasks || []),
        JSON.stringify(record.settings || {}),
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
