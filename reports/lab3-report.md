# Звіт з лабораторної роботи №3

**Дисципліна:** вебтехнології та розробка вебзастосунків
**Тема:** Взаємодія в реальному часі та фіналізація серверної частини
**Предметна область:** онлайн-платформа для юридичних консультацій
**Виконав:** Чернік Михайло Богданович, група ІПЗ-41, ВФК НУХТ
**Викладач:** Юхта О.А.
**Репозиторій:** https://github.com/mishachernika/legal-consult-api-lr03
**Розгортання:** підготовлено через `render.yaml` (Render Blueprint); для фактичного розгортання потрібні власний акаунт Render і змінні `DATABASE_URL` / `FRONTEND_URL`. Інструкція та обмеження free tier — у `docs/deployment.md`. Локально: `http://localhost:3000`.

---

## 1. Мета роботи

Здобути практичні навички впровадження обміну даними в реальному часі у вебзастосунки з використанням WebSocket (Socket.io), оптимізувати роботу з базою даних, провести комплексне тестування та підготувати розгортання серверної частини на безкоштовному хостингу.

## 2. Завдання

**Що обрано для real-time у предметній області:** чат консультацій (нові повідомлення), зміна статусів консультацій, нові відгуки, нові консультації, онлайн-статус користувачів, персональні сповіщення.

**Рівень 1** — виконано: Socket.io інтегровано (`src/socket/index.js`, піднімається в `server.js` поверх `http.Server`); базове WS-підключення; кімнати (`user:<id>`, `consultation:<id>`); real-time для основної сутності (повідомлення чату `message:new` + статуси консультацій); базові сповіщення; оптимізація БД (індекси + EXPLAIN ANALYZE, кеш); підготовка до деплою (Render blueprint + документація). Фактичний зовнішній деплой виконується після надання облікових даних хостингу.

**Рівень 2** — виконано: автентифікація WS через JWT (`io.use` + `handshake.auth.token`, без токена — `connect_error: unauthorized`); персональні сповіщення з типами (`CONSULTATION_CREATED`, `MESSAGE_NEW`, `REVIEW_NEW`, …) і пріоритетами (`LOW/NORMAL/HIGH`), зберігаються в БД (`Notification`) + REST API + real-time у `user:<id>`; real-time для всіх основних сутностей (consultations, messages, reviews, lawyers); онлайн-статус (`presence:update`, `GET /api/users/online`); reconnection з відновленням пропущених подій (outbox `EventOutbox` + `lastEventId` → `events:replay`); комплексна оптимізація: індекси, eager loading (`include` вже всюди), пагінація, кеш із інвалідацією.

**Рівень 3** — виконано частково: Redis-адаптер Socket.io при `REDIS_URL` (перевірено локально з `redis-server`: у логу «увімкнено Redis-адаптер»); rate limiting подій WS (30/10 с на socket → `ws:error RATE_LIMITED`); in-process черга фонових задач (`src/utils/queue.js`: аудит-лог, очищення outbox); кеш у пам'яті або Redis (`REDIS_URL`); метрики та моніторинг (`GET /metrics`: лічильники HTTP/WS/подій/сповіщень/черг, gauge `onlineUsers`, uptime); автомасштабування — описано в документації (free tier Render його не підтримує); детальна документація WebSocket API — у README (таблиці подій) і в цьому звіті.

## 3. Хід роботи

