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

/**
 * 图库分类定义
 */
interface GalleryTypeDefinition {
  name: string;
  pid: number;
  galleryType: 'drawings' | 'blocks';
}

/**
 * 默认分类数据
 * 注意：二级分类的 pid 将在运行时动态查找对应的一级分类 ID
 */
interface GalleryTypeDefinitionWithParent extends GalleryTypeDefinition {
  parentName?: string; // 父分类名称（仅二级分类使用）
}

const defaultTypes: GalleryTypeDefinitionWithParent[] = [
  // 图纸库分类
  { name: '建筑', pid: 0, galleryType: 'drawings' },
  { name: '机械', pid: 0, galleryType: 'drawings' },
  { name: '门', pid: 0, galleryType: 'drawings', parentName: '建筑' },
  { name: '窗', pid: 0, galleryType: 'drawings', parentName: '建筑' },
  { name: '齿轮', pid: 0, galleryType: 'drawings', parentName: '机械' },

  // 图块库分类
  { name: '建筑', pid: 0, galleryType: 'blocks' },
  { name: '机械', pid: 0, galleryType: 'blocks' },
  { name: '门', pid: 0, galleryType: 'blocks', parentName: '建筑' },
  { name: '窗', pid: 0, galleryType: 'blocks', parentName: '建筑' },
  { name: '齿轮', pid: 0, galleryType: 'blocks', parentName: '机械' },
];

async function main() {
  console.log('开始初始化图库分类...');

  // 清空现有分类（可选）
  const deleteResult = await prisma.galleryType.deleteMany({});
  console.log(`  清空了 ${deleteResult.count} 个现有分类`);

  // 创建新分类
  let createdCount = 0;

  // 获取已创建的分类 ID 映射（用于设置二级分类的 pid）
  const typeNameToIdMap = new Map<string, number>();

  // 获取管理员用户 ID
  const adminUser = await prisma.user.findFirst({
    where: { username: 'admin' },
  });

  if (!adminUser) {
    console.error('  ✗ 找不到管理员用户，无法创建默认分类');
    await prisma.$disconnect();
    process.exit(1);
  }

  for (const typeData of defaultTypes) {
    // 如果是一级分类（pid = 0），直接创建
    if (typeData.pid === 0 && !typeData.parentName) {
      const type = await prisma.galleryType.create({
        data: {
          name: typeData.name,
          pid: typeData.pid,
          galleryType: typeData.galleryType,
          ownerId: adminUser.id,
        },
      });
      typeNameToIdMap.set(`${typeData.galleryType}-${typeData.name}`, type.id);
      console.log(
        `  ✓ 创建一级分类: ${typeData.galleryType} - ${typeData.name} (ID: ${type.id})`
      );
      createdCount++;
    }
  }

  // 创建二级分类
  for (const typeData of defaultTypes) {
    // 如果是二级分类（有 parentName），需要先找到对应的一级分类 ID
    if (typeData.parentName) {
      // 根据 parentName 查找对应的一级分类
      const parentType = await prisma.galleryType.findFirst({
        where: {
          name: typeData.parentName,
          pid: 0,
          galleryType: typeData.galleryType,
          ownerId: adminUser.id,
        },
      });

      if (!parentType) {
        console.error(
          `  ✗ 找不到父分类: parentName=${typeData.parentName}, galleryType=${typeData.galleryType}`
        );
        continue;
      }

      const type = await prisma.galleryType.create({
        data: {
          name: typeData.name,
          pid: parentType.id,
          galleryType: typeData.galleryType,
          ownerId: adminUser.id,
        },
      });
      console.log(
        `  ✓ 创建二级分类: ${typeData.galleryType} - ${typeData.name} (父分类: ${parentType.name}, ID: ${type.id})`
      );
      createdCount++;
    }
  }

  console.log('\n图库分类初始化完成!');
  console.log(`  - 新建: ${createdCount} 个`);

  // 显示所有分类
  const allTypes = await prisma.galleryType.findMany({
    orderBy: [{ galleryType: 'asc' }, { pid: 'asc' }, { id: 'asc' }],
  });

  console.log('\n当前所有分类:');
  for (const type of allTypes) {
    const level = type.pid === 0 ? '一级' : '二级';
    const parent = type.pid === 0 ? '-' : `父ID: ${type.pid}`;
    console.log(
      `  - [${type.galleryType}] ${type.name} (${level}, ${parent}, ID: ${type.id})`
    );
  }
}

main()
  .catch((e) => {
    console.error('初始化图库分类失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
