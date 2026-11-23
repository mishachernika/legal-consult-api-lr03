# Лабораторна робота 03 — Взаємодія в реальному часі та фіналізація серверної частини (WebSocket + деплой)
## Автор

Чернік Михайло Богданович, група ІПЗ-41

REST API **онлайн-платформи юридичних консультацій**: клієнт реєструється, вибирає юриста за сферою права, замовляє консультацію, листується з юристом у чаті, прикріплює файли й після завершення лишає відгук з оцінкою.

Зроблено на Node.js 24 (ES-модулі) + Express 5, дані — PostgreSQL через Prisma 7, документація API — Swagger на `/api-docs`, тести — вбудований `node:test` + supertest.

## Що вміє API

### Real-time (ЛР03, Socket.io)

- WebSocket на тому ж порту, що й HTTP; автентифікація JWT у `handshake.auth.token` (без токена — `connect_error: unauthorized`);
- кімнати: персональна `user:<id>` (сповіщення) і `consultation:<id>` (чат/статуси; приєднатися можуть лише учасники — `consultation:join` з ack);
- real-time події для всіх основних сутностей: `consultation:created/updated/deleted`, `message:new`, `review:new/updated/deleted`, `lawyer:updated/deleted`, `notification:new`, `presence:update`;
- **outbox-патерн** для прикладних подій: подія спочатку пишеться в `EventOutbox` (порядковий `id`), а потім розсилається в кімнату; клієнт при перепідключенні передає `auth.lastEventId` і отримує `events:replay` із пропущеними подіями;
- онлайн-статус: `presence:update` + `GET /api/users/online`;
- rate limiting подій WebSocket (30 подій / 10 с на socket → `ws:error RATE_LIMITED`);
- сповіщення зберігаються в БД (`Notification`: type, priority, readAt) + REST (`/api/notifications`) + real-time у `user:<id>`;
- при `REDIS_URL` — Redis-адаптер Socket.io (горизонтальне масштабування) і спільний кеш.


### Аутентифікація та авторизація (ЛР02)

- реєстрація та вхід, паролі зберігаються лише як хеш **Argon2id** (пакет `argon2`);
- пара токенів **JWT**: короткий access (15 хв) + довгоживучий refresh (7 днів), у БД зберігається лише SHA-256 хеш refresh токена — його можна відкликати;
- **ротація** refresh токенів: кожен `/api/auth/refresh` відкликає старий і видає нову пару; повторне використання відкликаного токена відкликає **всі** сесії користувача (ознака викрадення);
- ролі `CLIENT` / `LAWYER` / `ADMIN` + middleware `authenticate` (Bearer-токен) і `authorize(...roles)`;
- зміна пароля (із перевіркою поточного), відновлення паролю через email (токен-одноразовий, у БД — хеш; без SMTP лист логується в консоль), двофакторна автентифікація **TOTP** (QR-код + код із додатку);
- захист маршрутів за ролями: наприклад, consultation редагують лише її учасники (клієнт — лише поки PENDING і може скасувати, юрист — статус/час/ціну), адмін бачить усе.

### Розширений функціонал

