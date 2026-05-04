///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
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
    }
    catch (error) {
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
async function cleanupDatabase() {
    // Clean up in order of dependencies to avoid foreign key constraints
    const tablenames = await prisma.$queryRaw `SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    for (const row of tablenames) {
        const { tablename } = row;
        if (tablename !== '_prisma_migrations') {
            try {
                await prisma.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
            }
            catch (error) {
                // 某些表可能因外键约束无法清空，忽略错误继续
                console.warn(`[global-teardown] 清空表 ${tablename} 失败:`, error);
            }
        }
    }
}
//# sourceMappingURL=global-teardown.js.map