1. **Socket.io інтеграція.** `npm i socket.io`, dev: `socket.io-client`. `src/socket/index.js`: `initSocket(httpServer)` — CORS за `FRONTEND_URL`, middleware автентифікації JWT, при `connection` — персональна кімната `user:<id>`, присутність, replay за `lastEventId`, rate limit на socket, `consultation:join/leave` із перевіркою учасника через БД (ack `{ok:false}` для стороннього). `server.js` створює `httpServer = createServer(app)` і піднімає socket на тому ж порту.
2. **Outbox + еміти.** `src/socket/emitter.js`: `publishEvent(room, event, payload)` спочатку пише подію в `EventOutbox` (автоінкрементний `id` = порядковий номер), потім розсилає в кімнату (подія містить `id`). Контролери (consultation/message/review/lawyer) публікують події при кожній зміні. Replay: при підключенні з `auth.lastEventId` сервер вибирає з outbox події `id > lastEventId` у кімнатах користувача (персональна + кімнати його консультацій) і шле `events:replay`.
3. **Сповіщення.** Модель `Notification` (type, priority, title, body, data, readAt) + `notificationService.createNotification` (БД + `notification:new` у `user:<id>`) + REST `/api/notifications` (список з пагінацією і `?unread=true`, `/:id/read`, `/read-all`, DELETE). Події: нова консультація → юристу (HIGH), нове повідомлення → другому учаснику, новий відгук → юристу, зміна статусу → другій стороні.
4. **Присутність.** `src/socket/presence.js`: `Map<userId, Set<socketId>>`; при connect/disconnect розсилається `presence:update`; REST `GET /api/users/online`.
5. **Оптимізація БД.** Лог повільних запитів: `PRISMA_LOG_QUERY=1` у `db.js`. Діагностика через `EXPLAIN ANALYZE` у psql (20 000 демо-рядків): до індексів — `Seq Scan` (Notification: 3.26 мс, EventOutbox: 0.22 мс на LIMIT 100); після міграції `add-realtime-indexes` (`@@index([room, id])`, `@@index([userId, readAt])`, `@@index([createdAt])`) — `Index Scan` (0.07 мс і 0.03 мс відповідно). Логи: `reports/screenshots/lab3-explain-before.txt` / `lab3-explain-after.txt`. N+1 немає — усі списки йдуть з `include` (Prisma робить фіксовану кількість запитів); усі списки мають пагінацію; додано кеш із TTL (catalog lawyers 30 с, specializations 60 с) з версійною інвалідацією при мутаціях; у пам'яті процесу або в Redis при `REDIS_URL`.
6. **Черги та метрики.** `src/utils/queue.js` — in-process черга (аудит-лог пишемо туди, outbox чистимо раз на годину); `src/utils/metrics.js` + middleware лічильників + `GET /metrics` (ADMIN): uptime, `httpRequestsTotal`, `wsConnections`, `wsEvents`, `wsRateLimited`, `eventsPublished`, `notificationsSent`, `queueEnqueued/Processed`, gauge `onlineUsers`, стан черг.
7. **Тести.** `tests/socket.test.js` (піднімає `httpServer` на порту 0): відхилення без токена, кімнати (учасник ок / сторонній forbidden), `message:new` у кімнату після REST POST + запис в outbox + сповіщення, replay після «втрати» з'єднання, WS rate limit, presence. `tests/notifications.test.js`: REST сповіщень. Усього **58 тестів, усі green**.
8. **Деплой.** `render.yaml` (Blueprint: build `npm ci && npx prisma generate`, preDeploy `npx prisma migrate deploy`, start `node src/server.js`, health check `/health`, секрети `generateValue`), `docs/deployment.md` — кроки й обмеження free tier (засинання 15 хв, тимчасова файлова система, БД 30 днів → Neon/Supabase, sticky sessions/Redis-адаптер для кількох інстансів, автомасштабування на платних тарифах). Конфігурацію перевірено локально; для створення зовнішнього сервісу необхідні облікові дані Render.

## 4. Схема БД (нове у ЛР03)

```prisma
model Notification {
  id        Int                  @id @default(autoincrement())
  userId    Int
  type      NotificationType     // CONSULTATION_CREATED, CONSULTATION_UPDATED, CONSULTATION_CANCELLED, MESSAGE_NEW, REVIEW_NEW, SYSTEM
  priority  NotificationPriority @default(NORMAL) // LOW, NORMAL, HIGH
  title     String
  body      String?
  data      Json?
  readAt    DateTime?
  createdAt DateTime             @default(now())
  user      User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt, createdAt(sort: Desc)]) // непрочитані користувача, свіжі спочатку
  @@index([createdAt])
}

model EventOutbox {              // outbox real-time подій (порядковий id для replay)
  id        BigInt   @id @default(autoincrement())
  event     String
  room      String
  payload   Json
  createdAt DateTime @default(now())
  @@index([room, id])            // replay: події кімнати після lastEventId
}
```

Міграції: `add-notifications-outbox`, `add-realtime-indexes`.

## 5. Ключові лістинги

`src/socket/index.js` (фрагмент — auth, кімнати, rate limit, replay):

