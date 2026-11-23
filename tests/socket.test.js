import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import app from '../src/app.js';
import { initSocket } from '../src/socket/index.js';
import { prisma } from '../src/db.js';
import { registerUser, wipeDatabase } from './helpers.js';

let httpServer;
let io;
let url;
const clients = [];

function client(token, extraAuth = {}) {
  const c = connect(url, { auth: { token, ...extraAuth }, reconnection: false, forceNew: true });
  clients.push(c);
  return c;
}

before(async () => {
  await wipeDatabase();
  httpServer = createServer(app);
  io = await initSocket(httpServer);
  httpServer.listen(0);
  await once(httpServer, 'listening');
  url = `http://localhost:${httpServer.address().port}`;
});

after(async () => {
  clients.forEach((c) => c.close());
  await io.close();
  httpServer.close();
  await wipeDatabase();
  await prisma.$disconnect();
});

describe('WebSocket (Socket.io)', () => {
  let clientUser, lawyerUser, outsider, consultationId;

  before(async () => {
    clientUser = await registerUser('CLIENT', { email: 'ws-client@test.local' });
    lawyerUser = await registerUser('CLIENT', { email: 'ws-lawyer@test.local' });
    outsider = await registerUser('CLIENT', { email: 'ws-outsider@test.local' });

    // профіль юриста + консультація від клієнта
    await request(app)
      .post('/api/lawyers')
      .set(lawyerUser.auth)
      .send({ userId: lawyerUser.id, pricePerHour: 600 });
    const cons = await request(app)
      .post('/api/consultations')
      .set(clientUser.auth)
      .send({
        lawyerId: lawyerUser.id,
        topic: 'WS: перевірка договору',
        description: 'Потрібна консультація щодо умов договору поставки.',
      });
    consultationId = cons.body.data.id;
  });

  test('підключення без токена → connect_error unauthorized', async () => {
    const c = client('');
    const [err] = await once(c, 'connect_error');
    assert.equal(err.message, 'unauthorized');
  });

  test('підключення з токеном → connect, присутність, персональна кімната', async () => {
    const c = client(clientUser.tokens.accessToken);
    await once(c, 'connect');
    assert.ok(c.id);

    const online = await request(app).get('/api/users/online').set(clientUser.auth);
    assert.equal(online.status, 200);
    assert.ok(online.body.data.includes(clientUser.id));
  });

  test('consultation:join — учасник ок, сторонній → ok:false', async () => {
    const c = client(clientUser.tokens.accessToken);
    await once(c, 'connect');
    const ack = await c.emitWithAck('consultation:join', consultationId);
    assert.deepEqual(ack, { ok: true });

    const out = client(outsider.tokens.accessToken);
    await once(out, 'connect');
    const ackOut = await out.emitWithAck('consultation:join', consultationId);
    assert.equal(ackOut.ok, false);
    out.close(); // не лишаємо стороннього онлайн для наступних тестів
  });

  test('POST /messages (REST) → подія message:new у кімнаті + outbox + сповіщення адресату', async () => {
    const c = client(clientUser.tokens.accessToken);
    await once(c, 'connect');
    await c.emitWithAck('consultation:join', consultationId);

    const got = once(c, 'message:new');
    const res = await request(app)
      .post(`/api/consultations/${consultationId}/messages`)
      .set(lawyerUser.auth)
      .send({ text: 'Добрий день! Так, можемо зустрітись.' });
    assert.equal(res.status, 201);

    const [event] = await got;
    assert.equal(event.message.text, 'Добрий день! Так, можемо зустрітись.');
    assert.ok(event.id, 'у події є порядковий id з outbox');

    // подія збережена в outbox
    const rows = await prisma.eventOutbox.findMany({ where: { event: 'message:new' } });
    assert.ok(rows.length >= 1);
    // сповіщення створено для клієнта (адресат повідомлення від юриста)
    const notes = await prisma.notification.findMany({ where: { userId: clientUser.id, type: 'MESSAGE_NEW' } });
    assert.ok(notes.length >= 1);
  });

  test('replay: перепідключення з lastEventId → events:replay із пропущеними подіями', async () => {
    const c1 = client(clientUser.tokens.accessToken);
    await once(c1, 'connect');
    await c1.emitWithAck('consultation:join', consultationId);

    const got = once(c1, 'message:new');
    await request(app)
      .post(`/api/consultations/${consultationId}/messages`)
      .set(lawyerUser.auth)
      .send({ text: 'Перше повідомлення' });
    const [first] = await got;
    c1.close();

    // поки клієнт офлайн — ще одне повідомлення
    await request(app)
      .post(`/api/consultations/${consultationId}/messages`)
      .set(lawyerUser.auth)
      .send({ text: 'Друге, пропущене повідомлення' });

    const c2 = client(clientUser.tokens.accessToken, { lastEventId: Number(first.id) });
    const [replay] = await once(c2, 'events:replay');
    assert.ok(Array.isArray(replay));
    assert.ok(replay.some((e) => e.event === 'message:new' && e.payload.message.text === 'Друге, пропущене повідомлення'));
  });

  test('rate limiting подій WebSocket: після 30 подій за 10 с → ws:error RATE_LIMITED', async () => {
    const c = client(clientUser.tokens.accessToken);
    await once(c, 'connect');
    const limited = once(c, 'ws:error');
    for (let i = 0; i < 40; i++) {
      c.emit('consultation:join', consultationId);
    }
    const [err] = await limited;
    assert.equal(err.code, 'RATE_LIMITED');
  });

  test('presence:update — відключення позначає користувача офлайн', async () => {
    const temp = await registerUser('CLIENT', { email: 'ws-presence@test.local' });
    const c = client(temp.tokens.accessToken);
    await once(c, 'connect');
    assert.ok((await request(app).get('/api/users/online').set(clientUser.auth)).body.data.includes(temp.id));
    c.close();
    await new Promise((r) => setTimeout(r, 300));
    const online = await request(app).get('/api/users/online').set(clientUser.auth);
    assert.ok(!online.body.data.includes(temp.id));
  });
});
