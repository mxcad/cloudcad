/**
 * 修复节点 path 字段格式
 *
 * 问题：节点的 path 字段包含了完整文件路径（包含文件名）
 * 解决：将 path 字段修改为只包含目录路径
 *
 * 例如：
 *  修改前：202602/cml69vs3w0003ssuf0kchmrg6/f72f8517355ec1d0720d87a2f32249b7.dwg.mxweb
 *  修改后：202602/cml69vs3w0003ssuf0kchmrg6
 */

import { PrismaClient } from '@prisma/client';
import * as path from 'path';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('开始修复节点 path 字段格式...');

  // 查找所有包含文件名的节点（path 中包含扩展名）
  const nodes = await prisma.fileSystemNode.findMany({
    where: {
      path: {
        not: null,
      },
      isFolder: false,
    },
    select: {
      id: true,
      name: true,
      path: true,
    },
  });

  console.log(`找到 ${nodes.length} 个节点需要检查`);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const node of nodes) {
    if (!node.path) {
      continue;
    }

    // 检查 path 是否包含文件名（通过检查是否有扩展名）
    const pathExt = path.extname(node.path);

    if (pathExt) {
      // path 包含文件名，需要修复
      const directoryPath = path.dirname(node.path);

      console.log(`修复节点 ${node.id} (${node.name})`);
      console.log(`  原路径: ${node.path}`);
      console.log(`  新路径: ${directoryPath}`);

      await prisma.fileSystemNode.update({
        where: { id: node.id },
        data: { path: directoryPath },
      });

      fixedCount++;
    } else {
      // path 已经是正确的格式（纯目录路径）
      skippedCount++;
    }
  }

  console.log(`\n修复完成！`);
  console.log(`  修复数量: ${fixedCount}`);
  console.log(`  跳过数量: ${skippedCount}`);
}

main()
  .catch((e) => {
    console.error('修复失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
