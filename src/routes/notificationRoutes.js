import { Router } from 'express';
import {
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
} from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Мої сповіщення (пагінація; ?unread=true — лише непрочитані; у відповіді unreadCount)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 100 } }
 *       - { in: query, name: unread, schema: { type: boolean } }
 *     responses:
 *       200: { description: Список сповіщень із пагінацією }
 *       401: { description: Необхідна аутентифікація }
 */
router.get('/', authenticate, getNotifications);

/**
 * @swagger
 * /api/notifications/read-all:
 *   post:
 *     summary: Позначити всі мої сповіщення прочитаними
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Кількість оновлених сповіщень }
 *       401: { description: Необхідна аутентифікація }
 */
router.post('/read-all', authenticate, markAllRead);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   post:
 *     summary: Позначити сповіщення прочитаним
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Сповіщення оновлено }
 *       403: { description: Чуже сповіщення }
 *       404: { description: Не знайдено }
 */
router.post('/:id/read', authenticate, markRead);

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Видалити сповіщення
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       204: { description: Видалено }
 *       403: { description: Чуже сповіщення }
 *       404: { description: Не знайдено }
 */
router.delete('/:id', authenticate, deleteNotification);

export default router;
