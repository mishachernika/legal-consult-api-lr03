import { AppError } from './AppError.js';

// Проста DSL-валідація: правило — рядок 'check' або пара ['check', аргумент]
const checks = {
  required: () => (v) => (v === undefined || v === null || v === '' ? 'поле є обов\'язковим' : null),
  email: () => (v) => (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'невірний формат email'),
  string: () => (v) => (typeof v === 'string' ? null : 'має бути рядком'),
  min: (n) => (v) => (typeof v === 'string' && v.trim().length >= n ? null : `мінімальна довжина — ${n} символів`),
  max: (n) => (v) => (typeof v === 'string' && v.length <= n ? null : `максимальна довжина — ${n} символів`),
  int: () => (v) => (Number.isInteger(v) ? null : 'має бути цілим числом'),
  positiveInt: () => (v) => (Number.isInteger(v) && v > 0 ? null : 'має бути додатним цілим числом'),
  nonNegativeInt: () => (v) => (Number.isInteger(v) && v >= 0 ? null : 'має бути цілим невід\'ємним числом'),
  rating: () => (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? null : 'має бути цілим числом від 1 до 5'),
  nonNegativeNumber: () => (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? null : 'має бути невід\'ємним числом'),
  date: () => (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? null : 'має бути датою у форматі ISO 8601'),
  bool: () => (v) => (typeof v === 'boolean' ? null : 'має бути булевим значенням'),
  enum: (list) => (v) => (list.split(',').map((s) => s.trim()).includes(v) ? null : `допустимі значення: ${list}`),
  arrayOfPositiveInt: () => (v) =>
    Array.isArray(v) && v.length > 0 && v.every((x) => Number.isInteger(x) && x > 0)
      ? null
      : 'має бути непорожнім масивом додатних цілих чисел',
};

export function validate(data, rules) {
  const errors = {};
  for (const [field, ruleList] of Object.entries(rules)) {
    const value = data ? data[field] : undefined;
    for (const rule of ruleList) {
      const [name, arg] = Array.isArray(rule) ? rule : [rule];
      const make = checks[name];
      if (!make) continue;
      // необов'язкові поля не перевіряємо, якщо їх не передано
      if (name !== 'required' && (value === undefined || value === null)) continue;
      const message = make(arg)(value);
      if (message) {
        (errors[field] ??= []).push(message);
        break;
      }
    }
  }
  return errors;
}

export function assertValid(data, rules) {
  const errors = validate(data, rules);
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Помилка валідації даних', errors);
  }
}
