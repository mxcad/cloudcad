/**
 * data/files 污染治理迁移脚本（一次性、幂等、发现式）
 *
 * 背景：`data/files` 是 SVN 工作副本、且被 DirectoryAllocator 按 {YYYYMM}/{nodeId}/ 扫描。
 * 两类历史污染需要清理（线上旧代码 d358697 之前产生）：
 *
 *   1. UUID 副本节点——旧版 node-copy-move 用 randomUUID() 造副本节点 id，磁盘目录名是
 *      UUID、目录内文件却沿用源节点 cuid 文件名，导致「目录名 / 文件名前缀 / nodeId」三者
 *      不一致，preloading 读侧按 nodeId 推导路径指向不存在的文件（外部参照静默失效）。
 *      本脚本按 UUID 正则**发现**这些节点（不硬编码 id，适配任意实例），把目录名、文件名
 *      前缀、DB 的 id/path、audit_logs 的 resourceId/params.nodeId 统一改为新 cuid。
 *
 *   2. 非图纸资产落在 files 下——头像（data/files/avatars）与品牌资产（data/files/brand）
 *      会被当月份目录列举、.png 又不在 MX_IGNORE_PATTERNS 内被卷入 SVN 版本提交。
 *      本脚本把它们搬到 data/ 层（与代码侧新默认值一致）。
 *
 * 幂等：无 UUID 节点 / 目录已搬走时是空操作，可重复执行。
 *
 * 使用方式：
 * ```bash
 * cd packages/backend
 * pnpm tsx scripts/migrate-files-data-hygiene.ts --dry-run   # 仅统计
 * pnpm tsx scripts/migrate-files-data-hygiene.ts             # 执行
 * ```
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@cloudcad/db';
import { createId } from '@paralleldrive/cuid2';

const isDryRun = process.argv.includes('--dry-run');

// 与 packages/backend/src/config/configuration.ts 的 resolvePath 逻辑保持一致。
// 该文件用 __dirname(=…/src/config) + '../../../../' 定位仓库根；本脚本在
// packages/backend/scripts，到仓库根是三级（scripts→backend→packages→根）。
// 注意 migrate-wechat-avatars.ts 用的 '../../' 会错落到 packages/data，勿照抄。
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
function resolvePath(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
  return path.resolve(PROJECT_ROOT, inputPath);
}
const filesDataPath = resolvePath(process.env.FILES_DATA_PATH || 'data/files');
const avatarPath = resolvePath(process.env.AVATAR_PATH || 'data/avatars');
const brandAssetPath = resolvePath(process.env.BRAND_ASSET_PATH || 'data/brand');

// 与 common/utils/node-id.ts 的 generateNodeId 同格式：25 字符、c 开头、0-9a-z
const generateNodeId = (): string => `c${createId()}`;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UuidNodeRow {
  id: string;
  path: string;
}

/**
 * 迁移一个 UUID 副本节点：DB（audit_logs → path → id，单事务）+ 磁盘（目录名 + 文件名前缀）。
 * srcCuid 从 path 的文件名段取（目录内文件沿用源节点文件名），与新 cuid 一起统一。
 */
