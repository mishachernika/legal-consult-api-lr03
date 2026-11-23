import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../db.js';
import { setIo } from './emitter.js';
import { addConnection, removeConnection, isOnline, onlineUserIds } from './presence.js';
import { metrics } from '../utils/metrics.js';
import { enqueue } from '../utils/queue.js';

// Rate limiting подій WebSocket (рівень 3): ліміт на один socket
const WS_RATE_LIMIT = Number(process.env.WS_RATE_LIMIT) || 30;
const WS_RATE_WINDOW_MS = 10_000;

metrics.gauge('onlineUsers', () => onlineUserIds().length);

export async function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  // Горизонтальне масштабування (рівень 3): Redis-адаптер розсилює події між інстансами сервера.
  // Без REDIS_URL працює in-memory адаптер (один інстанс).
  if (process.env.REDIS_URL) {
    const { createClient } = await import('redis');
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[socket] увімкнено Redis-адаптер (горизонтальне масштабування)');
  }

  setIo(io);

  // Автентифікація WebSocket: клієнт передає JWT у handshake.auth.token
  io.use((socket, next) => {
    try {
      socket.user = verifyAccessToken(socket.handshake.auth?.token ?? '');
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.userId;
    metrics.inc('wsConnections');

    // Персональна кімната для сповіщень + присутність
    socket.join(`user:${userId}`);
    addConnection(userId, socket.id);
    io.emit('presence:update', { userId, online: true });

    // Replay пропущених подій: клієнт передає lastEventId у handshake.auth
    const lastEventId = Number(socket.handshake.auth?.lastEventId ?? 0);
    if (lastEventId > 0) void replayMissedEvents(socket, userId, lastEventId);

    // Rate limiting подій на socket
    let windowStart = Date.now();
    let count = 0;
    socket.use((packet, next) => {
      const now = Date.now();
      if (now - windowStart > WS_RATE_WINDOW_MS) {
        windowStart = now;
        count = 0;
      }
      if (++count > WS_RATE_LIMIT) {
        metrics.inc('wsRateLimited');
        socket.emit('ws:error', { code: 'RATE_LIMITED', message: 'Забагато подій — зачекайте трохи' });
        return; // пакет відкидаємо
      }
      metrics.inc('wsEvents');
      next();
    });

    // Кімната консультації: приєднатися можуть лише її учасники (клієнт/юрист) або адмін
    socket.on('consultation:join', async (consultationId, ack) => {
      try {
        const id = Number(consultationId);
        const consultation = Number.isInteger(id)
          ? await prisma.consultation.findUnique({ where: { id } })
          : null;
        if (!consultation || (consultation.clientId !== userId && consultation.lawyerId !== userId && socket.user.role !== 'ADMIN')) {
          ack?.({ ok: false, error: 'forbidden' });
          return;
        }
        await socket.join(`consultation:${id}`);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: 'error' });
      }
    });

    socket.on('consultation:leave', (consultationId) => {
      socket.leave(`consultation:${Number(consultationId)}`);
    });

    socket.on('disconnect', () => {
      metrics.inc('wsDisconnects');
      if (removeConnection(userId, socket.id)) {
        io.emit('presence:update', { userId, online: false });
      }
    });
  });

  // Періодичне очищення outbox (події старші 24 год через чергу фонових задач)
  const cleanup = setInterval(() => {
    enqueue('outbox-cleanup', { olderThan: new Date(Date.now() - 24 * 3600 * 1000) });
  }, 3600_000);
  cleanup.unref();

  return io;
}

// Події з outbox, які клієнт пропустив між сесіями (його персональна кімната + кімнати його консультацій)
async function replayMissedEvents(socket, userId, lastEventId) {
  const rooms = [`user:${userId}`];
  const consultations = await prisma.consultation.findMany({
    where: { OR: [{ clientId: userId }, { lawyerId: userId }] },
    select: { id: true },
  });
  for (const c of consultations) rooms.push(`consultation:${c.id}`);

  const events = await prisma.eventOutbox.findMany({
    where: { id: { gt: BigInt(lastEventId) }, room: { in: rooms } },
    orderBy: { id: 'asc' },
    take: 500,
  });

  if (events.length > 0) {
    socket.emit('events:replay', events.map((e) => ({ id: String(e.id), event: e.event, room: e.room, payload: e.payload })));
  }
}

export { isOnline, onlineUserIds };
