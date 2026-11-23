import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpecs } from './config/swagger.js';
import { audit } from './middleware/audit.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import lawyerRoutes from './routes/lawyerRoutes.js';
import specializationRoutes from './routes/specializationRoutes.js';
import consultationRoutes from './routes/consultationRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/auth.js';
import { authorize } from './middleware/authorize.js';
import { metrics } from './utils/metrics.js';
import { queueStats } from './utils/queue.js';

const app = express();

// CSP вимкнено, бо Swagger UI використовує inline-скрипти
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Метрики для моніторингу: лічильники HTTP/WS/черг + gauge (онлайн, uptime)
app.use((req, res, next) => {
  res.on('finish', () => {
    metrics.inc('httpRequestsTotal');
    if (res.statusCode >= 500) metrics.inc('httpErrorsTotal');
  });
  next();
});

// Моніторинг (рівень 3): метрики застосунку, лише для адміна
app.get('/metrics', authenticate, authorize('ADMIN'), (req, res) => {
  res.json({ ...metrics.snapshot(), queues: queueStats() });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, { explorer: true }));

// Rate limiting для всього /api/ — захист від зловживань (рівень 3)
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT) || 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Забагато запитів з цієї IP-адреси, спробуйте пізніше' },
  })
);

// Журнал дій користувачів (рівень 3): пишемо всі не-GET запити після відповіді
app.use('/api/', audit());

// Окремий посилений ліміт на auth-ендпоінти (login/register/refresh/2fa/...) — захист від перебору паролів
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT) || 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Забагато спроб входу або запитів. Спробуйте пізніше' },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/lawyers', lawyerRoutes);
app.use('/api/specializations', specializationRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
