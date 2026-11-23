import { consultationModel } from '../models/consultationModel.js';
import { userModel } from '../models/userModel.js';
import { lawyerModel } from '../models/lawyerModel.js';
import { reviewModel } from '../models/reviewModel.js';
import { AppError } from '../utils/AppError.js';
import { assertValid } from '../utils/validate.js';
import { parseId } from '../utils/params.js';
import { parsePagination, paginate } from '../utils/pagination.js';

export const STATUSES = 'PENDING,CONFIRMED,IN_PROGRESS,COMPLETED,CANCELLED';

// Список консультацій: адмін бачить усі, звичайний користувач — лише свої (як клієнт або юрист)
export async function getConsultations(req, res) {
  const { clientId, lawyerId, status, search } = req.query;
  const conditions = [];

  if (req.user.role === 'ADMIN') {
    if (clientId) conditions.push({ clientId: parseId(clientId, 'ідентифікатор клієнта') });
    if (lawyerId) conditions.push({ lawyerId: parseId(lawyerId, 'ідентифікатор юриста') });
  } else {
    conditions.push({ OR: [{ clientId: req.user.userId }, { lawyerId: req.user.userId }] });
  }

  if (status) {
    if (!STATUSES.split(',').includes(status)) {
      throw new AppError(400, 'Невідомий статус консультації', { status: [`допустимі значення: ${STATUSES}`] });
    }
    conditions.push({ status });
  }

  if (search) {
    conditions.push({
      OR: [
        { topic: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};
  const { page, limit, skip, take } = parsePagination(req.query);
  const { items, total } = await consultationModel.findPage(where, { skip, take });
  res.json(paginate(items, total, { page, limit }));
}

function assertParticipantOrAdmin(req, consultation) {
  if (
    req.user.role !== 'ADMIN' &&
    consultation.clientId !== req.user.userId &&
    consultation.lawyerId !== req.user.userId
  ) {
    throw new AppError(403, 'Немає доступу до цієї консультації');
  }
}

export async function getConsultationById(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор консультації');
  const consultation = await consultationModel.findById(id);
  if (!consultation) throw new AppError(404, 'Консультацію не знайдено');
  assertParticipantOrAdmin(req, consultation);
  res.json({ data: consultation });
}

// Клієнт створює запит на консультацію для себе; адмін — для будь-якого клієнта.
// Ціну при створенні може задати лише адміністратор (інакше — ставка юриста; далі ціну змінює юрист)
export async function createConsultation(req, res) {
  const isAdmin = req.user.role === 'ADMIN';
  const clientId = isAdmin ? req.body?.clientId : req.user.userId;
  assertValid({ ...req.body, clientId }, {
    clientId: ['required', 'positiveInt'],
    lawyerId: ['required', 'positiveInt'],
    topic: ['required', 'string', ['min', 5], ['max', 200]],
    description: ['required', 'string', ['min', 10], ['max', 5000]],
    scheduledAt: ['date'],
    price: ['nonNegativeNumber'],
  });
  const { lawyerId, topic, description, scheduledAt, price } = req.body;

  if (price !== undefined && !isAdmin) {
    throw new AppError(403, 'Ціну консультації встановлює лише юрист або адміністратор');
  }

  const client = await userModel.findById(clientId);
  if (!client) throw new AppError(404, 'Клієнта не знайдено');

  const lawyerProfile = await lawyerModel.findByUserId(lawyerId);
  if (!lawyerProfile) throw new AppError(404, 'Профіль юриста не знайдено');

  const consultation = await consultationModel.create({
    clientId,
    lawyerId,
    topic,
    description,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    // якщо адмін ціну не передав, беремо погодинну ставку юриста
    price: price ?? lawyerProfile.pricePerHour,
  });
  res.status(201).json({ data: consultation });
}

// Оновлення з правилами за ролями:
// - адмін — будь-які поля;
// - юрист — статус, час і ціну;
// - клієнт — тему, опис і час лише доки консультація PENDING, плюс скасування (CANCELLED)
export async function updateConsultation(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор консультації');
  const consultation = await consultationModel.findByIdCore(id);
  if (!consultation) throw new AppError(404, 'Консультацію не знайдено');
  assertParticipantOrAdmin(req, consultation);

  assertValid(req.body, {
    lawyerId: ['positiveInt'],
    topic: ['string', ['min', 5], ['max', 200]],
    description: ['string', ['min', 10], ['max', 5000]],
    status: [['enum', STATUSES]],
    scheduledAt: ['date'],
    price: ['nonNegativeNumber'],
  });
  const { lawyerId, topic, description, status, scheduledAt, price } = req.body ?? {};

  const isAdmin = req.user.role === 'ADMIN';
  const isClient = consultation.clientId === req.user.userId;
  const isLawyer = consultation.lawyerId === req.user.userId;

  const data = {};
  if (isAdmin) {
    if (lawyerId !== undefined) {
      const lawyerProfile = await lawyerModel.findByUserId(lawyerId);
      if (!lawyerProfile) throw new AppError(404, 'Профіль юриста не знайдено');
      data.lawyerId = lawyerId;
    }
    if (topic !== undefined) data.topic = topic;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt);
    if (price !== undefined) data.price = price;
  } else if (isLawyer) {
    if (status !== undefined) data.status = status;
    if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt);
    if (price !== undefined) data.price = price;
  } else if (isClient) {
    if (consultation.status !== 'PENDING') {
      throw new AppError(400, 'Клієнт може редагувати консультацію лише доки вона очікує підтвердження');
    }
    if (topic !== undefined) data.topic = topic;
    if (description !== undefined) data.description = description;
    if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt);
    if (status !== undefined) {
      if (status !== 'CANCELLED') {
        throw new AppError(403, 'Клієнт може лише скасувати консультацію (CANCELLED)');
      }
      data.status = 'CANCELLED';
    }
  }

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'Не передано жодного поля, доступного для вашої ролі');
  }

  const updated = await consultationModel.update(id, data);
  res.json({ data: updated });
}

// Перерахунок середнього рейтингу юриста після видалення відгуку (каскад)
async function recalcLawyerRatingSafe(lawyerId) {
  const profile = await lawyerModel.findByUserId(lawyerId);
  if (!profile) return;
  const avg = await reviewModel.avgRating(lawyerId);
  await lawyerModel.setRatingByUserId(lawyerId, avg);
}

// Видалення: адмін завжди, клієнт — лише власну consultation у статусі PENDING
export async function deleteConsultation(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор консультації');
  const consultation = await consultationModel.findByIdWithReview(id);
  if (!consultation) throw new AppError(404, 'Консультацію не знайдено');

  const isAdmin = req.user.role === 'ADMIN';
  const isOwnerClient = consultation.clientId === req.user.userId && consultation.status === 'PENDING';
  if (!isAdmin && !isOwnerClient) {
    throw new AppError(403, 'Лише адміністратор або клієнт (до підтвердження) може видалити консультацію');
  }

  await consultationModel.remove(id); // відгук видалиться каскадом
  // але рейтинг юриста треба перерахувати вручну
  if (consultation.review) await recalcLawyerRatingSafe(consultation.lawyerId);
  res.status(204).end();
}
