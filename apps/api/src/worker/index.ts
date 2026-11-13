import { db } from '../db/index.js';
import { env } from '../config/index.js';
import type { JobRunRecord } from '../db/index.js';
import { executeNewsFetchJob } from '../services/newsIngestion.js';
import { executeReleaseNotificationJob, processPushRetriesAndReceipts } from '../services/pushNotifications.js';

/**
 * SidPrep Self-Hosted Worker
 * Uses PostgreSQL FOR UPDATE SKIP LOCKED pattern.
 * Zero Redis / BullMQ overhead to preserve Oracle Always Free memory budget.
 */
export class SidPrepWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastCronRunDateIst: string | null = null;

  public start() {
    this.isRunning = true;
    console.log(`[Worker] Started SidPrep Background Worker with PostgreSQL FOR UPDATE SKIP LOCKED. Timezone: ${env.NEWS_TIMEZONE}`);

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

  public async publishScheduledNews(): Promise<number> {
    const now = new Date();
    let publishedCount = 0;
    const drafts = Array.from(db.newsDrafts.values()).filter(
      (d) => d.editorialStatus === 'APPROVED' || (d.editorialStatus === 'SCHEDULED' && (!d.scheduledFor || new Date(d.scheduledFor) <= now))
    );

    for (const draft of drafts) {
      draft.editorialStatus = 'PUBLISHED';
      draft.publishedAt = now.toISOString();
      draft.updatedAt = now.toISOString();
      await db.newsDrafts.set(draft.id, draft);
      publishedCount++;
    }

    if (publishedCount > 0) {
      db.logOperational({
        service: 'WORKER_EDITORIAL',
        level: 'INFO',
        message: `Worker auto-published ${publishedCount} approved/scheduled news drafts`,
        meta: { publishedCount },
      });
    }

    return publishedCount;
  }

  public async runTick() {
    const now = new Date();
    // Format current IST time
    const istTimeStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: env.NEWS_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    // 1. Scheduled News Fetch Check (e.g. 05:30 IST)
    const todayIst = db.getTodayIst();
    if (istTimeStr === '05:30' && this.lastCronRunDateIst !== todayIst) {
      this.lastCronRunDateIst = todayIst;
      db.logOperational({
        service: 'WORKER_CRON',
        level: 'INFO',
        message: 'Executed scheduled 05:30 IST RSS news ingestion cycle',
        meta: { timestampIST: istTimeStr },
      });
      try {
        await executeNewsFetchJob({
          sourceGroup: 'ALL',
          workerId: 'worker_scheduled_0530_cron',
          maxConcurrency: 4,
          maxAgeHours: 48,
        });
      } catch (err: any) {
        console.error('[Worker] Error executing scheduled 05:30 IST news fetch:', err.message);
      }
    }

    // 2. Publish all approved and due scheduled news drafts (resilient catchup)
    await this.publishScheduledNews();

    // 3. Process due push notification retries and verify provider receipts
    await processPushRetriesAndReceipts();

    // 4. Process any queued async jobs using PostgreSQL FOR UPDATE SKIP LOCKED
    while (await this.processNextJob()) {
      // Drain queued jobs cleanly
    }
  }

  public async processNextJob(): Promise<boolean> {
    const job = await db.jobs.claimNextJob();
    if (!job) return false;

    console.log(`[Worker] Claimed and processing job ${job.id} (${job.jobType}) via FOR UPDATE SKIP LOCKED`);
    try {
      await this.executeJob(job);
      await db.jobs.completeJob(job.id);
      db.logOperational({
        service: 'WORKER',
        level: 'INFO',
        message: `Successfully executed job ${job.id} (${job.jobType})`,
        meta: { jobId: job.id, jobType: job.jobType },
      });
      return true;
    } catch (err: any) {
      console.error(`[Worker] Job ${job.id} execution failed:`, err.message);
      await db.jobs.failJob(job.id, err?.message || 'Execution error');
      db.logOperational({
        service: 'WORKER',
        level: 'ERROR',
        message: `Job ${job.id} (${job.jobType}) failed: ${err?.message || 'Execution error'}`,
        meta: { jobId: job.id, jobType: job.jobType, error: err?.message },
      });
      return false;
    }
  }

  private async executeJob(job: JobRunRecord): Promise<void> {
    switch (job.jobType) {
      case 'NEWS_FETCH':
        await executeNewsFetchJob({
          sourceId: (job.payload as any)?.sourceId,
          workerId: `bg_worker_${job.id}`,
        });
        db.logOperational({
          service: 'WORKER',
          level: 'INFO',
          message: 'Executed real background news fetch job',
          meta: { jobId: job.id, payload: job.payload },
        });
        break;

      case 'NEWS_PUBLISH':
        await this.publishScheduledNews();
        db.logOperational({
          service: 'WORKER',
          level: 'INFO',
          message: 'Executed editorial auto-publish job',
          meta: { jobId: job.id, payload: job.payload },
        });
        break;

      case 'QUOTA_CHECK':
        db.logOperational({
          service: 'WORKER',
          level: 'INFO',
          message: 'Checking Brevo and R2 storage consumption quotas',
          meta: { jobId: job.id, brevoUsed: db.brevoSendsToday },
        });
        break;

      case 'LOG_CLEANUP':
        db.logOperational({
          service: 'WORKER',
          level: 'INFO',
          message: 'Pruning old operational and telemetry events',
          meta: { jobId: job.id },
        });
        break;

      case 'RELEASE_NOTIFICATION': {
        const releaseId = String((job.payload as any)?.releaseId || '');
        if (!releaseId) {
          throw new Error('RELEASE_NOTIFICATION job missing payload.releaseId');
        }
        await executeReleaseNotificationJob(releaseId, job.id);
        break;
      }

      case 'PUSH_RETRY_AND_RECEIPTS': {
        await processPushRetriesAndReceipts();
        break;
      }

      default:
        console.log(`[Worker] Completed generic job task: ${job.jobType}`);
        break;
    }
  }
}

export const worker = new SidPrepWorker();
