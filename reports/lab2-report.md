# Звіт з лабораторної роботи №2

**Дисципліна:** вебтехнології та розробка вебзастосунків
**Тема:** Аутентифікація, авторизація та розширений функціонал
**Предметна область:** онлайн-платформа для юридичних консультацій
**Виконав:** Чернік Михайло Богданович, група ІПЗ-41, ВФК НУХТ
**Викладач:** Юхта О.А.
**Репозиторій:** https://github.com/mishachernika/legal-consult-api-lr02

---

## 1. Мета роботи

Здобути практичні навички реалізації системи аутентифікації та авторизації користувачів, впровадити механізми безпечного зберігання паролів та управління сесіями, розширити функціональність серверного застосунку файловим сервісом, пошуком, фільтрацією та пагінацією, а також створити документацію API.

## 2. Завдання

**Рівень 1 (обов'язковий мінімум)** — виконано повністю:

1. Реєстрація користувачів з валідацією даних — `POST /api/auth/register`.
2. Безпечне зберігання паролів — Argon2id (пакет `argon2`), у БД зберігається лише хеш `$argon2id$v=19$m=…,t=…,p=…$сіль$хеш`.
3. Аутентифікація на основі JWT — access токен (15 хв, `JWT_SECRET`) у заголовку `Authorization: Bearer …`.
4. Middleware аутентифікації — `src/middleware/auth.js` (`authenticate` → `req.user = { userId, role }`).
5. Базова система ролей — enum `Role`: `CLIENT`, `LAWYER`, `ADMIN`.
6. Middleware авторизації — `src/middleware/authorize.js` (`authorize('ADMIN')` тощо) для захисту маршрутів.
7. Пагінація списків — `page`/`limit` (limit обмежено 100) для всіх GET-списків, відповідь `{ data, pagination: { page, limit, total, totalPages, hasMore } }`.
8. Документація API — Swagger (swagger-jsdoc + swagger-ui-express) на `/api-docs`, JSDoc `@swagger` у кожному роуті.

**Рівень 2** — виконано повністю:

1. Файловий сервіс — Multer 2.x, `POST /api/files/upload` (один файл) та `/upload-multiple` (до 5), файли можна прикріпити до консультації.
2. Валідація типів і розмірів — MIME-тип **і** розширення перевіряються разом (jpg/png/gif/webp/pdf), ліміт 5 МБ (`MAX_FILE_SIZE`), оригінальне ім'я ніколи не використовується як шлях на диску; додатково перевіряються **«магічні байти»** вмісту (сигнатури jpeg/png/gif/webp/pdf), підроблений файл видаляється і повертається 400; у відповідях API серверний `path` не віддається.
3. Пошук по основних сутностях — `?search=` (insensitive) для користувачів, юристів, консультацій.
4. Фільтрація — роль, статус консультації, сфера права, діапазон ціни, мінімальний рейтинг; сортування з білим списком полів.
5. Оновлення та видалення файлів — `DELETE /api/files/:id` (власник або ADMIN), файл видаляється і з диска; якщо запис у БД не вдався — «осиротілий» файл прибирається.
6. Зміна паролю — `POST /api/auth/change-password` (перевіряє поточний, примусово завершує всі сесії).
7. Refresh токени з ротацією та відкликанням — у БД лише SHA-256 хеш; повторне використання відкликаного токена відкликає всі токени користувача; `POST /api/auth/logout`, `DELETE /api/auth/sessions`.
8. Базові тести для auth — `tests/auth.test.js` (12 тестів: реєстрація, вхід, ротація, reuse-detection, logout, change/reset password, 2FA).

**Рівень 3** — виконано частково (без OAuth — залишено як майбутнє покращення, бо потребує зовнішніх провайдерів):

1. Відновлення паролю через email — `forgot-password`/`reset-password`, одноразовий токен (хеш у БД, 1 год); без `SMTP_URL` лист логується в консоль (dev-режим).
2. Двофакторна автентифікація — TOTP (otplib) + QR-код: `/api/auth/2fa/enable → confirm → disable`, при login вимагається поле `totp`.
3. OAuth — **не реалізовано** (див. висновки).
4. Логування дій — middleware `audit()` пише всі не-GET запити в `AuditLog` (дія, сутність, id, замасковане тіло, IP); читати журнал може лише ADMIN (`GET /api/audit-logs`).
5. Rate limiting — `express-rate-limit` на `/api/` (100 запитів / 15 хв з IP, перевірено: після ліміту → 429) **плюс окремий посилений ліміт на `/api/auth`** (10 запитів / 15 хв, `AUTH_RATE_LIMIT`) — захист від перебору паролів і кодів 2FA.
6. Складніша система дозволів — правила на рівні контролерів: consultation редагують лише її учасники (клієнт — лише PENDING і може скасувати; **ціну при створенні задає лише адмін**, далі ціну змінює юрист), чат пишуть лише учасники, відгук лишає лише клієнт завершеної консультації, `isVerified` ставить лише ADMIN, список усіх користувачів з email/телефонами — лише ADMIN (чужа картка віддає лише публічні поля), видалення consultation з відгуком перераховує рейтинг юриста, створення профілю юриста не знижує роль ADMIN.
7. Кілька файлів одночасно — `/api/files/upload-multiple` (до 5, поле `files[]`).
8. Розширена документація — Swagger для всіх ендпоінтів із прикладами запитів, кодами відповідей (400/401/403/404/409) і схемою `bearerAuth`.

## 3. Хід роботи

1. **Середовище.** Node.js 24 LTS, PostgreSQL 17 (порт 5433), окремі бази `legal_consult` і `legal_consult_test`. Проєкт — ES-модулі (`"type": "module"`), `dev` = `node --env-file=.env --watch src/server.js`, `test` = `node --env-file-if-exists=.env.test --test --test-concurrency=1 "tests/**/*.test.js"` (послідовний запуск файлів, бо кожен файл чистить тестову БД).
2. **Залежності** (крок 1 методички): `express@5`, `jsonwebtoken`, `argon2`, `multer@2`, `swagger-jsdoc`, `swagger-ui-express`, `helmet`, `express-rate-limit`, `cors`, `@prisma/client@7`, `@prisma/adapter-pg`, `pg`, `dotenv`; додатково для рівня 3: `otplib`, `qrcode`, `nodemailer`; dev: `prisma@7`, `supertest`.
3. **Змінні середовища** — `.env` / `.env.test` (поза git), шаблони `.env.example` / `.env.test.example`: `DATABASE_URL`, `PORT`, `FRONTEND_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRES_IN`, `UPLOAD_DIR`, `MAX_FILE_SIZE`, `RATE_LIMIT`, опціонально `SMTP_URL`. Секрети згенеровано `node -p "require('node:crypto').randomBytes(32).toString('hex')"`.
4. **Схема БД** — розширено до 10 моделей (див. розділ 4), міграція `add-auth-files-audit`, `npx prisma generate` (Prisma 7 генерує клієнт у `src/generated/prisma` окремою командою).
5. **Утиліти** — `src/utils/jwt.js` (access/refresh, у refresh є `jti`), `password.js` (Argon2id), `pagination.js`, `totp.js` (обгортка otplib v13), `email.js` (nodemailer, dev-fallback у консоль).
6. **Middleware** — `auth.js` (Bearer → `req.user`), `authorize.js` (ролі), `upload.js` (Multer: mime+ext, 5 МБ, до 5 файлів), `audit.js` (запис у `AuditLog` після відповіді, чутливі поля маскуються `***`), у `errorHandler.js` додано гілки MulterError (зокрема `LIMIT_FILE_SIZE` → «Файл занадто великий») і `err.status`.
7. **Auth-контролер** — register/login/refresh/logout/sessions/me/change-password/forgot/reset-password/2fa. Refresh зберігається лише як SHA-256 хеш; ротація + виявлення повторного використання відкликаного токена (відкликання всіх сесій). Відповідь на login завжди однакова для невідомого email і хибного пароля.
8. **Файловий сервіс** — `fileController`: upload/upload-multiple/get/getMy/getConsultationFiles/delete; перевірка прав на консультацію при прикріпленні.
9. **Захист предметних ендпоінтів** — усі списки з пагінацією, пошуком і фільтрами; правила доступу в контролерах (власник/учасник/ADMIN, див. розділ 2 рівень 3 п.6); додатковий ліміт на `/api/auth` у `app.js`.
10. **Безпека застосунку** — `app.js`: helmet (CSP вимкнено для Swagger UI), CORS із `credentials: true` і `FRONTEND_URL`, rate limit на `/api/`, audit на `/api/`, `express.json({ limit: '1mb' })`.
11. **Swagger** — теги Authentication/Files/Audit, `bearerAuth` security scheme, всі ендпоінти задокументовані.
12. **Тести** — `tests/auth.test.js` (12), `tests/files.test.js` (6), `tests/api.test.js` (29) + `helpers.js`; усього **47 тестів, усі green**. `scripts/smoke.mjs` — **32/32 PASS** проти живого сервера; `scripts/curl-demo.sh` — curl-сесія для скріншотів. CI `.github/workflows/tests.yml` — Node 24 + PostgreSQL 17, секрети у env, `npm test`.

## 4. Схема бази даних

Додано до моделей ЛР01: у `User` — `password`, `avatar`, `totpSecret`, `totpEnabled`; нові моделі `File` (з опціональним `consultationId`), `RefreshToken` (лише `tokenHash` SHA-256 + `revokedAt`), `PasswordResetToken` (хеш + `usedAt`), `AuditLog` (userId?, action, entity, entityId, details Json, ip). Зв'язки з `onDelete: Cascade` / `SetNull`, індекси на зовнішніх ключах і полях фільтрів.

```prisma
model RefreshToken {
  id        Int       @id @default(autoincrement())
  tokenHash String    @unique
  userId    Int
  expiresAt DateTime
  revokedAt DateTime?
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model File {
  id             Int           @id @default(autoincrement())
  filename       String
  originalName   String
  mimetype       String
  size           Int
  path           String
  uploadedBy     Int
  consultationId Int?
  createdAt      DateTime      @default(now())
  user           User          @relation(fields: [uploadedBy], references: [id], onDelete: Cascade)
  consultation   Consultation? @relation(fields: [consultationId], references: [id], onDelete: SetNull)
  @@index([uploadedBy])
  @@index([consultationId])
}
```

## 5. Ключові лістинги

`src/utils/password.js` — Argon2id:

```js
import argon2 from 'argon2';

export function hashPassword(password) {
  // Argon2id із параметрами за замовчуванням (рекомендація OWASP)
  return argon2.hash(password, { type: argon2.argon2id });
}

export function comparePassword(password, hash) {
  return argon2.verify(hash, password);
}
```

`src/middleware/auth.js` + `authorize.js`:

```js
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Токен аутентифікації відсутній' });
  }
  try {
    req.user = verifyAccessToken(authHeader.slice(7)); // { userId, role }
    next();
  } catch {
    res.status(401).json({ error: 'Недійсний або прострочений токен' });
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Необхідна аутентифікація' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостатньо прав для виконання цієї операції' });
    }
    next();
  };
}
```

Ротація refresh токенів (`authController.refresh`, фрагмент):

```js
const stored = await refreshTokenModel.findByHash(sha256(refreshToken));
if (!stored || stored.revokedAt) {
  // Повторне використання відкликаного токена — ознака викрадення: відкликаємо всі сесії
  if (stored) await refreshTokenModel.revokeAllForUser(stored.userId);
  throw new AppError(401, 'Недійсний refresh токен');
}
await refreshTokenModel.revoke(stored.id); // ротація: старий токен відкликано
res.json({ tokens: await issueTokens(stored.user) });
```

`src/middleware/upload.js` — валідація MIME + розширення разом (фрагмент):

```js
const allowedTypes = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/gif', ['.gif']],
  ['image/webp', ['.webp']],
  ['application/pdf', ['.pdf']],
]);
// fileFilter: allowedTypes.get(file.mimetype)?.includes(ext) — обидва значення мають збігатися
// limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, files: 5 }
```

Пагінація (`src/utils/pagination.js`):

```js
export function parsePagination(query, { defaultLimit = 10, maxLimit = 100 } = {}) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}
// відповідь: { data, pagination: { page, limit, total, totalPages, hasMore } }
```

`app.js` — безпека (фрагмент):

```js
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.RATE_LIMIT) || 100, … }));
// окремий посилений ліміт на auth (login/2FA/...) — захист від перебору
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT) || 10, … }));
app.use('/api/', audit()); // журнал дій у AuditLog
```

## 6. Тестування API

Запущено сервер і перевірено ендпоінти. Скріншоти та логи — у `reports/screenshots/`:

| Файл | Що на ньому |
|---|---|
| `lab2-swagger.png` | Swagger UI на `/api-docs` — групи Authentication, Users, Lawyers, Consultations, Reviews, Files, Audit (справжній скріншот headless Chrome) |
| `lab2-terminal-curl.png` | **справжній знімок екрана вікна Terminal.app** (`screencapture -l<window id>`): `scripts/curl-demo.sh` — health, каталог юристів із пагінацією, реєстрація (пара JWT у відповіді), вхід і запит із `Bearer`-токеном, 401 без токена, валідація → 400, 404 |
| `lab2-terminal-npm-test.png` | **знімок вікна Terminal.app**: `npm test` — **tests 47, pass 47, fail 0** |
| `lab2-terminal-smoke.png` | **знімок вікна Terminal.app**: `node scripts/smoke.mjs` — **32/32 PASS** (реєстрація, ротація refresh, 401/403 без прав, ціна лише для адміна, консультація, чат, файли + магічні байти, відгук, аудит) |
| `lab2-smoke.txt`, `lab2-npm-test.txt`, `lab2-curl-session.txt` | ті самі виводи текстом |
| `lab2-rate-limit.txt` | rate limiting на `/api/`: 105 запитів до `/api/specializations` → 58×200 і 47×429 (ліміт 100 за вікно 15 хв, частину «з'їли» попередні демо-запити) |
| `lab2-auth-rate-limit.txt` | окремий ліміт на `/api/auth` (`AUTH_RATE_LIMIT=10`): 12 спроб login → 10×401 і далі 429 `{"error":"Забагато спроб входу або запитів. Спробуйте пізніше"}` |

Тести: `npm test` → `tests 47, pass 47, fail 0` (auth: реєстрація/вхід/ротація/reuse-detection/logout/change+reset password/2FA; files: upload png, відхилення .exe і завеликого, multi-upload, права доступу; API: захищені маршрути, пагінація, пошук, фільтри, RBAC-правила, аудит, помилки). Тести женуться проти окремої БД `legal_consult_test` (`NODE_ENV=test`, `.env.test`), файли запускаються послідовно (`--test-concurrency=1`), бо кожен чистить базу.

Приклади запитів (curl):

```bash
# реєстрація → у відповіді accessToken + refreshToken
curl -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"client@example.com","password":"password123","name":"Олена"}'

# вхід демо-адміном із seed
curl -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@legal.ua","password":"password123"}'

# захищений маршрут без токена → 401, з токеном → 200
curl -o /dev/null -w '%{http_code}\n' localhost:3000/api/users
curl localhost:3000/api/consultations?status=PENDING -H "Authorization: Bearer $TOKEN"

# ротація токенів
curl -X POST localhost:3000/api/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"…"}'

# завантаження файлу (multipart)
curl -X POST localhost:3000/api/files/upload -H "Authorization: Bearer $TOKEN" \
  -F "file=@dogovir.pdf" -F "consultationId=1"
```

## 7. Контрольні питання

1. **Аутентифікація vs авторизація.** Аутентифікація відповідає «Хто ви?» — перевірка облікових даних і видача JWT (`POST /api/auth/login`, middleware `authenticate`). Авторизація — «Що вам дозволено?» — перевірка ролі/прав уже автентифікованого користувача (`authorize('ADMIN')`, правила власника в контролерах, наприклад DELETE consultation лише для ADMIN або клієнта у статусі PENDING).
2. **JWT** складається з header.payload.signature (base64url, підпис HMAC/RSA). Популярний для API, бо stateless: сервер перевіряє підпис і не зберігає сесію, токен самодостатній і легко масштабується між інстансами. Важливо: payload лише підписаний, не зашифрований — туди не кладуть паролі (у нас лише `userId`, `role`, `jti`).
3. **Argon2id vs SHA-256.** SHA-256 швидкий — пароль можна перебирати на GPU мільярдами в секунду. Argon2id навмисне повільний і вимогливий до пам'яті (параметри m/t/p у самому хеші), тому атака перебором стає дорогою; OWASP рекомендує його першим вибором. **Сіль** — унікальний випадковий рядок на пароль, зберігається всередині хешу (`$argon2id$…$сіль$хеш`); завдяки солі однакові паролі дають різні хеші, і не потрібні rainbow tables.
4. **Middleware в Express** — функція `(req, res, next)` у ланцюжку обробки. У нас: `authenticate` читає заголовок `Authorization: Bearer …`, перевіряє підпис JWT і кладе payload у `req.user`; `authorize(...roles)` порівнює `req.user.role` зі списком дозволених ролей і або пускає далі (`next()`), або повертає 401/403. Так кожен захищений маршрут — просто `router.get('/', authenticate, getUsers)`.
5. **RBAC** — модель, де права прив'язані до ролей, а ролі — до користувачів. У проєкті enum `Role { CLIENT, LAWYER, ADMIN }` у `User`; `authorize('ADMIN')` на маршрутах адміна (наприклад, `DELETE /api/users/:id`), а детальніші правила — в контролерах: власник профілю редагує лише свій, клієнт консультації бачить лише свої консультації, `isVerified` підтверджує лише адмін.
6. **Multer** — middleware для `multipart/form-data`. У нас: `diskStorage` з унікальним ім'ям (`fieldname-timestamp-random.ext`, оригінальне ім'я не використовується), `fileFilter` перевіряє, що MIME-тип і розширення відповідають одне одному (обидва легко підробити з клієнта, тому перевіряємо разом), `limits: { fileSize: 5 МБ, files: 5 }`; додатково у контролері перевіряються «магічні байти» (сигнатура вмісту), підроблений файл видаляється з диска. Помилки Multer ловить централізований `errorHandler` (`LIMIT_FILE_SIZE` → 400 «Файл занадто великий»).
7. **Пагінація** — параметри `page` (≥1) і `limit` (1…100, за замовчуванням 10); у Prisma це `skip = (page-1)*limit`, `take = limit` разом із паралельним `count` для `total`. Відповідь: `{ data, pagination: { page, limit, total, totalPages, hasMore } }`. Обмеження `limit` захищає від виборки всієї таблиці одним запитом.
8. **Swagger** — інструменти для документації REST API за специфікацією OpenAPI. У нас swagger-jsdoc збирає специфікацію з JSDoc-коментарів у `src/routes/*.js`, swagger-ui-express віддає інтерактивний UI на `/api-docs` — можна виконувати запити прямо з браузера (кнопка Authorize → Bearer токен). Перевага: документація живе в коді й не розходиться з реальністю.
9. **Загрози вебдодатків** (OWASP Top 10) і як мінімізовано: підбір паролів — Argon2id + однакова відповідь login на невідомий email/хибний пароль; викрадення сесій — короткий access токен + refresh у БД лише хешем із ротацією та відкликанням; XSS/CSRF — helmet, CORS лише для свого origin, токени в заголовку, а не в cookie; зловживання API — rate limiting 100/15 хв; витік секретів — `.env` поза git, секрети 64 hex; ін'єкції — параметризовані запити Prisma; завантаження шкідливих файлів — перевірка mime+ext, ліміт розміру, унікальні імена без шляху від клієнта.
10. **Access vs refresh.** Access короткий (15 хв) і ходить з кожним запитом; його не зберігають на сервері, тому відкликати до кінця життя не можна — тому він короткий. Refresh довгий (7 днів), використовується лише на `/api/auth/refresh`, зберігається у БД хешем — тому його можна відкликати (logout, зміна пароля). **Ротація**: кожен refresh обмінюється на нову пару, а старий одразу відкликається; якщо відкликаний токен пред'явлено знову — це ознака викрадення, і тоді відкликаються всі токени користувача (у нас це реалізовано й покрито тестом).

## 8. Висновки

Розширено API платформи юридичних консультацій до рівня «продакшн-близької» безпеки: Argon2id для паролів, пара JWT access/refresh із ротацією та відкликанням (у БД — лише хеші), RBAC із middleware і детальними правилами в контролерах, файловий сервіс із валідацією типу/розміру, пагінація/пошук/фільтри для всіх списків, Swagger-документація, а з рівня 3 — відновлення паролю через email, TOTP-2FA з QR-кодом, rate limiting, журнал дій (audit log) і multi-upload. OAuth-соцмережі свідомо не реалізовано: для локальної розробки потрібні реєстрація додатку в провайдера та публічний callback-URL; механізм розширюється стандартно (окремий роут + обмін code на токен провайдера), тому це заплановано як наступне покращення.

Усі 47 інтеграційних тестів green (`npm test`), smoke 32/32 проти живого сервера, CI у GitHub Actions на Node 24 + PostgreSQL 17. Rate limiting перевірено на практиці: після 100 запитів з одного IP за 15 хв API повертає 429.
