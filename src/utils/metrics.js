// Прості метрики застосунку: лічильники + gauge-функції (зчитуються при /metrics)
const counters = new Map();
const gauges = new Map();
const startedAt = Date.now();

export const metrics = {
  inc(name, by = 1) {
    counters.set(name, (counters.get(name) ?? 0) + by);
  },
  gauge(name, fn) {
    gauges.set(name, fn);
  },
  snapshot() {
    const gaugesOut = {};
    for (const [name, fn] of gauges) {
      try {
        gaugesOut[name] = fn();
      } catch {
        gaugesOut[name] = null;
      }
    }
    return {
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      counters: Object.fromEntries(counters),
      gauges: gaugesOut,
    };
  },
};
