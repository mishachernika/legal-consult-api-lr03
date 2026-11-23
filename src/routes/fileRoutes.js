import { Router } from 'express';
import {
  uploadFile,
  uploadMultipleFiles,
  getFile,
  getMyFiles,
  getConsultationFiles,
  deleteFile,
} from '../controllers/fileController.js';
import { authenticate } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: Завантаження одного файлу (до 5 МБ; jpg/png/gif/webp/pdf; можна прив'язати до консультації полем consultationId)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               consultationId: { type: integer }
 *     responses:
 *       201: { description: Файл успішно завантажено }
 *       400: { description: Файл не надано, невалідний тип або завеликий розмір }
 *       401: { description: Необхідна аутентифікація }
 *       403: { description: Немає прав на консультацію }
 */
router.post('/upload', authenticate, upload.single('file'), uploadFile);

/**
 * @swagger
 * /api/files/upload-multiple:
 *   post:
 *     summary: Завантаження кількох файлів одночасно (до 5, поле files[])
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files: { type: array, items: { type: string, format: binary } }
 *               consultationId: { type: integer }
 *     responses:
 *       201: { description: Файли завантажено }
 *       400: { description: Файли не надано }
 *       401: { description: Необхідна аутентифікація }
 */
router.post('/upload-multiple', authenticate, upload.array('files', 5), uploadMultipleFiles);

/**
 * @swagger
 * /api/files/my:
 *   get:
 *     summary: Мої завантажені файли (з пагінацією)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 100 } }
 *     responses:
 *       200: { description: Список файлів із пагінацією }
 *       401: { description: Необхідна аутентифікація }
 */
router.get('/my', authenticate, getMyFiles);

/**
 * @swagger
 * /api/files/consultation/{id}:
 *   get:
 *     summary: Файли консультації (лише для її учасників або адміна)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Список файлів }
 *       403: { description: Немає доступу до консультації }
 *       404: { description: Консультацію не знайдено }
 */
router.get('/consultation/:id', authenticate, getConsultationFiles);

/**
 * @swagger
 * /api/files/{id}:
 *   get:
 *     summary: Завантаження файлу за ID (публічно)
 *     tags: [Files]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Вміст файлу }
 *       404: { description: Файл не знайдено }
 *   delete:
 *     summary: Видалення файлу (власник або адмін)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Файл видалено }
 *       403: { description: Недостатньо прав }
 *       404: { description: Файл не знайдено }
 */
router.get('/:id', getFile);
router.delete('/:id', authenticate, deleteFile);

export default router;
