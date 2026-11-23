import { AppError } from './AppError.js';

export function parseId(value, name = 'ідентифікатор') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `Невалідний ${name}: ${value}`);
  }
  return id;
}
