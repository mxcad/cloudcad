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
 * 数据迁移脚本：将 FileSystemNode 中的图库数据迁移到 GalleryItem 表
 *
 * 注意：此脚本用于从旧版本迁移数据到新版本
 * 如果 FileSystemNode 中的图库字段已经被删除，此脚本将无法执行
 */
async function migrateGalleryData() {
  console.log('========================================');
  console.log('开始图库数据迁移');
  console.log('========================================\n');

  try {
    // 1. 检查 FileSystemNode 表中是否还有图库相关字段
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'file_system_nodes'
      AND column_name IN ('is_in_gallery', 'gallery_type', 'gallery_first_type', 'gallery_second_type', 'gallery_third_type', 'gallery_look_num')
    `;

    if (columns.length === 0) {
      console.log('✓ FileSystemNode 表中已没有图库相关字段，无需迁移');
      console.log('⚠️  如果需要迁移历史数据，请先从备份恢复旧版本的数据库');
      return;
    }

    console.log(`✓ 检测到 ${columns.length} 个图库相关字段：`);
    columns.forEach(col => console.log(`  - ${col.column_name}`));

    // 2. 查询所有在图库中的文件
    const nodesInGallery = await prisma.fileSystemNode.findMany({
      where: {
        isInGallery: true,
      },
      select: {
        id: true,
        originalName: true,
        name: true,
        ownerId: true,
        galleryType: true,
        galleryFirstType: true,
        gallerySecondType: true,
        galleryThirdType: true,
        galleryLookNum: true,
      },
    });

    console.log(`\n找到 ${nodesInGallery.length} 个在图库中的文件`);

    if (nodesInGallery.length === 0) {
      console.log('✓ 没有需要迁移的数据');
      return;
    }

    // 3. 显示迁移预览
    console.log('\n迁移预览:');
    console.log('========================================');
    for (const node of nodesInGallery) {
      console.log(`  - ${node.originalName || node.name}`);
      console.log(`    用户: ${node.ownerId}`);
      console.log(`    类型: ${node.galleryType}`);
      console.log(`    分类: ${node.galleryFirstType} -> ${node.gallerySecondType}`);
      console.log(`    浏览次数: ${node.galleryLookNum}`);
    }
    console.log('========================================\n');

    // 4. 询问是否继续
    console.log('⚠️  即将开始迁移，此操作不可逆');
    console.log('建议：');
    console.log('  1. 在迁移前备份数据库');
    console.log('  2. 在测试环境先进行测试');
    console.log('  3. 确认迁移后再在生产环境执行\n');

    // 5. 开始迁移
    console.log('开始迁移...');

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ node: string; error: string }> = [];

    for (const node of nodesInGallery) {
      try {
        // 检查是否已存在相同的 GalleryItem
        const existingItem = await prisma.galleryItem.findFirst({
          where: {
            userId: node.ownerId,
            nodeId: node.id,
            galleryType: node.galleryType!,
            secondType: node.gallerySecondType!,
          },
        });

        if (existingItem) {
          console.log(`  ⚠️  跳过：${node.originalName || node.name}（已存在）`);
          continue;
        }

        // 创建 GalleryItem
        await prisma.galleryItem.create({
          data: {
            userId: node.ownerId,
            nodeId: node.id,
            galleryType: node.galleryType!,
            firstType: node.galleryFirstType!,
            secondType: node.gallerySecondType!,
            thirdType: node.galleryThirdType,
            lookNum: node.galleryLookNum || 0,
          },
        });

        console.log(`  ✓ 迁移成功：${node.originalName || node.name}`);
        successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        console.log(`  ✗ 迁移失败：${node.originalName || node.name} - ${errorMessage}`);
        errors.push({
          node: node.originalName || node.name,
          error: errorMessage,
        });
        errorCount++;
      }
    }

    // 6. 迁移结果
    console.log('\n========================================');
    console.log('迁移完成');
    console.log('========================================');
    console.log(`成功: ${successCount} 条`);
    console.log(`失败: ${errorCount} 条`);
    console.log(`总计: ${nodesInGallery.length} 条\n`);

    if (errors.length > 0) {
      console.log('错误详情:');
      errors.forEach(({ node, error }) => {
        console.log(`  - ${node}: ${error}`);
      });
    }

    if (successCount === nodesInGallery.length) {
      console.log('\n✓ 所有数据迁移成功！');
      console.log('💡 下一步：');
      console.log('  1. 运行 prisma db push 删除 FileSystemNode 中的旧字段');
      console.log('  2. 验证数据完整性');
      console.log('  3. 测试图库功能');
    }

  } catch (error) {
    console.error('\n✗ 迁移失败:', error);
    process.exit(1);
  }
}

/**
 * 检查迁移状态
 */
async function checkMigrationStatus() {
  console.log('========================================');
  console.log('检查图库数据迁移状态');
  console.log('========================================\n');

  try {
    // 检查 FileSystemNode 表中是否还有图库相关字段
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'file_system_nodes'
      AND column_name IN ('is_in_gallery', 'gallery_type', 'gallery_first_type', 'gallery_second_type', 'gallery_third_type', 'gallery_look_num')
    `;

    if (columns.length > 0) {
      console.log('⚠️  FileSystemNode 表中仍有图库相关字段：');
      columns.forEach(col => console.log(`  - ${col.column_name}`));

      const nodesInGallery = await prisma.fileSystemNode.count({
        where: {
          isInGallery: true,
        },
      });

      if (nodesInGallery > 0) {
        console.log(`\n⚠️  检测到 ${nodesInGallery} 个在图库中的文件`);
        console.log('建议运行：pnpm tsx scripts/migrate-gallery-data.ts 进行数据迁移');
      } else {
        console.log('\n✓ 没有需要迁移的数据');
        console.log('建议运行：prisma db push 删除旧字段');
      }
    } else {
      console.log('✓ FileSystemNode 表中已没有图库相关字段');

      // 检查 GalleryItem 表
      const galleryItemCount = await prisma.galleryItem.count();
      console.log(`✓ GalleryItem 表中有 ${galleryItemCount} 条记录`);
    }

    console.log('\n========================================');

  } catch (error) {
    console.error('\n✗ 检查失败:', error);
    process.exit(1);
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'migrate') {
    await migrateGalleryData();
  } else if (command === 'check') {
    await checkMigrationStatus();
  } else {
    console.log('用法:');
    console.log('  pnpm tsx scripts/migrate-gallery-data.ts migrate  # 执行数据迁移');
    console.log('  pnpm tsx scripts/migrate-gallery-data.ts check    # 检查迁移状态');
    console.log('\n默认执行检查...');
    await checkMigrationStatus();
  }
}

main()
  .catch((e) => {
    console.error('执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });