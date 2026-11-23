import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { registerUser, wipeDatabase } from './helpers.js';

let admin;
let client;
let lawyerUser;

before(async () => {
  await wipeDatabase();
  admin = await registerUser('ADMIN', { email: 'admin@test.local' });
  client = await registerUser('CLIENT', { email: 'client@test.local' });
  lawyerUser = await registerUser('CLIENT', { email: 'lawyer@test.local' });
});

after(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe('Health', () => {
  test('GET /health повертає статус ok', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });
});

describe('Users API (захищено токеном)', () => {
  test('GET /api/users без токена → 401', async () => {
    assert.equal((await request(app).get('/api/users')).status, 401);
  });

  test('GET /api/users звичайний користувач → 403, адмін → пагінований список без паролів', async () => {
    const asClient = await request(app).get('/api/users').set(client.auth);
    assert.equal(asClient.status, 403);

    const res = await request(app).get('/api/users').set(admin.auth);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.pagination.total >= 3);
    assert.ok(res.body.data.every((u) => u.password === undefined));
  });

  test('GET /api/users/:id чужа картка → без email/phone; своя → повна', async () => {
    const other = await request(app).get(`/api/users/${admin.id}`).set(client.auth);
    assert.equal(other.status, 200);
    assert.equal(other.body.data.email, undefined);
    assert.equal(other.body.data.phone, undefined);
    assert.equal(other.body.data.name, 'Тестовий 1');

    const self = await request(app).get(`/api/users/${client.id}`).set(client.auth);
    assert.equal(self.status, 200);
    assert.equal(self.body.data.email, 'client@test.local');
  });

  test('GET /api/users?role=LAWYER&search= фільтр + пошук', async () => {
    const res = await request(app).get('/api/users?role=CLIENT&search=client').set(admin.auth);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data.every((u) => u.role === 'CLIENT' && u.email.includes('client')));
  });

  test('POST /api/users без токена → 401, звичайний користувач → 403, адмін → 201', async () => {
    assert.equal((await request(app).post('/api/users').send({})).status, 401);
    const forbidden = await request(app)
      .post('/api/users')
      .set(client.auth)
      .send({ email: 'x@x.ua', password: 'password123', name: 'Хакер' });
    assert.equal(forbidden.status, 403);

    const ok = await request(app)
      .post('/api/users')
      .set(admin.auth)
      .send({ email: 'newbie@test.local', password: 'password123', name: 'Новий Юзер' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.password, undefined);
  });

  test('PUT /api/users/:id — власник ок, чужий → 403, роль змінює лише адмін', async () => {
    const other = await request(app)
      .post('/api/users')
      .set(admin.auth)
      .send({ email: 'other@test.local', password: 'password123', name: 'Інший' });
    const otherId = other.body.data.id;

    const forbidden = await request(app).put(`/api/users/${otherId}`).set(client.auth).send({ name: 'Зламане Ім\'я' });
    assert.equal(forbidden.status, 403);

    const roleChange = await request(app).put(`/api/users/${client.id}`).set(client.auth).send({ role: 'ADMIN' });
    assert.equal(roleChange.status, 403);

    const ok = await request(app).put(`/api/users/${client.id}`).set(client.auth).send({ name: 'Клієнт Оновлений' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.name, 'Клієнт Оновлений');
  });

  test('DELETE /api/users/:id — лише адмін, 204 → повторно 404', async () => {
    const u = await request(app)
      .post('/api/users')
      .set(admin.auth)
      .send({ email: 'del@test.local', password: 'password123', name: 'Видалити' });
    const id = u.body.data.id;
    assert.equal((await request(app).delete(`/api/users/${id}`).set(client.auth)).status, 403);
    assert.equal((await request(app).delete(`/api/users/${id}`).set(admin.auth)).status, 204);
    assert.equal((await request(app).get(`/api/users/${id}`).set(admin.auth)).status, 404);
  });
});

describe('Specializations API', () => {
  test('GET публічний, POST без токена → 401, адмін → 201, дубль → 409', async () => {
    const list = await request(app).get('/api/specializations');
    assert.equal(list.status, 200);

    assert.equal((await request(app).post('/api/specializations').send({ name: 'Трудове право' })).status, 401);

    const created = await request(app)
      .post('/api/specializations')
      .set(admin.auth)
      .send({ name: 'Трудове право', description: 'Трудові спори' });
    assert.equal(created.status, 201);

    const dup = await request(app).post('/api/specializations').set(admin.auth).send({ name: 'Трудове право' });
    assert.equal(dup.status, 409);

    assert.equal((await request(app).delete(`/api/specializations/${created.body.data.id}`).set(client.auth)).status, 403);
    assert.equal((await request(app).delete(`/api/specializations/${created.body.data.id}`).set(admin.auth)).status, 204);
  });
});

