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

  // 创建测试用户 - 已注释，改为通过注册流程创建
  // const testPassword = await bcrypt.hash('Test123!', 12);
  // const testUser = await prisma.user.upsert({
  //   where: { email: 'test@cloucad.com' },
  //   update: {},
  //   create: {
  //     email: 'test@cloucad.com',
  //     username: 'testuser',
  //     password: testPassword,
  //     nickname: '测试用户',
  //     role: UserRole.USER,
  //     status: UserStatus.INACTIVE,
  //     emailVerified: false,
  //   },
  // });

  // console.log('测试用户已创建:', testUser);

  // 创建示例项目（根文件夹）- 已注释，等待用户注册后创建
  // const projectRootNode = await prisma.fileSystemNode.create({
  //   data: {
  //     name: '示例项目',
  //     description: '这是一个示例项目，用于演示系统功能',
  //     isFolder: true,
  //     isRoot: true,
  //     projectStatus: 'ACTIVE',
  //     ownerId: testUser.id,
  //   },
  // });

  // console.log('示例项目（根节点）已创建:', projectRootNode);

  // // 添加项目成员
  // await prisma.projectMember.create({
  //   data: {
  //     nodeId: projectRootNode.id,
  //     userId: admin.id,
  //     role: 'ADMIN',
  //   },
  // });

  // await prisma.projectMember.create({
  //   data: {
  //     nodeId: projectRootNode.id,
  //     userId: testUser.id,
  //     role: 'OWNER',
  //   },
  // });

  // console.log('项目成员已添加');

  // // 创建示例文件夹
  // const designFolder = await prisma.fileSystemNode.create({
  //   data: {
  //     name: '设计图纸',
  //     isFolder: true,
  //     isRoot: false,
  //     parentId: projectRootNode.id,
  //     ownerId: testUser.id,
  //   },
  // });

  // console.log('示例文件夹已创建:', designFolder);

  // // 创建示例文件
  // const sampleFile = await prisma.fileSystemNode.create({
  //   data: {
  //     name: 'sample.dwg',
  //     originalName: 'sample.dwg',
  //     isFolder: false,
  //     isRoot: false,
  //     parentId: designFolder.id,
  //     extension: '.dwg',
  //     mimeType: 'application/acad',
  //     size: 1024000,
  //     path: '/uploads/sample-dwg-123456.dwg',
  //     fileStatus: 'COMPLETED',
  //     ownerId: testUser.id,
  //   },
  // });

  // console.log('示例文件已创建:', sampleFile);

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
