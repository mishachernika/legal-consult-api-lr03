import { prisma } from '../db.js';

// Refresh-токени зберігаємо лише у вигляді SHA-256 хешу — так їх можна відкликати

export const refreshTokenModel = {
  create: (data) => prisma.refreshToken.create({ data }),

  findByHash: (tokenHash) =>
    prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } }),

  revoke: (id) =>
    prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } }),

  revokeByHash: (tokenHash) =>
    prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    }),

  revokeAllForUser: (userId) =>
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
};
