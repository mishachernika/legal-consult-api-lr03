import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
fs.mkdirSync(uploadDir, { recursive: true });

// Дозволені типи: MIME-тип і розширення мають збігатися (обидва легко підробити, тому перевіряємо разом)
const allowedTypes = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
  ['application/pdf', ['.pdf']],
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // оригінальне ім'я ніколи не використовуємо як шлях на диску
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.get(file.mimetype)?.includes(ext)) {
    cb(null, true);
  } else {
    const error = new Error('Непідтримуваний тип файлу (дозволено: jpg, png, gif, webp, pdf)');
    error.status = 400;
    cb(error);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024,
    files: 5,
  },
});

// «Магічні байти»: MIME-тип і ім'я файлу надходять від клієнта і їх легко підробити,
// тому додатково перевіряємо сигнатуру вмісту (перші байти файлу)
const MAGIC_SIGNATURES = new Map([
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]], // 'GIF8'
  ['application/pdf', [0x25, 0x50, 0x44, 0x46]], // '%PDF'
]);

export function hasValidMagicBytes(filePath, mimetype) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    if (mimetype === 'image/webp') {
      // RIFF....WEBP
      return n >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
    }
    const signature = MAGIC_SIGNATURES.get(mimetype);
    if (!signature) return false;
    return n >= signature.length && signature.every((byte, i) => buf[i] === byte);
  } finally {
    fs.closeSync(fd);
  }
}
