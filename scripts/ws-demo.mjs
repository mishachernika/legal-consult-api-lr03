// Демо WebSocket (Socket.io) проти запущеного сервера: node scripts/ws-demo.mjs
// Потрібен seed (npm run db:seed). Показує: auth-підключення, кімнату консультації,
// real-time повідомлення з REST-запиту, сповіщення, presence і replay пропущених подій.
import { io } from 'socket.io-client';

const BASE = `http://localhost:${process.env.PORT || 3000}`;

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function log(...args) {
  console.log(...args);
}

async function main() {
  log(`WS-демо проти ${BASE}\n`);

  // 1. Вхід клієнтом (seed) і вибір його консультації
  const clientLogin = await api('POST', '/api/auth/login', { body: { email: 'olena.kovalchuk@example.com', password: 'password123' } });
  const clientToken = clientLogin.body.tokens.accessToken;
  log(`вхід: клієнт id=${clientLogin.body.user.id}`);

  const consultations = await api('GET', '/api/consultations?limit=5', { token: clientToken });
  const consultation = consultations.body.data[0];
  const consultationId = consultation.id;
  // юриста беремо з картки консультації, щоб він був її учасником
  const lawyerLogin = await api('POST', '/api/auth/login', { body: { email: consultation.lawyer.email, password: 'password123' } });
  const lawyerToken = lawyerLogin.body.tokens.accessToken;
  log(`консультація id=${consultationId} («${consultation.topic}»), юрист ${consultation.lawyer.name} (id=${lawyerLogin.body.user.id})`);

  // 2. Підключення без токена → відхилено
  await new Promise((resolve) => {
    const bad = io(BASE, { auth: {}, reconnection: false });
    bad.on('connect_error', (err) => {
      log(`підключення без токена → connect_error: ${err.message}`);
      bad.close();
      resolve();
    });
  });

  // 3. Підключення з токеном; клієнт приєднується до кімнати своєї консультації
  const client = io(BASE, { auth: { token: clientToken } });
  const lawyer = io(BASE, { auth: { token: lawyerToken } });
  await Promise.all([
    new Promise((r) => client.on('connect', r)),
    new Promise((r) => lawyer.on('connect', r)),
  ]);
  log('обидва клієнти підключені (JWT у handshake.auth.token)');

  client.on('presence:update', (p) => log(`presence:update user=${p.userId} online=${p.online}`));
  let lastId = 0;
  client.on('message:new', (e) => {
    lastId = Number(e.id);
    log(`[клієнт] message:new #${e.id}: ${e.message.text}`);
  });
  client.on('notification:new', (e) => log(`[клієнт] notification:new: ${e.notification.title} (priority=${e.notification.priority})`));
  lawyer.on('message:new', (e) => log(`[юрист] message:new #${e.id}: ${e.message.text}`));
  lawyer.on('notification:new', (e) => log(`[юрист] notification:new: ${e.notification.title}`));

  const ack = await client.emitWithAck('consultation:join', consultationId);
  log(`consultation:join ${consultationId} → ack ${JSON.stringify(ack)}`);
  await lawyer.emitWithAck('consultation:join', consultationId);

  // 4. Юрист пише через REST — обидва отримують подію real-time
  log('\nюрист надсилає повідомлення через REST POST /api/consultations/:id/messages ...');
  const msg = await api('POST', `/api/consultations/${consultationId}/messages`, {
    token: lawyerToken,
    body: { text: 'Добрий день! Так, можемо обговорити деталі договору.' },
  });
  log(`REST відповідь: ${msg.status}`);
  await new Promise((r) => setTimeout(r, 500));

  // 5. Replay: клієнт «втрачає» з'єднання, повертається з lastEventId
  client.close();
  await new Promise((r) => setTimeout(r, 300));
  await api('POST', `/api/consultations/${consultationId}/messages`, {
    token: lawyerToken,
    body: { text: 'Це повідомлення клієнт пропустив, поки був офлайн.' },
  });
  const client2 = io(BASE, { auth: { token: clientToken, lastEventId: lastId } });
  const replayPromise = new Promise((resolve) => client2.on('events:replay', resolve));
  await new Promise((r) => client2.on('connect', r));
  const events = await Promise.race([replayPromise, new Promise((r) => setTimeout(() => r([]), 1500))]);
  log(`\nreplay: перепідключення з lastEventId=${lastId} → events:replay (${events.length} подій):`);
  for (const e of events) log(`  #${e.id} ${e.event} room=${e.room} (${e.payload?.message?.text ?? ''})`);
  await new Promise((r) => setTimeout(r, 300));

  // 6. Онлайн-статус через REST
  const online = await api('GET', '/api/users/online', { token: clientToken });
  log(`\nGET /api/users/online → ${JSON.stringify(online.body.data)}`);

  client2.close();
  lawyer.close();
  log('\nготово');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
