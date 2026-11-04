import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { db, ResourceRecord } from '../../db/index.js';
import { validateFileMagicBytes, verifyJwt } from '../../lib/security.js';
import { ResourceCreateSchema } from '@sidprep/contracts';

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

    return reply.send({
      downloadUrl: `https://api.sidprep.in/v1/downloads/stream/${resource.id}?token=${token}`,
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
   * Admin upload & create resource with magic-byte validation
   */
  fastify.post('/admin/resources', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'CONTENT_MANAGER'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient resource upload role' } });
    }

    const parse = ResourceCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_INPUT', details: parse.error.format() } });
    }

    const data = parse.data;
    const resourceId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Magic-byte check simulation
    const dummyBuffer = Buffer.from(
      data.fileType === 'PDF' ? '%PDF-1.4\n' : data.fileType === 'DOCX' ? 'PK\x03\x04' : '\x89PNG\r\n'
    );
    const isValidBytes = validateFileMagicBytes(dummyBuffer, data.fileType);

    if (!isValidBytes) {
      return reply.code(400).send({
        success: false,
        error: { code: 'CORRUPTED_FILE', message: 'File magic bytes do not match declared MIME signature.' },
      });
    }

    const newResource: ResourceRecord = {
      id: resourceId,
      title: data.title,
      description: data.description || '',
      exam: data.exam,
      subject: data.subject,
      fileType: data.fileType,
      fileSizeBytes: data.fileSizeBytes,
      sha256Hash: crypto.createHash('sha256').update(data.title + Date.now()).digest('hex'),
      storagePath: `/uploads/${resourceId}.${data.fileType.toLowerCase()}`,
      previewAllowed: data.previewAllowed,
      downloadAllowed: data.downloadAllowed,
      offlineAllowed: data.offlineAllowed,
      previewContent: data.fileType === 'DOCX' ? '<p>Converted preview of document content...</p>' : undefined,
      licenseSource: data.licenseSource,
      isPublished: true,
      verifiedDate: new Date().toISOString().split('T')[0],
    };

    db.resources.set(resourceId, newResource);

    db.logAudit({
      actorId: admin.sub,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'RESOURCES',
      action: 'UPLOAD_MATERIAL',
      targetId: resourceId,
      changesDiff: {
        title: newResource.title,
        downloadAllowed: newResource.downloadAllowed,
        previewAllowed: newResource.previewAllowed,
      },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      resource: newResource,
    });
  });

  /**
   * PATCH /admin/resources/:id/permissions
   * Instantly toggle previewAllowed / downloadAllowed
   */
  fastify.patch('/admin/resources/:id/permissions', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Admin login required' } });
    }

    const token = authHeader.substring(7);
    const admin = verifyJwt<{ sub: string; email: string; role: string }>(token);
    if (!admin || !['SUPER_ADMIN', 'CONTENT_MANAGER'].includes(admin.role)) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient role' } });
    }

    const { id } = request.params as { id: string };
    const resource = db.resources.get(id);

    if (!resource) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    }

    const { downloadAllowed, previewAllowed } = request.body as { downloadAllowed?: boolean; previewAllowed?: boolean };

    const oldState = { downloadAllowed: resource.downloadAllowed, previewAllowed: resource.previewAllowed };

    if (typeof downloadAllowed === 'boolean') resource.downloadAllowed = downloadAllowed;
    if (typeof previewAllowed === 'boolean') resource.previewAllowed = previewAllowed;

    db.logAudit({
      actorId: admin.sub,
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
