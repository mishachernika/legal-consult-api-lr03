import { Router } from 'express';
import {
  getReviews,
  getReviewById,
  createReview,
  updateReview,
  deleteReview,
} from '../controllers/reviewController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * @swagger
 * /api/reviews:
 *   get:
 *     summary: Список відгуків з фільтрами
 *     tags: [Reviews]
 *     parameters:
 *       - in: query
 *         name: lawyerId
 *         schema: { type: integer }
 *       - in: query
 *         name: clientId
 *         schema: { type: integer }
 *       - in: query
 *         name: minRating
 *         schema: { type: integer, minimum: 1, maximum: 5 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200: { description: Список відгуків із пагінацією }
 *   post:
 *     summary: Відгук на завершену консультацію (лише клієнт цієї консультації)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [consultationId, rating]
 *             properties:
 *               consultationId: { type: integer }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               text: { type: string, maxLength: 1000 }
 *     responses:
 *       201: { description: Відгук створено, рейтинг юриста перераховано }
 *       400: { description: Помилка валідації або консультація ще не завершена }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Лише клієнт консультації може залишити відгук }
 *       404: { description: Консультацію не знайдено }
 *       409: { description: Відгук для цієї консультації вже існує }
 */
router.get('/', getReviews);
router.post('/', authenticate, createReview);

/**
 * @swagger
 * /api/reviews/{id}:
 *   get:
 *     summary: Відгук за ID
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Відгук }
 *       404: { description: Відгук не знайдено }
 *   put:
 *     summary: Оновлення відгуку (власник або адмін)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Відгук оновлено, рейтинг юриста перераховано }
 *       400: { description: Помилка валідації даних }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Можна редагувати лише власний відгук }
 *       404: { description: Відгук не знайдено }
 *   delete:
 *     summary: Видалення відгуку (власник або адмін)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Відгук видалено }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Можна видалити лише власний відгук }
 *       404: { description: Відгук не знайдено }
 */
router.get('/:id', getReviewById);
router.put('/:id', authenticate, updateReview);
router.delete('/:id', authenticate, deleteReview);

export default router;