```js
io.use((socket, next) => {
  try {
    socket.user = verifyAccessToken(socket.handshake.auth?.token ?? '');
    next();
  } catch { next(new Error('unauthorized')); }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.userId}`);          // персональні сповіщення
  addConnection(socket.user.userId, socket.id);       // presence
  io.emit('presence:update', { userId: socket.user.userId, online: true });

  const lastEventId = Number(socket.handshake.auth?.lastEventId ?? 0);
  if (lastEventId > 0) void replayMissedEvents(socket, socket.user.userId, lastEventId);

  let windowStart = Date.now(), count = 0;            // WS rate limit: 30 подій / 10 с
  socket.use((packet, next) => {
    if (++count > WS_RATE_LIMIT) { socket.emit('ws:error', { code: 'RATE_LIMITED' }); return; }
    next();
  });

  socket.on('consultation:join', async (id, ack) => { /* перевірка учасника через БД */ });
});
```

`src/socket/emitter.js` — outbox-патерн:

```js
export async function publishEvent(room, event, payload = {}) {
  const row = await prisma.eventOutbox.create({ data: { event, room, payload } });
  const data = { id: String(row.id), ...payload };
  if (room === '') getIo().emit(event, data); else getIo().to(room).emit(event, data);
  return row;
}
```

`src/utils/cache.js` — кеш із версійною інвалідацією (пам'ять або Redis):

```js
export async function cacheWrap(namespace, rawKey, ttlSeconds, fn) { /* get → miss → fn → set EX ttl */ }
export async function cacheInvalidate(namespace) { /* incr версії namespace */ }
```

## 6. Тестування

| Файл у `reports/screenshots/` | Що на ньому |
|---|---|
| `lab3-terminal-ws.png` | **знімок вікна Terminal.app**: `node scripts/ws-demo.mjs` — відхилення без токена, `consultation:join`, real-time `message:new` обом учасникам після REST POST, `notification:new`, `presence:update`, replay (`events:replay` із пропущеними подіями), `GET /api/users/online` |
| `lab3-terminal-npm-test.png` | **знімок вікна Terminal.app**: `npm test` — **tests 58, pass 58, fail 0** |
| `lab3-terminal-metrics.png` | **знімок вікна Terminal.app**: `GET /metrics` адміном — лічильники, черги, `onlineUsers` |
| `lab3-swagger.png` | Swagger UI `/api-docs` (група Notifications теж) |
| `lab3-ws-demo.txt`, `lab3-smoke.txt` (33/33 PASS), `lab3-npm-test.txt`, `lab3-metrics.txt` | ті самі виводи текстом |
| `lab3-explain-before.txt` / `lab3-explain-after.txt` | `EXPLAIN ANALYZE` до і після індексів: `Seq Scan` (3.26 мс / 0.22 мс) → `Index Scan` (0.03 мс / 0.07 мс) |

Сценарії socket-тестів: unauthorized connect; join room як учасник/сторонній; REST POST message → `message:new` у кімнаті + outbox + сповіщення; reconnect із `lastEventId` → `events:replay`; 40 подій → `ws:error RATE_LIMITED`; disconnect → `presence:update online=false`. Локально перевірено і з Redis (`REDIS_URL=redis://localhost:6379`): сервер логує «увімкнено Redis-адаптер».

## 7. Контрольні питання

