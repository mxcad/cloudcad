import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDatabaseSchema() {
  try {
    console.log('Testing database schema...');

    // 测试 1: 查询所有用户（检查 User 模型是否可用）
    const userCount = await prisma.user.count();
    console.log(`✓ User model is available. Total users: ${userCount}`);

    // 测试 2: 查询有状态的用户（检查 status 字段是否存在）
    const usersWithStatus = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
      },
      take: 1,
      select: {
        id: true,
        email: true,
        status: true,
      },
    });

    console.log(
      `✓ Status field exists and is queryable. Found ${usersWithStatus.length} active users`
    );

    // 测试 3: 检查 UserStatus 枚举值
    const allUsers = await prisma.user.findMany({
      take: 5,
      select: {
        id: true,
        status: true,
      },
    });

    const statuses = new Set(allUsers.map((u) => u.status));
    console.log(
      `✓ UserStatus enum values found: ${Array.from(statuses).join(', ')}`
    );

    console.log('\n✅ All tests passed! Database schema is correct.');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseSchema();
