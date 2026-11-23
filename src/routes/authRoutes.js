import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  revokeAllSessions,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
  enable2fa,
  confirm2fa,
  disable2fa,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Реєстрація нового користувача (пароль хешується Argon2id)
 *     tags: [Authentication]
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
 *     responses:
 *       201: { description: Користувача зареєстровано, повернуто пару токенів }
 *       400: { description: Помилка валідації даних }
 *       409: { description: Користувач з таким email вже існує }
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Вхід (при увімкненій 2FA потрібне поле totp)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               totp: { type: string, description: 'Код 2FA, якщо увімкнено' }
 *     responses:
 *       200: { description: Успішний вхід, повернуто пару токенів }
 *       401: { description: Невірні дані для входу або код 2FA }
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Оновлення пари токенів (ротація refresh токена; повторне використання відкликаного токена відкликає всі сесії)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Токени успішно оновлено }
 *       401: { description: Недійсний або відкликаний refresh токен }
 */
router.post('/refresh', refresh);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Вихід (відкликання refresh токена)
 *     tags: [Authentication]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       204: { description: Токен відкликано }
 */
router.post('/logout', logout);

/**
 * @swagger
 * /api/auth/sessions:
 *   delete:
 *     summary: Відкликання всіх сесій поточного користувача
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Усі сесії завершено }
 *       401: { description: Необхідна аутентифікація }
 */
router.delete('/sessions', authenticate, revokeAllSessions);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Поточний користувач за токеном
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Картка користувача }
 *       401: { description: Необхідна аутентифікація }
 */
router.get('/me', authenticate, me);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Зміна паролю (потребує поточний пароль; всі сесії завершуються)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8, maxLength: 72 }
 *     responses:
 *       200: { description: Пароль змінено }
 *       401: { description: Невірний поточний пароль або токен }
 */
router.post('/change-password', authenticate, changePassword);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Запит на відновлення паролю (лист із токеном; відповідь завжди однакова)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Лист надіслано (якщо email існує) }
 */
router.post('/forgot-password', forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Скидання паролю за токеном із листа
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword: { type: string, minLength: 8, maxLength: 72 }
 *     responses:
 *       200: { description: Пароль скинуто }
 *       400: { description: Токен недійсний або прострочений }
 */
router.post('/reset-password', resetPassword);

/**
 * @swagger
 * /api/auth/2fa/enable:
 *   post:
 *     summary: Початок увімкнення 2FA — повертає секрет, otpauth URL і QR-код
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Дані для налаштування TOTP }
 *       401: { description: Необхідна аутентифікація }
 */
router.post('/2fa/enable', authenticate, enable2fa);

/**
 * @swagger
 * /api/auth/2fa/confirm:
 *   post:
 *     summary: Підтвердження увімкнення 2FA кодом із додатку-автентифікатора
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, minLength: 6, maxLength: 6 }
 *     responses:
 *       200: { description: 2FA увімкнено }
 *       400: { description: Невірний код }
 */
router.post('/2fa/confirm', authenticate, confirm2fa);

/**
 * @swagger
 * /api/auth/2fa/disable:
 *   post:
 *     summary: Вимкнення 2FA (потребує пароль)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: 2FA вимкнено }
 *       401: { description: Невірний пароль }
 */
router.post('/2fa/disable', authenticate, disable2fa);

export default router;
