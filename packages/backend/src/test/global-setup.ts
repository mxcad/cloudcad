///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

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
      } catch (error) {
        // 某些表可能因外键约束无法清空，忽略错误继续
        console.warn(`[global-setup] 清空表 ${tablename} 失败:`, error);
      }
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
    console.warn('[global-setup] 创建管理员测试用户失败 (可能已存在):', error);
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
    console.warn('[global-setup] 创建普通测试用户失败 (可能已存在):', error);
  }
}
