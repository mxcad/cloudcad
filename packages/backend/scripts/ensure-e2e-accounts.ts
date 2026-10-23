/**
 * 幂等 E2E 测试账号准备脚本（探路→结晶 的卡点解法 #1：「没有可用测试账号」）。
 *
 * 直接复用后端真实代码路径，保证与登录校验零漂移：
 *   - 密码哈希：bcryptjs 12 轮（与 BcryptPasswordHasher 一致）
 *   - PII 派生列：encryptPii / hmacIndex / normalizeEmail（与 PiiCryptoService 同一份纯函数）
 *   - 数据访问：@cloudcad/db 共享 Prisma Client
 *
 * 登录门禁对齐：status=ACTIVE + emailVerified=true（绕过 requireEmailVerification 门禁）。
 *
 * 用法（在 packages/backend 下，自动加载本目录 .env 的 PII 密钥）：
 *   node --import tsx scripts/ensure-e2e-accounts.ts
 *
 * 幂等：按 email 唯一键 upsert，重复运行只刷新密码/状态/角色，不产生重复行。
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@cloudcad/db';
import * as bcrypt from 'bcryptjs';
import {
  normalizeEmail,
  encryptPii,
  hmacIndex,
  resolvePiiKey,
} from '../src/common/pii/pii-crypto.service';

// 必须与 BcryptPasswordHasher.saltRounds 保持一致
const SALT_ROUNDS = 12;

interface E2eAccount {
  email: string;
  username: string;
  password: string;
  role: string;
  nickname: string;
}

// 三个固定角色账号：管理员 + 协同双用户（A 发起 / B 加入）
const ACCOUNTS: E2eAccount[] = [
  {
    email: 'e2e-admin@example.com',
    username: 'e2e_admin',
    password: 'E2eAdmin!2026',
    role: 'ADMIN',
    nickname: 'E2E 管理员',
  },
  {
    email: 'e2e-user-a@example.com',
    username: 'e2e_user_a',
    password: 'E2eUser!2026',
    role: 'USER',
    nickname: 'E2E 用户A',
  },
  {
    email: 'e2e-user-b@example.com',
    username: 'e2e_user_b',
    password: 'E2eUser!2026',
    role: 'USER',
    nickname: 'E2E 用户B',
  },
];

async function main(): Promise<void> {
  // Prisma 7 驱动适配器：与后端 DatabaseService 同一构造方式（显式 connectionString）
  const databaseUrl =
    process.env.DATABASE_URL ??
    `postgresql://postgres:${process.env.DB_PASSWORD ?? ''}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 5433}/${process.env.DB_NAME ?? 'cloudcad'}`;
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  // PII 密钥：env 显式设置时按 hex/base64 解码；未设置走 SHA-256 回退（与后端一致）
  const encKey = resolvePiiKey(process.env.PII_ENCRYPTION_KEY, 'e2e-fallback');
  const hmacKey = resolvePiiKey(process.env.PII_HMAC_KEY, 'e2e-fallback');

  const roles = await prisma.role.findMany({
    where: { name: { in: ACCOUNTS.map((a) => a.role) } },
  });
  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));

  for (const a of ACCOUNTS) {
    const roleId = roleIdByName.get(a.role);
    if (!roleId) {
      console.error(`[skip] 角色 ${a.role} 不存在，无法创建 ${a.email}`);
      continue;
    }

    const email = normalizeEmail(a.email);
    const passwordHash = await bcrypt.hash(a.password, SALT_ROUNDS);
    const data = {
      email,
      emailEnc: encryptPii(email, encKey),
      emailHmac: hmacIndex(email, hmacKey),
      username: a.username,
      password: passwordHash,
      nickname: a.nickname,
      roleId,
      status: 'ACTIVE' as const,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      provider: 'LOCAL',
      totpEnabled: false,
    };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data });
      console.log(`[updated] ${a.email}  role=${a.role}  user=${a.username}`);
    } else {
      await prisma.user.create({ data });
      console.log(`[created] ${a.email}  role=${a.role}  user=${a.username}`);
    }
  }

  await prisma.$disconnect();
  console.log('\nE2E 测试账号就绪：');
  for (const a of ACCOUNTS) {
    console.log(`  ${a.email}  /  ${a.password}  (${a.role})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
