import { prisma } from '../db.js';

const includeSender = { sender: { select: { id: true, name: true, role: true } } };

// Модель повідомлень чату консультації
export const messageModel = {
  findByConsultation: (consultationId) =>
    prisma.message.findMany({
      where: { consultationId },
      orderBy: { createdAt: 'asc' },
      include: includeSender,
    }),

  create: (data) => prisma.message.create({ data, include: includeSender }),
};
