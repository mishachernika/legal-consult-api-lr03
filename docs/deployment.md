# Розгортання на хостингу (ЛР03)

## Обраний хостинг: Render (free tier)

**Чому Render:** є безкоштовний тариф для Node.js, підтримує WebSocket «з коробки», автоматичні SSL-сертифікати, health checks, деплой з GitHub по push, blueprint у репозиторії (`render.yaml`).

### Кроки деплою

1. База даних: створити безкоштовну PostgreSQL у **Neon** (neon.tech) або **Supabase** — у Render безкоштовна БД живе лише 30 днів і її видаляють. Скопіювати connection string (`postgresql://...?sslmode=require`).
2. На [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → вибрати репозиторій `mishachernika/legal-consult-api-lr03` — Render підхопить `render.yaml`.
3. У envVars вказати вручну: `DATABASE_URL` (з Neon/Supabase), `FRONTEND_URL` (адреса фронтенду). `JWT_SECRET` і `REFRESH_TOKEN_SECRET` згенеруються самі (`generateValue: true`).
4. Deploy. Build: `npm ci && npx prisma generate`; перед стартом автоматично виконається `npx prisma migrate deploy` (preDeployCommand); старт: `node src/server.js` (порт із змінної `PORT`, яку Render задає сам).
5. Перевірити: `GET https://<service>.onrender.com/health` → `{"status":"ok"}`; Swagger — `/api-docs`; WebSocket — той самий порт (Socket.io поверх HTTPS/WSS).

### Обмеження free tier Render, які враховано

- **З характеристик застосунку:** сервіс «засинає» після 15 хв без запитів; холодний старт до ~60 с. WebSocket-з'єднання при цьому обриваються — клієнт Socket.io має `reconnection: true` (за замовчуванням), а пропущені події відновлюємо через outbox: клієнт передає `lastEventId` у `auth` і отримує `events:replay`.
- **Тимчасова файлова система:** завантажені через Multer файли зникають після redeploy/засинання. Для постійного зберігання потрібне S3-сумісне сховище (Cloudflare R2 free tier) — у цьому проєкті це задокументовано як наступний крок.
- **БД 30 днів:** тому `DATABASE_URL` — від Neon/Supabase (free, безстроково), а не від Render Postgres.
- **Горизонтальне масштабування:** free tier = 1 інстанс. При переході на кілька інстансів задаємо `REDIS_URL` (Upstash free) — тоді Socket.io працює через Redis-адаптер, а кеш стає спільним; балансувальник має sticky sessions (Render робить це автоматично для WebSocket).
- **Автомасштабування** на free tier недоступне; на платних тарифах Render вмикає його в Settings → Scaling (min/max інстанси за метриками CPU/RAM, які видно у вкладці Metrics; наші власні метрики — у `GET /metrics`).

### Локальна перевірка WebSocket

```bash
npm run dev                 # сервер на :3000
node scripts/ws-demo.mjs    # два socket.io-client + REST-запит → real-time події, presence, replay
```
