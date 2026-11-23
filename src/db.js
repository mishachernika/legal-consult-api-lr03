import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// PRISMA_LOG_QUERY=1 — лог усіх SQL-запитів із тривалістю (для пошуку повільних, див. ЛР03)
const log = process.env.PRISMA_LOG_QUERY === '1' ? [{ emit: 'event', level: 'query' }] : [];

// Єдиний екземпляр клієнта Prisma на весь застосунок
export const prisma = new PrismaClient({ adapter, log });

if (process.env.PRISMA_LOG_QUERY === '1') {
  prisma.$on('query', (e) => {
    console.log(`[prisma] ${e.duration}ms ${e.query.replace(/\s+/g, ' ').slice(0, 220)}`);
  });
}
