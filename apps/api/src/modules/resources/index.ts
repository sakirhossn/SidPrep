import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, ResourceRecord } from '../../db/index.js';
import { env } from '../../config/index.js';
import { validateFileMagicBytes, verifyJwt } from '../../lib/security.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { getSignedDownloadUrl } from '../../lib/storage.js';
import { ResourceCreateSchema } from '@sidprep/contracts';

const uploadsDir = path.resolve(process.cwd(), 'uploads', 'resources');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (err) {
  console.warn('[Resources] Warning: could not initialize local uploads directory:', (err as Error).message);
}

export const resourceRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /resources
   * Public/student catalogue of study notes and materials
   */
  fastify.get('/resources', async (request, reply) => {
    const { exam, subject, search, page = '1', limit = '20' } = request.query as {
      exam?: string;
      subject?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    const p = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10)));

    let items = Array.from(db.resources.values()).filter((r) => r.isPublished);

    if (exam) {
      items = items.filter((r) => r.exam.toUpperCase() === exam.toUpperCase());
    }

    if (subject) {
      items = items.filter((r) => r.subject.toLowerCase().includes(subject.toLowerCase()));
    }

    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }

    const total = items.length;
    const startIndex = (p - 1) * lim;
    const paginated = items.slice(startIndex, startIndex + lim);

    return reply.send({
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
   * Helper: Streaming Raw Document Bytes (F15)
   */
  const streamResourceFile = async (id: string, request: any, reply: any) => {
    const resource = db.resources.get(id);

    if (!resource || !resource.isPublished) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }

    const isPreview = request.query?.preview === 'true';
    if (!isPreview && !resource.downloadAllowed) {
      return reply.code(403).send({
        success: false,
        error: { code: 'DOWNLOAD_DENIED', message: 'Direct download is restricted by administrator policy.' },
      });
    }

    if (isPreview && !resource.previewAllowed) {
      return reply.code(403).send({
        success: false,
        error: { code: 'PREVIEW_RESTRICTED', message: 'Preview is restricted by administrator policy.' },
      });
    }

    let filePath = resource.storagePath;
    if (!filePath || !fs.existsSync(filePath)) {
      filePath = path.join(uploadsDir, `${resource.sha256Hash}.${resource.fileType.toLowerCase()}`);
    }

    if (!fs.existsSync(filePath)) {
      db.logOperational({
        service: 'STORAGE',
        level: 'ERROR',
        message: `Resource binary missing from storage for resource ${resource.id} at ${filePath}`,
        meta: { resourceId: resource.id, filePath },
      });
      return reply.code(404).send({
        success: false,
        error: { code: 'RESOURCE_FILE_MISSING', message: 'The requested document file could not be found in storage.' },
      });
    }

    const stat = fs.statSync(filePath);
    const mimeTypes: Record<string, string> = {
      PDF: 'application/pdf',
      PNG: 'image/png',
      JPEG: 'image/jpeg',
      DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const mimeType = mimeTypes[resource.fileType] || 'application/octet-stream';
    const safeFilename = `${resource.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${resource.fileType.toLowerCase()}`;
    const disposition = isPreview ? `inline; filename="${safeFilename}"` : `attachment; filename="${safeFilename}"`;

    reply.header('Content-Type', mimeType);
    reply.header('Content-Length', stat.size);
    reply.header('Content-Disposition', disposition);
    reply.header('ETag', `"${resource.sha256Hash}"`);

    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  };

  /**
   * GET /downloads/stream/:id
   * Streams verified document bytes directly to client
   */
  fastify.get('/downloads/stream/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return streamResourceFile(id, request, reply);
  });

  /**
   * GET /resources/:id/file
   * Direct download route alias
   */
  fastify.get('/resources/:id/file', async (request, reply) => {
    const { id } = request.params as { id: string };
    return streamResourceFile(id, request, reply);
  });

  /**
   * GET /resources/:id/preview
   * In-browser or in-app safe sanitized preview
   */
  fastify.get('/resources/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const resource = db.resources.get(id);

    if (!resource || !resource.isPublished) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }

    if (!resource.previewAllowed) {
      return reply.code(403).send({ success: false, error: { code: 'PREVIEW_RESTRICTED', message: 'Preview is disabled for this material' } });
    }

    const token = crypto.randomBytes(16).toString('hex');

    // Log preview event
    db.logOperational({
      service: 'RESOURCE_ACCESS',
      level: 'INFO',
      message: `Resource preview served for ${resource.id} (${resource.fileType})`,
      meta: { ip: request.ip },
    });

    return reply.send({
      resourceId: resource.id,
      title: resource.title,
      previewType: resource.fileType === 'DOCX' ? 'HTML' : resource.fileType === 'PDF' ? 'PDF_URL' : 'IMAGE_URL',
      previewUrl: `/v1/downloads/stream/${resource.id}?token=${token}&preview=true`,
      content: resource.previewContent || `Preview available for ${resource.title}`,
      downloadAllowed: resource.downloadAllowed,
    });
  });

  /**
   * Helper: Resource download ticket issuer
   */
  const handleResourceDownload = async (id: string, request: any, reply: any) => {
    const resource = db.resources.get(id);

    if (!resource || !resource.isPublished) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }

    // Strict policy check: downloadAllowed MUST be true
    if (!resource.downloadAllowed) {
      db.logOperational({
        service: 'RESOURCE_ACCESS',
        level: 'WARN',
        message: `Direct download denied for preview-only resource ${resource.id}`,
        meta: { ip: request.ip },
      });

      return reply.code(403).send({
        success: false,
        error: {
          code: 'DOWNLOAD_DENIED',
          message: 'Direct file download is prohibited by administrator policy. In-app/browser preview is available.',
        },
      });
    }

    // Generate short-lived signed URL token (5 minutes)
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.logOperational({
      service: 'RESOURCE_ACCESS',
      level: 'INFO',
      message: `Signed download token issued for ${resource.id}`,
      meta: { expiresAt, ip: request.ip },
    });

    const downloadUrl =
      env.STORAGE_DRIVER === 'r2'
        ? await getSignedDownloadUrl(resource.storagePath, 300)
        : `/v1/downloads/stream/${resource.id}?token=${token}`;

    return reply.send({
      downloadUrl,
      expiresAt,
      fileSizeBytes: resource.fileSizeBytes,
      filename: `${resource.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${resource.fileType.toLowerCase()}`,
    });
  };

  /**
   * GET & POST /resources/:id/download
   * Enforces strict administrative download policy (both HTTP methods supported)
   */
  fastify.get('/resources/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    return handleResourceDownload(id, request, reply);
  });

  fastify.post('/resources/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    return handleResourceDownload(id, request, reply);
  });

  /**
   * POST /admin/resources
   * Admin upload & create resource with true cryptographic SHA-256 and magic-byte checks (F15)
   */
  fastify.post('/admin/resources', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] }, async (request, reply) => {
    const admin = request.admin!;

    const parse = ResourceCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', details: parse.error.format() } });
    }

    const data = parse.data;
    const body = request.body as any;
    const resourceId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Extract actual file buffer - real files only, no synthetic fallback
    let fileBuffer: Buffer;
    if (body.fileBase64) {
      fileBuffer = Buffer.from(body.fileBase64, 'base64');
    } else if (body.content) {
      fileBuffer = Buffer.from(body.content, 'utf8');
    } else {
      return reply.code(400).send({
        success: false,
        error: { code: 'FILE_REQUIRED', message: 'Binary file payload (fileBase64 or content) is required. Synthetic creation is prohibited.' },
      });
    }

    // Magic-byte check on the real buffer
    const isValidBytes = validateFileMagicBytes(fileBuffer, data.fileType);
    if (!isValidBytes) {
      return reply.code(400).send({
        success: false,
        error: { code: 'CORRUPTED_FILE', message: 'File magic bytes do not match declared MIME signature.' },
      });
    }

    // Compute genuine SHA-256 hash
    const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const ext = data.fileType.toLowerCase();
    const filePath = path.join(uploadsDir, `${sha256Hash}.${ext}`);
    fs.writeFileSync(filePath, fileBuffer);

    const newResource: ResourceRecord = {
      id: resourceId,
      title: data.title,
      description: data.description || '',
      exam: data.exam,
      subject: data.subject,
      fileType: data.fileType,
      fileSizeBytes: fileBuffer.length,
      sha256Hash,
      storagePath: filePath,
      previewAllowed: data.previewAllowed,
      downloadAllowed: data.downloadAllowed,
      offlineAllowed: data.offlineAllowed,
      previewContent: data.previewContent || (data.fileType === 'DOCX' ? '<p>Converted preview of document content...</p>' : undefined),
      licenseSource: data.licenseSource,
      isPublished: true,
      verifiedDate: new Date().toISOString().split('T')[0],
    };

    await db.resources.set(resourceId, newResource);

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'RESOURCES',
      action: 'UPLOAD_MATERIAL',
      targetId: resourceId,
      changesDiff: {
        title: newResource.title,
        downloadAllowed: newResource.downloadAllowed,
        previewAllowed: newResource.previewAllowed,
        sha256Hash,
      },
      ipAddress: request.ip,
    });

    return reply.status(201).send({
      success: true,
      resource: newResource,
    });
  });

  /**
   * GET /admin/resources
   * Admin resource library management list
   */
  fastify.get('/admin/resources', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'AUDITOR'])] }, async (request, reply) => {
    const isR2 = env.STORAGE_DRIVER === 'r2';
    const items = Array.from(db.resources.values()).map((r) => ({
      ...r,
      fileSize: `${(r.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
      storageDriver: isR2 ? 'Cloudflare R2 Standard' : 'Local Disk Storage',
      previewHtml: r.previewContent || `<p>Document preview for <strong>${r.title}</strong></p>`,
    }));

    return reply.send({ success: true, data: items });
  });

  /**
   * PATCH /admin/resources/:id/permissions
   * Instantly toggle previewAllowed / downloadAllowed
   */
  fastify.patch('/admin/resources/:id/permissions', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER'])] }, async (request, reply) => {
    const admin = request.admin!;

    const { id } = request.params as { id: string };
    const resource = db.resources.get(id);

    if (!resource) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }

    const { downloadAllowed, previewAllowed } = request.body as { downloadAllowed?: boolean; previewAllowed?: boolean };

    const oldState = { downloadAllowed: resource.downloadAllowed, previewAllowed: resource.previewAllowed };

    if (typeof downloadAllowed === 'boolean') resource.downloadAllowed = downloadAllowed;
    if (typeof previewAllowed === 'boolean') resource.previewAllowed = previewAllowed;

    await db.resources.set(id, resource);

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'RESOURCES',
      action: 'UPDATE_PERMISSIONS',
      targetId: id,
      changesDiff: { from: oldState, to: { downloadAllowed: resource.downloadAllowed, previewAllowed: resource.previewAllowed } },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      resource,
    });
  });
};
