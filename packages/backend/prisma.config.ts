import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DATABASE_URL 缺失时的兜底：从 DB_* 部件拼接（与部署运行时 pg_dump/psql 及
// 后端 database.service 同一口径）。禁止硬编码端口——部署换端口（DB_PORT=5433
// 绕开系统 PG）时硬编码 5432 会让 Prisma CLI 静默连到系统库（用户 VM 实锤：
// DB_PORT=5433、兜底仍 5432 → migrate deploy 对系统库 P1000）
function fallbackDatabaseUrl(dbSuffix = '') {
  const user = process.env.DB_USERNAME || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const db = process.env.DB_DATABASE || 'cloudcad';
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${db}${dbSuffix}`;
}

export default defineConfig({
  schema: '../db/prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/prisma/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL || fallbackDatabaseUrl(),
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL || fallbackDatabaseUrl('_shadow'),
  },
});
