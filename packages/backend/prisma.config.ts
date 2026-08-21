import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: '../db/prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/prisma/seed.js',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://postgres:password@localhost:5432/cloudcad',
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL ||
      'postgresql://postgres:password@localhost:5432/cloudcad_shadow',
  },
});
