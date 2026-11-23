import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Список користувачів з пагінацією, пошуком і фільтром за роллю (лише адміністратор — там email і телефони)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [CLIENT, LAWYER, ADMIN] }
 *         description: Фільтр за роллю
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Пошук за ім'ям або email
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *     responses:
 *       200: { description: Список користувачів із пагінацією }
 *       400: { description: Невідома роль у фільтрі }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Лише адміністратор }
 *   post:
 *     summary: Створення користувача адміністратором (звичайна реєстрація — POST /api/auth/register)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, maxLength: 72 }
 *               name: { type: string, minLength: 2, maxLength: 100 }
 *               phone: { type: string, maxLength: 20 }
 *               role: { type: string, enum: [CLIENT, LAWYER, ADMIN], default: CLIENT }
 *     responses:
 *       201: { description: Користувача створено }
 *       400: { description: Помилка валідації даних }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Лише адміністратор }
 *       409: { description: Email вже зайнятий }
 */
router.get('/', authenticate, authorize('ADMIN'), getUsers);
router.post('/', authenticate, authorize('ADMIN'), createUser);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Картка користувача за ID (своя або адмін — повна; чужа — лише публічні поля без email/phone)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Картка користувача }
 *       401: { description: Необхідна аутентифікація }
 *       404: { description: Користувача не знайдено }
 *   put:
 *     summary: Оновлення даних користувача (власник або адмін; роль змінює лише адмін)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Дані оновлено }
 *       400: { description: Помилка валідації даних }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Недостатньо прав }
 *       404: { description: Користувача не знайдено }
 *       409: { description: Email вже зайнятий }
 *   delete:
 *     summary: Видалення користувача (лише адміністратор)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Користувача видалено }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Лише адміністратор }
 *       404: { description: Користувача не знайдено }
 *       409: { description: Є пов'язані записи (консультації тощо) }
 */
router.get('/:id', authenticate, getUserById);
router.put('/:id', authenticate, updateUser);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteUser);

export default router;