- **файловий сервіс** на Multer 2.x: завантаження одного або до 5 файлів одразу, перевірка MIME-типу **і** розширення разом **і «магічних байтів» вмісту**, ліміт 5 МБ, генерація унікальних імен (оригінальне ім'я не використовується як шлях), у відповідях немає серверного `path`, файли можна прикріпити до консультації;
- **пагінація** (`page`, `limit` до 100) для всіх списків, **пошук** (`search`) і **фільтри** (роль, статус, сфера, ціна, рейтинг) з білим списком сортування;
- **rate limiting** на `/api/` (100 запитів / 15 хв з IP) і посилений на `/api/auth` (10/15 хв — захист від перебору паролів), helmet, CORS із `credentials`;
- **журнал дій** (audit log): усі не-GET запити пишуться в `AuditLog` із маскуванням чутливих полів, читати може лише адмін;
- Swagger-документація всіх ендпоінтів на `/api-docs`.

### Предметна область (з ЛР01)

- каталог юристів: профіль, сфери права, ставка за годину, середній рейтинг;
- консультації зі статусами `PENDING → CONFIRMED → IN_PROGRESS → COMPLETED / CANCELLED` (ціну за замовчуванням береться зі ставки юриста);
- чат у межах консультації — лише для її учасників;
- відгук лише після завершення консультації і лише один; рейтинг юриста перераховується автоматично;
- валідація всіх вхідних даних, помилки у форматі `{ "error": "...", "details": {...} }`.

## Стек

Node.js 24 · Express 5 · Socket.io · PostgreSQL · Prisma 7 · JWT (jsonwebtoken) · Argon2id · Multer 2 · otplib + qrcode (2FA) · nodemailer · express-rate-limit · helmet · cors · Swagger · Redis (опційно) · node:test + supertest.

## База даних

12 доменних моделей: `User`, `LawyerProfile`, `Specialization`, `Consultation`, `Message`, `Review`, `File`, `RefreshToken`, `PasswordResetToken`, `AuditLog`, `Notification`, `EventOutbox` (а також службова проміжна таблиця many-to-many Prisma). У `User` — хеш пароля й TOTP-секрет; токени зберігаються лише у вигляді SHA-256 хешів.

## Як запустити у себе

Потрібні Node.js 24 і PostgreSQL.

```bash
git clone https://github.com/mishachernika/legal-consult-api-lr03.git
cd legal-consult-api-lr03
npm install

cp .env.example .env          # вказати свій DATABASE_URL і згенерувати секрети
cp .env.test.example .env.test # для тестів
# секрети: node -p "require('node:crypto').randomBytes(32).toString('hex')"

npm run db:migrate            # застосувати міграції
npx prisma generate           # згенерувати Prisma Client у src/generated
npm run db:seed               # демо-дані (пароль для всіх демо-акаунтів: password123)
npm run dev                   # сервер з автоперезапуском (node --watch)
```

- API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/api-docs`
- health-check: `GET /health`

Демо-акаунти після seed: `admin@legal.ua` (ADMIN), `ivan.petrenko@legal.ua`, `olena.shevchenko@legal.ua`, `andriy.kravchuk@legal.ua` (LAWYER), `olena.kovalchuk@example.com` та ін. (CLIENT) — пароль `password123`.

## Змінні середовища

| Змінна | Навіщо | Приклад |
|---|---|---|
| `DATABASE_URL` | підключення до PostgreSQL | `postgresql://user:pass@localhost:5432/legal_consult` |
| `PORT` | порт сервера | `3000` |
| `FRONTEND_URL` | origin фронтенду для CORS і посилань у листах | `http://localhost:5173` |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | підпис access-токенів | 64 hex-символи / `15m` |
| `REFRESH_TOKEN_SECRET` / `REFRESH_TOKEN_EXPIRES_IN` | підпис refresh-токенів | 64 hex-символи / `7d` |
| `UPLOAD_DIR` / `MAX_FILE_SIZE` | куди складати файли / ліміт розміру | `uploads` / `5242880` |
| `RATE_LIMIT` | ліміт запитів на `/api/` за 15 хв | `100` |
| `AUTH_RATE_LIMIT` | окремий посилений ліміт на `/api/auth` (login, 2FA…) за 15 хв | `10` |
| `SMTP_URL` | якщо задано — листи для скидання паролю йдуть через SMTP, інакше логуються в консоль | `smtp://user:pass@smtp.example.com:587` |

`.env` і `.env.test` не лежать у репозиторії — тільки шаблони `.env.example` / `.env.test.example`.

## Ендпоінти

| Метод | Шлях | Доступ | Що робить |
|---|---|---|---|
| POST | `/api/auth/register` | публічний | реєстрація → пара токенів |
| POST | `/api/auth/login` | публічний | вхід (+ `totp`, якщо 2FA) → пара токенів |
| POST | `/api/auth/refresh` | публічний | ротація пари токенів |
| POST | `/api/auth/logout` | публічний | відкликання refresh токена |
| DELETE | `/api/auth/sessions` | токен | відкликати всі сесії |
| GET | `/api/auth/me` | токен | поточний користувач |
| POST | `/api/auth/change-password` | токен | зміна пароля (старі сесії завершуються) |
| POST | `/api/auth/forgot-password` | публічний | лист із токеном скидання |
| POST | `/api/auth/reset-password` | публічний | скидання паролю за токеном |
| POST | `/api/auth/2fa/enable` · `/2fa/confirm` · `/2fa/disable` | токен | TOTP 2FA |
| GET, POST | `/api/users` | ADMIN / ADMIN | список (`?role=&search=&page=&limit=`) / створити |
| GET, PUT, DELETE | `/api/users/:id` | токен (чужа картка — без email/phone) / власник+ADMIN / ADMIN | картка / оновити / видалити |
| GET, POST | `/api/lawyers` | публічний / токен | каталог із пагінацією, пошуком, фільтрами / свій профіль |
| GET, PUT, DELETE | `/api/lawyers/:id` | публічний / власник+ADMIN | профіль з відгуками / оновити / видалити |
| GET | `/api/lawyers/:id/reviews` | публічний | відгуки про юриста |
| GET, POST | `/api/specializations` | публічний / ADMIN | довідник сфер права |
| GET, PUT, DELETE | `/api/specializations/:id` | публічний / ADMIN | картка сфери / змінити / видалити |
| GET, POST | `/api/consultations` | токен | мої консультації (`?status=&search=`) / новий запит |
| GET, PUT, DELETE | `/api/consultations/:id` | учасник / учасник за ролями / ADMIN | картка з чатом / змінити / видалити |
| GET, POST | `/api/consultations/:id/messages` | учасник | чат консультації |
| GET, POST | `/api/reviews` | публічний / токен | список із пагінацією і фільтрами / відгук на COMPLETED |
| GET, PUT, DELETE | `/api/reviews/:id` | публічний / власник+ADMIN | картка / оновити / видалити |
| POST | `/api/files/upload` · `/api/files/upload-multiple` | токен | завантажити 1 файл / до 5 (multipart) |
| GET | `/api/files/my` · `/api/files/consultation/:id` | токен | мої файли (пагінація) / файли консультації |
| GET, DELETE | `/api/files/:id` | власник, учасник консультації або ADMIN / власник+ADMIN | скачати / видалити файл |
| GET | `/api/audit-logs` | ADMIN | журнал дій із пагінацією і фільтрами |

Детальні описи з прикладами — у Swagger UI.


## WebSocket API (Socket.io)

Підключення: `io(url, { auth: { token: <accessToken>, lastEventId: <id останньої отриманої події> } })`. Без валідного токена — `connect_error: "unauthorized"`. CORS — за `FRONTEND_URL`.

**Події клієнт → сервер:**

| Подія | Аргументи | Ack | Опис |
|---|---|---|---|
| `consultation:join` | `consultationId` | `{ok:true}` або `{ok:false,error:"forbidden"}` | приєднатися до кімнати консультації (лише учасник/адмін) |
| `consultation:leave` | `consultationId` | — | вийти з кімнати |

**Події сервер → клієнт.** Для прикладних подій із `EventOutbox` поле `id` є порядковим номером, який клієнт зберігає як `lastEventId`. Технічні події присутності та ліміту не зберігаються в outbox і такого `id` не мають:

| Подія | Кімната | Коли | Payload |
|---|---|---|---|
| `consultation:created` | `consultation:<id>`, `user:<clientId>`, `user:<lawyerId>` | створення консультації | `{ id, consultation }` |
| `consultation:updated` | `consultation:<id>`, `user:<clientId>`, `user:<lawyerId>` | зміна (статус/ціна/...) | `{ id, consultation, changed }` |
| `consultation:deleted` | `consultation:<id>`, `user:<clientId>`, `user:<lawyerId>` | видалення | `{ id }` |
| `message:new` | `consultation:<id>` | нове повідомлення в чаті | `{ id, message }` |
| `review:new/updated/deleted` | `consultation:<id>`, `user:<lawyerId>` | зміни відгуків | `{ id, review }` |
| `lawyer:updated/deleted` | broadcast (всі) | зміна каталогу юристів | `{ id, lawyer }` / `{ id }` |
| `notification:new` | `user:<id>` | нове сповіщення | `{ id, notification }` |
| `presence:update` | broadcast | користувач онлайн/офлайн | `{ userId, online }` |
| `events:replay` | особисто клієнту | при підключенні з `lastEventId` | масив `{ id, event, room, payload }` |
| `ws:error` | особисто клієнту | rate limit подій | `{ code: "RATE_LIMITED", message }` |

Приклад клієнта — `scripts/ws-demo.mjs`.

## Сповіщення (REST)

| Метод | Шлях | Опис |
|---|---|---|
| GET | `/api/notifications?unread=true&page=&limit=` | мої сповіщення (у відповіді `unreadCount`) |
| POST | `/api/notifications/:id/read` | позначити прочитаним |
| POST | `/api/notifications/read-all` | прочитати всі |
| DELETE | `/api/notifications/:id` | видалити |

## Моніторинг

`GET /metrics` (ADMIN) — uptime, лічильники HTTP/WS/подій/сповіщень/черг, gauge `onlineUsers`, стан черг. `GET /health` — для health check хостингу.

## Розгортання

Для розгортання підготовлено Render Blueprint у `render.yaml`; покрокова інструкція — у `docs/deployment.md`. Перед створенням сервісу потрібно вказати власні `DATABASE_URL` і `FRONTEND_URL`. WebSocket працює на тому самому URL, а reconnect після cold start компенсується replay прикладних подій.

## Тести та перевірка

```bash
npm test                  # 58 інтеграційних тестів проти окремої тестової БД (auth, files, API, WebSocket, сповіщення)
node scripts/smoke.mjs    # 33 smoke-перевірки проти запущеного сервера
node scripts/ws-demo.mjs   # демо WebSocket: кімнати, real-time чат, сповіщення, presence, replay
bash scripts/curl-demo.sh # curl-приклади наживо
```

## Скріншоти

Swagger UI на `/api-docs`:

`npm test` у терміналі (58/58):

![npm test: 58 тестів без помилок](reports/screenshots/lab3-terminal-npm-test.png)

Smoke-тест наживо, 33/33:

Вивід перевірки збережено у [`reports/screenshots/lab3-smoke.txt`](reports/screenshots/lab3-smoke.txt).

### Приклад роботи застосунку — Swagger UI

На знімку — документація запущеного API: публічні й захищені маршрути, JWT-авторизація та предметні групи ендпоінтів. WebSocket-сценарій відтворюється командою `node scripts/ws-demo.mjs`: неавторизоване підключення відхиляється, учасники входять до кімнати консультації, повідомлення приходить у real-time, а після reconnect клієнт отримує `events:replay`.

![Рисунок 1 — Swagger UI онлайн-платформи юридичних консультацій](reports/screenshots/lab3-swagger.png)

## Структура проєкту

```
├── prisma/                  # schema.prisma, міграції, seed (паролі хешуються Argon2id)
├── src/
│   ├── models/              # шар моделей: усі запити до БД (MVC Model)
│   ├── controllers/         # тонкі контролери: валідація + правила доступу + відповіді
│   ├── routes/              # маршрути + JSDoc для Swagger
│   ├── middleware/          # auth (JWT), authorize (ролі), upload (Multer), audit, errorHandler
│   ├── utils/               # jwt, password (Argon2id), totp, email, пагінація, валідація, AppError
│   ├── config/              # swagger
│   ├── app.js               # збирання застосунку (без listen): helmet, cors, rate limit, audit
│   ├── server.js            # запуск сервера
│   └── db.js                # єдиний екземпляр PrismaClient (PrismaPg adapter)
├── src/socket/              # Socket.io: auth, rooms, presence, outbox-еміти, WS rate limit, Redis-адаптер
├── src/services/            # notificationService (БД + real-time доставка)
├── tests/                   # auth, files, api, socket, notifications + helpers.js
├── scripts/                 # smoke.mjs, ws-demo.mjs, curl-demo.sh
├── docs/deployment.md       # деплой на Render (кроки, обмеження free tier)
├── render.yaml              # Blueprint для Render
├── reports/                 # звіти лабораторних + скріншоти
└── .github/workflows/       # CI: тести на кожен push (Node 24 + PostgreSQL 17)
```

Звіти: `reports/lab1-report.md`, `reports/lab2-report.md`, `reports/lab3-report.md`.
