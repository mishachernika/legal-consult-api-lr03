import { createHash, randomBytes } from 'node:crypto';
import qrcode from 'qrcode';
import { createTotpSecret, totpUri, checkTotpCode } from '../utils/totp.js';
import { userModel } from '../models/userModel.js';
import { refreshTokenModel } from '../models/refreshTokenModel.js';
import { resetTokenModel } from '../models/resetTokenModel.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { assertValid } from '../utils/validate.js';
import { AppError } from '../utils/AppError.js';
import { sendPasswordResetEmail } from '../utils/email.js';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// Створює пару токенів і зберігає хеш refresh токена в БД, щоб його можна було відкликати
async function issueTokens(user) {
  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = generateRefreshToken(user.id);
  const { exp } = verifyRefreshToken(refreshToken);

  await refreshTokenModel.create({
    tokenHash: sha256(refreshToken),
    userId: user.id,
    expiresAt: new Date(exp * 1000),
  });

  return { accessToken, refreshToken };
}

export async function register(req, res) {
  assertValid(req.body, {
    email: ['required', 'email', ['max', 255]],
    password: ['required', 'string', ['min', 8], ['max', 72]],
    name: ['required', 'string', ['min', 2], ['max', 100]],
    phone: ['string', ['max', 20]],
  });
  const { email, password, name, phone } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) throw new AppError(409, 'Користувач з таким email вже існує');

  const user = await userModel.create({ email, password: await hashPassword(password), name, phone });

  res.status(201).json({
    message: 'Користувача успішно зареєстровано',
    user: userModel.public(user),
    tokens: await issueTokens(user),
  });
}

export async function login(req, res) {
  assertValid(req.body, {
    email: ['required', 'email'],
    password: ['required', 'string'],
    totp: ['string', ['max', 10]],
  });
  const { email, password, totp } = req.body;

  const user = await userModel.findByEmail(email);

  // Однакова відповідь для неіснуючого email і хибного пароля (захист від перебору)
  if (!user || !(await comparePassword(password, user.password))) {
    throw new AppError(401, 'Невірний email або пароль');
  }

  if (user.totpEnabled) {
    if (!totp || !checkTotpCode(user.totpSecret, totp)) {
      throw new AppError(401, 'Невірний або відсутній код двофакторної автентифікації');
    }
  }

  res.json({
    message: 'Успішний вхід',
    user: userModel.public(user),
    tokens: await issueTokens(user),
  });
}

export async function refresh(req, res) {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) throw new AppError(400, 'Refresh токен відсутній');

  try {
    verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Недійсний refresh токен');
  }

  const stored = await refreshTokenModel.findByHash(sha256(refreshToken));

  if (!stored || stored.revokedAt) {
    // Повторне використання відкликаного токена — ознака викрадення: відкликаємо всі токени користувача
    if (stored) await refreshTokenModel.revokeAllForUser(stored.userId);
    throw new AppError(401, 'Недійсний refresh токен');
  }

  // Ротація: старий токен відкликаємо, видаємо нову пару
  await refreshTokenModel.revoke(stored.id);

  res.json({ tokens: await issueTokens(stored.user) });
}

export async function logout(req, res) {
  const { refreshToken } = req.body ?? {};
  if (refreshToken) await refreshTokenModel.revokeByHash(sha256(refreshToken));
  res.status(204).end();
}

// Відкликання всіх сесій користувача (наприклад, «вийти на всіх пристроях»)
export async function revokeAllSessions(req, res) {
  await refreshTokenModel.revokeAllForUser(req.user.userId);
  res.json({ message: 'Усі сесії завершено' });
}

export async function me(req, res) {
  const user = await userModel.findById(req.user.userId);
  if (!user) throw new AppError(404, 'Користувача не знайдено');
  res.json({ data: { ...userModel.public(user), _count: user._count } });
}

export async function changePassword(req, res) {
  assertValid(req.body, {
    currentPassword: ['required', 'string'],
    newPassword: ['required', 'string', ['min', 8], ['max', 72]],
  });
  const { currentPassword, newPassword } = req.body;

  const user = await userModel.findByEmail((await userModel.findById(req.user.userId)).email);
  if (!(await comparePassword(currentPassword, user.password))) {
    throw new AppError(401, 'Невірний поточний пароль');
  }

  await userModel.updatePassword(user.id, await hashPassword(newPassword));
  await refreshTokenModel.revokeAllForUser(user.id); // примусово завершуємо всі сесії

  res.json({ message: 'Пароль успішно змінено' });
}

export async function forgotPassword(req, res) {
  assertValid(req.body, { email: ['required', 'email'] });
  const { email } = req.body;

  const user = await userModel.findByEmail(email);
  if (user) {
    const token = randomBytes(32).toString('hex');
    await resetTokenModel.create({
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 година
    });
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, resetUrl);
  }

  // Завжди однакова відповідь, щоб не розкривати, чи існує email у системі
  res.json({ message: 'Якщо email зареєстровано, ми надіслали лист із посиланням для скидання паролю' });
}

export async function resetPassword(req, res) {
  assertValid(req.body, {
    token: ['required', 'string', ['max', 128]],
    newPassword: ['required', 'string', ['min', 8], ['max', 72]],
  });
  const { token, newPassword } = req.body;

  const record = await resetTokenModel.findByHash(sha256(token));
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, 'Токен скидання недійсний або прострочений');
  }

  await resetTokenModel.markUsed(record.id);
  await userModel.updatePassword(record.userId, await hashPassword(newPassword));
  await refreshTokenModel.revokeAllForUser(record.userId);

  res.json({ message: 'Пароль успішно скинуто' });
}

// --- 2FA (TOTP) ---

export async function enable2fa(req, res) {
  const user = await userModel.findByEmail((await userModel.findById(req.user.userId)).email);
  const secret = createTotpSecret();
  await userModel.setTotp(user.id, secret, false); // ще не увімкнено — треба підтвердити кодом

  const otpauthUrl = totpUri(user.email, 'Legal Consult', secret);
  const qrCode = await qrcode.toDataURL(otpauthUrl);

  res.json({ secret, otpauthUrl, qrCode, message: 'Відскануйте QR-код і підтвердіть кодом через /api/auth/2fa/confirm' });
}

export async function confirm2fa(req, res) {
  assertValid(req.body, { code: ['required', 'string', ['min', 6], ['max', 6]] });
  const user = await userModel.findById(req.user.userId);
  if (!user?.totpSecret) throw new AppError(400, 'Спочатку увімкніть 2FA через /api/auth/2fa/enable');

  if (!checkTotpCode(user.totpSecret, req.body.code)) {
    throw new AppError(400, 'Невірний код');
  }

  await userModel.setTotp(user.id, user.totpSecret, true);
  res.json({ message: 'Двофакторну автентифікацію увімкнено' });
}

export async function disable2fa(req, res) {
  assertValid(req.body, { password: ['required', 'string'] });
  const user = await userModel.findById(req.user.userId);
  const full = await userModel.findByEmail(user.email);
  if (!(await comparePassword(req.body.password, full.password))) {
    throw new AppError(401, 'Невірний пароль');
  }
  await userModel.setTotp(user.id, null, false);
  res.json({ message: 'Двофакторну автентифікацію вимкнено' });
}
