import { prisma } from '../db.js';

// Токени відновлення паролю (у БД — лише SHA-256 хеш)
export const resetTokenModel = {
  create: (data) => prisma.passwordResetToken.create({ data }),

  findByHash: (tokenHash) => prisma.passwordResetToken.findUnique({ where: { tokenHash } }),

  markUsed: (id) =>
    prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } }),
};
