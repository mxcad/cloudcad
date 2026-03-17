///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

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
      } catch (error) {
        // 某些表可能因外键约束无法清空，忽略错误继续
        console.warn(`[global-teardown] 清空表 ${tablename} 失败:`, error);
      }
    }
  }
}
