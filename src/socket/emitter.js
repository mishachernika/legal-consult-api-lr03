import { prisma } from '../db.js';
import { metrics } from '../utils/metrics.js';

// Єдине місце, де зберігається посилання на io (setIo викликається з initSocket у server.js / тестах)
let io = null;

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}

// Outbox-патерн: кожна real-time подія спочатку пишеться в EventOutbox (автоінкрементний id —
// це порядковий номер події), а потім розсилається в кімнату. Завдяки цьому клієнт,
// який перепідключився з lastEventId, може отримати пропущені події.
// room: 'user:<id>' | 'consultation:<id>' | '' (broadcast всім)
export async function publishEvent(room, event, payload = {}) {
  const row = await prisma.eventOutbox.create({ data: { event, room, payload } });
  metrics.inc('eventsPublished');
  const data = { id: String(row.id), ...payload };
  if (!getIo()) return row; // наприклад, у REST-тестах без піднятого socket-сервера
  if (room === '') getIo().emit(event, data);
  else getIo().to(room).emit(event, data);
  return row;
}
