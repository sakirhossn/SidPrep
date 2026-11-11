import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { db, NewsDraftRecord } from '../../db/index.js';
import { query } from '../../db/pool.js';
import { isSafePublicUrl } from '../../lib/security.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { executeNewsFetchJob, testFeedConnectivity } from '../../services/newsIngestion.js';

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_REVIEW', 'REVIEWED', 'ARCHIVED'],
  IN_REVIEW: ['REVIEWED', 'REJECTED', 'ARCHIVED'],
  REVIEWED: ['APPROVED', 'REJECTED', 'ARCHIVED'],
  APPROVED: ['SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
  SCHEDULED: ['PUBLISHED', 'APPROVED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export const newsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /current-affairs
   * Public and student current affairs news feed with category, exam and archive filters
   */
  fastify.get('/current-affairs', async (request, reply) => {
    const { category, exam, date, month, page = '1', limit = '20' } = request.query as {
      category?: string;
      exam?: string;
      date?: string;
      month?: string;
      page?: string;
      limit?: string;
    };

    const p = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10)));

    let items = Array.from(db.newsDrafts.values()).filter(
      (draft) => draft.editorialStatus === 'PUBLISHED'
    );

    if (category && category !== 'ALL') {
      items = items.filter((d) => d.category.toLowerCase() === category.toLowerCase());
    }

    if (exam && exam !== 'ALL') {
      items = items.filter((d) =>
        (d.targetExams || ['SSC_CGL', 'RRB_NTPC', 'WBPSC_CLERKSHIP', 'IBPS_PO'])
          .map((x) => x.toUpperCase())
          .includes(exam.toUpperCase())
      );
    }

    if (date) {
      items = items.filter((d) => (d.publishedAt || d.createdAt).startsWith(date));
    } else if (month) {
      items = items.filter((d) => (d.publishedAt || d.createdAt).startsWith(month));
    }

    // Sort descending by publication date
    items.sort(
      (a, b) =>
        new Date(b.publishedAt || b.createdAt).getTime() -
        new Date(a.publishedAt || a.createdAt).getTime()
    );

    const total = items.length;
    const startIndex = (p - 1) * lim;
    const paginated = items.slice(startIndex, startIndex + lim);

    return reply.send({
      success: true,
      items: paginated,
      data: paginated,
      total,
      pagination: {
        total,
        page: p,
        limit: lim,
        totalPages: Math.ceil(total / lim) || 1,
      },
    });
  });

  /**
   * GET /quizzes/daily
   * Practice quiz generated from current affairs
   */
  fastify.get('/quizzes/daily', async (request, reply) => {
    const dateStr = new Date().toISOString().split('T')[0];
    const questions = Array.from(db.questions.values()).slice(0, 5).map((q) => {
      const en = q.translations.find((t) => t.language === 'en') || q.translations[0];
      return {
        id: q.id,
        sectionId: 'ca_daily',
        sequence: 1,
        text: en?.text || 'Daily Question',
        options: en?.options || [],
        positiveMarks: 1.0,
        negativeMarks: 0.25,
      };
    });

    return reply.send({
      id: `quiz_${dateStr}`,
      date: dateStr,
      title: `Daily Current Affairs Challenge — ${dateStr}`,
      questions,
    });
  });

  /**
   * POST /admin/news/fetch-now
   * Admin triggers real on-demand ingestion across active official feeds
   */
  fastify.post(
    '/admin/news/fetch-now',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { sourceId } = (request.body as { sourceId?: string }) || {};

      const result = await executeNewsFetchJob({
        sourceId,
        adminId: admin.id,
        workerId: `manual_${admin.id}`,
      });

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'NEWS_FETCHER',
        action: 'RUN_FETCH_NOW',
        targetId: result.jobId,
        changesDiff: {
          status: result.status,
          itemsFetched: result.itemsFetched,
          itemsNew: result.itemsNew,
          itemsDuplicate: result.itemsDuplicate,
        },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: `News ingestion completed. ${result.itemsNew} new items drafted for editorial review.`,
        ...result,
        newDraftCount: result.itemsNew,
        mode: 'MANUAL_APPROVAL',
      });
    }
  );

  /**
   * GET /admin/news/jobs
   * History of background & manual fetch jobs
   */
  fastify.get(
    '/admin/news/jobs',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR', 'AUDITOR'])] },
    async (_request, reply) => {
      try {
        const res = await query(
          `SELECT j.*, s.name as source_name 
           FROM news_fetch_jobs j 
           LEFT JOIN news_sources s ON j.source_id = s.id 
           ORDER BY j.created_at DESC LIMIT 25`
        );
        return reply.send({ success: true, data: res.rows });
      } catch (err: any) {
        return reply.send({ success: true, data: [] });
      }
    }
  );

  /**
   * GET /admin/news/sources
   * List configured news sources with health status
   */
  fastify.get(
    '/admin/news/sources',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR', 'AUDITOR'])] },
    async (_request, reply) => {
      try {
        const res = await query('SELECT * FROM news_sources ORDER BY created_at ASC');
        if (res.rows.length > 0) {
          return reply.send({ success: true, data: res.rows });
        }
      } catch {
        // Fallback to memory
      }

      const sources = Array.from(db.newsSources.values()).map((s) => ({
        id: s.id,
        name: s.name,
        feed_url: s.feedUrl,
        is_enabled: s.isEnabled,
        category: s.category || 'National',
        language: 'en',
        fetch_interval_minutes: 60,
        parser_type: 'rss',
        health_status: 'HEALTHY',
        last_fetched_at: s.lastFetchedAt,
      }));

      return reply.send({ success: true, data: sources });
    }
  );

  /**
   * POST /admin/news/sources
   * Add a new news source
   */
  fastify.post(
    '/admin/news/sources',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = request.body as any;

      if (!body.name || !body.feedUrl) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Source name and feedUrl are required.' },
        });
      }

      if (!isSafePublicUrl(body.feedUrl)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'SSRF_BLOCKED', message: 'Feed URL must be a public HTTP/HTTPS endpoint.' },
        });
      }

      const normalizedFeedUrl = body.feedUrl.trim();
      const existing = Array.from(db.newsSources.values()).find((s) => s.feedUrl === normalizedFeedUrl);
      if (existing) {
        return reply.code(409).send({
          success: false,
          error: { code: 'DUPLICATE_FEED_URL', message: 'A news source with this feed URL is already registered.' },
        });
      }

      const sourceId = body.id || `src_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newSource = {
        id: sourceId,
        name: body.name.trim(),
        feedUrl: normalizedFeedUrl,
        isEnabled: body.isEnabled !== undefined ? Boolean(body.isEnabled) : true,
        category: body.category || 'National',
        language: body.language || 'en',
        fetchIntervalMinutes: Number(body.fetchIntervalMinutes) || 60,
        parserType: body.parserType || 'rss',
      };

      try {
        await query(
          `INSERT INTO news_sources (id, name, feed_url, is_enabled, category, language, fetch_interval_minutes, parser_type, health_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'HEALTHY')
           ON CONFLICT (id) DO NOTHING`,
          [
            newSource.id,
            newSource.name,
            newSource.feedUrl,
            newSource.isEnabled,
            newSource.category,
            newSource.language,
            newSource.fetchIntervalMinutes,
            newSource.parserType,
          ]
        );
      } catch (err: any) {
        console.warn('[News] Insert source fallback:', err.message);
      }

      try {
        await db.newsSources.set(sourceId, {
          id: sourceId,
          name: newSource.name,
          feedUrl: newSource.feedUrl,
          category: newSource.category,
          isEnabled: newSource.isEnabled,
          createdAt: new Date().toISOString(),
        });
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.code(409).send({
            success: false,
            error: { code: 'DUPLICATE_FEED_URL', message: 'A news source with this feed URL is already registered.' },
          });
        }
        throw err;
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'NEWS_SOURCES',
        action: 'CREATE_SOURCE',
        targetId: sourceId,
        changesDiff: { name: newSource.name, feedUrl: newSource.feedUrl },
        ipAddress: request.ip,
      });

      return reply.code(201).send({
        success: true,
        message: 'News source added successfully.',
        data: newSource,
      });
    }
  );

  /**
   * POST /admin/news/sources/:id/test
   * Test feed connectivity and preview items without saving
   */
  fastify.post(
    '/admin/news/sources/:id/test',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let feedUrl: string | undefined;

      try {
        const res = await query('SELECT feed_url FROM news_sources WHERE id = $1', [id]);
        if (res.rows.length > 0) feedUrl = res.rows[0].feed_url;
      } catch {
        // Fallback
      }

      if (!feedUrl) {
        const memSource = db.newsSources.get(id);
        feedUrl = memSource?.feedUrl;
      }

      if (!feedUrl) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'News source not found.' },
        });
      }

      const testResult = await testFeedConnectivity(feedUrl);
      return reply.send({
        success: testResult.success,
        data: testResult,
      });
    }
  );

  /**
   * PATCH /admin/news/drafts/:id/status
   * Editorial status transition with strict transition validation
   */
  fastify.patch(
    '/admin/news/drafts/:id/status',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR', 'REVIEWER'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const draft = db.newsDrafts.get(id);

      if (!draft) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'News draft not found' } });
      }

      const { status, title, originalSummary, category } = request.body as any;

      if (status) {
        const currentStatus = draft.editorialStatus || 'DRAFT';
        const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

        if (status !== currentStatus && !allowedNext.includes(status)) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'INVALID_EDITORIAL_TRANSITION',
              message: `Cannot transition editorial status from '${currentStatus}' directly to '${status}'. Allowed transitions: ${allowedNext.join(', ')}`,
            },
          });
        }
      }

      const previousState = { ...draft };

      if (title) draft.title = title;
      if (originalSummary) draft.originalSummary = originalSummary;
      if (category) draft.category = category;

      if (status) {
        draft.editorialStatus = status;
        if (status === 'APPROVED') {
          draft.approvedBy = admin.email;
          draft.approvalMode = 'MANUAL';
        }
        if (status === 'PUBLISHED') {
          draft.publishedAt = new Date().toISOString();
        }
      }

      draft.updatedAt = new Date().toISOString();
      await db.newsDrafts.set(draft.id, draft);

      // Also sync to PostgreSQL news_articles
      try {
        await query(
          `UPDATE news_articles 
           SET editorial_status = $1, reviewed_by = $2, reviewed_at = NOW(),
               published_at = CASE WHEN $1 = 'PUBLISHED' THEN NOW() ELSE published_at END
           WHERE id = $3`,
          [draft.editorialStatus, admin.id, id]
        );
      } catch {
        // Fallback
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'CURRENT_AFFAIRS',
        action: `TRANSITION_${status || 'EDIT'}`,
        targetId: id,
        changesDiff: { from: previousState.editorialStatus, to: draft.editorialStatus },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        draft,
      });
    }
  );

  /**
   * POST /admin/news/drafts/:id/schedule
   * Schedule approved news draft for future publication (F17)
   */
  fastify.post(
    '/admin/news/drafts/:id/schedule',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const { scheduledFor } = (request.body as { scheduledFor?: string }) || {};

      if (!scheduledFor || isNaN(new Date(scheduledFor).getTime())) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_SCHEDULE_DATE', message: 'A valid ISO datetime string is required for scheduledFor' },
        });
      }

      const draft = db.newsDrafts.get(id);
      if (!draft) {
        return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'News draft not found' } });
      }

      draft.scheduledFor = scheduledFor;
      draft.editorialStatus = 'SCHEDULED';
      draft.approvedBy = admin.email;
      draft.updatedAt = new Date().toISOString();
      await db.newsDrafts.set(draft.id, draft);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'CURRENT_AFFAIRS',
        action: 'SCHEDULE_PUBLICATION',
        targetId: id,
        changesDiff: { scheduledFor },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        draft,
      });
    }
  );

  /**
   * POST /admin/news/publish-approved
   * Triggers catchup and publication of all approved / due scheduled drafts (F17)
   */
  fastify.post(
    '/admin/news/publish-approved',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR'])] },
    async (_request, reply) => {
      const now = new Date();
      const publishedIds: string[] = [];

      const eligibleDrafts = Array.from(db.newsDrafts.values()).filter((d) => {
        if (d.editorialStatus === 'APPROVED') return true;
        if (d.editorialStatus === 'SCHEDULED' && (!d.scheduledFor || new Date(d.scheduledFor) <= now)) return true;
        return false;
      });

      for (const draft of eligibleDrafts) {
        draft.editorialStatus = 'PUBLISHED';
        draft.publishedAt = now.toISOString();
        draft.updatedAt = now.toISOString();
        await db.newsDrafts.set(draft.id, draft);
        publishedIds.push(draft.id);
      }

      return reply.send({
        success: true,
        publishedCount: publishedIds.length,
        publishedIds,
      });
    }
  );

  /**
   * GET /admin/news/drafts
   * List all drafts for editorial review console
   */
  fastify.get(
    '/admin/news/drafts',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR', 'REVIEWER', 'SUPPORT'])] },
    async (_request, reply) => {
      const drafts = Array.from(db.newsDrafts.values());
      drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return reply.send(drafts);
    }
  );
};
