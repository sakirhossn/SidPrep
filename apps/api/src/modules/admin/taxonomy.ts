import type { FastifyInstance } from 'fastify';
import { db, type TaxonomyRecord } from '../../db/index.js';
import { requireAdminAuth } from '../../lib/adminAuth.js';
import { query } from '../../db/pool.js';

interface TaxonomyNode extends TaxonomyRecord {
  children: TaxonomyNode[];
  questionCount: number;
  childCount: number;
}

export async function adminTaxonomyRoutes(fastify: FastifyInstance) {
  /**
   * Helper: Count questions using this taxonomy node
   */
  const getQuestionCount = (nodeId: string, nodeName: string, aliases: string[] = []): number => {
    const questions = Array.from(db.questions.values());
    const validKeys = new Set([nodeId, nodeName, ...(aliases || [])]);
    return questions.filter((q) => validKeys.has(q.topicId)).length;
  };

  /**
   * Helper: Cycle detection when reparenting
   */
  const causesCycle = (nodeId: string, targetParentId: string): boolean => {
    if (nodeId === targetParentId) return true;
    let current: string | undefined = targetParentId;
    const visited = new Set<string>();
    while (current) {
      if (current === nodeId) return true;
      if (visited.has(current)) break;
      visited.add(current);
      const parentRecord = db.taxonomy.get(current);
      current = parentRecord?.parentId;
    }
    return false;
  };

  /**
   * Helper: Build hierarchical tree from flat records
   */
  const buildTaxonomyTree = (activeOnly = false): { tree: TaxonomyNode[]; flat: any[] } => {
    let all = Array.from(db.taxonomy.values());
    if (activeOnly) {
      all = all.filter((t) => t.isActive !== false);
    }

    // Sort by sortOrder, then name
    all.sort((a, b) => {
      if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) {
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    const map = new Map<string, TaxonomyNode>();
    for (const item of all) {
      map.set(item.id, {
        ...item,
        children: [],
        questionCount: getQuestionCount(item.id, item.name, item.aliases),
        childCount: 0,
      });
    }

    const roots: TaxonomyNode[] = [];
    for (const item of all) {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        const parent = map.get(item.parentId)!;
        parent.children.push(node);
        parent.childCount++;
      } else {
        roots.push(node);
      }
    }

    const flat = Array.from(map.values()).map((n) => ({
      ...n,
      children: undefined,
    }));

    return { tree: roots, flat };
  };

  /**
   * GET /admin/taxonomy
   * Retrieve full taxonomy tree + flat list with question & child counts
   */
  fastify.get(
    '/admin/taxonomy',
    { preHandler: [requireAdminAuth()] },
    async (_request, reply) => {
      const result = buildTaxonomyTree(false);
      return reply.send({
        success: true,
        tree: result.tree,
        flat: result.flat,
        totalCount: result.flat.length,
      });
    }
  );

  /**
   * GET /admin/taxonomy/:id/dependencies
   * Inspect question and child references before delete/move
   */
  fastify.get(
    '/admin/taxonomy/:id/dependencies',
    { preHandler: [requireAdminAuth()] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = db.taxonomy.get(id);
      if (!item) {
        return reply.code(404).send({ error: 'Taxonomy node not found' });
      }

      const all = Array.from(db.taxonomy.values());
      const directChildren = all.filter((t) => t.parentId === id);

      const qCount = getQuestionCount(item.id, item.name, item.aliases);
      const affectedQuestions = Array.from(db.questions.values())
        .filter((q) => q.topicId === item.id || q.topicId === item.name || (item.aliases && item.aliases.includes(q.topicId)))
        .slice(0, 10)
        .map((q) => ({ id: q.id, text: q.translations?.[0]?.text?.substring(0, 80) || q.id }));

      return reply.send({
        success: true,
        id: item.id,
        name: item.name,
        level: item.level,
        questionCount: qCount,
        childCount: directChildren.length,
        children: directChildren.map((c) => ({ id: c.id, name: c.name, level: c.level })),
        canDeleteDirectly: qCount === 0 && directChildren.length === 0,
        sampleQuestions: affectedQuestions,
      });
    }
  );

  /**
   * POST /admin/taxonomy
   * Create Subject, Topic, or Subtopic
   */
  fastify.post(
    '/admin/taxonomy',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = request.body as any;

      const name = String(body.name || '').trim();
      if (!name) {
        return reply.code(400).send({ error: 'Name is required' });
      }

      const level = (body.level as 'SUBJECT' | 'TOPIC' | 'SUBTOPIC') || 'TOPIC';
      if (!['SUBJECT', 'TOPIC', 'SUBTOPIC'].includes(level)) {
        return reply.code(400).send({ error: 'Invalid level. Must be SUBJECT, TOPIC, or SUBTOPIC.' });
      }

      let parentId = body.parentId ? String(body.parentId).trim() : undefined;
      let parent: TaxonomyRecord | undefined;

      if (level === 'TOPIC') {
        if (!parentId) {
          return reply.code(400).send({ error: 'Topics must have a valid Subject as parent.' });
        }
        parent = db.taxonomy.get(parentId);
        if (!parent || parent.level !== 'SUBJECT') {
          return reply.code(400).send({ error: 'Parent for a TOPIC must be an existing SUBJECT.' });
        }
      } else if (level === 'SUBTOPIC') {
        if (!parentId) {
          return reply.code(400).send({ error: 'Subtopics must have a valid Topic as parent.' });
        }
        parent = db.taxonomy.get(parentId);
        if (!parent || parent.level !== 'TOPIC') {
          return reply.code(400).send({ error: 'Parent for a SUBTOPIC must be an existing TOPIC.' });
        }
      } else if (level === 'SUBJECT') {
        parentId = undefined;
      }

      // Sibling uniqueness check
      const siblings = Array.from(db.taxonomy.values()).filter((t) => (t.parentId || null) === (parentId || null));
      const duplicate = siblings.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        return reply.code(409).send({ error: `A sibling category with name "${name}" already exists under this parent.` });
      }

      const slug = body.slug ? String(body.slug).trim() : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const id = body.id ? String(body.id).trim() : `tax_${level.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      let subject = name;
      let topicName = name;
      let subtopicName: string | undefined = undefined;

      if (level === 'SUBJECT') {
        subject = name;
        topicName = name;
      } else if (level === 'TOPIC') {
        subject = parent?.name || 'General Awareness';
        topicName = name;
      } else if (level === 'SUBTOPIC') {
        const grandParent = parent?.parentId ? db.taxonomy.get(parent.parentId) : undefined;
        subject = grandParent?.name || parent?.subject || 'General Awareness';
        topicName = parent?.name || '';
        subtopicName = name;
      }

      const newRecord: TaxonomyRecord = {
        id,
        parentId,
        subject,
        topicName,
        subtopicName,
        level,
        name,
        slug,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : siblings.length + 1,
        isActive: body.isActive !== false,
        description: body.description ? String(body.description).trim() : undefined,
        aliases: Array.isArray(body.aliases) ? body.aliases.map((a: any) => String(a).trim()).filter(Boolean) : [],
        examMappings: Array.isArray(body.examMappings) ? body.examMappings.map((e: any) => String(e).trim()).filter(Boolean) : [],
        createdAt: new Date().toISOString(),
      };

      await db.taxonomy.set(id, newRecord);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TAXONOMY',
        action: 'CREATE_TAXONOMY',
        targetId: id,
        changesDiff: { name, level, parentId, sortOrder: newRecord.sortOrder },
        ipAddress: request.ip,
      });

      return reply.code(201).send({
        success: true,
        item: newRecord,
      });
    }
  );

  /**
   * PATCH /admin/taxonomy/:id
   * Edit taxonomy properties or move parent
   */
  fastify.patch(
    '/admin/taxonomy/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const record = db.taxonomy.get(id);
      if (!record) {
        return reply.code(404).send({ error: 'Taxonomy node not found' });
      }

      const diff: Record<string, any> = {};

      if (body.name !== undefined) {
        const newName = String(body.name).trim();
        if (!newName) {
          return reply.code(400).send({ error: 'Name cannot be empty' });
        }
        if (newName !== record.name) {
          // Check sibling uniqueness
          const siblings = Array.from(db.taxonomy.values()).filter((t) => t.id !== id && (t.parentId || null) === (record.parentId || null));
          if (siblings.some((s) => s.name.toLowerCase() === newName.toLowerCase())) {
            return reply.code(409).send({ error: `A sibling with name "${newName}" already exists.` });
          }
          diff.name = { from: record.name, to: newName };
          record.name = newName;
          if (record.level === 'SUBJECT') record.subject = newName;
          if (record.level === 'TOPIC') record.topicName = newName;
          if (record.level === 'SUBTOPIC') record.subtopicName = newName;
        }
      }

      // Reparenting
      if (body.parentId !== undefined && body.parentId !== record.parentId) {
        const newParentId = body.parentId ? String(body.parentId).trim() : undefined;
        if (newParentId) {
          if (causesCycle(record.id, newParentId)) {
            return reply.code(400).send({ error: 'Cycle detected: Cannot move a category under itself or one of its descendants.' });
          }
          const parent = db.taxonomy.get(newParentId);
          if (!parent) {
            return reply.code(400).send({ error: 'Specified parent does not exist.' });
          }
          if (record.level === 'TOPIC' && parent.level !== 'SUBJECT') {
            return reply.code(400).send({ error: 'A TOPIC can only be moved under a SUBJECT.' });
          }
          if (record.level === 'SUBTOPIC' && parent.level !== 'TOPIC') {
            return reply.code(400).send({ error: 'A SUBTOPIC can only be moved under a TOPIC.' });
          }
        } else if (record.level !== 'SUBJECT') {
          return reply.code(400).send({ error: 'Only SUBJECT level categories can have no parent.' });
        }
        diff.parentId = { from: record.parentId, to: newParentId };
        record.parentId = newParentId;
      }

      if (body.description !== undefined) {
        record.description = body.description ? String(body.description).trim() : undefined;
        diff.description = record.description;
      }

      if (body.slug !== undefined) {
        record.slug = body.slug ? String(body.slug).trim() : undefined;
        diff.slug = record.slug;
      }

      if (typeof body.sortOrder === 'number') {
        record.sortOrder = body.sortOrder;
        diff.sortOrder = body.sortOrder;
      }

      if (typeof body.isActive === 'boolean') {
        record.isActive = body.isActive;
        diff.isActive = body.isActive;
      }

      if (Array.isArray(body.aliases)) {
        record.aliases = body.aliases.map((a: any) => String(a).trim()).filter(Boolean);
        diff.aliases = record.aliases;
      }

      if (Array.isArray(body.examMappings)) {
        record.examMappings = body.examMappings.map((e: any) => String(e).trim()).filter(Boolean);
        diff.examMappings = record.examMappings;
      }

      record.updatedAt = new Date().toISOString();
      await db.taxonomy.set(id, record);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TAXONOMY',
        action: 'UPDATE_TAXONOMY',
        targetId: id,
        changesDiff: diff,
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        item: record,
      });
    }
  );

  /**
   * PATCH /admin/taxonomy/reorder
   * Reorder sibling categories
   */
  fastify.patch(
    '/admin/taxonomy/reorder',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN', 'CONTENT_MANAGER', 'EXAM_EDITOR'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const body = request.body as { items: Array<{ id: string; sortOrder: number }> };

      if (!body?.items || !Array.isArray(body.items)) {
        return reply.code(400).send({ error: 'items array is required' });
      }

      for (const item of body.items) {
        const record = db.taxonomy.get(item.id);
        if (record && typeof item.sortOrder === 'number') {
          record.sortOrder = item.sortOrder;
          record.updatedAt = new Date().toISOString();
          await db.taxonomy.set(record.id, record);
        }
      }

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TAXONOMY',
        action: 'REORDER_TAXONOMY',
        changesDiff: { reorderedCount: body.items.length },
        ipAddress: request.ip,
      });

      return reply.send({ success: true, reordered: body.items.length });
    }
  );

  /**
   * DELETE /admin/taxonomy/:id
   * Safe delete with dependency verification and mandatory reassignment if questions exist
   */
  fastify.delete(
    '/admin/taxonomy/:id',
    { preHandler: [requireAdminAuth(['SUPER_ADMIN'])] },
    async (request, reply) => {
      const admin = request.admin!;
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { reassignToId?: string };

      const item = db.taxonomy.get(id);
      if (!item) {
        return reply.code(404).send({ error: 'Taxonomy node not found' });
      }

      // Check child nodes
      const all = Array.from(db.taxonomy.values());
      const children = all.filter((t) => t.parentId === id);
      if (children.length > 0) {
        return reply.code(409).send({
          error: `Cannot delete "${item.name}" because it contains ${children.length} subcategories. Please reassign or delete subcategories first.`,
          childCount: children.length,
        });
      }

      // Check associated questions
      const matchingKeys = [item.id, item.name, ...(item.aliases || [])];
      const associatedQuestions = Array.from(db.questions.values()).filter((q) =>
        matchingKeys.includes(q.topicId)
      );

      if (associatedQuestions.length > 0) {
        if (!body.reassignToId) {
          return reply.code(409).send({
            error: `Cannot delete "${item.name}" because it is referenced by ${associatedQuestions.length} questions. You must provide a "reassignToId" to preserve question integrity, or deactivate this category instead.`,
            questionCount: associatedQuestions.length,
            requiresReassignment: true,
          });
        }

        const reassignTarget = db.taxonomy.get(body.reassignToId);
        if (!reassignTarget || reassignTarget.id === id) {
          return reply.code(400).send({ error: 'Invalid reassignment target category.' });
        }

        // Atomically reassign questions in memory and PostgreSQL
        for (const q of associatedQuestions) {
          q.topicId = reassignTarget.id;
          await db.questions.set(q.id, q);
        }

        try {
          await query(
            `UPDATE questions SET topic_id = $1 WHERE topic_id = ANY($2::text[])`,
            [reassignTarget.id, matchingKeys]
          );
        } catch (dbErr: any) {
          console.warn('[adminTaxonomyRoutes] Database batch reassignment notice:', dbErr.message);
        }
      }

      await db.taxonomy.delete(id);

      db.logAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        module: 'TAXONOMY',
        action: 'DELETE_TAXONOMY',
        targetId: id,
        changesDiff: {
          deletedName: item.name,
          deletedLevel: item.level,
          reassignedQuestionsCount: associatedQuestions.length,
          reassignedToId: body.reassignToId || null,
        },
        ipAddress: request.ip,
      });

      return reply.send({
        success: true,
        message: `Category "${item.name}" was safely deleted.`,
        reassignedQuestionsCount: associatedQuestions.length,
      });
    }
  );

  /**
   * GET /taxonomy (Public)
   * Active taxonomy hierarchy for students and public visitors
   */
  fastify.get('/taxonomy', async (_request, reply) => {
    const result = buildTaxonomyTree(true);
    return reply.send({
      success: true,
      tree: result.tree,
    });
  });
}