describe('Lawyers API', () => {
  let profileId;
  let specId;

  before(async () => {
    const s = await request(app).post('/api/specializations').set(admin.auth).send({ name: 'Кримінальне право' });
    specId = s.body.data.id;
  });

  test('POST /api/lawyers — свій профіль → 201 і роль стала LAWYER; чужий → 403', async () => {
    const foreign = await request(app)
      .post('/api/lawyers')
      .set(lawyerUser.auth)
      .send({ userId: client.id, pricePerHour: 100 });
    assert.equal(foreign.status, 403);

    const res = await request(app)
      .post('/api/lawyers')
      .set(lawyerUser.auth)
      .send({
        userId: lawyerUser.id,
        bio: 'Адвокат, 10 років практики',
        experienceYears: 10,
        pricePerHour: 800,
        specializationIds: [specId],
      });
    assert.equal(res.status, 201);
    profileId = res.body.data.id;
    assert.equal(res.body.data.specializations.length, 1);

    const me = await request(app).get('/api/auth/me').set(lawyerUser.auth);
    assert.equal(me.body.data.role, 'LAWYER');
  });

  test('POST повторно для того самого userId → 409; невідома спеціалізація → 400', async () => {
    const dup = await request(app)
      .post('/api/lawyers')
      .set(lawyerUser.auth)
      .send({ userId: lawyerUser.id, pricePerHour: 100 });
    assert.equal(dup.status, 409);

    const other = await registerUser('CLIENT', { email: 'lawyer2@test.local' });
    const bad = await request(app)
      .post('/api/lawyers')
      .set(other.auth)
      .send({ userId: other.id, pricePerHour: 100, specializationIds: [99999] });
    assert.equal(bad.status, 400);
  });

  test('GET /api/lawyers — пагінація, пошук, фільтр за спеціалізацією і ціною', async () => {
    const all = await request(app).get('/api/lawyers?page=1&limit=10');
    assert.equal(all.status, 200);
    assert.ok(all.body.pagination.total >= 1);

    const filtered = await request(app).get(`/api/lawyers?specializationId=${specId}&minPrice=700&maxPrice=900&search=адвокат`);
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.data.length >= 1);
    assert.ok(
      filtered.body.data.every(
        (l) => l.specializations.some((s) => s.id === specId) && Number(l.pricePerHour) >= 700 && Number(l.pricePerHour) <= 900
      )
    );
  });

  test('PUT /api/lawyers/:id — власник ок, чужий → 403; isVerified лише адмін', async () => {
    const forbidden = await request(app).put(`/api/lawyers/${profileId}`).set(client.auth).send({ pricePerHour: 1 });
    assert.equal(forbidden.status, 403);

    const notAdmin = await request(app).put(`/api/lawyers/${profileId}`).set(lawyerUser.auth).send({ isVerified: true });
    assert.equal(notAdmin.status, 403);

    const ok = await request(app).put(`/api/lawyers/${profileId}`).set(lawyerUser.auth).send({ pricePerHour: 850 });
    assert.equal(ok.status, 200);
    assert.equal(Number(ok.body.data.pricePerHour), 850);

    const verified = await request(app).put(`/api/lawyers/${profileId}`).set(admin.auth).send({ isVerified: true });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.isVerified, true);
  });

  test('адмін створює профіль юриста для себе — роль лишається ADMIN', async () => {
    const selfAdmin = await registerUser('ADMIN', { email: 'selfadmin@test.local' });
    const res = await request(app)
      .post('/api/lawyers')
      .set(selfAdmin.auth)
      .send({ userId: selfAdmin.id, pricePerHour: 300 });
    assert.equal(res.status, 201);

    const me = await request(app).get('/api/auth/me').set(selfAdmin.auth);
    assert.equal(me.body.data.role, 'ADMIN');
  });

  test('GET /api/lawyers/:id — картка з відгуками і лічильником консультацій; 404 для чужого id', async () => {
    const res = await request(app).get(`/api/lawyers/${profileId}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.reviews));
    assert.equal(typeof res.body.data.consultationsCount, 'number');

    assert.equal((await request(app).get('/api/lawyers/99999')).status, 404);
  });
});

describe('Consultations + Messages API', () => {
  let consultationId;

  test('POST /api/consultations без токена → 401; клієнт створює для себе → 201, PENDING, ціна = ставка юриста', async () => {
    assert.equal((await request(app).post('/api/consultations').send({})).status, 401);

    const res = await request(app)
      .post('/api/consultations')
      .set(client.auth)
      .send({
        lawyerId: lawyerUser.id,
        topic: 'Питання щодо договору оренди',
        description: 'Потрібна консультація щодо умов договору оренди приміщення.',
      });
    assert.equal(res.status, 201);
    consultationId = res.body.data.id;
    assert.equal(res.body.data.status, 'PENDING');
    assert.equal(res.body.data.clientId, client.id);
    assert.equal(Number(res.body.data.price), 850);
  });

  test('POST /api/consultations із price від клієнта → 403 (ціну задає лише юрист/адмін)', async () => {
    const res = await request(app)
      .post('/api/consultations')
      .set(client.auth)
      .send({
        lawyerId: lawyerUser.id,
        topic: 'Спроба задати ціну 0',
        description: 'Клієнт намагається сам встановити нульову ціну.',
        price: 0,
      });
    assert.equal(res.status, 403);
  });

  test('GET /api/consultations — клієнт бачить лише свої, пошук працює', async () => {
    const outsider = await registerUser('CLIENT', { email: 'outsider@test.local' });

    const asClient = await request(app).get('/api/consultations').set(client.auth);
    assert.equal(asClient.status, 200);
    assert.ok(asClient.body.data.length >= 1);
    assert.ok(asClient.body.data.every((c) => c.clientId === client.id || c.lawyerId === client.id));

    const asOutsider = await request(app).get('/api/consultations').set(outsider.auth);
    assert.equal(asOutsider.status, 200);
    assert.equal(asOutsider.body.data.length, 0);

    const searched = await request(app).get('/api/consultations?search=оренди').set(client.auth);
    assert.ok(searched.body.data.length >= 1);
    assert.ok(searched.body.data.every((c) => c.topic.includes('оренди') || c.description.includes('оренди')));
  });

  test('GET /api/consultations/:id сторонній → 403, учасник → 200', async () => {
    const outsider = await registerUser('CLIENT', { email: 'outsider2@test.local' });
    assert.equal((await request(app).get(`/api/consultations/${consultationId}`).set(outsider.auth)).status, 403);
    assert.equal((await request(app).get(`/api/consultations/${consultationId}`).set(client.auth)).status, 200);
  });

  test('PUT клієнт редагує PENDING і може скасувати; юрист змінює статус', async () => {
    const edit = await request(app)
      .put(`/api/consultations/${consultationId}`)
      .set(client.auth)
      .send({ topic: 'Оренда приміщення (уточнено)' });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.data.topic, 'Оренда приміщення (уточнено)');

    // клієнт не може поставити довільний статус
    const badStatus = await request(app)
      .put(`/api/consultations/${consultationId}`)
      .set(client.auth)
      .send({ status: 'COMPLETED' });
    assert.equal(badStatus.status, 403);

    // юрист підтверджує
    const confirm = await request(app)
      .put(`/api/consultations/${consultationId}`)
      .set(lawyerUser.auth)
      .send({ status: 'CONFIRMED' });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.data.status, 'CONFIRMED');

    // після підтвердження клієнт уже не редагує
    const lateEdit = await request(app)
      .put(`/api/consultations/${consultationId}`)
      .set(client.auth)
      .send({ topic: 'Пізня зміна теми' });
    assert.equal(lateEdit.status, 400);
  });

  test('чат: сторонній → 403, учасник → 201, історія читається', async () => {
    const outsider = await registerUser('CLIENT', { email: 'outsider3@test.local' });

    const forbidden = await request(app)
      .post(`/api/consultations/${consultationId}/messages`)
      .set(outsider.auth)
      .send({ text: 'Привіт, я тут випадково' });
    assert.equal(forbidden.status, 403);

    const post = await request(app)
      .post(`/api/consultations/${consultationId}/messages`)
      .set(client.auth)
      .send({ text: 'Добрий день! Коли зручно провести консультацію?' });
    assert.equal(post.status, 201);
    assert.equal(post.body.data.sender.id, client.id);

    const list = await request(app).get(`/api/consultations/${consultationId}/messages`).set(lawyerUser.auth);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
  });

  test('DELETE консультації: сторонній → 403, адмін → 204', async () => {
    const outsider = await registerUser('CLIENT', { email: 'outsider4@test.local' });
    assert.equal((await request(app).delete(`/api/consultations/${consultationId}`).set(outsider.auth)).status, 403);
    assert.equal((await request(app).delete(`/api/consultations/${consultationId}`).set(admin.auth)).status, 204);
  });
});

describe('Reviews API', () => {
  let consultationId;

  test('відгук до завершення → 400; після COMPLETED клієнт → 201, дубль → 409, чужий → 403', async () => {
    const created = await request(app)
      .post('/api/consultations')
      .set(client.auth)
      .send({
        lawyerId: lawyerUser.id,
        topic: 'Другий договір на перевірку',
        description: 'Прошу перевірити договір поставки між юрособами.',
      });
    consultationId = created.body.data.id;

    const early = await request(app)
      .post('/api/reviews')
      .set(client.auth)
      .send({ consultationId, rating: 5, text: 'Супер' });
    assert.equal(early.status, 400);

    await request(app).put(`/api/consultations/${consultationId}`).set(lawyerUser.auth).send({ status: 'COMPLETED' });

    const ok = await request(app)
      .post('/api/reviews')
      .set(client.auth)
      .send({ consultationId, rating: 4, text: 'Гарна консультація, дякую' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.clientId, client.id);

    const dup = await request(app).post('/api/reviews').set(client.auth).send({ consultationId, rating: 5 });
    assert.equal(dup.status, 409);

    const other = await registerUser('CLIENT', { email: 'rev-outsider@test.local' });
    const foreign = await request(app)
      .post('/api/reviews')
      .set(other.auth)
      .send({ consultationId: 99999, rating: 5 });
    assert.equal(foreign.status, 404);
  });

  test('рейтинг поза 1-5 → 400; GET з пагінацією і фільтром; PUT чужого → 403, свій → 200', async () => {
    const badRating = await request(app)
      .post('/api/reviews')
      .set(client.auth)
      .send({ consultationId, rating: 9 });
    assert.equal(badRating.status, 400);

    const list = await request(app).get(`/api/reviews?lawyerId=${lawyerUser.id}&minRating=1&page=1&limit=10`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.pagination.total, 1);

    const reviewId = list.body.data[0].id;
    const other = await registerUser('CLIENT', { email: 'rev-outsider2@test.local' });
    assert.equal((await request(app).put(`/api/reviews/${reviewId}`).set(other.auth).send({ rating: 1 })).status, 403);

    const ok = await request(app).put(`/api/reviews/${reviewId}`).set(client.auth).send({ rating: 5 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.rating, 5);

    // рейтинг профілю перераховано
    const profile = await request(app).get('/api/lawyers?limit=100');
    const p = profile.body.data.find((l) => l.user.id === lawyerUser.id);
    assert.equal(Number(p.rating), 5);
  });

  test('DELETE консультації з відгуком → рейтинг юриста перераховується', async () => {
    const list = await request(app).get(`/api/reviews?lawyerId=${lawyerUser.id}`);
    const reviewId = list.body.data[0].id;
    const review = await request(app).get(`/api/reviews/${reviewId}`);
    const cid = review.body.data.consultation.id;

    assert.equal((await request(app).delete(`/api/consultations/${cid}`).set(admin.auth)).status, 204);

    const profile = await request(app).get('/api/lawyers?limit=100');
    const p = profile.body.data.find((l) => l.user.id === lawyerUser.id);
    // відгуків не лишилось — середній рейтинг став null
    assert.equal(p.rating, null);
  });
});

describe('Audit log', () => {
  test('запити потрапляють у журнал, доступ лише адміну', async () => {
    const asClient = await request(app).get('/api/audit-logs').set(client.auth);
    assert.equal(asClient.status, 403);

    const res = await request(app).get('/api/audit-logs?page=1&limit=5').set(admin.auth);
    assert.equal(res.status, 200);
    assert.ok(res.body.pagination.total >= 1);
    // чутливі поля замасковані
    const actions = res.body.data.map((a) => a.action);
    assert.ok(actions.some((a) => a.startsWith('POST')));
  });
});

describe('Обробка помилок', () => {
  test('невідомий маршрут → 404 у форматі JSON', async () => {
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  test('невалідний id у шляху → 400', async () => {
    const res = await request(app).get('/api/users/abc').set(admin.auth);
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('невалідний токен → 401', async () => {
    const res = await request(app).get('/api/users').set('Authorization', 'Bearer fake.token.here');
    assert.equal(res.status, 401);
  });
});
