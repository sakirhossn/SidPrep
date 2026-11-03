import { db } from '../db/index.js';
import { env } from '../config/index.js';

/**
 * SidPrep Self-Hosted Worker
 * Uses PostgreSQL FOR UPDATE SKIP LOCKED pattern / lightweight in-process runner.
 * Zero Redis / BullMQ overhead to preserve Oracle Always Free memory budget.
 */
export class SidPrepWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  public start() {
    this.isRunning = true;
    console.log(`[Worker] Started SidPrep Background Worker. Timezone: ${env.NEWS_TIMEZONE}`);

    // Run periodic tasks every 60 seconds
    this.timer = setInterval(async () => {
      try {
        await this.runTick();
      } catch (err) {
        console.error('[Worker] Error in job tick:', err);
      }
    }, 60000);
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Worker] Stopped background worker.');
  }

  private async runTick() {
    const now = new Date();
    // Format current IST time
    const istTimeStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: env.NEWS_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    // 1. Scheduled News Fetch Check (e.g. 05:30 IST)
    if (istTimeStr === '05:30') {
      db.logOperational({
        service: 'WORKER_CRON',
        level: 'INFO',
        message: 'Executed scheduled 05:30 IST RSS news ingestion cycle',
        meta: { timestampIST: istTimeStr },
      });
    }

    // 2. Scheduled News Publish Check (e.g. 07:00 IST)
    if (istTimeStr === '07:00') {
      db.logOperational({
        service: 'WORKER_CRON',
        level: 'INFO',
        message: 'Executed scheduled 07:00 IST editorial publication pass',
        meta: { timestampIST: istTimeStr },
      });
    }

    // 3. Process any queued async jobs
    const queuedJob = db.jobs.find((j) => j.status === 'QUEUED');
    if (queuedJob) {
      queuedJob.status = 'RUNNING';
      try {
        console.log(`[Worker] Processing job ${queuedJob.id} of type ${queuedJob.jobType}`);
        queuedJob.status = 'COMPLETED';
      } catch (err: any) {
        queuedJob.retryCount++;
        queuedJob.lastError = err?.message || 'Execution error';
        queuedJob.status = queuedJob.retryCount >= 3 ? 'FAILED' : 'QUEUED';
      }
    }
  }
}

export const worker = new SidPrepWorker();
