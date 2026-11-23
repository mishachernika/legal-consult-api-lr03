import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Єдиний екземпляр клієнта Prisma на весь застосунок
export const prisma = new PrismaClient({ adapter });
