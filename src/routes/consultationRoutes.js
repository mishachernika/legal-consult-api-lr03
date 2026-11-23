import { Router } from 'express';
import {
  getConsultations,
  getConsultationById,
  createConsultation,
  updateConsultation,
  deleteConsultation,
} from '../controllers/consultationController.js';
import { listMessages, createMessage } from '../controllers/messageController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * @swagger
 * /api/consultations:
 *   get:
 *     summary: Список консультацій з пагінацією, пошуком і фільтрами (адмін бачить усі, решта — лише свої)
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: clientId
 *         schema: { type: integer }
 *         description: Фільтр за клієнтом (лише для адміна)
 *       - in: query
 *         name: lawyerId
 *         schema: { type: integer }
 *         description: Фільтр за юристом (лише для адміна)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Пошук за темою або описом
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200: { description: Список консультацій із пагінацією }
 *       400: { description: Невідомий статус у фільтрі }
 *       401: { description: Необхідна аутентифікація }
 *   post:
 *     summary: Створення запиту на консультацію (клієнт — для себе; адмін — для будь-якого clientId)
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lawyerId, topic, description]
 *             properties:
 *               clientId: { type: integer, description: 'Лише для адміна; інакше береться поточний користувач' }
 *               lawyerId: { type: integer }
 *               topic: { type: string, minLength: 5, maxLength: 200 }
 *               description: { type: string, minLength: 10, maxLength: 5000 }
 *               scheduledAt: { type: string, format: date-time }
 *               price: { type: number, minimum: 0, description: 'Якщо не передано — ставка юриста за годину' }
 *     responses:
 *       201: { description: Консультацію створено зі статусом PENDING }
 *       400: { description: Помилка валідації даних }
 *       401: { description: Необхідна аутентифікація }
 *       404: { description: Клієнта або профіль юриста не знайдено }
 */
router.get('/', authenticate, getConsultations);
router.post('/', authenticate, createConsultation);

/**
 * @swagger
 * /api/consultations/{id}:
 *   get:
 *     summary: Картка консультації з чатом і відгуком ( лише для учасників або адміна)
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Картка консультації }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Немає доступу до консультації }
 *       404: { description: Консультацію не знайдено }
 *   put:
 *     summary: Оновлення консультації за ролями (клієнт редагує лише PENDING і може скасувати; юрист — статус/час/ціну; адмін — усе)
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Дані оновлено }
 *       400: { description: Помилка валідації даних або немає доступних полів }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Немає доступу до консультації }
 *       404: { description: Консультацію не знайдено }
 *   delete:
 *     summary: Видалення консультації (адмін, або клієнт — власну у статусі PENDING; чат і відгук видаляться каскадом)
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Консультацію видалено }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Недостатньо прав }
 *       404: { description: Консультацію не знайдено }
 */
router.get('/:id', authenticate, getConsultationById);
router.put('/:id', authenticate, updateConsultation);
router.delete('/:id', authenticate, deleteConsultation);

/**
 * @swagger
 * /api/consultations/{id}/messages:
 *   get:
 *     summary: Історія чату консультації (лише для учасників або адміна)
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Список повідомлень у хронологічному порядку }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Немає доступу до чату }
 *       404: { description: Консультацію не знайдено }
 *   post:
 *     summary: Надсилання повідомлення в чат (відправник — поточний користувач)
 *     tags: [Consultations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, minLength: 1, maxLength: 2000 }
 *     responses:
 *       201: { description: Повідомлення надіслано }
 *       400: { description: Помилка валідації даних }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Лише учасники консультації можуть писати в чат }
 *       404: { description: Консультацію не знайдено }
 */
router.get('/:id/messages', authenticate, listMessages);
router.post('/:id/messages', authenticate, createMessage);

export default router;
