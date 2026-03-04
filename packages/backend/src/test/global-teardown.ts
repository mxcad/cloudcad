import { PrismaClient } from '@prisma/client';

// Global test teardown for integration tests
const prisma = new PrismaClient();

export default async function globalTeardown() {
  try {
    // Connect to test database
    await prisma.$connect();
    // Clean up database after tests
    await cleanupDatabase();
  } catch (error) {
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupDatabase() {
  // Clean up in order of dependencies to avoid foreign key constraints
  const tablenames =
    await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  for (const row of tablenames as Array<{ tablename: string }>) {
    const { tablename } = row;
    if (tablename !== '_prisma_migrations') {
      try {
        await prisma.$executeRawUnsafe(
          `TRUNCATE TABLE "public"."${tablename}" CASCADE;`
        );
      } catch (error) {}
    }
  }
}
