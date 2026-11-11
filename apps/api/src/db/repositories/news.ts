import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { NewsDraftRecord } from '../index.js';

export interface NewsSourceRecord {
  id: string;
  name: string;
  feedUrl: string;
  isEnabled: boolean;
  category?: string;
  sourceGroup?: string;
  sourceType?: 'DIRECT_FEED' | 'GOOGLE_NEWS_DISCOVERY';
  queryTemplate?: string;
  queryKeywords?: string[];
  publisherUsageRights?: 'OFFICIAL_GOVT' | 'PUBLIC_OPEN_ACCESS' | 'FAIR_DEALING_DISCOVERY' | 'REQUIRES_LICENSE';
  isVerified?: boolean;
  feedFormat?: string;
  lastTestResult?: any;
  lastTestedAt?: string;
  priorityTier?: number;
  lastFetchedAt?: string;
  createdAt?: string;
}

export class NewsSourceRepository extends BaseRepository<NewsSourceRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM news_sources');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const source: NewsSourceRecord = {
          id: row.id,
          name: row.name,
          feedUrl: row.feed_url,
          isEnabled: Boolean(row.is_enabled),
          category: row.category,
          sourceGroup: row.source_group || 'national_governance',
          sourceType: row.source_type || 'DIRECT_FEED',
          queryTemplate: row.query_template,
          queryKeywords: Array.isArray(row.query_keywords) ? row.query_keywords : [],
          publisherUsageRights: row.publisher_usage_rights || 'FAIR_DEALING_DISCOVERY',
          isVerified: Boolean(row.is_verified),
          feedFormat: row.feed_format || 'RSS_2_0',
          lastTestResult: row.last_test_result,
          lastTestedAt: row.last_tested_at ? new Date(row.last_tested_at).toISOString() : undefined,
          priorityTier: row.priority_tier || 2,
          lastFetchedAt: row.last_fetched_at ? new Date(row.last_fetched_at).toISOString() : undefined,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        };
        this.cache[source.id] = source;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[NewsSourceRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: NewsSourceRecord): Promise<void> {
    await query(
      `INSERT INTO news_sources (
        id, name, feed_url, is_enabled, category, source_group, source_type,
        query_template, query_keywords, publisher_usage_rights, is_verified, feed_format,
        last_test_result, last_tested_at, priority_tier, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        feed_url = EXCLUDED.feed_url,
        is_enabled = EXCLUDED.is_enabled,
        category = EXCLUDED.category,
        source_group = EXCLUDED.source_group,
        source_type = EXCLUDED.source_type,
        query_template = EXCLUDED.query_template,
        query_keywords = EXCLUDED.query_keywords,
        publisher_usage_rights = EXCLUDED.publisher_usage_rights,
        is_verified = EXCLUDED.is_verified,
        feed_format = EXCLUDED.feed_format,
        last_test_result = EXCLUDED.last_test_result,
        last_tested_at = EXCLUDED.last_tested_at,
        priority_tier = EXCLUDED.priority_tier,
        updated_at = NOW()`,
      [
        record.id,
        record.name,
        record.feedUrl,
        record.isEnabled,
        record.category || 'National',
        record.sourceGroup || 'national_governance',
        record.sourceType || 'DIRECT_FEED',
        record.queryTemplate || null,
        record.queryKeywords || [],
        record.publisherUsageRights || 'FAIR_DEALING_DISCOVERY',
        record.isVerified || false,
        record.feedFormat || 'RSS_2_0',
        record.lastTestResult ? JSON.stringify(record.lastTestResult) : null,
        record.lastTestedAt || null,
        record.priorityTier || 2,
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM news_sources WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM news_sources');
  }
}

export class NewsDraftRepository extends BaseRepository<NewsDraftRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM news_drafts');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const draft: NewsDraftRecord = {
          id: row.id,
          candidateId: row.candidate_id || undefined,
          title: row.title,
          headline: row.title,
          originalSummary: row.original_summary,
          summary: row.original_summary,
          category: row.category,
          targetExams: Array.isArray(row.target_exams) ? row.target_exams : [],
          keyFacts: Array.isArray(row.key_facts) ? row.key_facts : [],
          whyItMatters: row.why_it_matters || undefined,
          staticGkBackground: row.static_gk_background || undefined,
          practiceMcqs: Array.isArray(row.practice_mcqs) ? row.practice_mcqs : undefined,
          sourceName: row.source_name,
          sourceUrl: row.source_url,
          canonicalUrl: row.canonical_url || row.source_url,
          feedEntryId: row.feed_entry_id || undefined,
          originalPublisher: row.original_publisher || undefined,
          alternativeSourceUrls: Array.isArray(row.alternative_source_urls) ? row.alternative_source_urls : [],
          needsSourceReview: Boolean(row.needs_source_review),
          articleContent: row.article_content || undefined,
          publisherUsageRights: row.publisher_usage_rights || 'FAIR_DEALING_DISCOVERY',
          eventDate: row.event_date ? new Date(row.event_date).toISOString().split('T')[0] : undefined,
          exclusionReason: row.exclusion_reason || undefined,
          rejectionReason: row.rejection_reason || undefined,
          confidenceScore: Number(row.confidence_score) || 0.9,
          editorialStatus: (row.editorial_status as any) || 'DRAFT',
          approvedBy: row.approved_by || undefined,
          approvalMode: row.approval_mode || undefined,
          scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : undefined,
          publishedAt: row.published_at ? new Date(row.published_at).toISOString() : undefined,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        };
        this.cache[draft.id] = draft;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[NewsDraftRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: NewsDraftRecord): Promise<void> {
    await query(
      `INSERT INTO news_drafts (
        id, candidate_id, title, original_summary, category, target_exams, key_facts,
        why_it_matters, static_gk_background, practice_mcqs, event_date, canonical_url,
        exclusion_reason, rejection_reason, source_name, source_url, confidence_score,
        editorial_status, approved_by, approval_mode, scheduled_for, published_at,
        feed_entry_id, original_publisher, alternative_source_urls, needs_source_review, article_content, publisher_usage_rights,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        candidate_id = EXCLUDED.candidate_id,
        title = EXCLUDED.title,
        original_summary = EXCLUDED.original_summary,
        category = EXCLUDED.category,
        target_exams = EXCLUDED.target_exams,
        key_facts = EXCLUDED.key_facts,
        why_it_matters = EXCLUDED.why_it_matters,
        static_gk_background = EXCLUDED.static_gk_background,
        practice_mcqs = EXCLUDED.practice_mcqs,
        event_date = EXCLUDED.event_date,
        canonical_url = EXCLUDED.canonical_url,
        exclusion_reason = EXCLUDED.exclusion_reason,
        rejection_reason = EXCLUDED.rejection_reason,
        source_name = EXCLUDED.source_name,
        source_url = EXCLUDED.source_url,
        confidence_score = EXCLUDED.confidence_score,
        editorial_status = EXCLUDED.editorial_status,
        approved_by = EXCLUDED.approved_by,
        approval_mode = EXCLUDED.approval_mode,
        scheduled_for = EXCLUDED.scheduled_for,
        published_at = EXCLUDED.published_at,
        feed_entry_id = EXCLUDED.feed_entry_id,
        original_publisher = EXCLUDED.original_publisher,
        alternative_source_urls = EXCLUDED.alternative_source_urls,
        needs_source_review = EXCLUDED.needs_source_review,
        article_content = EXCLUDED.article_content,
        publisher_usage_rights = EXCLUDED.publisher_usage_rights,
        updated_at = NOW()`,
      [
        record.id,
        record.candidateId || null,
        record.title,
        record.originalSummary,
        record.category,
        record.targetExams,
        record.keyFacts,
        record.whyItMatters || null,
        record.staticGkBackground || null,
        record.practiceMcqs ? JSON.stringify(record.practiceMcqs) : '[]',
        record.eventDate || null,
        record.canonicalUrl || record.sourceUrl,
        record.exclusionReason || null,
        record.rejectionReason || null,
        record.sourceName,
        record.sourceUrl,
        record.confidenceScore,
        record.editorialStatus,
        record.approvedBy || null,
        record.approvalMode || null,
        record.scheduledFor || null,
        record.publishedAt || null,
        record.feedEntryId || null,
        record.originalPublisher || null,
        record.alternativeSourceUrls || [],
        record.needsSourceReview || false,
        record.articleContent || null,
        record.publisherUsageRights || 'FAIR_DEALING_DISCOVERY',
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM news_drafts WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM news_drafts');
  }
}
