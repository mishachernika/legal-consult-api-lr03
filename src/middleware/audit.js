import { auditLogModel } from '../models/auditLogModel.js';
import { createQueue, enqueue } from '../utils/queue.js';
import { eventOutboxModel } from '../models/eventOutboxModel.js';

const SENSITIVE = new Set(['password', 'newPassword', 'currentPassword', 'token', 'refreshToken', 'totp', 'code', 'secret']);

// Черги фонових задач: аудит-лог пишемо асинхронно через чергу, outbox чистимо раз на годину
createQueue('audit', (log) => auditLogModel.create(log));
createQueue('outbox-cleanup', ({ olderThan }) => eventOutboxModel.deleteOlderThan(olderThan));

// Журнал дій: після успішної відповіді ставимо запис у AuditLog у чергу (помилки не валять запит)
export function audit() {
  return (req, res, next) => {
    res.on('finish', () => {
      if (req.method === 'GET' || res.statusCode >= 500) return;
      const body = { ...(req.body ?? {}) };
      for (const key of Object.keys(body)) {
        if (SENSITIVE.has(key)) body[key] = '***';
      }
      enqueue('audit', {
        userId: req.user?.userId ?? null,
        action: `${req.method} ${req.route?.path ?? req.path}`,
        entity: req.baseUrl?.replace('/api/', '') || null,
        entityId: req.params?.id ? Number(req.params.id) : null,
        details: Object.keys(body).length > 0 ? body : null,
        ip: req.ip,
      });
    });
    next();
  };
}
