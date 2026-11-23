import { prisma } from '../db.js';

export const eventOutboxModel = {
  create: (data) => prisma.eventOutbox.create({ data }),

  findAfter: (id, rooms, { take = 500 } = {}) =>
    prisma.eventOutbox.findMany({
      where: { id: { gt: BigInt(id) }, room: { in: rooms } },
      orderBy: { id: 'asc' },
      take,
    }),

  deleteOlderThan: (date) => prisma.eventOutbox.deleteMany({ where: { createdAt: { lt: date } } }),
};
