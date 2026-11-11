import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../../db/index.js';
import { query } from '../../db/pool.js';
import { requireStudentAuth } from '../../lib/studentAuth.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { validateFileMagicBytes } from '../../lib/security.js';
import {
  CreateSupportConversationSchema,
  AddSupportMessageSchema,
} from '@sidprep/contracts';

interface InMemoryConversation {
  id: string;
  studentId: string;
  subject: string;
  category: string;
  status: 'OPEN' | 'RESOLVED' | 'CLOSED';
  assignedAdminId?: string;
  unreadStudentCount: number;
  unreadAdminCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

interface InMemoryMessage {
  id: string;
  conversationId: string;
  senderType: 'STUDENT' | 'STAFF';
  senderId: string;
  senderName: string;
  messageText: string;
  attachments: any[];
  isInternalNote: boolean;
  createdAt: string;
}

const memoryConversations = new Map<string, InMemoryConversation>();
const memoryMessages = new Map<string, InMemoryMessage>();

export const supportRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /support/conversations
   * Student opens a new support conversation / ticket
   */
  fastify.post('/support/conversations', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;

    const parse = CreateSupportConversationSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Subject, category, and message are required', details: parse.error.format() },
      });
    }

    const { subject, category, message, attachments = [] } = parse.data;

    // Validate attachments
    for (const att of attachments) {
      if (att.fileSizeBytes > 5 * 1024 * 1024) {
        return reply.code(400).send({
          success: false,
          error: { code: 'ATTACHMENT_TOO_LARGE', message: `Attachment ${att.filename} exceeds 5 MB limit` },
        });
      }
      if (att.fileBase64) {
        const buf = Buffer.from(att.fileBase64, 'base64');
        if (!validateFileMagicBytes(buf, att.fileType)) {
          return reply.code(400).send({
            success: false,
            error: { code: 'INVALID_ATTACHMENT', message: `Attachment ${att.filename} failed magic-byte verification for ${att.fileType}` },
          });
        }
      }
    }

    const convId = `conv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const msgId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const memConv: InMemoryConversation = {
      id: convId,
      studentId: student.id,
      subject: subject.trim(),
      category: category.trim(),
      status: 'OPEN',
      unreadStudentCount: 0,
      unreadAdminCount: 1,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
    memoryConversations.set(convId, memConv);

    const memMsg: InMemoryMessage = {
      id: msgId,
      conversationId: convId,
      senderType: 'STUDENT',
      senderId: student.id,
      senderName: student.firstName ? `${student.firstName} ${student.lastName || ''}`.trim() : student.email,
      messageText: message.trim(),
      attachments,
      isInternalNote: false,
      createdAt: now,
    };
    memoryMessages.set(msgId, memMsg);

    try {
      await query(
        `INSERT INTO support_conversations 
         (id, student_id, subject, category, status, unread_student_count, unread_admin_count, last_message_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'OPEN', 0, 1, NOW(), NOW(), NOW())`,
        [convId, student.id, subject.trim(), category.trim()]
      );

      await query(
        `INSERT INTO support_messages 
         (id, conversation_id, sender_type, sender_id, sender_name, message_text, attachments, is_internal_note, created_at)
         VALUES ($1, $2, 'STUDENT', $3, $4, $5, $6, false, NOW())`,
        [msgId, convId, student.id, memMsg.senderName, message.trim(), JSON.stringify(attachments)]
      );
    } catch (err: any) {
      console.warn('[Support] DB insert fallback to memory:', err.message);
    }

    db.logOperational({
      service: 'SUPPORT',
      level: 'INFO',
      message: `Support ticket ${convId} created by student ${student.id}`,
      meta: { convId, studentId: student.id, category },
    });

    return reply.code(201).send({
      success: true,
      conversationId: convId,
      message: 'Support ticket created successfully.',
    });
  });

  /**
   * GET /support/conversations
   * Student retrieves their list of support conversations
   */
  fastify.get('/support/conversations', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;

    try {
      const res = await query(
        `SELECT id, student_id as "studentId", subject, category, status, 
                unread_student_count as "unreadStudentCount", unread_admin_count as "unreadAdminCount",
                last_message_at as "lastMessageAt", created_at as "createdAt"
         FROM support_conversations
         WHERE student_id = $1
         ORDER BY last_message_at DESC`,
        [student.id]
      );
      if (res.rows && res.rows.length > 0) {
        return reply.send({ success: true, conversations: res.rows });
      }
    } catch (err: any) {
      console.warn('[Support] DB query fallback to memory:', err.message);
    }

    const convs = Array.from(memoryConversations.values())
      .filter((c) => c.studentId === student.id)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return reply.send({ success: true, conversations: convs });
  });

  /**
   * GET /support/conversations/:id
   * Student retrieves a single conversation with messages (Strict ownership check!)
   */
  fastify.get('/support/conversations/:id', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;
    const { id } = request.params as { id: string };

    let conv: any = null;
    try {
      const convRes = await query(
        `SELECT id, student_id as "studentId", subject, category, status, 
                unread_student_count as "unreadStudentCount", unread_admin_count as "unreadAdminCount",
                last_message_at as "lastMessageAt", created_at as "createdAt"
         FROM support_conversations
         WHERE id = $1`,
        [id]
      );
      if (convRes.rows.length > 0) {
        conv = convRes.rows[0];
      }
    } catch {}

    if (!conv) {
      conv = memoryConversations.get(id);
    }

    if (!conv) {
      return reply.code(404).send({
        success: false,
        error: { code: 'CONVERSATION_NOT_FOUND', message: 'Support conversation not found' },
      });
    }

    // Ownership check (INVARIANT F01 / F09)
    if (conv.studentId !== student.id) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have permission to view this support conversation.' },
      });
    }

    // Reset unread_student_count
    if (conv.unreadStudentCount > 0) {
      conv.unreadStudentCount = 0;
      try {
        await query(`UPDATE support_conversations SET unread_student_count = 0 WHERE id = $1`, [id]);
      } catch {}
      const memC = memoryConversations.get(id);
      if (memC) memC.unreadStudentCount = 0;
    }

    // Retrieve messages (exclude internal notes!)
    let messages: any[] = [];
    try {
      const msgRes = await query(
        `SELECT id, conversation_id as "conversationId", sender_type as "senderType",
                sender_id as "senderId", sender_name as "senderName", message_text as "messageText",
                attachments, is_internal_note as "isInternalNote", created_at as "createdAt"
         FROM support_messages
         WHERE conversation_id = $1 AND is_internal_note = false
         ORDER BY created_at ASC`,
        [id]
      );
      messages = msgRes.rows;
    } catch {}

    if (messages.length === 0) {
      messages = Array.from(memoryMessages.values())
        .filter((m) => m.conversationId === id && !m.isInternalNote)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    return reply.send({
      success: true,
      conversation: conv,
      messages,
    });
  });

  /**
   * POST /support/conversations/:id/messages
   * Student sends reply to an existing support conversation
   */
  fastify.post('/support/conversations/:id/messages', { preHandler: [requireStudentAuth()] }, async (request, reply) => {
    const student = request.student!.record;
    const { id } = request.params as { id: string };

    let conv: any = null;
    try {
      const convRes = await query(`SELECT * FROM support_conversations WHERE id = $1`, [id]);
      if (convRes.rows.length > 0) {
        conv = {
          id: convRes.rows[0].id,
          studentId: convRes.rows[0].student_id,
          status: convRes.rows[0].status,
        };
      }
    } catch {}

    if (!conv) {
      conv = memoryConversations.get(id);
    }

    if (!conv) {
      return reply.code(404).send({
        success: false,
        error: { code: 'CONVERSATION_NOT_FOUND', message: 'Support conversation not found' },
      });
    }

    // Ownership check
    if (conv.studentId !== student.id) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have permission to reply to this conversation.' },
      });
    }

    if (conv.status === 'CLOSED') {
      return reply.code(400).send({
        success: false,
        error: { code: 'CONVERSATION_CLOSED', message: 'This conversation has been closed and cannot receive new messages.' },
      });
    }

    const parse = AddSupportMessageSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Message text is required', details: parse.error.format() },
      });
    }

    const { message, attachments = [] } = parse.data;

    // Validate attachments
    for (const att of attachments) {
      if (att.fileSizeBytes > 5 * 1024 * 1024) {
        return reply.code(400).send({
          success: false,
          error: { code: 'ATTACHMENT_TOO_LARGE', message: `Attachment ${att.filename} exceeds 5 MB limit` },
        });
      }
      if (att.fileBase64) {
        const buf = Buffer.from(att.fileBase64, 'base64');
        if (!validateFileMagicBytes(buf, att.fileType)) {
          return reply.code(400).send({
            success: false,
            error: { code: 'INVALID_ATTACHMENT', message: `Attachment ${att.filename} failed magic-byte verification for ${att.fileType}` },
          });
        }
      }
    }

    const msgId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const senderName = student.firstName ? `${student.firstName} ${student.lastName || ''}`.trim() : student.email;

    const memMsg: InMemoryMessage = {
      id: msgId,
      conversationId: id,
      senderType: 'STUDENT',
      senderId: student.id,
      senderName,
      messageText: message.trim(),
      attachments,
      isInternalNote: false,
      createdAt: now,
    };
    memoryMessages.set(msgId, memMsg);

    const memC = memoryConversations.get(id);
    if (memC) {
      memC.unreadAdminCount += 1;
      memC.lastMessageAt = now;
      memC.status = 'OPEN';
    }

    try {
      await query(
        `INSERT INTO support_messages 
         (id, conversation_id, sender_type, sender_id, sender_name, message_text, attachments, is_internal_note, created_at)
         VALUES ($1, $2, 'STUDENT', $3, $4, $5, $6, false, NOW())`,
        [msgId, id, student.id, senderName, message.trim(), JSON.stringify(attachments)]
      );

      await query(
        `UPDATE support_conversations 
         SET unread_admin_count = unread_admin_count + 1, last_message_at = NOW(), status = 'OPEN', updated_at = NOW() 
         WHERE id = $1`,
        [id]
      );
    } catch (err: any) {
      console.warn('[Support] DB reply fallback to memory:', err.message);
    }

    return reply.code(201).send({
      success: true,
      messageId: msgId,
    });
  });

  /**
   * GET /admin/support/conversations
   * Admin lists support conversations with search & status filters
   */
  fastify.get('/admin/support/conversations', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'SUPPORT', 'CONTENT_MANAGER'])] }, async (request, reply) => {
    const { status, category, search, page = '1', limit = '50' } = request.query as {
      status?: string;
      category?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    const p = Math.max(1, parseInt(page, 10));
    const lim = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const offset = (p - 1) * lim;

    try {
      let sql = `
        SELECT c.id, c.student_id as "studentId", c.subject, c.category, c.status,
               c.unread_student_count as "unreadStudentCount", c.unread_admin_count as "unreadAdminCount",
               c.last_message_at as "lastMessageAt", c.created_at as "createdAt",
               s.email as "studentEmail", s.first_name as "studentFirstName", s.last_name as "studentLastName"
        FROM support_conversations c
        LEFT JOIN students s ON s.id = c.student_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let pIdx = 1;

      if (status) {
        sql += ` AND c.status = $${pIdx++}`;
        params.push(status.toUpperCase());
      }
      if (category) {
        sql += ` AND c.category ILIKE $${pIdx++}`;
        params.push(`%${category}%`);
      }
      if (search) {
        sql += ` AND (c.subject ILIKE $${pIdx} OR s.email ILIKE $${pIdx} OR s.first_name ILIKE $${pIdx})`;
        params.push(`%${search}%`);
        pIdx++;
      }

      sql += ` ORDER BY c.last_message_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
      params.push(lim, offset);

      const res = await query(sql, params);
      return reply.send({
        success: true,
        conversations: res.rows,
        page: p,
        limit: lim,
      });
    } catch (err: any) {
      console.warn('[Support] Admin DB query fallback to memory:', err.message);
    }

    let items = Array.from(memoryConversations.values());
    if (status) items = items.filter((c) => c.status === status.toUpperCase());
    if (category) items = items.filter((c) => c.category.toLowerCase().includes(category.toLowerCase()));
    if (search) items = items.filter((c) => c.subject.toLowerCase().includes(search.toLowerCase()));

    items.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    const paginated = items.slice(offset, offset + lim).map((c) => {
      const student = db.students.get(c.studentId);
      return {
        ...c,
        studentEmail: student?.email || 'unknown',
        studentFirstName: student?.firstName || '',
        studentLastName: student?.lastName || '',
      };
    });

    return reply.send({
      success: true,
      conversations: paginated,
      total: items.length,
      page: p,
      limit: lim,
    });
  });

  /**
   * GET /admin/support/conversations/:id
   * Admin inspects conversation details and ALL messages (including internal notes)
   */
  fastify.get('/admin/support/conversations/:id', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'SUPPORT', 'CONTENT_MANAGER'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    let conv: any = null;
    try {
      const convRes = await query(
        `SELECT c.id, c.student_id as "studentId", c.subject, c.category, c.status,
                c.unread_student_count as "unreadStudentCount", c.unread_admin_count as "unreadAdminCount",
                c.last_message_at as "lastMessageAt", c.created_at as "createdAt",
                s.email as "studentEmail", s.first_name as "studentFirstName", s.last_name as "studentLastName"
         FROM support_conversations c
         LEFT JOIN students s ON s.id = c.student_id
         WHERE c.id = $1`,
        [id]
      );
      if (convRes.rows.length > 0) {
        conv = convRes.rows[0];
      }
    } catch {}

    if (!conv) {
      const memC = memoryConversations.get(id);
      if (memC) {
        const student = db.students.get(memC.studentId);
        conv = {
          ...memC,
          studentEmail: student?.email || 'unknown',
          studentFirstName: student?.firstName || '',
          studentLastName: student?.lastName || '',
        };
      }
    }

    if (!conv) {
      return reply.code(404).send({
        success: false,
        error: { code: 'CONVERSATION_NOT_FOUND', message: 'Support conversation not found' },
      });
    }

    // Reset unread_admin_count
    try {
      await query(`UPDATE support_conversations SET unread_admin_count = 0 WHERE id = $1`, [id]);
    } catch {}
    const memC = memoryConversations.get(id);
    if (memC) memC.unreadAdminCount = 0;

    let messages: any[] = [];
    try {
      const msgRes = await query(
        `SELECT id, conversation_id as "conversationId", sender_type as "senderType",
                sender_id as "senderId", sender_name as "senderName", message_text as "messageText",
                attachments, is_internal_note as "isInternalNote", created_at as "createdAt"
         FROM support_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [id]
      );
      messages = msgRes.rows;
    } catch {}

    if (messages.length === 0) {
      messages = Array.from(memoryMessages.values())
        .filter((m) => m.conversationId === id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    return reply.send({
      success: true,
      conversation: conv,
      messages,
    });
  });

  /**
   * POST /admin/support/conversations/:id/reply
   * Admin or staff replies to student or posts internal note
   */
  fastify.post('/admin/support/conversations/:id/reply', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'SUPPORT', 'CONTENT_MANAGER'])] }, async (request, reply) => {
    const admin = request.admin!;
    const { id } = request.params as { id: string };

    let conv: any = null;
    try {
      const convRes = await query(`SELECT * FROM support_conversations WHERE id = $1`, [id]);
      if (convRes.rows.length > 0) {
        conv = convRes.rows[0];
      }
    } catch {}

    if (!conv) {
      conv = memoryConversations.get(id);
    }

    if (!conv) {
      return reply.code(404).send({
        success: false,
        error: { code: 'CONVERSATION_NOT_FOUND', message: 'Support conversation not found' },
      });
    }

    const parse = AddSupportMessageSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Reply text is required', details: parse.error.format() },
      });
    }

    const { message, attachments = [], isInternalNote = false } = parse.data;
    const msgId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const memMsg: InMemoryMessage = {
      id: msgId,
      conversationId: id,
      senderType: 'STAFF',
      senderId: admin.id,
      senderName: admin.name || admin.email,
      messageText: message.trim(),
      attachments,
      isInternalNote: Boolean(isInternalNote),
      createdAt: now,
    };
    memoryMessages.set(msgId, memMsg);

    const memC = memoryConversations.get(id);
    if (memC && !isInternalNote) {
      memC.unreadStudentCount += 1;
      memC.lastMessageAt = now;
    }

    try {
      await query(
        `INSERT INTO support_messages 
         (id, conversation_id, sender_type, sender_id, sender_name, message_text, attachments, is_internal_note, created_at)
         VALUES ($1, $2, 'STAFF', $3, $4, $5, $6, $7, NOW())`,
        [msgId, id, admin.id, admin.name || admin.email, message.trim(), JSON.stringify(attachments), Boolean(isInternalNote)]
      );

      if (!isInternalNote) {
        await query(
          `UPDATE support_conversations 
           SET unread_student_count = unread_student_count + 1, last_message_at = NOW(), updated_at = NOW() 
           WHERE id = $1`,
          [id]
        );
      }
    } catch (err: any) {
      console.warn('[Support] DB admin reply fallback to memory:', err.message);
    }

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'SUPPORT',
      action: isInternalNote ? 'ADD_INTERNAL_NOTE' : 'SEND_STAFF_REPLY',
      targetId: id,
      changesDiff: { isInternalNote, messagePreview: message.substring(0, 80) },
      ipAddress: request.ip,
    });

    return reply.code(201).send({
      success: true,
      messageId: msgId,
      isInternalNote: Boolean(isInternalNote),
    });
  });

  /**
   * PATCH /admin/support/conversations/:id/status
   * Admin updates conversation status (OPEN, RESOLVED, CLOSED)
   */
  fastify.patch('/admin/support/conversations/:id/status', { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'SUPPORT', 'CONTENT_MANAGER'])] }, async (request, reply) => {
    const admin = request.admin!;
    const { id } = request.params as { id: string };
    const { status } = (request.body || {}) as { status?: string };

    if (!status || !['OPEN', 'RESOLVED', 'CLOSED'].includes(status.toUpperCase())) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Status must be one of OPEN, RESOLVED, or CLOSED.' },
      });
    }

    const newStatus = status.toUpperCase() as 'OPEN' | 'RESOLVED' | 'CLOSED';

    let conv = memoryConversations.get(id);
    if (conv) {
      conv.status = newStatus;
      conv.updatedAt = new Date().toISOString();
    }

    try {
      const res = await query(
        `UPDATE support_conversations SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [id, newStatus]
      );
      if (res.rowCount === 0 && !conv) {
        return reply.code(404).send({
          success: false,
          error: { code: 'CONVERSATION_NOT_FOUND', message: 'Support conversation not found' },
        });
      }
    } catch (err: any) {
      console.warn('[Support] DB status update fallback to memory:', err.message);
    }

    db.logAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      module: 'SUPPORT',
      action: 'UPDATE_CONVERSATION_STATUS',
      targetId: id,
      changesDiff: { status: newStatus },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      status: newStatus,
      message: `Support conversation marked as ${newStatus}.`,
    });
  });
};
