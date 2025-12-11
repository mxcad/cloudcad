import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

// Global test setup for integration tests
const prisma = new PrismaClient();

export default async function globalSetup() {
  console.log('🔧 Global test setup started');

  try {
    // Connect to test database
    await prisma.$connect();
    console.log('✅ Database connected');

    // Clean up database before tests
    await cleanupDatabase();
    console.log('✅ Database cleaned');

    // Run database migrations if needed
    // await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    console.log('✅ Database schema ready');

    // Create test data seeds if needed
    await seedTestData();
    console.log('✅ Test data seeded');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    console.log('🔧 Global test setup completed');
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
      } catch (error) {
        console.log(`⚠️  Note: ${tablename} doesn't exist, skipping`);
      }
    }
  }
}

async function seedTestData() {
  // Create default admin user if it doesn't exist
  const hashedPassword = '$2a$10$example.hashed.password'; // Mock hashed password

  try {
    await prisma.user.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'admin@test.com',
        username: 'admin',
        password: hashedPassword,
        nickname: 'Test Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
  } catch (error) {
    // Admin user might already exist
    console.log('ℹ️  Admin user already exists or creation failed');
  }

  // Create default regular user if it doesn't exist
  try {
    await prisma.user.create({
      data: {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'user@test.com',
        username: 'user',
        password: hashedPassword,
        nickname: 'Test User',
        role: 'USER',
        status: 'ACTIVE',
      },
    });
  } catch (error) {
    // Regular user might already exist
    console.log('ℹ️  Regular user already exists or creation failed');
  }
}
