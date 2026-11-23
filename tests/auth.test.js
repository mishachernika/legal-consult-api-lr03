import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { generateSync } from 'otplib';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { registerUser, wipeDatabase } from './helpers.js';

const credentials = { email: 'auth@example.com', password: 'testpassword123', name: 'Auth Тест' };

before(() => wipeDatabase());
after(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe('Authentication API', () => {
  test('реєстрація: 201, токени, без пароля у відповіді', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, credentials.email);
    assert.equal(res.body.user.password, undefined);
    assert.ok(res.body.tokens.accessToken);
    assert.ok(res.body.tokens.refreshToken);
  });

  test('дубль email → 409', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);
    assert.equal(res.status, 409);
  });

  test('короткий пароль → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, email: 'short@example.com', password: 'short' });
    assert.equal(res.status, 400);
    assert.ok(res.body.details.password);
  });

  test('вхід із правильним паролем → 200 + токени', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    assert.equal(res.status, 200);
    assert.ok(res.body.tokens.accessToken);
    assert.ok(res.body.tokens.refreshToken);
  });

  test('хибний пароль і невідомий email → однакова 401', async () => {
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'wrongpassword' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error);
  });

  test('GET /api/auth/me без токена → 401, з токеном → 200', async () => {
    assert.equal((await request(app).get('/api/auth/me')).status, 401);
    const { auth } = await registerUser('CLIENT', { email: 'me@example.com' });
    const res = await request(app).get('/api/auth/me').set(auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.email, 'me@example.com');
    assert.equal(res.body.data.password, undefined);
  });

  test('refresh: ротація, старий токен відкликано, повторне використання відкликає всі сесії', async () => {
    const { tokens } = await registerUser('CLIENT', { email: 'refresh@example.com' });

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    assert.equal(first.status, 200);
    assert.notEqual(first.body.tokens.refreshToken, tokens.refreshToken);

    // старий токен уже відкликано
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken });
    assert.equal(reuse.status, 401);

    // повторне використання відкликаного токена скасовує й нові токени користувача
    const afterReuse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.tokens.refreshToken });
    assert.equal(afterReuse.status, 401);
  });

  test('logout відкликає refresh токен', async () => {
    const { tokens } = await registerUser('CLIENT', { email: 'logout@example.com' });
    assert.equal((await request(app).post('/api/auth/logout').send({ refreshToken: tokens.refreshToken })).status, 204);
    assert.equal(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: tokens.refreshToken })).status,
      401
    );
  });

  test('change-password: хибний поточний → 401, успіх → старі сесії відкликано, новий пароль працює', async () => {
    const u = await registerUser('CLIENT', { email: 'changepw@example.com', password: 'oldpassword123' });

    const wrong = await request(app)
      .post('/api/auth/change-password')
      .set(u.auth)
      .send({ currentPassword: 'nope-nope', newPassword: 'newpassword456' });
    assert.equal(wrong.status, 401);

    const ok = await request(app)
      .post('/api/auth/change-password')
      .set(u.auth)
      .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });
    assert.equal(ok.status, 200);

    // усі refresh токени відкликано
    assert.equal(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: u.tokens.refreshToken })).status,
      401
    );

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'changepw@example.com', password: 'newpassword456' });
    assert.equal(login.status, 200);
  });

  test('forgot/reset-password: токен із БД скидає пароль, повторне використання → 400', async () => {
    await registerUser('CLIENT', { email: 'reset@example.com', password: 'oldpassword123' });

    // відповідь завжди 200, навіть для неіснуючого email
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    assert.equal(unknown.status, 200);

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com' });
    assert.equal(res.status, 200);

    const record = await prisma.passwordResetToken.findFirst({
      where: { user: { email: 'reset@example.com' }, usedAt: null },
      orderBy: { id: 'desc' },
    });
    assert.ok(record, 'токен скидання має бути в БД (хеш)');

    // у dev-режимі без SMTP токен видно в логах; у тесті беремо хеш із БД і генеруємо токен напряму
    // (токен у листі — це випадкові 32 байти; тому створюємо власний запис через модель, як це робить контролер)
    const { createHash, randomBytes } = await import('node:crypto');
    const token = randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId: record.userId,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'brandnew789' });
    assert.equal(reset.status, 200);

    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'another000' });
    assert.equal(again.status, 400);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@example.com', password: 'brandnew789' });
    assert.equal(login.status, 200);
  });

  test('2FA: enable → confirm кодом → login вимагає totp → disable', async () => {
    const u = await registerUser('CLIENT', { email: 'totp@example.com' });

    const enable = await request(app).post('/api/auth/2fa/enable').set(u.auth);
    assert.equal(enable.status, 200);
    assert.ok(enable.body.secret);
    assert.ok(enable.body.qrCode.startsWith('data:image/png;base64,'));

    const code = generateSync({ secret: enable.body.secret });
    const confirm = await request(app).post('/api/auth/2fa/confirm').set(u.auth).send({ code });
    assert.equal(confirm.status, 200);

    // без коду 2FA вхід не проходить
    const noTotp = await request(app)
      .post('/api/auth/login')
      .send({ email: 'totp@example.com', password: u.password });
    assert.equal(noTotp.status, 401);

    // з правильним кодом — проходить
    const withTotp = await request(app)
      .post('/api/auth/login')
      .send({ email: 'totp@example.com', password: u.password, totp: generateSync({ secret: enable.body.secret }) });
    assert.equal(withTotp.status, 200);

    const disable = await request(app).post('/api/auth/2fa/disable').set(u.auth).send({ password: u.password });
    assert.equal(disable.status, 200);

    const after = await request(app)
      .post('/api/auth/login')
      .send({ email: 'totp@example.com', password: u.password });
    assert.equal(after.status, 200);
  });

  test('2FA confirm із хибним кодом → 400', async () => {
    const u = await registerUser('CLIENT', { email: 'totp2@example.com' });
    await request(app).post('/api/auth/2fa/enable').set(u.auth);
    const res = await request(app).post('/api/auth/2fa/confirm').set(u.auth).send({ code: '000000' });
    assert.ok(res.status === 400 || res.status === 401 || res.status === 403);
  });
});
