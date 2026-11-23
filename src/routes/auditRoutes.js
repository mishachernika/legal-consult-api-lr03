import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import { auditLogModel } from '../models/auditLogModel.js';
import { parsePagination, paginate } from '../utils/pagination.js';

const router = Router();

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: Журнал дій користувачів (тільки адміністратор), з пагінацією
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *       - { in: query, name: action, schema: { type: string }, description: 'Фільтр за дією, напр. POST /api/consultations/:id' }
 *       - { in: query, name: userId, schema: { type: integer } }
 *     responses:
 *       200: { description: Список записів журналу }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Лише адміністратор }
 */
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  const { page, limit, skip, take } = parsePagination(req.query, { defaultLimit: 20 });
  const where = {};
  if (req.query.action) where.action = { contains: req.query.action, mode: 'insensitive' };
  if (req.query.userId) where.userId = Number(req.query.userId);
  const { items, total } = await auditLogModel.findPage(where, { skip, take });
  res.json(paginate(items, total, { page, limit }));
});

export default router;
