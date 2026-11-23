import { consultationModel } from '../models/consultationModel.js';
import { messageModel } from '../models/messageModel.js';
import { AppError } from '../utils/AppError.js';
import { assertValid } from '../utils/validate.js';
import { parseId } from '../utils/params.js';

function assertParticipant(req, consultation) {
  if (
    req.user.role !== 'ADMIN' &&
    consultation.clientId !== req.user.userId &&
    consultation.lawyerId !== req.user.userId
  ) {
    throw new AppError(403, 'Лише учасники консультації мають доступ до чату');
  }
}

export async function listMessages(req, res) {
  const consultationId = parseId(req.params.id, 'ідентифікатор консультації');
  const consultation = await consultationModel.findByIdCore(consultationId);
  if (!consultation) throw new AppError(404, 'Консультацію не знайдено');
  assertParticipant(req, consultation);

  res.json({ data: await messageModel.findByConsultation(consultationId) });
}

// Відправником завжди є поточний автентифікований користувач (senderId з тіла ігноруємо)
export async function createMessage(req, res) {
  const consultationId = parseId(req.params.id, 'ідентифікатор консультації');
  assertValid(req.body, {
    text: ['required', 'string', ['min', 1], ['max', 2000]],
  });
  const { text } = req.body;

  const consultation = await consultationModel.findByIdCore(consultationId);
  if (!consultation) throw new AppError(404, 'Консультацію не знайдено');
  assertParticipant(req, consultation);

  const message = await messageModel.create({
    consultationId,
    senderId: req.user.userId,
    text,
  });
  res.status(201).json({ data: message });
}
