import fs from 'node:fs';
import path from 'node:path';
import { query, getPool } from './pool.js';

let migrationPromise: Promise<{ applied: string[]; total: number }> | null = null;

export async function runMigrations(): Promise<{ applied: string[]; total: number }> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = runMigrationsInternal().finally(() => {
    migrationPromise = null;
  });
  return migrationPromise;
}

async function runMigrationsInternal(): Promise<{ applied: string[]; total: number }> {
  await getPool();

  // Acquire PostgreSQL session advisory lock to ensure single-instance migration concurrency
  try {
    await query('SELECT pg_advisory_lock(718293)');
  } catch (err: any) {
    console.warn('[DB Migration] Advisory lock warning:', err.message);
  }

  try {
    // Ensure migrations tracking table exists
    await query(`
      CREATE TABLE IF NOT EXISTS pgmigrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        run_on TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const appliedRows = await query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY id ASC');
    const appliedSet = new Set(appliedRows.rows.map((r) => r.name));

    // Find migration files in apps/api/migrations
    const possibleDirs = [
      path.resolve(process.cwd(), 'apps/api/migrations'),
      path.resolve(process.cwd(), 'migrations'),
      path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../migrations'),
    ];

    let migrationsDir = '';
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        migrationsDir = dir;
        break;
      }
    }

    if (!migrationsDir) {
      console.warn('[DB Migration] Migrations directory not found. Skipping.');
      return { applied: [], total: 0 };
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const newlyApplied: string[] = [];

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`[DB Migration] Applying migration: ${file}...`);
      try {
        await query('BEGIN');
        await query(sql);
        await query('INSERT INTO pgmigrations (name) VALUES ($1)', [file]);
        await query('COMMIT');
        newlyApplied.push(file);
        console.log(`[DB Migration] Applied: ${file}`);
      } catch (err: any) {
        await query('ROLLBACK').catch(() => {});
        console.error(`[DB Migration] Error applying ${file}:`, err);
        throw err;
      }
    }

    if (newlyApplied.length === 0) {
      console.log('[DB Migration] All database migrations are up to date.');
    }

    return { applied: newlyApplied, total: files.length };
  } finally {
    try {
      await query('SELECT pg_advisory_unlock(718293)');
    } catch {
      // Ignore unlock cleanup error if connection closed
    }
  }
}

// Allow standalone execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then((res) => {
      console.log(`[DB Migration] Finished. Applied ${res.applied.length} new migrations.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[DB Migration] Fatal migration error:', err);
      process.exit(1);
    });
}
