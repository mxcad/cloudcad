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

  // 创建管理员用户
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
    },
  });

  console.log('测试用户已创建:', testUser);

  // 创建示例项目
  const project = await prisma.project.create({
    data: {
      name: '示例项目',
      description: '这是一个示例项目，用于演示系统功能',
      status: 'ACTIVE',
      ownerId: testUser.id,
    },
  });

  console.log('示例项目已创建:', project);

  // 添加项目成员
  await prisma.projectMember.create({
    data: {
      projectId: project.id,
      userId: admin.id,
      role: 'OWNER',
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId: project.id,
      userId: testUser.id,
      role: 'MEMBER',
    },
  });

  console.log('项目成员已添加');

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
