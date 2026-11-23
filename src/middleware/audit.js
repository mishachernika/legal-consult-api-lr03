import { auditLogModel } from '../models/auditLogModel.js';

const SENSITIVE = new Set(['password', 'newPassword', 'currentPassword', 'token', 'refreshToken', 'totp', 'code', 'secret']);

// Журнал дій: після успішної відповіді пишемо запис у AuditLog (асинхронно, помилки не валять запит)
export function audit() {
  return (req, res, next) => {
    res.on('finish', () => {
      if (req.method === 'GET' || res.statusCode >= 500) return;
      const body = { ...(req.body ?? {}) };
      for (const key of Object.keys(body)) {
        if (SENSITIVE.has(key)) body[key] = '***';
      }
      auditLogModel
        .create({
          userId: req.user?.userId ?? null,
          action: `${req.method} ${req.route?.path ?? req.path}`,
          entity: req.baseUrl?.replace('/api/', '') || null,
          entityId: req.params?.id ? Number(req.params.id) : null,
          details: Object.keys(body).length > 0 ? body : null,
          ip: req.ip,
        })
        .catch(() => {});
    });
    next();
  };
}
