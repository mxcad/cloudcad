import 'dotenv/config';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('开始种子数据初始化...');

  // 创建管理员用户（管理员账号不需要邮箱验证）
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@cloucad.com' },
    update: {},
    create: {
      email: 'admin@cloucad.com',
      username: 'admin',
      password: adminPassword,
      nickname: '系统管理员',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('管理员用户已创建:', admin);

  // 创建测试用户
  const testPassword = await bcrypt.hash('Test123!', 12);
  const testUser = await prisma.user.upsert({
    where: { email: 'test@cloucad.com' },
    update: {},
    create: {
      email: 'test@cloucad.com',
      username: 'testuser',
      password: testPassword,
      nickname: '测试用户',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('测试用户已创建:', testUser);

  // 创建更多测试用户
  const users = [
    {
      email: 'zhangsan@cloucad.com',
      username: 'zhangsan',
      nickname: '张三',
      password: 'Zhang123!',
    },
    {
      email: 'lisi@cloucad.com',
      username: 'lisi',
      nickname: '李四',
      password: 'Li123!',
    },
    {
      email: 'wangwu@cloucad.com',
      username: 'wangwu',
      nickname: '王五',
      password: 'Wang123!',
    },
    {
      email: 'zhaoliu@cloucad.com',
      username: 'zhaoliu',
      nickname: '赵六',
      password: 'Zhao123!',
    },
    {
      email: 'qianqi@cloucad.com',
      username: 'qianqi',
      nickname: '钱七',
      password: 'Qian123!',
    },
  ];

  for (const userData of users) {
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: userData.email,
        username: userData.username,
        password: hashedPassword,
        nickname: userData.nickname,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`用户已创建: ${user.nickname} (${user.email})`);
  }

  console.log('种子数据初始化完成!');
}

main()
  .catch((e) => {
    console.error('种子数据初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
