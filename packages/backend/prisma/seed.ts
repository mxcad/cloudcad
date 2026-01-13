import 'dotenv/config';
import { PrismaClient, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

// 手动构建DATABASE_URL，确保格式正确
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || '5432';
const dbUser = process.env.DB_USERNAME || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'password';
const dbDatabase = process.env.DB_DATABASE || 'cloucad';

// 确保密码是字符串类型并进行URL编码
const encodedPassword = encodeURIComponent(String(dbPassword));
const databaseUrl = `postgresql://${dbUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbDatabase}`;

console.log('数据库连接URL:', databaseUrl.replace(/:[^:@]*@/, ':***@')); // 隐藏密码的日志

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  log: ['info', 'warn', 'error'],
  adapter,
});

async function main() {
  console.log('开始种子数据初始化...');

  // 获取或创建默认角色
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: '系统管理员，拥有所有权限',
      isSystem: true,
    },
  });

  const userRole = await prisma.role.upsert({
    where: { name: 'USER' },
    update: {},
    create: {
      name: 'USER',
      description: '普通用户，基础权限',
      isSystem: true,
    },
  });

  console.log('角色已准备:', adminRole.name, userRole.name);

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
      roleId: adminRole.id,
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
      roleId: userRole.id,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('测试用户已创建:', testUser);

  // 创建更多测试用户（用于分页功能测试）
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

  // 批量创建用户
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
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`用户已创建: ${user.nickname} (${user.email})`);
  }

  // 创建批量测试用户（用于分页测试）
  const surnames = ['陈', '林', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '罗', '梁'];
  const names = ['明', '伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰'];

  for (let i = 1; i <= 43; i++) {
    const surname = surnames[i % surnames.length];
    const name = names[i % names.length];
    const nickname = `${surname}${name}${i}`;
    const username = `user${i}`;
    const email = `user${i}@cloucad.com`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        username,
        password: testPassword,
        nickname,
        roleId: userRole.id,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`测试用户已创建: ${user.nickname} (${user.email})`);
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
