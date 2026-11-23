import { Router } from 'express';
import {
  getLawyers,
  getLawyerById,
  createLawyer,
  updateLawyer,
  deleteLawyer,
} from '../controllers/lawyerController.js';
import { getReviewsByLawyer } from '../controllers/reviewController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * @swagger
 * /api/lawyers:
 *   get:
 *     summary: Список профілів юристів з фільтрами та сортуванням
 *     tags: [Lawyers]
 *     parameters:
 *       - in: query
 *         name: specializationId
 *         schema: { type: integer }
 *         description: Фільтр за сферою права
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Пошук за ім'ям юриста або текстом профілю
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [rating, pricePerHour, experienceYears], default: rating }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200: { description: Список юристів із пагінацією }
 *   post:
 *     summary: Створення профілю юриста для власного акаунта (або для будь-якого — адміністратором)
 *     tags: [Lawyers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, pricePerHour]
 *             properties:
 *               userId: { type: integer }
 *               bio: { type: string, maxLength: 2000 }
 *               experienceYears: { type: integer, minimum: 0, default: 0 }
 *               pricePerHour: { type: number, minimum: 0 }
 *               isVerified: { type: boolean, default: false }
 *               specializationIds: { type: array, items: { type: integer } }
 *     responses:
 *       201: { description: Профіль створено, роль користувача стала LAWYER }
 *       400: { description: Помилка валідації або спеціалізації не знайдено }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Недостатньо прав }
 *       404: { description: Користувача не знайдено }
 *       409: { description: Профіль для цього користувача вже існує }
 */
router.get('/', getLawyers);
router.post('/', authenticate, createLawyer);

/**
 * @swagger
 * /api/lawyers/{id}:
 *   get:
 *     summary: Профіль юриста за ID (з відгуками та кількістю консультацій)
 *     tags: [Lawyers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Профіль юриста }
 *       404: { description: Профіль не знайдено }
 *   put:
 *     summary: Оновлення профілю юриста (власник або адмін; верифікацію ставить лише адмін)
 *     tags: [Lawyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Профіль оновлено }
 *       400: { description: Помилка валідації }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Недостатньо прав }
 *       404: { description: Профіль не знайдено }
 *   delete:
 *     summary: Видалення профілю юриста (власник або адмін; роль користувача стане CLIENT)
 *     tags: [Lawyers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Профіль видалено }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Недостатньо прав }
 *       404: { description: Профіль не знайдено }
 */
router.get('/:id', getLawyerById);
router.put('/:id', authenticate, updateLawyer);
router.delete('/:id', authenticate, deleteLawyer);

/**
 * @swagger
 * /api/lawyers/{id}/reviews:
 *   get:
 *     summary: Відгуки про юриста (id — ідентифікатор користувача-юриста)
 *     tags: [Lawyers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Список відгуків }
 *       404: { description: Профіль юриста не знайдено }
 */
router.get('/:id/reviews', getReviewsByLawyer);

export default router;
