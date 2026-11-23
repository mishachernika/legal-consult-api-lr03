import { userModel } from '../models/userModel.js';
import { hashPassword } from '../utils/password.js';
import { AppError } from '../utils/AppError.js';
import { assertValid } from '../utils/validate.js';
import { parseId } from '../utils/params.js';
import { parsePagination, paginate } from '../utils/pagination.js';

const ROLES = 'CLIENT,LAWYER,ADMIN';

// Список користувачів (email/телефони всіх бачить лише адмін — тому й authorize('ADMIN') у роуті)
export async function getUsers(req, res) {
  const { role, search } = req.query;
  if (role && !ROLES.split(',').includes(role)) {
    throw new AppError(400, 'Невідома роль', { role: [`допустимі значення: ${ROLES}`] });
  }
  const where = {};
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  const { page, limit, skip, take } = parsePagination(req.query);
  const { items, total } = await userModel.findPage(where, { skip, take });
  res.json(paginate(items.map(userModel.public), total, { page, limit }));
}

export async function getUserById(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор користувача');
  const user = await userModel.findById(id);
  if (!user) throw new AppError(404, 'Користувача не знайдено');

  const isAdmin = req.user.role === 'ADMIN';
  const isSelf = req.user.userId === id;
  if (!isAdmin && !isSelf) {
    // чужа картка: лише публічні поля, без email/phone
    const { id: uid, name, role, avatar, createdAt, lawyerProfile } = user;
    return res.json({ data: { id: uid, name, role, avatar, createdAt, lawyerProfile } });
  }
  res.json({ data: userModel.public(user) });
}

// Створення користувача адміністратором (звичайна реєстрація — через /api/auth/register)
export async function createUser(req, res) {
  assertValid(req.body, {
    email: ['required', 'email', ['max', 255]],
    password: ['required', ['min', 8], ['max', 72]],
    name: ['required', 'string', ['min', 2], ['max', 100]],
    phone: ['string', ['max', 20]],
    role: [['enum', ROLES]],
  });
  const { email, password, name, phone, role } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) throw new AppError(409, 'Користувач з таким email вже існує');

  const user = await userModel.create({
    email,
    password: await hashPassword(password),
    name,
    phone,
    role,
  });
  res.status(201).json({ data: userModel.public(user) });
}

// Редагувати можна лише власний профіль; роль змінює лише адміністратор
export async function updateUser(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор користувача');
  if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
    throw new AppError(403, 'Можна редагувати лише власний профіль');
  }
  assertValid(req.body, {
    email: ['email', ['max', 255]],
    name: ['string', ['min', 2], ['max', 100]],
    phone: ['string', ['max', 20]],
    role: [['enum', ROLES]],
    avatar: ['string', ['max', 500]],
  });
  const { email, name, phone, role, avatar } = req.body ?? {};
  if ([email, name, phone, role, avatar].every((v) => v === undefined)) {
    throw new AppError(400, 'Не передано жодного поля для оновлення');
  }
  if (role !== undefined && req.user.role !== 'ADMIN') {
    throw new AppError(403, 'Лише адміністратор може змінювати роль користувача');
  }
  if (email) {
    const existing = await userModel.findByEmail(email);
    if (existing && existing.id !== id) throw new AppError(409, 'Користувач з таким email вже існує');
  }
  const data = {};
  if (email !== undefined) data.email = email;
  if (name !== undefined) data.name = name;
  if (phone !== undefined) data.phone = phone;
  if (role !== undefined) data.role = role;
  if (avatar !== undefined) data.avatar = avatar;

  const user = await userModel.update(id, data); // P2025 → 404
  res.json({ data: userModel.public(user) });
}

export async function deleteUser(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор користувача');
  await userModel.remove(id); // P2025 → 404, P2003 → 409
  res.status(204).end();
}