1. **WebSocket vs HTTP/polling.** HTTP — запит-відповідь, кожен запит нове з'єднання (з keep-alive — довше, але все одно ініціює клієнт); polling — клієнт постійно опитує сервер, більшість відповідей порожні. WebSocket (RFC 6455) — один TCP-канал, повний дуплекс: після рукостискання `Upgrade: 101` сервер може писати клієнту будь-коли, з малою затримкою і без зайвих заголовків. Виправданий, коли потрібні push-події (чат, сповіщення, статуси) — у нас це чат консультацій і статуси; для звичайних CRUD достатньо HTTP.
2. **Socket.io vs чистий WebSocket.** Socket.io — надбудова: власний протокол поверх WebSocket, автоматичний фолбек на HTTP long-polling, автоматичний reconnection, кімнати/namespaces, acks, бінарні дані. Тому клієнт `socket.io-client` не підключиться до «голого» WS-сервера — несумісні протоколи. У проєкті: `socket.io` на сервері, `socket.io-client` у тестах/демо.
3. **Rooms vs namespaces.** Namespace — окрема «точка входу» (окремий URL-шлях `/admin` зі своїми middleware), rooms — довільні канали всередині одного namespace, куди socket вступає через `join`. У нас один namespace, а кімнати — за сутностями: `user:<id>` (персональні сповіщення) і `consultation:<id>` (чат/статуси консультації, вступ лише для учасників).
4. **Автентифікація WS.** При handshake клієнт передає `auth.token` (access JWT); middleware `io.use` перевіряє підпис і кладе payload у `socket.user`, без валідного токена — `connect_error: unauthorized`. Access-токен живе 15 хв: після спливу чинне з'єднання **не розриваємо** примусово, а нові підключення з протерміченим токеном відхиляються — клієнт оновлює пару токенів через `POST /api/auth/refresh` і перепідключається з новим `auth.token` (Socket.io reconnection це робить сам).
5. **Відновлення стану після reconnect.** У нас — outbox-патерн: кожна real-time подія спочатку пишеться в таблицю `EventOutbox` з автоінкрементним `id`, і цей `id` приходить у кожній події клієнту. Клієнт зберігає `lastEventId`, а при перепідключенні передає його в `auth.lastEventId` — сервер вибирає з outbox події з `id > lastEventId` у кімнатах, доступних користувачу (його `user:<id>` + кімнати його консультацій), і надсилає `events:replay`. Пропущені: повідомлення чату, зміни статусів, сповіщення — все, що сталося офлайн. Outbox чиститься раз на годину (події старші 24 год).
6. **B-tree індекс.** Це збалансоване дерево: листя відсортовані й зв'язані, тому пошук за діапазоном/рівністю — O(log n) читань замість повного скану. Колонки обирали за реальними запитами: фільтри (`userId`, `room`), сортування (`createdAt DESC`, `id`), join (зовнішні ключі вже індексовані в ЛР01). Ціна: повільніший запис і місце на диску — тому індексуємо лише те, що справді використовується.
7. **N+1.** Один запит за список + N запитів за пов'язані дані кожного елемента. У Prisma `include`/`select` роблять фіксовану кількість запитів (окремий запит на кожну relation, а не на запис), тому N+1 у класичному вигляді немає; пов'язані дані завантажуємо eager (`include` у моделях). Пагінація + `Promise.all([findMany, count])` у `findPage` — два запити замість багатьох.
8. **EXPLAIN ANALYZE** показує реальний план виконання запиту з фактичним часом і кількістю рядків. `Seq Scan` — послідовне читання всієї таблиці; `Index Scan` — читання через індекс (рази швидше на великих таблицях). У нас: до індексів `Seq Scan` на `Notification`/`EventOutbox` (3.26 мс), після `@@index([userId, readAt])` / `@@index([room, id])` — `Index Scan` (0.03–0.07 мс), логи в `lab3-explain-*.txt`.
9. **Redis-адаптер.** При кількох інстансах сервера подія, опублікована на одному, не дійде до socketів, підключених до іншого, — потрібен спільний транспорт: Redis pub/sub (адаптер) розсилає події між інстансами. Тому потрібні sticky sessions: балансувальник має направляти всі запити одного клієнта (включно з long-polling фолбеком) на один інстанс, інакше handshake і наступні пакети роз'їдуться по різних серверах. У нас: при `REDIS_URL` вмикається `@socket.io/redis-adapter` (перевірено локально), Render дає sticky sessions автоматично для WebSocket.
10. **Обмеження free tier Render (враховані в `docs/deployment.md`):** засинання після 15 хв без запитів (холодний старт до ~60 с; WS розривається — компенсуємо reconnection + replay через outbox); тимчасова файлова система (Multer-файли зникають після redeploy — для продакшну S3/R2); безкоштовна БД Render живе 30 днів — тому `DATABASE_URL` беремо з Neon/Supabase (free, безстроково). `prisma migrate deploy` на відміну від `migrate dev` лише застосовує готові міграції без інтерактиву й без зміни схеми — тому використовується на сервері (preDeployCommand), а `migrate dev` — лише локально.

## 8. Висновки

Серверна частина стала real-time: Socket.io з JWT-автентифікацією, кімнатами консультацій і персональними кімнатами, outbox-патерном для відновлення прикладних подій після перепідключення, сповіщеннями з типами/пріоритетами в БД + REST + WS, онлайн-статусом, WS rate limiting. БД оптимізовано індексами (EXPLAIN ANALYZE до/після у звіті), N+1 немає, є кеш із інвалідацією. Додано чергу фонових задач і метрики (`/metrics`). Розгортання підготовлено як Render Blueprint (`render.yaml`) із документацією обмежень free tier; Redis-адаптер і спільний кеш вмикаються змінною `REDIS_URL` (перевірено локально). 58 тестів green, smoke 33/33, WS-демо з двома клієнтами — у скріншотах. Для зовнішнього запуску лишається створити сервіс у власному акаунті Render (New → Blueprint) та вказати `DATABASE_URL`/`FRONTEND_URL`; після цього застосунок буде доступний за URL сервісу, а WebSocket — на тому самому URL.
