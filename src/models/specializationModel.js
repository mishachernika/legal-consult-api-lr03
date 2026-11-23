import { prisma } from '../db.js';

// Модель довідника сфер права
export const specializationModel = {
  findAll: () =>
    prisma.specialization.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { lawyers: true } } },
    }),

  findById: (id) =>
    prisma.specialization.findUnique({
      where: { id },
      include: { lawyers: { include: { user: { select: { id: true, name: true, email: true } } } } },
    }),

  findByName: (name) => prisma.specialization.findUnique({ where: { name } }),

  // для перевірки, що всі передані id існують
  findByIds: (ids) =>
    prisma.specialization.findMany({ where: { id: { in: ids } }, select: { id: true } }),

  create: (data) => prisma.specialization.create({ data }),

  update: (id, data) => prisma.specialization.update({ where: { id }, data }),

  remove: (id) => prisma.specialization.delete({ where: { id } }),
};
