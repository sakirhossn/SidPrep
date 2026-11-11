import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { NewsDraftRecord } from '../index.js';

export interface NewsSourceRecord {
  id: string;
  name: string;
  feedUrl: string;
  isEnabled: boolean;
  category?: string;
  lastFetchedAt?: string;
  createdAt?: string;
}

export class NewsSourceRepository extends BaseRepository<NewsSourceRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM current_affairs_sources');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const source: NewsSourceRecord = {
          id: row.id,
          name: row.name,
          feedUrl: row.feed_url,
          isEnabled: Boolean(row.is_enabled),
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
      `INSERT INTO current_affairs_sources (
        id, name, feed_url, is_enabled, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        feed_url = EXCLUDED.feed_url,
        is_enabled = EXCLUDED.is_enabled`,
      [record.id, record.name, record.feedUrl, record.isEnabled]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM current_affairs_sources WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM current_affairs_sources');
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
          originalSummary: row.original_summary,
          category: row.category,
          targetExams: Array.isArray(row.target_exams) ? row.target_exams : [],
          keyFacts: Array.isArray(row.key_facts) ? row.key_facts : [],
          sourceName: row.source_name,
          sourceUrl: row.source_url,
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
        source_name, source_url, confidence_score, editorial_status, approved_by, approval_mode,
        scheduled_for, published_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (id) DO UPDATE SET
        candidate_id = EXCLUDED.candidate_id,
        title = EXCLUDED.title,
        original_summary = EXCLUDED.original_summary,
        category = EXCLUDED.category,
        target_exams = EXCLUDED.target_exams,
        key_facts = EXCLUDED.key_facts,
        source_name = EXCLUDED.source_name,
        source_url = EXCLUDED.source_url,
        confidence_score = EXCLUDED.confidence_score,
        editorial_status = EXCLUDED.editorial_status,
        approved_by = EXCLUDED.approved_by,
        approval_mode = EXCLUDED.approval_mode,
        scheduled_for = EXCLUDED.scheduled_for,
        published_at = EXCLUDED.published_at,
        updated_at = NOW()`,
      [
        record.id,
        record.candidateId || null,
        record.title,
        record.originalSummary,
        record.category,
        record.targetExams,
        record.keyFacts,
        record.sourceName,
        record.sourceUrl,
        record.confidenceScore,
        record.editorialStatus,
        record.approvedBy || null,
        record.approvalMode || null,
        record.scheduledFor || null,
        record.publishedAt || null,
        record.createdAt,
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
