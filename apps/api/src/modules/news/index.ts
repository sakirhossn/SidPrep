import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { db, NewsDraftRecord } from '../../db/index.js';
import { query } from '../../db/pool.js';
import { isSafePublicUrl } from '../../lib/security.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { executeNewsFetchJob, testFeedConnectivity } from '../../services/newsIngestion.js';

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_REVIEW', 'REVIEWED', 'APPROVED', 'REJECTED', 'ARCHIVED'],
  IN_REVIEW: ['REVIEWED', 'REJECTED', 'ARCHIVED', 'DRAFT'],
  REVIEWED: ['APPROVED', 'REJECTED', 'ARCHIVED', 'DRAFT'],
  APPROVED: ['SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'DRAFT'],
  SCHEDULED: ['PUBLISHED', 'APPROVED', 'ARCHIVED', 'DRAFT'],
  PUBLISHED: ['ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

/**
 * Normalizes exam matching: supports 'SSC' matching 'SSC_CGL', 'SSC_CHSL', or 'SSC'
 */
function isExamMatched(targetExams: string[] | undefined, requestedExam: string): boolean {
  if (!requestedExam || requestedExam === 'ALL') return true;
  if (!targetExams || targetExams.length === 0) return true;
  const req = requestedExam.toUpperCase();
  return targetExams.some((exam) => {
    const ex = exam.toUpperCase();
    return ex === req || ex.startsWith(req) || req.startsWith(ex);
  });
}

export const newsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /current-affairs
   * Public & student current affairs feed filtered by exam, category, and date/month
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
      items = items.filter((d) => isExamMatched(d.targetExams, exam));
    }

    if (date) {
      items = items.filter(
        (d) => (d.eventDate && d.eventDate === date) || (d.publishedAt && d.publishedAt.startsWith(date))
      );
    } else if (month) {
      items = items.filter(
        (d) => (d.eventDate && d.eventDate.startsWith(month)) || (d.publishedAt && d.publishedAt.startsWith(month))
      );
    }

    // Sort descending by event date or publication date
    items.sort((a, b) => {
      const timeB = new Date(b.eventDate || b.publishedAt || b.createdAt).getTime();
      const timeA = new Date(a.eventDate || a.publishedAt || a.createdAt).getTime();
      return timeB - timeA;
    });

    const total = items.length;
    const startIndex = (p - 1) * lim;
    const paginated = items.slice(startIndex, startIndex + lim).map((d) => ({
      id: d.id,
      headline: d.headline || d.title,
      title: d.title,
      summary: d.summary || d.originalSummary,
      originalSummary: d.originalSummary,
      category: d.category,
      targetExams: d.targetExams || ['SSC', 'RRB', 'WBPSC', 'IBPS'],
      keyFacts: d.keyFacts || [],
      whyItMatters: d.whyItMatters,
      staticGkBackground: d.staticGkBackground,
      practiceMcqs: d.practiceMcqs || [],
      sourceName: d.sourceName,
      sourceUrl: d.sourceUrl,
      eventDate: d.eventDate || (d.publishedAt ? d.publishedAt.split('T')[0] : d.createdAt.split('T')[0]),
      publishedAt: d.publishedAt,
    }));

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
   * GET /current-affairs/daily
   * Daily Current Affairs digest for a specific day and target exam
   */
  fastify.get('/current-affairs/daily', async (request, reply) => {
    const { date, exam } = request.query as { date?: string; exam?: string };

    const publishedArticles = Array.from(db.newsDrafts.values()).filter(
      (draft) => draft.editorialStatus === 'PUBLISHED'
    );

    // If date provided, use it; otherwise find latest available date with published articles
    let targetDate = date;
    if (!targetDate && publishedArticles.length > 0) {
      const dates = publishedArticles
        .map((d) => d.eventDate || (d.publishedAt ? d.publishedAt.split('T')[0] : ''))
        .filter(Boolean)
        .sort()
        .reverse();
      targetDate = dates[0] || new Date().toISOString().split('T')[0];
    } else if (!targetDate) {
      targetDate = new Date().toISOString().split('T')[0];
    }

    let dailyItems = publishedArticles.filter(
      (d) =>
        (d.eventDate === targetDate || (d.publishedAt && d.publishedAt.startsWith(targetDate!))) &&
        isExamMatched(d.targetExams, exam || 'ALL')
    );

    // If no articles for targetDate, fallback to latest published
    if (dailyItems.length === 0 && publishedArticles.length > 0 && !date) {
      dailyItems = publishedArticles.slice(0, 10);
    }

    const formatted = dailyItems.map((d) => ({
      id: d.id,
      headline: d.headline || d.title,
      summary: d.summary || d.originalSummary,
      category: d.category,
      targetExams: d.targetExams,
      keyFacts: d.keyFacts || [],
      staticGkBackground: d.staticGkBackground,
      practiceMcqs: d.practiceMcqs || [],
      sourceName: d.sourceName,
      sourceUrl: d.sourceUrl,
      eventDate: d.eventDate || targetDate,
    }));

    return reply.send({
      success: true,
      date: targetDate,
      exam: exam || 'ALL',
      totalCount: formatted.length,
      articles: formatted,
    });
  });

  /**
   * GET /current-affairs/daily-quiz
   * Practice daily quiz generated from verified MCQs of published articles
   */
  fastify.get('/current-affairs/daily-quiz', async (request, reply) => {
    const { date, exam } = request.query as { date?: string; exam?: string };

    const published = Array.from(db.newsDrafts.values()).filter(
      (draft) => draft.editorialStatus === 'PUBLISHED'
    );

    let targetDate = date;
    if (!targetDate && published.length > 0) {
      const dates = published
        .map((d) => d.eventDate || (d.publishedAt ? d.publishedAt.split('T')[0] : ''))
        .filter(Boolean)
        .sort()
        .reverse();
      targetDate = dates[0] || new Date().toISOString().split('T')[0];
    } else if (!targetDate) {
      targetDate = new Date().toISOString().split('T')[0];
    }

    // Collect articles for that date
    let eligibleArticles = published.filter(
      (d) =>
        (d.eventDate === targetDate || (d.publishedAt && d.publishedAt.startsWith(targetDate!))) &&
        isExamMatched(d.targetExams, exam || 'ALL')
    );

    if (eligibleArticles.length === 0 && published.length > 0) {
      eligibleArticles = published.slice(0, 5);
    }

    const questions: any[] = [];
    let qNumber = 1;

    for (const art of eligibleArticles) {
      if (art.practiceMcqs && art.practiceMcqs.length > 0) {
        for (const mcq of art.practiceMcqs) {
          questions.push({
            id: `q_${art.id}_${qNumber}`,
            articleId: art.id,
            questionNumber: qNumber,
            questionText: mcq.question,
            options: mcq.options.map((opt) => ({
              id: opt.id,
              text: opt.text,
            })),
            headlineReference: art.headline || art.title,
            category: art.category,
          });
          qNumber++;
        }
      }
    }

    return reply.send({
      success: true,
      quizId: `quiz_${targetDate}`,
      date: targetDate,
      exam: exam || 'ALL',
      title: `Daily Current Affairs Challenge — ${targetDate}`,
      durationMinutes: Math.max(5, questions.length * 2),
      questionsCount: questions.length,
      questions,
    });
  });

  /**
   * POST /current-affairs/daily-quiz/submit
   * Grade student submission for the daily quiz against authoritative MCQs
   */
  fastify.post('/current-affairs/daily-quiz/submit', async (request, reply) => {
    const { quizId, answers = {} } = request.body as {
      quizId: string;
      answers: Record<string, string>; // { questionId: selectedOptionId }
    };

    const published = Array.from(db.newsDrafts.values()).filter(
      (draft) => draft.editorialStatus === 'PUBLISHED'
    );

    let correctCount = 0;
    const review: any[] = [];

    // Map questions from all published drafts
    for (const art of published) {
      if (!art.practiceMcqs) continue;
      let qNum = 1;
      for (const mcq of art.practiceMcqs) {
        const qId = `q_${art.id}_${qNum}`;
        const userSelected = answers[qId] || answers[art.id] || null;

        if (userSelected !== undefined || Object.keys(answers).some((k) => k.includes(art.id))) {
          const isCorrect = userSelected === mcq.correctOptionId;
          if (isCorrect) correctCount++;

          review.push({
            questionId: qId,
            articleId: art.id,
            questionText: mcq.question,
            userOptionId: userSelected,
            correctOptionId: mcq.correctOptionId,
            isCorrect,
            explanation: mcq.explanation,
            keyFact: art.keyFacts?.[0] || art.summary || art.originalSummary,
          });
        }
        qNum++;
      }
    }

    const totalQuestions = review.length > 0 ? review.length : Object.keys(answers).length;
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return reply.send({
      success: true,
      quizId,
      score: correctCount,
      totalQuestions,
      percentage,
      passed: percentage >= 50,
      answersReview: review,
    });
  });

  /**
   * GET /current-affairs/monthly
   * Monthly revision digest grouped by category for quick exam preparation
   */
  fastify.get('/current-affairs/monthly', async (request, reply) => {
    const { year, month, exam } = request.query as {
      year?: string;
      month?: string;
      exam?: string;
    };

    const now = new Date();
    const targetYear = year || String(now.getFullYear());
    const targetMonth = month ? month.padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${targetYear}-${targetMonth}`;

    const published = Array.from(db.newsDrafts.values()).filter(
      (draft) => draft.editorialStatus === 'PUBLISHED'
    );

    const monthlyItems = published.filter((d) => {
      const matchMonth =
        (d.eventDate && d.eventDate.startsWith(monthPrefix)) ||
        (d.publishedAt && d.publishedAt.startsWith(monthPrefix));
      return matchMonth && isExamMatched(d.targetExams, exam || 'ALL');
    });

    // Group items by category
    const categorized: Record<string, any[]> = {};
    for (const item of monthlyItems) {
      const cat = item.category || 'National';
      if (!categorized[cat]) categorized[cat] = [];
      categorized[cat].push({
        id: item.id,
        headline: item.headline || item.title,
        summary: item.summary || item.originalSummary,
        keyFacts: item.keyFacts || [],
        staticGkBackground: item.staticGkBackground,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        eventDate: item.eventDate,
      });
    }

    return reply.send({
      success: true,
      month: monthPrefix,
      exam: exam || 'ALL',
      totalArticles: monthlyItems.length,
      categories: Object.keys(categorized).map((cat) => ({
        category: cat,
        count: categorized[cat].length,
        articles: categorized[cat],
      })),
    });
  });

  /**
   * GET /quizzes/daily (Backward compatibility redirect to daily-quiz)
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
          itemsRejected: result.itemsRejected,
        },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: `News ingestion completed. ${result.itemsNew} new items drafted for editorial review. ${result.itemsRejected} non-exam items filtered out.`,
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
   * PATCH or PUT /admin/news/drafts/:id
   * Full editorial update: edit headline, summary, key facts, static GK, practice MCQ, and exam tags (SSC, RRB, WBPSC, IBPS)
   */
  const handleEditDraft = async (request: any, reply: any) => {
    const admin = request.admin!;
    const { id } = request.params as { id: string };
    const draft = db.newsDrafts.get(id);

    if (!draft) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'News draft not found' } });
    }

    const {
      status,
      title,
      headline,
      originalSummary,
      summary,
      category,
      targetExams,
      keyFacts,
      whyItMatters,
      staticGkBackground,
      practiceMcqs,
      eventDate,
      rejectionReason,
    } = request.body as any;

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

    if (title || headline) {
      draft.title = (headline || title).trim();
      draft.headline = draft.title;
    }
    if (originalSummary || summary) {
      draft.originalSummary = (summary || originalSummary).trim();
      draft.summary = draft.originalSummary;
    }
    if (category) draft.category = category;
    if (Array.isArray(targetExams)) draft.targetExams = targetExams;
    if (Array.isArray(keyFacts)) draft.keyFacts = keyFacts;
    if (whyItMatters !== undefined) draft.whyItMatters = whyItMatters;
    if (staticGkBackground !== undefined) draft.staticGkBackground = staticGkBackground;
    if (Array.isArray(practiceMcqs)) draft.practiceMcqs = practiceMcqs;
    if (eventDate) draft.eventDate = eventDate;
    if (rejectionReason) draft.rejectionReason = rejectionReason;

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

    // Sync to PostgreSQL news_articles
    try {
      await query(
        `UPDATE news_articles 
         SET headline = COALESCE($1, headline),
             summary = COALESCE($2, summary),
             category = COALESCE($3, category),
             target_exams = COALESCE($4, target_exams),
             key_facts = COALESCE($5, key_facts),
             exam_relevance = COALESCE($6, exam_relevance),
             static_gk_background = COALESCE($7, static_gk_background),
             practice_mcqs = COALESCE($8, practice_mcqs),
             event_date = COALESCE($9, event_date),
             editorial_status = COALESCE($10, editorial_status),
             rejection_reason = COALESCE($11, rejection_reason),
             reviewed_by = $12,
             reviewed_at = NOW(),
             published_at = CASE WHEN $10 = 'PUBLISHED' THEN NOW() ELSE published_at END
         WHERE id = $13`,
        [
          draft.headline,
          draft.summary,
          draft.category,
          draft.targetExams,
          draft.keyFacts,
          draft.whyItMatters || null,
          draft.staticGkBackground || null,
          draft.practiceMcqs ? JSON.stringify(draft.practiceMcqs) : null,
          draft.eventDate || null,
          draft.editorialStatus,
          draft.rejectionReason || null,
          admin.id,
          id,
        ]
      );
    } catch (err: any) {
      console.warn('[News] Sync article edit fallback:', err.message);
    }

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'CURRENT_AFFAIRS',
      action: `EDIT_DRAFT_${status || 'UPDATE'}`,
      targetId: id,
      changesDiff: {
        from: previousState.editorialStatus,
        to: draft.editorialStatus,
        targetExams: draft.targetExams,
      },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      draft,
    });
  };

  fastify.patch(
    '/admin/news/drafts/:id/status',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR', 'REVIEWER'])] },
    handleEditDraft
  );

  fastify.patch(
    '/admin/news/drafts/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR', 'REVIEWER'])] },
    handleEditDraft
  );

  fastify.put(
    '/admin/news/drafts/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR', 'REVIEWER'])] },
    handleEditDraft
  );

  /**
   * POST /admin/news/drafts/:id/schedule
   * Schedule approved news draft for future publication
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
   * Triggers catchup and publication of all approved / due scheduled drafts
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
