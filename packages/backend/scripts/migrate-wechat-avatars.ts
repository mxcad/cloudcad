/**
 * 存量微信头像迁移脚本（一次性）
 *
 * 背景：微信登录用户的 avatar 字段直接存了微信域名 URL
 * （https://thirdwx.qlogo.cn/...），浏览器直连该域名可能因防盗链/域名失效
 * 导致头像不显示。新流程（登录/注册时 syncWechatAvatar）已把头像下载落盘，
 * 本脚本把存量微信 URL 用户一次性迁移到本地存储，失败降级保留原值。
 *
 * 使用方式：
 * ```bash
 * cd packages/backend
 * pnpm tsx scripts/migrate-wechat-avatars.ts
 * ```
 * 可选：`--dry-run` 仅统计不执行写入；`--limit 100` 限制处理数量。
 */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@cloudcad/db';

const isDryRun = process.argv.includes('--dry-run');
const limitArgIdx = process.argv.indexOf('--limit');
const limit = limitArgIdx > -1 ? Number(process.argv[limitArgIdx + 1]) : 0;

// 与 packages/backend/src/config/configuration.ts 的 resolvePath 逻辑保持一致
const PROJECT_ROOT = path.resolve(__dirname, '../../');
function resolvePath(inputPath: string): string {
  if (!inputPath) return inputPath;
  if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
  return path.resolve(PROJECT_ROOT, inputPath);
}
const filesDataPath = resolvePath(process.env.FILES_DATA_PATH || 'data/files');
const avatarDir = resolvePath(process.env.AVATAR_PATH || path.join(filesDataPath, 'avatars'));

const EXT_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};
const OLD_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function isWechatAvatarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('.qlogo.cn') || host.endsWith('.qpic.cn');
  } catch {
    return false;
  }
}

interface MigrateStats {
  total: number;
  skipped: number;
  success: number;
  failed: number;
  failures: { userId: string; reason: string }[];
}

async function migrateOne(userId: string, avatarUrl: string): Promise<void> {
  // redirect: 'error' — 拒绝跟随重定向，避免白名单校验被 302 绕过
  const response = await fetch(avatarUrl, {
    signal: AbortSignal.timeout(3_000),
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const ext = EXT_MAP[contentType.split(';')[0].trim()];
  if (!ext) {
    throw new Error(`非图片类型: ${contentType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('超过 5MB');
  }

  await fs.promises.mkdir(avatarDir, { recursive: true }).catch(() => {});
  const cleanups = OLD_EXTENSIONS.map((oldExt) =>
    fs.promises
      .unlink(path.join(avatarDir, `${userId}${oldExt}`))
      .catch(() => {})
  );
  await Promise.all(cleanups);
  await fs.promises.writeFile(path.join(avatarDir, `${userId}${ext}`), buffer);
}

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? '',
  });
  const prisma = new PrismaClient({ adapter });

  const users = await prisma.user.findMany({
    where: { avatar: { not: null } },
    select: { id: true, avatar: true },
  });
  const targets = users.filter(
    (u): u is { id: string; avatar: string } =>
      !!u.avatar && isWechatAvatarUrl(u.avatar)
  );

  const stats: MigrateStats = {
    total: targets.length,
    skipped: 0,
    success: 0,
    failed: 0,
    failures: [],
  };

  if (isDryRun) {
    console.log(`[dry-run] 检测到存量微信头像用户: ${stats.total}`);
    await prisma.$disconnect();
    return;
  }

  const effective = limit > 0 ? targets.slice(0, limit) : targets;
  const pending = effective.length;
  const CONCURRENCY = 5;
  let nextIdx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (nextIdx < pending) {
      const idx = nextIdx++;
      const { id, avatar } = effective[idx];
      try {
        await migrateOne(id, avatar);
        if (!isDryRun) {
          await prisma.user.update({
            where: { id },
            data: { avatar: `/api/v1/users/avatar/${id}` },
          });
        }
        stats.success++;
        console.log(`[ok] ${id} -> 本地头像`);
      } catch (error) {
        stats.failed++;
        stats.failures.push({
          userId: id,
          reason: (error as Error).message,
        });
        console.warn(`[fail] ${id} 保留原头像: ${(error as Error).message}`);
      }
    }
  });
  await Promise.all(workers);

  console.log('---- 迁移完成 ----');
  console.log(`总量: ${stats.total}`);
  console.log(`成功: ${stats.success}`);
  console.log(`失败: ${stats.failed}`);
  if (stats.failures.length > 0) {
    console.log('失败明细（已保留原微信 URL，可在用户下次微信登录时自动修复）:');
    for (const f of stats.failures) {
      console.log(`  ${f.userId}: ${f.reason}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('迁移失败:', err.message);
  process.exit(1);
});
