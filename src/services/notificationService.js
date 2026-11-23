import { notificationModel } from '../models/notificationModel.js';
import { publishEvent } from '../socket/emitter.js';
import { metrics } from '../utils/metrics.js';

// Створює сповіщення в БД і одразу доставляє його у персональну WebSocket-кімнату user:<id>
export async function createNotification({ userId, type, priority = 'NORMAL', title, body, data }) {
  const notification = await notificationModel.create({ userId, type, priority, title, body, data });
  metrics.inc('notificationsSent');
  await publishEvent(`user:${userId}`, 'notification:new', {
    notification: {
      id: notification.id,
      type: notification.type,
      priority: notification.priority,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    },
  });
  return notification;
}
