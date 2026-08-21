/**
 * size 为 null 的 FILE 节点存量排查脚本
 *
 * 背景：FileSystemNode.size 可空，复制/粘贴/恢复配额增量计算时 size 为 null
 * 会被当作 0（#215）。守卫层已做防御（NodeSizeResolverService 物理文件兜底），
 * 但存量脏数据是否仍影响统计口径（_sum 忽略 null）需先确认规模，再决定
 * 是否执行 A 回填 / C 统计口径 / D schema 加固。
 *
 * 使用方式：
 * ```bash
 * cd packages/backend
 * pnpm tsx scripts/audit-null-size-files.ts
 * ```
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@cloudcad/db';

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  });
  const prisma = new PrismaClient({ adapter });

  const totalNull = await prisma.fileSystemNode.count({
    where: {
      nodeType: 'FILE',
      size: null,
      deletedAt: null,
    },
  });

  const completedNull = await prisma.fileSystemNode.count({
    where: {
      nodeType: 'FILE',
      size: null,
      fileStatus: 'COMPLETED',
      deletedAt: null,
    },
  });

  console.log('size 为 null 的 FILE 节点（未删除）:', totalNull);
  console.log('其中 fileStatus=COMPLETED:', completedNull);

  if (completedNull > 0) {
    console.log(
      '存在 COMPLETED + size null 存量，建议执行 A（回填）或评估 C（统计口径 coalesce）。'
    );
  } else {
    console.log('无 COMPLETED + size null 存量，防御性收紧（B）已足够。');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('排查失败:', err.message);
  process.exit(1);
});
