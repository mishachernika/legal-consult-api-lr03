import { prisma } from '../db.js';

export const auditLogModel = {
  create: (data) => prisma.auditLog.create({ data }),

  findPage: async (where, { skip, take }) => {
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  },
};
