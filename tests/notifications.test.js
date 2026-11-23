import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { registerUser, wipeDatabase } from './helpers.js';

let clientUser, lawyerUser;

before(async () => {
  await wipeDatabase();
  clientUser = await registerUser('CLIENT', { email: 'nt-client@test.local' });
  lawyerUser = await registerUser('CLIENT', { email: 'nt-lawyer@test.local' });
  await request(app).post('/api/lawyers').set(lawyerUser.auth).send({ userId: lawyerUser.id, pricePerHour: 500 });
});

after(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe('Notifications API', () => {
  test('без токена → 401', async () => {
    assert.equal((await request(app).get('/api/notifications')).status, 401);
  });

  test('створення консультації → у юриста з’являється сповіщення (unread)', async () => {
    await request(app)
      .post('/api/consultations')
      .set(clientUser.auth)
      .send({
        lawyerId: lawyerUser.id,
        topic: 'Сповіщення: договір оренди',
        description: 'Прошу консультацію щодо договору оренди приміщення.',
      });

    const res = await request(app).get('/api/notifications?unread=true').set(lawyerUser.auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].type, 'CONSULTATION_CREATED');
    assert.equal(res.body.data[0].priority, 'HIGH');
    assert.ok(res.body.unreadCount >= 1);
  });

  test('POST /:id/read → прочитано; POST /read-all → всі прочитані', async () => {
    const list = await request(app).get('/api/notifications').set(lawyerUser.auth);
    const id = list.body.data[0].id;

    const read = await request(app).post(`/api/notifications/${id}/read`).set(lawyerUser.auth);
    assert.equal(read.status, 200);
    assert.ok(read.body.data.readAt);

    // нове сповіщення — ще однією консультацією
    await request(app)
      .post('/api/consultations')
      .set(clientUser.auth)
      .send({
        lawyerId: lawyerUser.id,
        topic: 'Ще одна консультація',
        description: 'Питання щодо трудового договору, опис достатньої довжини.',
      });
    const all = await request(app).post('/api/notifications/read-all').set(lawyerUser.auth);
    assert.equal(all.status, 200);

    const after = await request(app).get('/api/notifications?unread=true').set(lawyerUser.auth);
    assert.equal(after.body.data.length, 0);
    assert.equal(after.body.unreadCount, 0);
  });

  test('чуже сповіщення → 403; DELETE свого → 204', async () => {
    const list = await request(app).get('/api/notifications').set(lawyerUser.auth);
    const id = list.body.data[0].id;

    assert.equal((await request(app).post(`/api/notifications/${id}/read`).set(clientUser.auth)).status, 403);
    assert.equal((await request(app).delete(`/api/notifications/${id}`).set(clientUser.auth)).status, 403);
    assert.equal((await request(app).delete(`/api/notifications/${id}`).set(lawyerUser.auth)).status, 204);
    assert.equal((await request(app).get('/api/notifications').set(lawyerUser.auth)).body.data.some((n) => n.id === id), false);
  });
});
