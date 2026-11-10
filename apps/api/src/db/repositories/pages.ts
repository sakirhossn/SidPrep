import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { PageRecord } from '../index.js';

export class PageRepository extends BaseRepository<PageRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM pages');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const page: PageRecord = {
          id: row.id,
          slug: row.slug,
          title: row.title,
          subtitle: row.subtitle || undefined,
          contentHtml: row.content_html,
          metaTitle: row.meta_title || undefined,
          metaDescription: row.meta_description || undefined,
          isPublished: Boolean(row.is_published),
          isSystem: Boolean(row.is_system),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        };
        this.cache[page.id] = page;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[PageRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: PageRecord): Promise<void> {
    await query(
      `INSERT INTO pages (
        id, slug, title, subtitle, content_html, meta_title, meta_description, is_published, is_system, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        content_html = EXCLUDED.content_html,
        meta_title = EXCLUDED.meta_title,
        meta_description = EXCLUDED.meta_description,
        is_published = EXCLUDED.is_published,
        is_system = EXCLUDED.is_system,
        updated_at = NOW()`,
      [
        record.id,
        record.slug,
        record.title,
        record.subtitle || null,
        record.contentHtml,
        record.metaTitle || null,
        record.metaDescription || null,
        record.isPublished,
        record.isSystem,
        record.createdAt,
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM pages WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM pages WHERE is_system = FALSE');
  }
}
