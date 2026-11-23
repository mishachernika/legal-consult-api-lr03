// Smoke-тест API проти запущеного сервера: node scripts/smoke.mjs (порт із PORT або 3000)
// Очікує, що виконано `npm run db:seed` (демо-акаунти з паролем password123).
const BASE = `http://localhost:${process.env.PORT || 3000}`;

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
  }
}

async function req(method, path, { body, token, form } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* не JSON (наприклад, 204 або вміст файлу) */
  }
  return { status: res.status, body: data };
}

async function main() {
  console.log(`Smoke-тест проти ${BASE}\n`);

  const health = await req('GET', '/health');
  check('GET /health → 200 ok', health.status === 200 && health.body.status === 'ok');

  // публічний каталог
  const lawyers = await req('GET', '/api/lawyers?sortBy=pricePerHour&order=asc');
  check('GET /api/lawyers → пагінований список, сортування за ціною', lawyers.status === 200 && lawyers.body.data.length >= 3);
  const lawyer = lawyers.body.data[0];
  console.log(`  перший у списку: ${lawyer.user.name}, ${Number(lawyer.pricePerHour)} грн/год, сфер: ${lawyer.specializations.length}`);

  const specs = await req('GET', '/api/specializations');
  check('GET /api/specializations → довідник сфер права', specs.status === 200 && specs.body.data.length >= 5);

  // реєстрація + вхід
  const suffix = Date.now();
  const clientEmail = `smoke.${suffix}@example.com`;
  const reg = await req('POST', '/api/auth/register', {
    body: { email: clientEmail, password: 'smokepassword123', name: 'Smoke Тестовий' },
  });
  check('POST /api/auth/register → 201 + пара токенів, без пароля у відповіді',
    reg.status === 201 && !!reg.body.tokens?.accessToken && reg.body.user.password === undefined);
  const clientToken = reg.body.tokens.accessToken;
  const clientRefresh = reg.body.tokens.refreshToken;
  const clientId = reg.body.user.id;

  const badLogin = await req('POST', '/api/auth/login', { body: { email: clientEmail, password: 'wrongwrong' } });
  check('POST /api/auth/login з хибним паролем → 401', badLogin.status === 401);

  const refreshed = await req('POST', '/api/auth/refresh', { body: { refreshToken: clientRefresh } });
  check('POST /api/auth/refresh → ротація: новий refresh токен', refreshed.status === 200 && refreshed.body.tokens.refreshToken !== clientRefresh);
  const reuse = await req('POST', '/api/auth/refresh', { body: { refreshToken: clientRefresh } });
  check('повторне використання старого refresh токена → 401', reuse.status === 401);

  // вхід демо-акаунтами з seed
  const admin = await req('POST', '/api/auth/login', { body: { email: 'admin@legal.ua', password: 'password123' } });
  check('вхід адміном (admin@legal.ua / password123) → 200', admin.status === 200);
  const adminToken = admin.body.tokens.accessToken;

  const lawyerLogin = await req('POST', '/api/auth/login', { body: { email: lawyer.user.email, password: 'password123' } });
  check(`вхід юристом (${lawyer.user.email}) → 200`, lawyerLogin.status === 200);
  const lawyerToken = lawyerLogin.body.tokens.accessToken;

  // захист маршрутів
  const noToken = await req('GET', '/api/users');
  check('GET /api/users без токена → 401', noToken.status === 401);
  const usersClient = await req('GET', '/api/users', { token: clientToken });
  check('GET /api/users клієнтом → 403 (email/телефони всіх бачить лише адмін)', usersClient.status === 403);
  const users = await req('GET', '/api/users?page=1&limit=5', { token: adminToken });
  check('GET /api/users адміном → 200, пагінація, без паролів',
    users.status === 200 && Array.isArray(users.body.data) && users.body.pagination && users.body.data.every((u) => u.password === undefined));

  // консультація: клієнт створює для себе
  const cons = await req('POST', '/api/consultations', {
    token: clientToken,
    body: {
      lawyerId: lawyer.user.id,
      topic: 'Smoke: перевірка договору',
      description: 'Потрібна консультація щодо умов договору поставки товару.',
    },
  });
  check('POST /api/consultations (клієнт, без clientId) → 201, PENDING, ціна = ставка юриста',
    cons.status === 201 && cons.body.data.status === 'PENDING' && Number(cons.body.data.price) === Number(lawyer.pricePerHour));
  const consId = cons.body.data.id;

  const consNoToken = await req('POST', '/api/consultations', { body: { lawyerId: lawyer.user.id, topic: 'x', description: 'y' } });
  check('POST /api/consultations без токена → 401', consNoToken.status === 401);

  const consPrice = await req('POST', '/api/consultations', {
    token: clientToken,
    body: {
      lawyerId: lawyer.user.id,
      topic: 'Спроба задати ціну самому',
      description: 'Клієнт намагається передати власну ціну за консультацію.',
      price: 0,
    },
  });
  check('POST /api/consultations із price від клієнта → 403', consPrice.status === 403);

  const outsiderReg = await req('POST', '/api/auth/register', {
    body: { email: `out.${suffix}@example.com`, password: 'smokepassword123', name: 'Сторонній' },
  });
  const outsiderToken = outsiderReg.body.tokens.accessToken;

  const forbiddenGet = await req('GET', `/api/consultations/${consId}`, { token: outsiderToken });
  check('GET /api/consultations/:id стороннім → 403', forbiddenGet.status === 403);

  // статус змінює юрист
  const upd = await req('PUT', `/api/consultations/${consId}`, { token: lawyerToken, body: { status: 'CONFIRMED' } });
  check('PUT /api/consultations/:id юристом → CONFIRMED', upd.status === 200 && upd.body.data.status === 'CONFIRMED');

  const badStatus = await req('PUT', `/api/consultations/${consId}`, { token: lawyerToken, body: { status: 'WRONG' } });
  check('PUT з невалідним статусом → 400 з деталями', badStatus.status === 400 && !!badStatus.body.details?.status);

  // чат
  const msg = await req('POST', `/api/consultations/${consId}/messages`, { token: clientToken, body: { text: 'Добрий день!' } });
  check('POST /:id/messages від клієнта → 201 (sender = поточний користувач)', msg.status === 201 && msg.body.data.sender.id === clientId);
  const msgOut = await req('POST', `/api/consultations/${consId}/messages`, { token: outsiderToken, body: { text: 'Я тут випадково' } });
  check('POST /:id/messages від стороннього → 403', msgOut.status === 403);

  // файл: завантаження і валідація
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'doc.png');
  const up = await req('POST', '/api/files/upload', { token: clientToken, form });
  check('POST /api/files/upload (png) → 201, без server path у відповіді',
    up.status === 201 && up.body.file?.path === undefined);
  const fileId = up.body.file?.id;
  if (fileId) {
    const getFile = await req('GET', `/api/files/${fileId}`);
    check('GET /api/files/:id → 200 (публічно)', getFile.status === 200);
  }
  const exeForm = new FormData();
  exeForm.append('file', new Blob([png], { type: 'application/x-msdownload' }), 'virus.exe');
  const badFile = await req('POST', '/api/files/upload', { token: clientToken, form: exeForm });
  check('POST /api/files/upload (.exe) → 400', badFile.status === 400);

  // валідний .png за ім'ям/MIME, але всередині exe — відхиляє перевірка магічних байтів
  const fakeForm = new FormData();
  fakeForm.append('file', new Blob([Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(64)])], { type: 'image/png' }), 'fake.png');
  const fakeFile = await req('POST', '/api/files/upload', { token: clientToken, form: fakeForm });
  check('POST /api/files/upload (підроблений вміст) → 400 магічні байти', fakeFile.status === 400 && String(fakeFile.body.error).includes('магічних байтів'));

  // відгук після завершення
  await req('PUT', `/api/consultations/${consId}`, { token: lawyerToken, body: { status: 'COMPLETED' } });
  const review = await req('POST', '/api/reviews', { token: clientToken, body: { consultationId: consId, rating: 5, text: 'Все супер' } });
  check('POST /api/reviews після COMPLETED → 201', review.status === 201);
  const dup = await req('POST', '/api/reviews', { token: clientToken, body: { consultationId: consId, rating: 4 } });
  check('дубль відгуку → 409', dup.status === 409);

  const profile = await req('GET', `/api/lawyers/${lawyer.id}`);
  check('GET /api/lawyers/:id → рейтинг перераховано', profile.status === 200 && Number(profile.body.data.rating) === 5);

  // аудит: лише адмін
  const auditClient = await req('GET', '/api/audit-logs', { token: clientToken });
  check('GET /api/audit-logs клієнтом → 403', auditClient.status === 403);
  const auditAdmin = await req('GET', '/api/audit-logs?limit=5', { token: adminToken });
  check('GET /api/audit-logs адміном → 200 зі списком дій', auditAdmin.status === 200 && auditAdmin.body.pagination.total >= 1);

  // валідація і помилки
  const badReg = await req('POST', '/api/auth/register', { body: { email: 'not-an-email', password: 'short', name: 'A' } });
  check('POST /api/auth/register з невалідними даними → 400 з деталями', badReg.status === 400 && !!badReg.body.details);

  const notFound = await req('GET', '/api/nope');
  check('невідомий маршрут → 404 JSON', notFound.status === 404 && !!notFound.body.error);

  const badId = await req('GET', '/api/users/abc', { token: adminToken });
  check('невалідний id → 400', badId.status === 400);

  // прибирання за собою у демо-базі
  if (review.status === 201) await req('DELETE', `/api/reviews/${review.body.data.id}`, { token: adminToken });
  await req('DELETE', `/api/consultations/${consId}`, { token: adminToken });
  if (fileId) await req('DELETE', `/api/files/${fileId}`, { token: clientToken });
  await req('DELETE', `/api/users/${clientId}`, { token: adminToken });
  await req('DELETE', `/api/users/${outsiderReg.body.user.id}`, { token: adminToken });

  console.log(`\nРазом: ${passed} пройдено, ${failed} провалено`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
