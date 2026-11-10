import { BaseRepository } from './base.js';
import { query } from '../pool.js';
import type { ResourceRecord } from '../index.js';

export class ResourceRepository extends BaseRepository<ResourceRecord> {
  public async loadFromDb(): Promise<void> {
    try {
      const res = await query<any>('SELECT * FROM resources');
      this.cache = Object.create(null);
      for (const row of res.rows) {
        const resource: ResourceRecord = {
          id: row.id,
          title: row.title,
          description: row.description || '',
          exam: row.exam,
          subject: row.subject,
          fileType: (row.file_type as any) || 'PDF',
          fileSizeBytes: Number(row.file_size_bytes) || 0,
          sha256Hash: row.sha256_hash || '',
          storagePath: row.storage_path || '',
          previewAllowed: Boolean(row.preview_allowed),
          downloadAllowed: Boolean(row.download_allowed),
          offlineAllowed: Boolean(row.offline_allowed),
          previewContent: row.preview_content || undefined,
          licenseSource: row.license_source || 'Official / Open Educational',
          isPublished: Boolean(row.is_published),
          verifiedDate: row.verified_date || '2026-01-01',
        };
        this.cache[resource.id] = resource;
      }
      this.isLoaded = true;
    } catch (err: any) {
      console.error('[ResourceRepository] Error loading from DB:', err.message);
    }
  }

  public async persistInsertOrUpdate(record: ResourceRecord): Promise<void> {
    await query(
      `INSERT INTO resources (
        id, title, description, exam, subject, file_type, file_size_bytes, sha256_hash,
        storage_path, preview_allowed, download_allowed, offline_allowed, preview_content,
        license_source, is_published, verified_date, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        exam = EXCLUDED.exam,
        subject = EXCLUDED.subject,
        file_type = EXCLUDED.file_type,
        file_size_bytes = EXCLUDED.file_size_bytes,
        sha256_hash = EXCLUDED.sha256_hash,
        storage_path = EXCLUDED.storage_path,
        preview_allowed = EXCLUDED.preview_allowed,
        download_allowed = EXCLUDED.download_allowed,
        offline_allowed = EXCLUDED.offline_allowed,
        preview_content = EXCLUDED.preview_content,
        license_source = EXCLUDED.license_source,
        is_published = EXCLUDED.is_published,
        verified_date = EXCLUDED.verified_date`,
      [
        record.id,
        record.title,
        record.description,
        record.exam,
        record.subject,
        record.fileType,
        record.fileSizeBytes,
        record.sha256Hash,
        record.storagePath,
        record.previewAllowed,
        record.downloadAllowed,
        record.offlineAllowed,
        record.previewContent || null,
        record.licenseSource,
        record.isPublished,
        record.verifiedDate,
        'system',
      ]
    );
  }

  public async persistDelete(id: string): Promise<void> {
    await query('DELETE FROM resources WHERE id = $1', [id]);
  }

  public async persistClear(): Promise<void> {
    await query('DELETE FROM resources');
  }
}
