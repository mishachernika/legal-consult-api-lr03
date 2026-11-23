import { metrics } from './metrics.js';

// In-process черга фонових задач (рівень 3). Для кількох інстансів у продакшні — BullMQ поверх Redis.
// Зараз використовується для записів аудит-логу та періодичного очищення outbox.
const queues = new Map();

export function createQueue(name, handler) {
  queues.set(name, { name, handler, jobs: [], running: false });
}

export function enqueue(name, payload) {
  const q = queues.get(name);
  if (!q) throw new Error(`Черга "${name}" не зареєстрована`);
  q.jobs.push(payload);
  metrics.inc('queueEnqueued');
  void drain(q);
  return q.jobs.length;
}

export function queueSize(name) {
  return queues.get(name)?.jobs.length ?? 0;
}

export function queueStats() {
  return Object.fromEntries([...queues.values()].map((q) => [q.name, { pending: q.jobs.length, running: q.running }]));
}

async function drain(q) {
  if (q.running) return;
  q.running = true;
  while (q.jobs.length > 0) {
    const job = q.jobs.shift();
    try {
      await q.handler(job);
      metrics.inc('queueProcessed');
    } catch (err) {
      metrics.inc('queueFailed');
      console.error(`[queue:${q.name}] job failed:`, err.message);
    }
  }
  q.running = false;
}
