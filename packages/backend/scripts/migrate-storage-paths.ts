/**
 * 数据迁移脚本：将旧路径格式的文件迁移到新路径格式
 *
 * 旧路径格式：files/{userId}/{timestamp}-{filename}
 * 新路径格式：mxcad/file/{fileHash}/{filename}
 *
 * 运行方式：
 * pnpm ts-node scripts/migrate-storage-paths.ts
 */

import { PrismaClient, FileStatus } from '@prisma/client';
import { MinioStorageProvider } from '../src/storage/minio-storage.provider';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

const prisma = new PrismaClient();
const configService = new ConfigService();

async function migrateStoragePaths() {
  console.log('🚀 开始迁移存储路径...\n');

  try {
    // 初始化 MinIO 存储服务
    const minioStorage = new MinioStorageProvider(configService);

    // 查询所有使用旧路径格式的文件节点
    const oldPathNodes = await prisma.fileSystemNode.findMany({
      where: {
        path: {
          startsWith: 'files/',
        },
        isFolder: false,
        fileStatus: FileStatus.COMPLETED,
        fileHash: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        fileHash: true,
        path: true,
        size: true,
      },
    });

    console.log(`📊 找到 ${oldPathNodes.length} 个需要迁移的文件节点\n`);

    if (oldPathNodes.length === 0) {
      console.log('✅ 没有需要迁移的文件');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (const node of oldPathNodes) {
      // 跳过 path 或 fileHash 为 null 的节点
      if (!node.path || !node.fileHash) {
        console.log(`\n⚠️  跳过文件: ${node.name} (path 或 fileHash 为空)`);
        failCount++;
        continue;
      }

      const oldPath = node.path;
      const newPath = `mxcad/file/${node.fileHash}/${node.name}`;

      console.log(`\n处理文件: ${node.name}`);
      console.log(`  旧路径: ${oldPath}`);
      console.log(`  新路径: ${newPath}`);

      try {
        // 检查新路径是否已存在
        const newFileExists = await minioStorage.fileExists(newPath);

        if (newFileExists) {
          console.log(`  ⏭️  新路径已存在，跳过迁移`);
          skipCount++;

          // 更新数据库路径
          await prisma.fileSystemNode.update({
            where: { id: node.id },
            data: { path: newPath },
          });
          console.log(`  ✅ 数据库路径已更新`);
          continue;
        }

        // 检查旧路径是否存在
        const oldFileExists = await minioStorage.fileExists(oldPath);

        if (!oldFileExists) {
          console.log(`  ⚠️  旧路径文件不存在，跳过迁移`);
          failCount++;
          continue;
        }

        // 拷贝文件到新路径
        console.log(`  📦 拷贝文件...`);
        const copySuccess = await minioStorage.copyFile(oldPath, newPath);

        if (!copySuccess) {
          console.log(`  ❌ 拷贝失败`);
          failCount++;
          continue;
        }

        console.log(`  ✅ 拷贝成功`);

        // 更新数据库路径
        await prisma.fileSystemNode.update({
          where: { id: node.id },
          data: { path: newPath },
        });

        console.log(`  ✅ 数据库路径已更新`);
        successCount++;
      } catch (error) {
        console.error(`  ❌ 迁移失败: ${error.message}`);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 迁移统计:');
    console.log(`  ✅ 成功: ${successCount}`);
    console.log(`  ⏭️  跳过: ${skipCount}`);
    console.log(`  ❌ 失败: ${failCount}`);
    console.log(`  📊 总计: ${oldPathNodes.length}`);
    console.log('='.repeat(50));

    if (failCount > 0) {
      console.log('\n⚠️  部分文件迁移失败，请检查日志');
      process.exit(1);
    } else {
      console.log('\n✅ 所有文件迁移完成！');
    }
  } catch (error) {
    console.error('\n❌ 迁移过程出错:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行迁移
migrateStoragePaths();
