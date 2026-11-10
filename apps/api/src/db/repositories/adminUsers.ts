import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { AdminUserRecord } from '../index.js';

export class AdminUserRepository extends BaseRepository<AdminUserRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM admin_users');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const admin: AdminUserRecord = {
          id: row.id,
          email: row.email,
          name: row.name,
          passwordHash: row.password_hash,
          role: row.role as any,
          totpSecret: row.totp_secret,
          is2faEnabled: Boolean(row.is_2fa_enabled),
          isActive: Boolean(row.is_active),
          tokenVersion: Number(row.token_version) || 1,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        };
        this.cache[admin.id] = admin;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[AdminUserRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: AdminUserRecord): Promise<void> {
    await query(
      `INSERT INTO admin_users (
        id, email, name, password_hash, role, totp_secret, is_2fa_enabled, is_active, token_version, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        totp_secret = EXCLUDED.totp_secret,
        is_2fa_enabled = EXCLUDED.is_2fa_enabled,
        is_active = EXCLUDED.is_active,
        token_version = EXCLUDED.token_version`,
      [
        record.id,
        record.email,
        record.name,
        record.passwordHash,
        record.role,
        record.totpSecret,
        record.is2faEnabled,
        record.isActive,
        record.tokenVersion || 1,
        record.createdAt,
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM admin_users WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM admin_users');
  }
}
