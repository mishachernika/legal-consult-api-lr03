# Звіт з лабораторної роботи №1

**Дисципліна:** вебтехнології та розробка вебзастосунків
**Тема:** Розроблення backend архітектури та основного функціоналу
**Предметна область:** онлайн-платформа для юридичних консультацій
**Виконав:** Чернік Михайло Богданович, група ІПЗ-41, ВФК НУХТ
**Викладач:** Юхта О.А.
**Репозиторій:** https://github.com/mishachernika/legal-consult-api

---

## 1. Мета роботи

Здобути практичні навички створення серверної частини вебдодатку з використанням Node.js та Express.js, навчитися проєктувати структуру бази даних PostgreSQL та реалізовувати базові CRUD-операції з валідацією даних, обробкою помилок і документацією API.

## 2. Завдання

1. Новий проєкт Node.js + Express.js.
2. Підключення до PostgreSQL через Prisma 7 (ES-модулі, `prisma.config.ts`, адаптер `@prisma/adapter-pg`).
3. Моделі даних предметної області (6 сутностей, зв'язки 1:N та M:N, enum ролей).
4. Базовий роутинг та CRUD для всіх сутностей.
5. Валідація вхідних даних та централізована обробка помилок.
6. Змінні середовища (`.env`, `.env.example`, `.env` поза git).
7. Базова документація API (Swagger UI на `/api-docs`).

## 3. Хід роботи

1. **Середовище.** Встановлено Node.js 24 LTS (`brew install node@24`, `node -v` → v24.22.3) та PostgreSQL 17 (`brew install postgresql@17`, кластер на порту 5433, база `legal_consult`, тестова `legal_consult_test`). Створено GitHub-репозиторій `legal-consult-api`.
2. **Проєкт.** `npm init`, `"type": "module"`, скрипти `dev` (`node --env-file=.env --watch src/server.js`), `start`, `test`. Залежності: `express@5`, `@prisma/client@7`, `prisma@7`, `@prisma/adapter-pg`, `pg`, `dotenv`, `helmet`, `cors`, `swagger-jsdoc`, `swagger-ui-express`; dev: `supertest`.
3. **Структура папок** за вимогою методички (крок 4): `src/controllers/`, `src/models/`, `src/routes/`, `src/middleware/`, `src/utils/`, `src/config/`, `prisma/`, плюс `tests/`, `reports/`, `scripts/`.
4. **Змінні середовища.** `.env` (gitignored) з `DATABASE_URL`, `PORT`, `FRONTEND_URL`; у репозиторії — `.env.example` та `.env.test.example`.
5. **Схема БД** (`prisma/schema.prisma`), міграція `npx prisma migrate dev --name init`, генерація клієнта `npx prisma generate`. Єдиний екземпляр клієнта — `src/db.js` (`PrismaPg` адаптер + згенерований `PrismaClient`).
6. **Сервер.** `src/app.js` збирає застосунок (без `listen` — для тестів), `src/server.js` запускає порт. Middleware: helmet (CSP вимкнено для Swagger UI), cors, `express.json`, `/health`, Swagger UI, роутери, `notFound` + централізований `errorHandler`.
7. **Шар моделей (MVC Model)** `src/models/*.js`: `userModel`, `lawyerModel`, `specializationModel`, `consultationModel`, `messageModel`, `reviewModel` — кожна інкапсулює Prisma-запити своєї сутності (`findAll`, `findById`, `create`, `update`, `remove` тощо). **Контролери тонкі**: `src/controllers/*.js` містять лише валідацію, бізнес-правила (наприклад, писати в чат можуть лише учасники консультації) та HTTP-відповіді. Валідація — власна DSL у `src/utils/validate.js` (`assertValid` кидає `AppError(400, details)`). Помилки Prisma мапляться: P2002→409, P2025→404, P2003→409.
8. **Swagger.** `src/config/swagger.js` + JSDoc-коментарі `@swagger` у кожному файлі роутів; UI на `http://localhost:3000/api-docs`.
9. **Seed та тести.** `prisma/seed.js` (6 сфер права, 7 користувачів, 3 профілі юристів, 4 консультації, чат, відгук). `tests/api.test.js` — 28 інтеграційних тестів (`node:test` + supertest проти тестової БД). `scripts/smoke.mjs` — 16 smoke-перевірок проти живого сервера. CI `.github/workflows/tests.yml` (Node 24 + PostgreSQL 17 сервіс).

## 4. Схема бази даних

6 моделей: `User` (enum `Role`: CLIENT/LAWYER/ADMIN), `LawyerProfile` (1:1 з User), `Specialization`, `Consultation` (enum `ConsultationStatus`, 1:N від обох сторін User), `Message` (чат, 1:N), `Review` (1:1 з Consultation, унікальний `consultationId`). Зв'язок many-to-many — неявний `LawyerProfile ↔ Specialization`. Усі зовнішні ключі оголошені через `@relation` на рівні БД (включно з `Review.lawyerId → User`), індекси — на зовнішніх ключах і полях фільтрів (`role`, `status`, `lawyerId`, `pricePerHour`).

ER-діаграма — у `README.md` (mermaid) та `reports/screenshots/er-diagram.png`.

## 5. Ключові лістинги

`src/app.js` (фрагмент):

```js
app.use(helmet({ contentSecurityPolicy: false })); // CSP off: Swagger UI потребує inline-скриптів
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, { explorer: true }));
app.use('/api/users', userRoutes);
// ... lawyers, specializations, consultations, reviews
app.use(notFound);
app.use(errorHandler);
```

`src/middleware/errorHandler.js` (фрагмент):

```js
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err?.code === 'P2002') return res.status(409).json({ error: 'Запис з такими унікальними даними вже існує', details: err.meta?.target });
  if (err?.code === 'P2025') return res.status(404).json({ error: 'Запис не знайдено' });
  if (err?.code === 'P2003') return res.status(409).json({ error: "Неможливо видалити запис: з ним пов'язані інші дані" });
  console.error(err);
  return res.status(500).json({ error: 'Внутрішня помилка сервера' });
}
```

`prisma/schema.prisma` (фрагмент):

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Consultation {
  id          Int                @id @default(autoincrement())
  clientId    Int
  lawyerId    Int
  topic       String
  status      ConsultationStatus @default(PENDING)
  price       Decimal?           @db.Decimal(10, 2)
  client      User               @relation("ClientConsultations", fields: [clientId], references: [id])
  lawyer      User               @relation("LawyerConsultations", fields: [lawyerId], references: [id])
  messages    Message[]
  review      Review?
  @@index([clientId])
  @@index([lawyerId])
  @@index([status])
}
```

## 6. Тестування API

Запущено сервер (`npm run dev`) і перевірено ендпоінти. Скріншоти та логи — у `reports/screenshots/`:

| Файл | Що на ньому |
|---|---|
| `swagger-ui.png` | Swagger UI на `/api-docs` — усі групи ендпоінтів (справжній скріншот headless Chrome) |
| `er-diagram.png` | ER-діаграма БД (mermaid → PNG) |
| `terminal-curl.png` | **справжній знімок екрана вікна Terminal.app** (macOS `screencapture`): curl-запити наживо через `scripts/curl-demo.sh` — health, список юристів, створення консультації, валідація → 400, невідомий маршрут → 404 |
| `terminal-smoke.png` | **знімок вікна Terminal.app**: `node scripts/smoke.mjs` наживо — **16/16 PASS** |
| `terminal-npm-test.png` | **знімок вікна Terminal.app**: `npm test` наживо — **tests 28, pass 28, fail 0** |
| `api-smoke.txt`, `npm-test.txt`, `curl-session.txt` | ті самі виводи текстом |

Термінальні скріншоти зроблені справжніми знімками екрана (команди виконувались у Terminal.app, вікно захоплено `screencapture -l<window id>`), а не згенеровані скриптом. Після останньої зміни схеми повний цикл перезапущено наново: `npx prisma migrate dev` → «Already in sync», `npm test` → 28 pass / 0 fail, `node scripts/smoke.mjs` → 16/16 PASS (свіжі логи — у `reports/screenshots/*.txt`).

Сценарії smoke: health, списки з фільтрами, створення консультації з ціною за замовчуванням = ставка юриста, зміна статусу, чат лише для учасників → 403 для стороннього, відгук лише після COMPLETED, дубль відгуку → 409, валідація → 400, 404/400 для поганих запитів.

Приклади запитів (curl):

```bash
curl localhost:3000/health
curl 'localhost:3000/api/lawyers?sortBy=pricePerHour&order=asc'
curl -X POST localhost:3000/api/consultations -H 'Content-Type: application/json' -d '{
  "clientId": 5, "lawyerId": 2,
  "topic": "Договір купівлі квартири",
  "description": "Потрібно перевірити договір купівлі-продажу квартири та оцінити ризики."
}'
curl -X PUT localhost:3000/api/consultations/1 -H 'Content-Type: application/json' -d '{"status":"CONFIRMED"}'
curl -X POST localhost:3000/api/consultations/1/messages -H 'Content-Type: application/json' -d '{"senderId":5,"text":"Добрий день!"}'
curl -X POST localhost:3000/api/users -H 'Content-Type: application/json' -d '{"email":"bad","name":"A"}'
# → 400 {"error":"Помилка валідації даних","details":{"email":["невірний формат email"],"name":["мінімальна довжина — 2 символів"]}}
```

Swagger UI: `GET /api-docs/` → 200 (всі ендпоінти з прикладами та кодами відповідей).

## 7. Контрольні питання

1. **Node.js** — серверний рантайм на движку V8; переваги: неблокуючий event-driven I/O, одна мова JS на фронті й бекенді, величезна екосистема npm.
2. **Синхронність vs асинхронність**: синхронний код блокує потік до завершення (наприклад, `fs.readFileSync`), асинхронний реєструє callback/promise і продовжує роботу — у нашому API всі запити до БД асинхронні (`await prisma...`), тому сервер обробляє багато запитів одночасно на одному потоці.
3. **Express middleware** — функція `(req, res, next)`, що обробляє запит у ланцюжку: у нас `helmet`, `cors`, `express.json`, роутери та `errorHandler` (4 аргументи — перехоплює помилки).
4. **ORM/Prisma vs SQL**: Prisma генерує типобезпечний клієнт і міграції зі схеми, захищає від SQL-ін'єкцій параметризованими запитами; прямий SQL — ручні запити й ручні міграції.
5. **REST**: ресурси в URL, stateless-запити, JSON; CRUD → GET (read), POST (create), PUT (update), DELETE (delete).
6. **Валідація на сервері** потрібна, бо клієнт може надіслати будь-що: у нас `assertValid` перевіряє типи/діапазони/enum і повертає 400 зі списком помилок по полях.
7. **MVC у проєкті**: Model — Prisma-схема + шар `src/models/*.js` (всі запити до БД) + `db.js` (єдиний екземпляр клієнта); Controller — тонкі `src/controllers/*` (валідація, правила, відповіді), маршрути у `src/routes/*`; View — JSON-відповіді API, документація «виду» — Swagger UI.
8. **Міграції Prisma**: `migrate dev` створює SQL-файл у `prisma/migrations/` і застосовує його; історія зберігається в БД (`_prisma_migrations`), `migrate deploy` — для продакшну.
9. **Змінні середовища** (`DATABASE_URL`, `PORT`, секрети) винесені в `.env` поза git, підставляються через `--env-file` і `dotenv/config` у `prisma.config.ts`.
10. **Безпека ендпоінтів**: валідація вхідних даних, параметризовані запити ORM, helmet (захисні заголовки), CORS лише для свого фронтенду, `.env` у `.gitignore`, централізований обробник помилок без витоку деталей 500-клієнту. (У ЛР2 додадуться Argon2id, JWT, ролі, rate limiting.)

## 8. Висновки

Створено повноцінну серверну частину онлайн-платформи юридичних консультацій: 6 моделей у PostgreSQL через Prisma 7 з міграціями, CRUD REST API на Express 5 із валідацією та централізованою обробкою помилок, документацією Swagger, seed-даними, 28 інтеграційними тестами (всі green) та CI у GitHub Actions. Код відповідає принципам чистого коду: app.js не запускає сервер (тестопридатність), єдиний екземпляр Prisma, DRY-валідація.
