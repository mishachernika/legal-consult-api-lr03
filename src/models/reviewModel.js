import { prisma } from '../db.js';

export const reviewInclude = {
  client: { select: { id: true, name: true } },
  consultation: { select: { id: true, topic: true, status: true } },
};

// Модель відгуків + агрегат середнього рейтингу юриста
export const reviewModel = {
  findAll: (where) =>
    prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: 'desc' } }),

  findPage: async (where, { skip, take, orderBy = { createdAt: 'desc' } }) => {
    const [items, total] = await Promise.all([
      prisma.review.findMany({ where, skip, take, orderBy, include: reviewInclude }),
      prisma.review.count({ where }),
    ]);
    return { items, total };
  },

  findById: (id) => prisma.review.findUnique({ where: { id }, include: reviewInclude }),

  findByLawyer: (lawyerUserId) =>
    prisma.review.findMany({
      where: { lawyerId: lawyerUserId },
      include: reviewInclude,
      orderBy: { createdAt: 'desc' },
    }),

  create: (data) => prisma.review.create({ data, include: reviewInclude }),

  update: (id, data) => prisma.review.update({ where: { id }, data, include: reviewInclude }),

  remove: (id) => prisma.review.delete({ where: { id } }),

  avgRating: async (lawyerId) => {
    const agg = await prisma.review.aggregate({ where: { lawyerId }, _avg: { rating: true } });
    return agg._avg.rating;
  },
};
