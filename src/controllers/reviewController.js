import { reviewModel } from '../models/reviewModel.js';
import { consultationModel } from '../models/consultationModel.js';
import { lawyerModel } from '../models/lawyerModel.js';
import { AppError } from '../utils/AppError.js';
import { assertValid } from '../utils/validate.js';
import { parseId } from '../utils/params.js';
import { parsePagination, paginate } from '../utils/pagination.js';

// Перераховує середній рейтинг профілю юриста за всіма відгуками
async function recalcLawyerRating(lawyerId) {
  const avg = await reviewModel.avgRating(lawyerId);
  await lawyerModel.setRatingByUserId(lawyerId, avg);
}

// Список відгуків: публічний, з пагінацією та фільтрами
export async function getReviews(req, res) {
  const { lawyerId, clientId, minRating } = req.query;
  const where = {};
  if (lawyerId) where.lawyerId = parseId(lawyerId, 'ідентифікатор юриста');
  if (clientId) where.clientId = parseId(clientId, 'ідентифікатор клієнта');
  if (minRating) where.rating = { gte: parseId(minRating, 'мінімальний рейтинг') };

  const { page, limit, skip, take } = parsePagination(req.query);
  const { items, total } = await reviewModel.findPage(where, { skip, take });
  res.json(paginate(items, total, { page, limit }));
}

export async function getReviewsByLawyer(req, res) {
  const lawyerUserId = parseId(req.params.id, 'ідентифікатор користувача-юриста');
  const profile = await lawyerModel.findByUserId(lawyerUserId);
  if (!profile) throw new AppError(404, 'Профіль юриста не знайдено');

  res.json({ data: await reviewModel.findByLawyer(lawyerUserId) });
}

export async function getReviewById(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор відгуку');
  const review = await reviewModel.findById(id);
  if (!review) throw new AppError(404, 'Відгук не знайдено');
  res.json({ data: review });
}

// Відгук може залишити лише клієнт консультації після її завершення
export async function createReview(req, res) {
  assertValid(req.body, {
    consultationId: ['required', 'positiveInt'],
    rating: ['required', 'rating'],
    text: ['string', ['max', 1000]],
  });
  const { consultationId, rating, text } = req.body;

  const consultation = await consultationModel.findByIdWithReview(consultationId);
  if (!consultation) throw new AppError(404, 'Консультацію не знайдено');
  if (consultation.review) throw new AppError(409, 'Відгук для цієї консультації вже існує');
  if (consultation.status !== 'COMPLETED') {
    throw new AppError(400, 'Відгук можна залишити лише після завершення консультації');
  }
  if (consultation.clientId !== req.user.userId && req.user.role !== 'ADMIN') {
    throw new AppError(403, 'Лише клієнт консультації може залишити відгук');
  }

  const review = await reviewModel.create({
    consultationId,
    clientId: consultation.clientId,
    lawyerId: consultation.lawyerId,
    rating,
    text,
  });
  await recalcLawyerRating(consultation.lawyerId);

  res.status(201).json({ data: review });
}

export async function updateReview(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор відгуку');
  const existing = await reviewModel.findById(id);
  if (!existing) throw new AppError(404, 'Відгук не знайдено');
  if (req.user.role !== 'ADMIN' && existing.clientId !== req.user.userId) {
    throw new AppError(403, 'Можна редагувати лише власний відгук');
  }

  assertValid(req.body, {
    rating: ['rating'],
    text: ['string', ['max', 1000]],
  });
  const { rating, text } = req.body ?? {};
  if (rating === undefined && text === undefined) {
    throw new AppError(400, 'Не передано жодного поля для оновлення');
  }
  const data = {};
  if (rating !== undefined) data.rating = rating;
  if (text !== undefined) data.text = text;

  const review = await reviewModel.update(id, data);
  await recalcLawyerRating(review.lawyerId);
  res.json({ data: review });
}

export async function deleteReview(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор відгуку');
  const existing = await reviewModel.findById(id);
  if (!existing) throw new AppError(404, 'Відгук не знайдено');
  if (req.user.role !== 'ADMIN' && existing.clientId !== req.user.userId) {
    throw new AppError(403, 'Можна видалити лише власний відгук');
  }

  const review = await reviewModel.remove(id);
  await recalcLawyerRating(review.lawyerId);
  res.status(204).end();
}
