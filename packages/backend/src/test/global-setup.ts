import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

// Global test setup for integration tests
const prisma = new PrismaClient();

export default async function globalSetup() {
  try {
    // Connect to test database
    await prisma.$connect();
    // Clean up database before tests
    await cleanupDatabase();
    // Run database migrations if needed
    // await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
    // Create test data seeds if needed
    await seedTestData();
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

async function seedTestData() {
  // Create default admin user if it doesn't exist
  const hashedPassword = '$2a$10$example.hashed.password'; // Mock hashed password

  try {
    // 获取或创建 ADMIN 角色
    let adminRole = await prisma.role.findFirst({
      where: { name: 'ADMIN' },
    });

    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: {
          name: 'ADMIN',
          description: '系统管理员，拥有所有权限',
          isSystem: true,
        },
      });
    }

    await prisma.user.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'admin@test.com',
        username: 'admin',
        password: hashedPassword,
        nickname: 'Test Admin',
        roleId: adminRole.id,
        status: 'ACTIVE',
      },
    });
  } catch (error) {
    // Admin user might already exist
  }

  // Create default regular user if it doesn't exist
  try {
    // 获取或创建 USER 角色
    let userRole = await prisma.role.findFirst({
      where: { name: 'USER' },
    });

    if (!userRole) {
      userRole = await prisma.role.create({
        data: {
          name: 'USER',
          description: '普通用户，基础权限',
          isSystem: true,
        },
      });
    }

    await prisma.user.create({
      data: {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'user@test.com',
        username: 'user',
        password: hashedPassword,
        nickname: 'Test User',
        roleId: userRole.id,
        status: 'ACTIVE',
      },
    });
  } catch (error) {
    // Regular user might already exist
  }
}
