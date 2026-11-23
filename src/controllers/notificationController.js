import { notificationModel } from '../models/notificationModel.js';
import { AppError } from '../utils/AppError.js';
import { parseId } from '../utils/params.js';
import { parsePagination, paginate } from '../utils/pagination.js';

// Список сповіщень поточного користувача (пагінація, фільтр unread)
export async function getNotifications(req, res) {
  const { unread } = req.query;
  const where = { userId: req.user.userId };
  if (unread === 'true') where.readAt = null;

  const { page, limit, skip, take } = parsePagination(req.query, { defaultLimit: 20 });
  const { items, total } = await notificationModel.findPage(where, { skip, take });
  const unreadCount = await notificationModel.countUnread(req.user.userId);
  res.json({ ...paginate(items, total, { page, limit }), unreadCount });
}

export async function markRead(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор сповіщення');
  const notification = await notificationModel.findById(id);
  if (!notification) throw new AppError(404, 'Сповіщення не знайдено');
  if (notification.userId !== req.user.userId && req.user.role !== 'ADMIN') {
    throw new AppError(403, 'Можна читати лише свої сповіщення');
  }
  res.json({ data: await notificationModel.markRead(id) });
}

export async function markAllRead(req, res) {
  const result = await notificationModel.markAllRead(req.user.userId);
  res.json({ message: 'Усі сповіщення позначено прочитаними', updated: result.count });
}

export async function deleteNotification(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор сповіщення');
  const notification = await notificationModel.findById(id);
  if (!notification) throw new AppError(404, 'Сповіщення не знайдено');
  if (notification.userId !== req.user.userId && req.user.role !== 'ADMIN') {
    throw new AppError(403, 'Можна видаляти лише свої сповіщення');
  }
  await notificationModel.remove(id);
  res.status(204).end();
}
