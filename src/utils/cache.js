// Кеш: за замовчуванням у пам'яті процесу, якщо задано REDIS_URL — у Redis (тоді кеш спільний для всіх інстансів).
// Інвалідація версійна: bump версії namespace робить усі старі ключі невалідними (працює й у Redis).
const memory = new Map(); // key -> { value, expiresAt }
const memoryVersions = new Map(); // namespace -> version
let redisClient = null;

async function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (redisClient) return redisClient;
  const { createClient } = await import('redis');
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', () => {});
  await redisClient.connect();
  return redisClient;
}

async function getVersion(namespace) {
  const r = await getRedis().catch(() => null);
  if (r) return Number((await r.get(`cache:v:${namespace}`)) ?? 0);
  return memoryVersions.get(namespace) ?? 0;
}

// Обчислює fn і кладе результат у кеш на ttlSeconds; при hit віддає з кешу
export async function cacheWrap(namespace, rawKey, ttlSeconds, fn) {
  const version = await getVersion(namespace);
  const key = `cache:${namespace}:v${version}:${rawKey}`;

  const r = await getRedis().catch(() => null);
  if (r) {
    const hit = await r.get(key).catch(() => null);
    if (hit !== null) return JSON.parse(hit);
    const value = await fn();
    await r.set(key, JSON.stringify(value), { EX: ttlSeconds }).catch(() => {});
    return value;
  }

  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await fn();
  memory.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  // щоб пам'ять не росла вічно — чистимо прострочене при кожному записі
  for (const [k, v] of memory) {
    if (v.expiresAt <= now) memory.delete(k);
  }
  return value;
}

// Невалідувати весь namespace (наприклад, після зміни довідника)
export async function cacheInvalidate(namespace) {
  const r = await getRedis().catch(() => null);
  if (r) {
    await r.incr(`cache:v:${namespace}`).catch(() => {});
  } else {
    memoryVersions.set(namespace, (memoryVersions.get(namespace) ?? 0) + 1);
  }
}
