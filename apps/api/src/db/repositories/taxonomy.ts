import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { TaxonomyRecord } from '../index.js';

export class TaxonomyRepository extends BaseRepository<TaxonomyRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM syllabus_topics ORDER BY sort_order ASC, name ASC, created_at ASC');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const item: TaxonomyRecord = {
          id: row.id,
          parentId: row.parent_id || undefined,
          subject: row.subject || row.name || 'General Awareness',
          topicName: row.topic_name || row.name || '',
          subtopicName: row.subtopic_name || undefined,
          level: (row.level as any) || (row.parent_id ? 'TOPIC' : 'SUBJECT'),
          name: row.name || row.subtopic_name || row.topic_name || row.subject || row.id,
          slug: row.slug || undefined,
          sortOrder: Number(row.sort_order) || 0,
          isActive: row.is_active !== false,
          description: row.description || undefined,
          aliases: Array.isArray(row.aliases) ? row.aliases : [],
          examMappings: Array.isArray(row.exam_mappings) ? row.exam_mappings : [],
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        };
        this.cache[item.id] = item;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[TaxonomyRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: TaxonomyRecord): Promise<void> {
    await query(
      `INSERT INTO syllabus_topics (
        id, parent_id, subject, topic_name, subtopic_name, level, name, slug, sort_order, is_active, description, aliases, exam_mappings, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (id) DO UPDATE SET
        parent_id = EXCLUDED.parent_id,
        subject = EXCLUDED.subject,
        topic_name = EXCLUDED.topic_name,
        subtopic_name = EXCLUDED.subtopic_name,
        level = EXCLUDED.level,
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        description = EXCLUDED.description,
        aliases = EXCLUDED.aliases,
        exam_mappings = EXCLUDED.exam_mappings,
        updated_at = NOW()`,
      [
        record.id,
        record.parentId || null,
        record.subject,
        record.topicName,
        record.subtopicName || null,
        record.level,
        record.name,
        record.slug || null,
        record.sortOrder || 0,
        record.isActive !== false,
        record.description || null,
        record.aliases || [],
        record.examMappings || [],
        record.createdAt || new Date().toISOString(),
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM syllabus_topics WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM syllabus_topics');
  }
}
