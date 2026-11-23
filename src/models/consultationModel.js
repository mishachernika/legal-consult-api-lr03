import { prisma } from '../db.js';

export const consultationInclude = {
  client: { select: { id: true, name: true, email: true } },
  lawyer: { select: { id: true, name: true, email: true } },
};

// Модель консультації: CRUD + вибірки з чатом і відгуком
export const consultationModel = {
  findAll: (where) =>
    prisma.consultation.findMany({
      where,
      include: consultationInclude,
      orderBy: { createdAt: 'desc' },
    }),

  findPage: async (where, { skip, take, orderBy = { createdAt: 'desc' } }) => {
    const [items, total] = await Promise.all([
      prisma.consultation.findMany({ where, skip, take, orderBy, include: consultationInclude }),
      prisma.consultation.count({ where }),
    ]);
    return { items, total };
  },

  findById: (id) =>
    prisma.consultation.findUnique({
      where: { id },
      include: {
        ...consultationInclude,
        review: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { id: true, name: true, role: true } } },
        },
      },
    }),

  // скалярна вибірка (без include) — для перевірки існування та полів
  findByIdCore: (id) => prisma.consultation.findUnique({ where: { id } }),

  findByIdWithReview: (id) =>
    prisma.consultation.findUnique({ where: { id }, include: { review: true } }),

  create: (data) => prisma.consultation.create({ data, include: consultationInclude }),

  update: (id, data) =>
    prisma.consultation.update({ where: { id }, data, include: consultationInclude }),

  remove: (id) => prisma.consultation.delete({ where: { id } }),
};
