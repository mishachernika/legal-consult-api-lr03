import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// У тестовому режимі (NODE_ENV=test) змінні беруться з .env.test, інакше — з .env.
// Наявні змінні середовища (наприклад, у CI) не перезаписуються.
config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
