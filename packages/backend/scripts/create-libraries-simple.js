const { PrismaClient } = require('@prisma/client');

// Set the DATABASE_URL environment variable
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/cloudcad';

// Initialize Prisma Client without additional configuration
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('开始创建公共资源库...');
    
    // 连接数据库
    await prisma.$connect();
    console.log('✅ 数据库连接成功');
    
    // 获取系统管理员用户
    const adminUser = await prisma.user.findFirst({
      where: {
        role: {
          name: 'ADMIN',
        },
      },
    });

    if (!adminUser) {
      console.error('❌ 未找到管理员用户');
      return;
    }

    console.log(`✅ 找到管理员用户: ${adminUser.username}`);

    // 定义公共资源库配置
    const libraries = [
      {
        key: 'drawing',
        name: '公共图纸库',
        description: '公共 CAD 图纸资源',
      },
      {
        key: 'block',
        name: '公共图块库',
        description: '公共 CAD 图块资源',
      },
    ];

    // 检查和创建公共资源库
    for (const lib of libraries) {
      console.log(`\n检查 ${lib.name}...`);
      
      // 检查是否已存在（包括软删除的）
      const existing = await prisma.fileSystemNode.findFirst({
        where: { 
          libraryKey: lib.key, 
          isRoot: true,
          deletedAt: null, // 只查找未删除的
        },
      });

      if (existing) {
        console.log(`✅ ${lib.name} 已存在`);
      } else {
        console.log(`⚠️  ${lib.name} 不存在，正在创建...`);
        // 创建公共资源库根节点
        await prisma.fileSystemNode.create({
          data: {
            name: lib.name,
            description: lib.description,
            isFolder: true,
            isRoot: true,
            libraryKey: lib.key,
            projectStatus: 'ACTIVE',
            ownerId: adminUser.id,
          },
        });
        console.log(`✅ ${lib.name} 创建成功`);
      }
    }

    console.log('\n🎉 公共资源库创建完成！');
  } catch (error) {
    console.error('❌ 创建公共资源库失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();