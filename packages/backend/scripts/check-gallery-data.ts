import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

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

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('========================================');
  console.log('查询图库数据');
  console.log('========================================\n');

  // 查询所有分类
  const types = await prisma.galleryType.findMany({
    orderBy: [{ galleryType: 'asc' }, { pid: 'asc' }, { id: 'asc' }],
  });

  console.log(`分类总数: ${types.length}`);
  console.log('\n分类列表:');
  for (const type of types) {
    const level = type.pid === 0 ? '一级' : '二级';
    const parent = type.pid === 0 ? '-' : `父ID: ${type.pid}`;
    console.log(
      `  - [${type.galleryType}] ${type.name} (${level}, ${parent}, ID: ${type.id}, 状态: ${type.status})`
    );
  }

  // 查询所有图库文件
  const items = await prisma.fileSystemNode.findMany({
    where: {
      isInGallery: true,
    },
    select: {
      originalName: true,
      fileHash: true,
      galleryFirstType: true,
      gallerySecondType: true,
      galleryType: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`\n图库文件总数: ${items.length}`);
  if (items.length > 0) {
    console.log('\n图库文件列表:');
    for (const item of items) {
      console.log(
        `  - ${item.originalName} (firstType: ${item.galleryFirstType}, secondType: ${item.gallerySecondType}, galleryType: ${item.galleryType})`
      );
    }
  } else {
    console.log('\n⚠️  图库中没有文件，需要添加文件到图库');
  }

  // 统计每个分类下的文件数量
  console.log('\n========================================');
  console.log('分类文件统计');
  console.log('========================================\n');

  for (const type of types) {
    const itemCount = await prisma.fileSystemNode.count({
      where: {
        galleryFirstType: type.id,
        isInGallery: true,
      },
    });

    if (itemCount > 0) {
      console.log(
        `- [${type.galleryType}] ${type.name} (ID: ${type.id}): ${itemCount} 个文件`
      );
    }
  }

  console.log('\n========================================');
}

main()
  .catch((e) => {
    console.error('查询失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
