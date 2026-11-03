import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { db, NewsDraftRecord } from '../../db/index.js';
import { isSafePublicUrl, verifyJwt } from '../../lib/security.js';
import { env } from '../../config/index.js';

export const newsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /current-affairs
   * Public and student current affairs news feed
   */
  fastify.get('/current-affairs', async (request, reply) => {
    const { category, exam, page = '1', limit = '20' } = request.query as {
      category?: string;
      exam?: string;
      page?: string;
      limit?: string;
    };

    const p = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10)));

    let items = Array.from(db.newsDrafts.values()).filter(
      (draft) => draft.editorialStatus === 'PUBLISHED'
    );

    if (category) {
      items = items.filter((d) => d.category.toLowerCase() === category.toLowerCase());
    }

    if (exam) {
      items = items.filter((d) => d.targetExams.map((x) => x.toUpperCase()).includes(exam.toUpperCase()));
    }

    // Sort descending by publication date
    items.sort((a, b) => new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime());

    const total = items.length;
    const startIndex = (p - 1) * lim;
    const paginated = items.slice(startIndex, startIndex + lim);

    return reply.send({
      data: paginated,
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
        text: en.text,
        options: en.options,
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
   * Admin triggers on-demand RSS fetch across allowlisted sources (Idempotent)
   */
  fastify.post('/admin/news/fetch-now', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role for news fetching' } });
    }

    const activeSources = Array.from(db.newsSources.values()).filter((s) => s.isEnabled);
    const draftedItems: string[] = [];

    for (const source of activeSources) {
      // Enforce SSRF protection
      if (!isSafePublicUrl(source.feedUrl)) {
        db.logOperational({
          service: 'NEWS_FETCHER',
          level: 'ERROR',
          message: `Blocked unsafe RSS URL ${source.feedUrl}`,
          meta: { sourceId: source.id },
        });
        continue;
      }

      // Simulate safe XML/RSS fetch & normalization with deduplication hash
      const sampleStories = [
        {
          title: `India launches National Clean Energy Mission Phase 3 with focus on green hydrogen corridors`,
          summary: 'The Ministry of New and Renewable Energy announced the expansion of hydrogen production clusters across major maritime ports.',
          category: 'Environment',
          exams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
          keyFacts: ['Focus on 5 national green hydrogen hubs', 'Projected capacity: 5 MMT per annum by 2030'],
          url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2099881',
        },
        {
          title: `National Highway Authority of India sets new record of 34 km per day highway construction`,
          summary: 'Ministry of Road Transport and Highways released the annual infrastructure audit for Indian transport corridors.',
          category: 'National',
          exams: ['SSC', 'RRB'],
          keyFacts: ['Total network addition: 12,400 km in current fiscal', 'Electronic toll collection reached 99.2% penetration'],
          url: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2099882',
        },
      ];

      for (const story of sampleStories) {
        const contentHash = crypto.createHash('sha256').update(story.url + story.title).digest('hex');

        // Check deduplication
        const exists = Array.from(db.newsDrafts.values()).some((d) => d.sourceUrl === story.url);
        if (!exists) {
          const draftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const newDraft: NewsDraftRecord = {
            id: draftId,
            title: story.title,
            originalSummary: story.summary,
            category: story.category,
            targetExams: story.exams,
            keyFacts: story.keyFacts,
            sourceName: source.name,
            sourceUrl: story.url,
            confidenceScore: 0.96,
            editorialStatus: 'DRAFT', // Safe default: MANUAL_APPROVAL
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          db.newsDrafts.set(draftId, newDraft);
          draftedItems.push(draftId);
        }
      }
    }

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'NEWS_FETCHER',
      action: 'RUN_FETCH_NOW',
      changesDiff: { newlyDraftedCount: draftedItems.length },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      message: `News ingestion completed in Asia/Kolkata schedule. ${draftedItems.length} candidate items drafted.`,
      newDraftCount: draftedItems.length,
      mode: 'MANUAL_APPROVAL',
    });
  });

  /**
   * PATCH /admin/news/drafts/:id/status
   * Editorial status transition: DRAFT -> IN_REVIEW -> APPROVED -> PUBLISHED / REJECTED
   */
  fastify.patch('/admin/news/drafts/:id/status', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'CONTENT_MANAGER', 'CA_EDITOR', 'REVIEWER'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient editorial privileges' } });
    }

    const { id } = request.params as { id: string };
    const draft = db.newsDrafts.get(id);

    if (!draft) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'News draft not found' } });
    }

    const { status, title, originalSummary, category } = request.body as any;

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

    db.logAudit({
      actorId: admin.sub,
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
  });

  /**
   * GET /admin/news/drafts
   * List all drafts for editorial review console
   */
  fastify.get('/admin/news/drafts', async (request, reply) => {
    const drafts = Array.from(db.newsDrafts.values());
    drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return reply.send(drafts);
  });
};