async function migrateOneNode(
  prisma: PrismaClient,
  row: UuidNodeRow
): Promise<void> {
  const oldId = row.id;
  const newId = generateNodeId();

  // path 形如 {YYYYMM}/{oldId}/{srcCuid}.{ext}.mxweb
  const segs = row.path.split('/');
  if (segs.length < 3) {
    throw new Error(`path 结构异常，跳过: ${row.path}`);
  }
  const month = segs[0];
  const srcCuid = segs[2].split('.')[0];
  const oldDirSeg = `${month}/${oldId}/`;
  const newDirSeg = `${month}/${newId}/`;
  const oldFilePrefix = `${srcCuid}.`;
  const newFilePrefix = `${newId}.`;

  if (isDryRun) {
    console.log(`[dry-run] ${oldId} -> ${newId} (path=${row.path})`);
    return;
  }

  // 目标 cuid 不得已存在（新 cuid 碰撞概率可忽略，防御性断言）
  const clash = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM file_system_nodes WHERE id = ${newId}
  `;
  if (clash[0].n > 0) {
    throw new Error(`目标 cuid 已存在: ${newId}`);
  }

  // DB：audit_logs（resourceId 非外键不级联，须手工改；params.nodeId 是 jsonb 冗余副本）
  //     → path（目录段 + 文件名前缀）→ id（主键最后改）
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE audit_logs
      SET "resourceId" = ${newId},
          params = jsonb_set(params, '{nodeId}', to_jsonb(${newId}::text))
      WHERE "resourceId" = ${oldId}
    `,
    prisma.$executeRaw`
      UPDATE file_system_nodes
      SET "path" = replace(replace("path", ${oldDirSeg}, ${newDirSeg}),
                           ${oldFilePrefix}, ${newFilePrefix})
      WHERE id = ${oldId}
    `,
    prisma.$executeRaw`
      UPDATE file_system_nodes SET id = ${newId} WHERE id = ${oldId}
    `,
  ]);

  // 磁盘：目录改名 + 目录内以 srcCuid 为前缀的文件改名（thumbnail.jpg 等不动）
  const oldDir = path.join(filesDataPath, month, oldId);
  const newDir = path.join(filesDataPath, month, newId);
  if (fs.existsSync(oldDir)) {
    fs.renameSync(oldDir, newDir);
    for (const f of fs.readdirSync(newDir)) {
      if (!f.startsWith(srcCuid + '.')) continue;
      const renamed = newFilePrefix + f.slice(srcCuid.length + 1);
      fs.renameSync(path.join(newDir, f), path.join(newDir, renamed));
    }
    console.log(`[ok] ${oldId} -> ${newId} (磁盘 + DB)`);
  } else {
    console.log(`[ok] ${oldId} -> ${newId} (仅 DB，磁盘目录 ${month}/${oldId} 不存在)`);
  }
}

/** 把 oldDir 内容并入 newDir（newDir 不存在则整体改名），oldDir 清空后删除。幂等。 */
function relocateDir(oldDir: string, newDir: string, label: string): void {
  if (!fs.existsSync(oldDir)) {
    console.log(`[skip] ${label}: ${oldDir} 不存在（已迁移或从未产生）`);
    return;
  }
  if (isDryRun) {
    const n = fs
      .readdirSync(oldDir)
      .filter((f) => fs.statSync(path.join(oldDir, f)).isFile()).length;
    console.log(`[dry-run] ${label}: ${oldDir} -> ${newDir} (${n} 个文件)`);
    return;
  }
  fs.mkdirSync(newDir, { recursive: true });
  for (const f of fs.readdirSync(oldDir)) {
    const src = path.join(oldDir, f);
    const dst = path.join(newDir, f);
    if (!fs.existsSync(dst)) {
      fs.renameSync(src, dst);
    } else {
      console.warn(`[warn] ${label}: ${dst} 已存在，保留新目录版本`);
    }
  }
  try {
    fs.rmdirSync(oldDir);
    console.log(`[ok] ${label}: 已搬到 ${newDir}`);
  } catch {
    console.warn(`[warn] ${label}: ${oldDir} 非空，保留`);
  }
}

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('=== 1. UUID 副本节点迁移 ===');
    const rows = await prisma.$queryRaw<UuidNodeRow[]>`
      SELECT id, "path" FROM file_system_nodes
      WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ORDER BY id
    `;
    console.log(`发现 ${rows.length} 个 UUID 节点${isDryRun ? '（dry-run）' : ''}`);
    for (const row of rows) {
      await migrateOneNode(prisma, row);
    }

    console.log('\n=== 2. 非图纸资产搬出 data/files ===');
    relocateDir(path.join(filesDataPath, 'avatars'), avatarPath, '头像');
    relocateDir(path.join(filesDataPath, 'brand'), brandAssetPath, '品牌资产');

    if (!isDryRun) {
      console.log('\n---- 迁移完成 ----');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('迁移失败:', (err as Error).message);
  process.exit(1);
});
