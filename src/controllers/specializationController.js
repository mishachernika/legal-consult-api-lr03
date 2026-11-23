import { specializationModel } from '../models/specializationModel.js';
import { AppError } from '../utils/AppError.js';
import { assertValid } from '../utils/validate.js';
import { parseId } from '../utils/params.js';

export async function getSpecializations(req, res) {
  res.json({ data: await specializationModel.findAll() });
}

export async function getSpecializationById(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор спеціалізації');
  const specialization = await specializationModel.findById(id);
  if (!specialization) throw new AppError(404, 'Спеціалізацію не знайдено');
  res.json({ data: specialization });
}

export async function createSpecialization(req, res) {
  assertValid(req.body, {
    name: ['required', 'string', ['min', 3], ['max', 100]],
    description: ['string', ['max', 1000]],
  });
  const { name, description } = req.body;

  const existing = await specializationModel.findByName(name);
  if (existing) throw new AppError(409, 'Така спеціалізація вже існує');

  const specialization = await specializationModel.create({ name, description });
  res.status(201).json({ data: specialization });
}

export async function updateSpecialization(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор спеціалізації');
  assertValid(req.body, {
    name: ['string', ['min', 3], ['max', 100]],
    description: ['string', ['max', 1000]],
  });
  const { name, description } = req.body ?? {};
  if (name === undefined && description === undefined) {
    throw new AppError(400, 'Не передано жодного поля для оновлення');
  }
  if (name) {
    const existing = await specializationModel.findByName(name);
    if (existing && existing.id !== id) throw new AppError(409, 'Така спеціалізація вже існує');
  }
  const data = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;

  const specialization = await specializationModel.update(id, data);
  res.json({ data: specialization });
}

export async function deleteSpecialization(req, res) {
  const id = parseId(req.params.id, 'ідентифікатор спеціалізації');
  await specializationModel.remove(id);
  res.status(204).end();
}
