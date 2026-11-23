import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/db.js';
import { registerUser, wipeDatabase } from './helpers.js';

// мінімальний валідний PNG (заголовок)
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

before(() => wipeDatabase());
after(async () => {
  await wipeDatabase();
  await prisma.$disconnect();
});

describe('Files API', () => {
  test('upload без токена → 401', async () => {
    assert.equal((await request(app).post('/api/files/upload')).status, 401);
  });

  test('завантаження PNG → 201, отримання файлу → 200, чужий delete → 403, свій → 200', async () => {
    const owner = await registerUser('CLIENT', { email: 'files-owner@example.com' });
    const other = await registerUser('CLIENT', { email: 'files-other@example.com' });

    const ok = await request(app)
      .post('/api/files/upload')
      .set(owner.auth)
      .attach('file', png, { filename: 'doc.png', contentType: 'image/png' });
    assert.equal(ok.status, 201);
    const fileId = ok.body.file.id;
    assert.equal(ok.body.file.uploadedBy, owner.id);
    // серверний шлях на диску не віддаємо
    assert.equal(ok.body.file.path, undefined);

    // отримати файл може будь-хто (публічний ендпоінт)
    const get = await request(app).get(`/api/files/${fileId}`);
    assert.equal(get.status, 200);

    // чужий користувач не може видалити
    const forbidden = await request(app).delete(`/api/files/${fileId}`).set(other.auth);
    assert.equal(forbidden.status, 403);

    // власник може
    const del = await request(app).delete(`/api/files/${fileId}`).set(owner.auth);
    assert.equal(del.status, 200);
    assert.equal((await request(app).get(`/api/files/${fileId}`)).status, 404);
  });

  test('.exe відхиляється (MIME + розширення), завеликий файл → 400 «Файл занадто великий»', async () => {
    const u = await registerUser('CLIENT', { email: 'files-bad@example.com' });

    const bad = await request(app)
      .post('/api/files/upload')
      .set(u.auth)
      .attach('file', png, { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    assert.equal(bad.status, 400);

    // підроблений MIME: .png з image/png ок, а .exe з image/png — ні
    const spoofed = await request(app)
      .post('/api/files/upload')
      .set(u.auth)
      .attach('file', png, { filename: 'a.exe', contentType: 'image/png' });
    assert.equal(spoofed.status, 400);

    const big = await request(app)
      .post('/api/files/upload')
      .set(u.auth)
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' });
    assert.equal(big.status, 400);
    assert.equal(big.body.error, 'Файл занадто великий');
  });

  test('підроблений вміст: .png із начинкою exe → 400 (магічні байти)', async () => {
    const u = await registerUser('CLIENT', { email: 'files-magic@example.com' });
    const exeContent = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), Buffer.alloc(64)]);

    const res = await request(app)
      .post('/api/files/upload')
      .set(u.auth)
      .attach('file', exeContent, { filename: 'fake.png', contentType: 'image/png' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('магічних байтів'));

    // у відповіді /my порожньо — файл не зберігся
    const my = await request(app).get('/api/files/my').set(u.auth);
    assert.equal(my.body.pagination.total, 0);
  });

  test('upload-multiple: кілька файлів одразу (files[]), /my повертає пагінований список', async () => {
    const u = await registerUser('CLIENT', { email: 'files-multi@example.com' });

    const res = await request(app)
      .post('/api/files/upload-multiple')
      .set(u.auth)
      .attach('files', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('files', png, { filename: 'b.png', contentType: 'image/png' });
    assert.equal(res.status, 201);
    assert.equal(res.body.files.length, 2);

    const my = await request(app).get('/api/files/my?page=1&limit=10').set(u.auth);
    assert.equal(my.status, 200);
    assert.equal(my.body.data.length, 2);
    assert.equal(my.body.pagination.total, 2);
    assert.equal(my.body.pagination.page, 1);
  });

  test('файли консультації: учасник бачить, сторонній → 403; прив’язка чужої консультації → 403', async () => {
    const client = await registerUser('CLIENT', { email: 'cf-client@example.com' });
    const lawyerUser = await registerUser('CLIENT', { email: 'cf-lawyer@example.com' });
    const outsider = await registerUser('CLIENT', { email: 'cf-outsider@example.com' });

    // створюємо профіль юриста для lawyerUser
    const spec = await request(app)
      .post('/api/specializations')
      .set((await registerUser('ADMIN', { email: 'cf-admin@example.com' })).auth)
      .send({ name: 'Цивільне право' });
    assert.equal(spec.status, 201);

    const profile = await request(app)
      .post('/api/lawyers')
      .set(lawyerUser.auth)
      .send({ userId: lawyerUser.id, pricePerHour: 500, specializationIds: [spec.body.data.id] });
    assert.equal(profile.status, 201);

    const consultation = await request(app)
      .post('/api/consultations')
      .set(client.auth)
      .send({
        lawyerId: lawyerUser.id,
        topic: 'Консультація з договором',
        description: 'Потрібна перевірка договору купівлі-продажу квартири.',
      });
    assert.equal(consultation.status, 201);
    const cid = consultation.body.data.id;

    // сторонній не може прикріпити файл до чужої консультації
    const forbidden = await request(app)
      .post('/api/files/upload')
      .set(outsider.auth)
      .field('consultationId', String(cid))
      .attach('file', png, { filename: 'x.png', contentType: 'image/png' });
    assert.equal(forbidden.status, 403);

    // учасник може
    const ok = await request(app)
      .post('/api/files/upload')
      .set(client.auth)
      .field('consultationId', String(cid))
      .attach('file', png, { filename: 'dogovir.png', contentType: 'image/png' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.file.consultationId, cid);

    const asClient = await request(app).get(`/api/files/consultation/${cid}`).set(client.auth);
    assert.equal(asClient.status, 200);
    assert.equal(asClient.body.data.length, 1);

    const asOutsider = await request(app).get(`/api/files/consultation/${cid}`).set(outsider.auth);
    assert.equal(asOutsider.status, 403);
  });
});
