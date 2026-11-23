import { prisma } from '../db.js';

const includeProfile = { lawyerProfile: { include: { specializations: true } } };

// Поля, які можна віддавати назовні (без password/totpSecret)
export const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  avatar: true,
  totpEnabled: true,
  createdAt: true,
  updatedAt: true,
};

// Модель у MVC: усі Prisma-запити до таблиці User зібрані в одному місці
export const userModel = {
  public: (user) => {
    if (!user) return null;
    const { password, totpSecret, ...rest } = user;
    return rest;
  },

  findAll: (where) =>
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, include: includeProfile }),

  findPage: async (where, { skip, take, orderBy = { createdAt: 'desc' } }) => {
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, skip, take, orderBy, include: includeProfile }),
      prisma.user.count({ where }),
    ]);
    return { items, total };
  },

  findById: (id) =>
    prisma.user.findUnique({
      where: { id },
      include: {
        ...includeProfile,
        _count: { select: { consultationsAsClient: true, consultationsAsLawyer: true } },
      },
    }),

  // з паролем і TOTP-секретом — лише для auth-контролера
  findByEmail: (email) => prisma.user.findUnique({ where: { email } }),

  create: (data) => prisma.user.create({ data }),

  update: (id, data) => prisma.user.update({ where: { id }, data }),

  updatePassword: (id, passwordHash) => prisma.user.update({ where: { id }, data: { password: passwordHash } }),

  setTotp: (id, secret, enabled) =>
    prisma.user.update({ where: { id }, data: { totpSecret: secret, totpEnabled: enabled } }),

  setRole: (id, role) => prisma.user.update({ where: { id }, data: { role } }),

  remove: (id) => prisma.user.delete({ where: { id } }),
};
