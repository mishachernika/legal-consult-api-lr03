import { lawyerModel } from '../models/lawyerModel.js';
import { userModel } from '../models/userModel.js';
import { specializationModel } from '../models/specializationModel.js';
import { reviewModel } from '../models/reviewModel.js';
import { AppError } from '../utils/AppError.js';
import { assertValid } from '../utils/validate.js';
import { parseId } from '../utils/params.js';
import { parsePagination, paginate } from '../utils/pagination.js';

const SORTABLE = ['rating', 'pricePerHour', 'experienceYears'];

// Каталог юристів: публічний, з пагінацією, пошуком, фільтрами та сортуванням
export async function getLawyers(req, res) {
  const { specializationId, search, minPrice, maxPrice, sortBy = 'rating', order = 'desc' } = req.query;

  const where = {};
  if (specializationId) {
    where.specializations = { some: { id: parseId(specializationId, 'ідентифікатор спеціалізації') } };
  }
  if (search) {
    where.OR = [
      { bio: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.pricePerHour = {};
    if (minPrice !== undefined) where.pricePerHour.gte = Number(minPrice);
    if (maxPrice !== undefined) where.pricePerHour.lte = Number(maxPrice);
  }

  const { page, limit, skip, take } = parsePagination(req.query);
  const orderBy = { [SORTABLE.includes(sortBy) ? sortBy : 'rating']: order === 'asc' ? 'asc' : 'desc' };
  const { items, total } = await lawyerModel.findPage({ where, skip, take, orderBy });
  res.json(paginate(items, total, { page, limit }));
}

export async function getLawyerById(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор профілю юриста');
  const lawyer = await lawyerModel.findById(id);
  if (!lawyer) throw new AppError(404, 'Профіль юриста не знайдено');

  const [consultationsCount, reviews] = await Promise.all([
    lawyerModel.countConsultations(lawyer.userId),
    reviewModel.findByLawyer(lawyer.userId),
  ]);
  res.json({ data: { ...lawyer, consultationsCount, reviews } });
}

async function assertSpecializationsExist(specializationIds) {
  const found = await specializationModel.findByIds(specializationIds);
  if (found.length !== specializationIds.length) {
    throw new AppError(400, 'Частину спеціалізацій не знайдено', { specializationIds });
  }
}

// Профіль юриста створює сам користувач (або адмін — для будь-кого)
export async function createLawyer(req, res) {
  assertValid(req.body, {
    userId: ['required', 'positiveInt'],
    bio: ['string', ['max', 2000]],
    experienceYears: ['nonNegativeInt'],
    pricePerHour: ['required', 'nonNegativeNumber'],
    isVerified: ['bool'],
    specializationIds: ['arrayOfPositiveInt'],
  });
  const {
    userId,
    bio,
    experienceYears = 0,
    pricePerHour,
    isVerified = false,
    specializationIds = [],
  } = req.body;

  if (req.user.role !== 'ADMIN' && req.user.userId !== userId) {
    throw new AppError(403, 'Можна створити профіль юриста лише для власного акаунта');
  }

  const user = await userModel.findById(userId);
  if (!user) throw new AppError(404, 'Користувача не знайдено');

  const existing = await lawyerModel.findByUserId(userId);
  if (existing) throw new AppError(409, 'Профіль юриста для цього користувача вже існує');

  if (specializationIds.length > 0) await assertSpecializationsExist(specializationIds);

  const lawyer = await lawyerModel.create({
    userId,
    bio,
    experienceYears,
    pricePerHour,
    // верифікацію підтверджує лише адміністратор
    isVerified: req.user.role === 'ADMIN' ? isVerified : false,
    specializations: { connect: specializationIds.map((id) => ({ id })) },
  });
  // роль LAWYER отримує лише колишній клієнт — адміністратора не знижуємо
  if (user.role === 'CLIENT') await userModel.setRole(userId, 'LAWYER');

  res.status(201).json({ data: lawyer });
}

async function assertCanManageLawyer(req, id) {
  const lawyer = await lawyerModel.findById(id);
  if (!lawyer) throw new AppError(404, 'Профіль юриста не знайдено');
  if (req.user.role !== 'ADMIN' && lawyer.userId !== req.user.userId) {
    throw new AppError(403, 'Можна керувати лише власним профілем юриста');
  }
  return lawyer;
}

export async function updateLawyer(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор профілю юриста');
  await assertCanManageLawyer(req, id);
  assertValid(req.body, {
    bio: ['string', ['max', 2000]],
    experienceYears: ['nonNegativeInt'],
    pricePerHour: ['nonNegativeNumber'],
    isVerified: ['bool'],
    specializationIds: ['arrayOfPositiveInt'],
  });
  const { bio, experienceYears, pricePerHour, isVerified, specializationIds } = req.body ?? {};
  if ([bio, experienceYears, pricePerHour, isVerified, specializationIds].every((v) => v === undefined)) {
    throw new AppError(400, 'Не передано жодного поля для оновлення');
  }
  if (isVerified !== undefined && req.user.role !== 'ADMIN') {
    throw new AppError(403, 'Лише адміністратор може підтверджувати профіль юриста');
  }
  if (specializationIds && specializationIds.length > 0) {
    await assertSpecializationsExist(specializationIds);
  }
  const data = {};
  if (bio !== undefined) data.bio = bio;
  if (experienceYears !== undefined) data.experienceYears = experienceYears;
  if (pricePerHour !== undefined) data.pricePerHour = pricePerHour;
  if (isVerified !== undefined) data.isVerified = isVerified;
  if (specializationIds !== undefined) {
    data.specializations = { set: specializationIds.map((sid) => ({ id: sid })) };
  }

  const lawyer = await lawyerModel.update(id, data);
  res.json({ data: lawyer });
}

export async function deleteLawyer(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор профілю юриста');
  const lawyer = await assertCanManageLawyer(req, id);
  await lawyerModel.remove(lawyer.id);
  // без профілю юрист стає клієнтом, але адміністратора не знижуємо
  const user = await userModel.findById(lawyer.userId);
  if (user?.role === 'LAWYER') await userModel.setRole(lawyer.userId, 'CLIENT');
  res.status(204).end();
}
