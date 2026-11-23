import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';

let counter = 0;

// Реєструє користувача через API, за потреби змінює роль у БД і логіниться заново (свіжий токен із новою роллю)
export async function registerUser(role = 'CLIENT', overrides = {}) {
  counter += 1;
  const email = overrides.email ?? `user${counter}@test.local`;
  const password = overrides.password ?? 'testpassword123';
  const name = overrides.name ?? `Тестовий ${counter}`;

  const reg = await request(app).post('/api/auth/register').send({ email, password, name });
  if (reg.status !== 201) {
    throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  }

  let user = reg.body.user;
  if (role !== user.role) {
    await prisma.user.update({ where: { id: user.id }, data: { role } });
    user = { ...user, role };
  }

  const login = await request(app).post('/api/auth/login').send({ email, password });
  if (login.status !== 200) {
    throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  return {
    id: user.id,
    email,
    password,
    role,
    user: login.body.user,
    tokens: login.body.tokens,
    auth: { Authorization: `Bearer ${login.body.tokens.accessToken}` },
  };
}

export async function wipeDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.file.deleteMany();
  await prisma.review.deleteMany();
  await prisma.message.deleteMany();
  await prisma.consultation.deleteMany();
  await prisma.lawyerProfile.deleteMany();
  await prisma.specialization.deleteMany();
  await prisma.user.deleteMany();
}
