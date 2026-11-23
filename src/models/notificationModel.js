import { prisma } from '../db.js';

// Сповіщення: зберігаємо в БД (історія + unread), доставляємо real-time через WebSocket
export const notificationModel = {
  findPage: async (where, { skip, take, orderBy = { createdAt: 'desc' } }) => {
    const [items, total] = await Promise.all([
      prisma.notification.findMany({ where, skip, take, orderBy }),
      prisma.notification.count({ where }),
    ]);
    return { items, total };
  },

  findById: (id) => prisma.notification.findUnique({ where: { id } }),

  create: (data) => prisma.notification.create({ data }),

  markRead: (id) => prisma.notification.update({ where: { id }, data: { readAt: new Date() } }),

  markAllRead: (userId) =>
    prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } }),

  remove: (id) => prisma.notification.delete({ where: { id } }),

  countUnread: (userId) => prisma.notification.count({ where: { userId, readAt: null } }),
};
