import pg from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { env } from '../config/index.js';

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
}

export interface DbClient {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  release(): void;
}

export interface PoolInterface {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  connect(): Promise<DbClient>;
  end(): Promise<void>;
  on(event: string, listener: (...args: any[]) => void): void;
}

let activePool: PoolInterface | null = null;
let poolPromise: Promise<PoolInterface> | null = null;
let isShuttingDown = false;
let isEmbeddedFallback = false;

async function createPoolInternal(): Promise<PoolInterface> {
  const connectionString =
    process.env.DATABASE_URL ||
    env.DATABASE_URL ||
    `postgresql://${process.env.POSTGRES_USER || 'sidprep_user'}:${process.env.POSTGRES_PASSWORD || 'REPLACE_ME_POSTGRES_PASSWORD'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'sidprep_db'}`;

  if (process.env.NODE_ENV === 'production' && (process.env.USE_EMBEDDED_PG || connectionString.includes('dummy'))) {
    throw new Error('Production environment must use external PostgreSQL database. Embedded PGlite is disabled in production.');
  }

  // Attempt real pg.Pool connection if not explicitly disabled and not local test without external PG
  if (!process.env.USE_EMBEDDED_PG && !connectionString.includes('dummy')) {
    try {
      const realPool = new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 1000,
      });

      // Probe with 1 second timeout
      const probeClient = await realPool.connect();
      await probeClient.query('SELECT 1');
      probeClient.release();

      realPool.on('error', (err) => {
        console.error('[DB Pool] Unexpected error on idle client:', err);
      });

      console.log(`[DB Pool] Connected to PostgreSQL via pg.Pool at ${connectionString.replace(/:[^:@]+@/, ':***@')}`);
      activePool = realPool;
      return activePool;
    } catch (err: any) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[DB Pool] FATAL: External PostgreSQL connection failed in production mode:', err?.message || err);
        throw new Error(`Production database connection failed: ${err?.message || err}. Refusing fallback to embedded SQLite/PGlite.`);
      }
      console.warn(`[DB Pool] External PostgreSQL not listening. Using persistent local PostgreSQL engine...`);
    }
  }

  // Fallback to real persistent PostgreSQL engine (PGlite)
  isEmbeddedFallback = true;
  const pgliteModule = await import('@electric-sql/pglite');
  const PGlite = pgliteModule.PGlite || (pgliteModule as any).default?.PGlite || (pgliteModule as any).default;

  const baseDir = process.cwd().endsWith('apps\\api') || process.cwd().endsWith('apps/api')
    ? process.cwd()
    : path.resolve(process.cwd(), 'apps/api');

  const dataDir = process.env.NODE_ENV === 'test'
    ? path.resolve(baseDir, '.pgdata_test')
    : path.resolve(baseDir, '.pgdata');

  if (dataDir && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const pglite = new PGlite(dataDir);
  await pglite.waitReady;
  console.log(`[DB Pool] Persistent PostgreSQL engine initialized at ${dataDir}`);

  // Create pg.Pool compatible wrapper around PGlite
  activePool = {
    async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
      if ((!params || params.length === 0) && (text.includes(';') || text.trim().startsWith('--'))) {
        await pglite.exec(text);
        return { rows: [], rowCount: 0, command: 'EXEC' };
      }
      const res = await pglite.query(text, params);
      return {
        rows: res.rows as T[],
        rowCount: res.rows.length,
        command: (res as any).command || 'SELECT',
      };
    },
    async connect(): Promise<DbClient> {
      return {
        async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
          if ((!params || params.length === 0) && (text.includes(';') || text.trim().startsWith('--'))) {
            await pglite.exec(text);
            return { rows: [], rowCount: 0, command: 'EXEC' };
          }
          const res = await pglite.query(text, params);
          return {
            rows: res.rows as T[],
            rowCount: res.rows.length,
            command: (res as any).command || 'SELECT',
          };
        },
        release() {
          // No-op for in-process single-client pool
        },
      };
    },
    async end(): Promise<void> {
      await pglite.close();
    },
    on(_event: string, _listener: (...args: any[]) => void) {
      // Event emitter compatibility
    },
  };

  return activePool;
}

export async function getPool(): Promise<PoolInterface> {
  if (activePool) return activePool;
  if (!poolPromise) {
    poolPromise = createPoolInternal();
  }
  return poolPromise;
}

/**
 * Executes a parameterised query against the active pool
 */
export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  const p = await getPool();
  return p.query<T>(text, params);
}

/**
 * Retrieves a client for transactions
 */
export async function getClient(): Promise<DbClient> {
  const p = await getPool();
  return p.connect();
}

/**
 * Health check verification
 */
export async function checkHealth(): Promise<{ status: 'healthy' | 'degraded'; latencyMs: number; mode: string }> {
  const start = Date.now();
  try {
    const res = await query('SELECT 1 as alive');
    const latencyMs = Date.now() - start;
    const isLive = res.rows?.[0]?.alive === 1 || res.rows?.[0]?.alive === '1';
    if (!isLive) {
      return { status: 'degraded', latencyMs, mode: isEmbeddedFallback ? 'embedded-pg' : 'pg-pool' };
    }
    if (process.env.NODE_ENV === 'production' && isEmbeddedFallback) {
      return { status: 'degraded', latencyMs, mode: 'embedded-pg' };
    }
    return { status: 'healthy', latencyMs, mode: isEmbeddedFallback ? 'embedded-pg' : 'pg-pool' };
  } catch {
    return { status: 'degraded', latencyMs: Date.now() - start, mode: isEmbeddedFallback ? 'embedded-pg' : 'pg-pool' };
  }
}

/**
 * Graceful shutdown hook
 */
export async function closePool(): Promise<void> {
  if (isShuttingDown || !activePool) return;
  isShuttingDown = true;
  console.log('[DB Pool] Closing PostgreSQL pool connections...');
  try {
    await activePool.end();
    activePool = null;
    poolPromise = null;
    console.log('[DB Pool] PostgreSQL pool successfully terminated.');
  } catch (err: any) {
    console.error('[DB Pool] Error during pool termination:', err.message);
  }
}

// Register process exit listeners
process.on('SIGINT', async () => {
  await closePool();
});

process.on('SIGTERM', async () => {
  await closePool();
});
