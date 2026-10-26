/**
 * 认证模块 E2E 分支测试账号夹具（探路→结晶 的卡点解法 #2：「构造分支前置状态」）。
 *
 * 与 ensure-e2e-accounts.ts 同样复用后端真实代码路径（bcryptjs 12 轮、encryptPii /
 * hmacIndex / normalizeEmail、@cloudcad/db 共享 Prisma Client），保证与登录校验零漂移。
 *
 * 差异：ensure-e2e-accounts.ts 建三个固定幂等账号；本脚本按需造「任意分支前置态」的
 * 临时用户（无密码 / 有手机 / 未验证邮箱 / 停用 / 注销冷静期内或超期），测完按前缀批量删。
 *
 * 用法（在 packages/backend 下，自动加载本目录 .env 的 PII 密钥）：
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_ok   --email w2p-ok@example.com --password 'W2pOk!2026x'
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_nopw --no-password
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_ph   --phone 13800001001 --phone-verified
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_ev   --email-unverified
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_noem --no-email                 # emailVerified=false 且邮箱三列全空
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_sus  --status SUSPENDED
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_del1 --deleted-days -1          # 冷静期内（SELF）
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_del2 --deleted-days -10         # 冷静期已过
 *   node --import tsx scripts/e2e-auth-fixtures.ts create  w2p_adm  --deleted-days -1 --deactivated-by ADMIN
 *   node --import tsx scripts/e2e-auth-fixtures.ts list    --like 'w2_%'
 *   node --import tsx scripts/e2e-auth-fixtures.ts destroy --like 'w2_%'
 *
 * --deleted-days 为负数表示 N 天前删除（用户默认 deactivatedBy='SELF'，走自助注销自动恢复路径）。
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
  normalizePhone,
} from '../src/common/pii/pii-crypto.service';

const SALT_ROUNDS = 12;

interface Options {
  email?: string;
  password?: string;
  noPassword: boolean;
  phone?: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  noEmail: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  deletedDays?: number;
  deactivatedBy: string | null;
}

interface CliArgs {
  cmd: 'create' | 'list' | 'destroy';
  username?: string;
  nickname?: string;
  opts: Options;
  like: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const cli: CliArgs = {
    cmd: args[0] as CliArgs['cmd'],
    username: args[1],
    like: '%',
    opts: {
      noPassword: false,
      phoneVerified: false,
      emailVerified: true,
      noEmail: false,
      status: 'ACTIVE',
      deactivatedBy: null,
    },
  };
  const set = (name: string, value: string | boolean): void => {
    if (name === 'email') cli.opts.email = value as string;
    else if (name === 'password') cli.opts.password = value as string;
    else if (name === 'no-password') cli.opts.noPassword = true;
    else if (name === 'phone') cli.opts.phone = value as string;
    else if (name === 'phone-verified') cli.opts.phoneVerified = true;
    else if (name === 'email-unverified') cli.opts.emailVerified = false;
    else if (name === 'no-email') cli.opts.noEmail = true;
    else if (name === 'status') cli.opts.status = value as Options['status'];
    else if (name === 'deleted-days') cli.opts.deletedDays = Number(value);
    else if (name === 'deactivated-by') cli.opts.deactivatedBy = value as string;
    else if (name === 'nickname') cli.nickname = value as string;
    else if (name === 'like') cli.like = value as string;
    else throw new Error(`未知参数: --${name}`);
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const next = args[i + 1];
    const takesValue =
      next !== undefined && !next.startsWith('--') && name !== 'no-password' && name !== 'phone-verified' && name !== 'email-unverified' && name !== 'no-email';
    if (takesValue) {
      i++;
      set(name, next);
    } else {
      set(name, true);
    }
  }

  if (cli.cmd === 'create' && !cli.username) {
    throw new Error('create 需要 <username>');
  }
  return cli;
}

async function buildPrisma(): Promise<PrismaClient> {
  const databaseUrl =
    process.env.DATABASE_URL ??
    `postgresql://postgres:${process.env.DB_PASSWORD ?? ''}@${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 5433}/${process.env.DB_NAME ?? 'cloudcad'}`;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv);
  const prisma = await buildPrisma();

  const encKey = resolvePiiKey(process.env.PII_ENCRYPTION_KEY, 'e2e-fallback');
  const hmacKey = resolvePiiKey(process.env.PII_HMAC_KEY, 'e2e-fallback');

  if (cli.cmd === 'list') {
    const rows = await prisma.user.findMany({
      where: { username: { startsWith: cli.like.startsWith('%') ? undefined : cli.like, contains: cli.like.includes('%') ? cli.like.replace(/%/g, '') : undefined } },
      select: { id: true, username: true, email: true, status: true, emailVerified: true, phone: true, phoneVerified: true, deletedAt: true, deactivatedBy: true },
      orderBy: { username: 'asc' },
    });
    if (rows.length === 0) console.log('（无匹配用户）');
    for (const r of rows) {
      console.log(
        `${r.username.padEnd(20)} status=${r.status} emailVerified=${r.emailVerified} phone=${r.phone ?? ''} phoneVerified=${r.phoneVerified} deletedAt=${r.deletedAt ?? ''} deactivatedBy=${r.deactivatedBy ?? ''} ${r.email ?? ''}`
      );
    }
    await prisma.$disconnect();
    return;
  }

  if (cli.cmd === 'destroy') {
    const like = cli.like.replace(/%/g, '');
    const del = await prisma.user.deleteMany({ where: { username: { contains: like } } });
    const rt = await prisma.refreshToken.deleteMany({ where: { userId: { startsWith: like } } }).catch(() => ({ count: 0 }));
    console.log(`deleted users=${del.count} (prefix "${like}"), refreshTokens=${rt.count}`);
    await prisma.$disconnect();
    return;
  }

  // create
  const { opts, username } = cli;
  if (!username) throw new Error('create 需要 <username>');
  const role = await prisma.role.findUnique({ where: { name: 'USER' } });
  if (!role) throw new Error('USER 角色不存在');

  const oEmail = opts.email ?? `${username}@example.com`;
  const email = opts.noEmail ? undefined : normalizeEmail(oEmail);

  const data: Record<string, unknown> = {
    username,
    nickname: cli.nickname ?? username,
    roleId: role.id,
    status: opts.status,
    emailVerified: opts.emailVerified,
    emailVerifiedAt: opts.emailVerified && !opts.noEmail ? new Date() : null,
    provider: 'LOCAL',
    totpEnabled: false,
    passwordChangedAt: opts.noPassword ? null : new Date(),
  };

  if (!opts.noEmail) {
    data.email = email;
    data.emailEnc = encryptPii(email as string, encKey);
    data.emailHmac = hmacIndex(email as string, hmacKey);
  }
  const effectivePassword = opts.noPassword ? null : (opts.password ?? 'E2eUser!2026');
  data.password = effectivePassword ? await bcrypt.hash(effectivePassword, SALT_ROUNDS) : null;

  if (opts.phone) {
    const phone = normalizePhone(opts.phone);
    data.phone = phone;
    data.phoneEnc = encryptPii(phone, encKey);
    data.phoneHmac = hmacIndex(phone, hmacKey);
    data.phoneVerified = opts.phoneVerified;
    data.phoneVerifiedAt = opts.phoneVerified ? new Date() : null;
  }

  if (opts.deletedDays !== undefined) {
    data.deletedAt = new Date(Date.now() + opts.deletedDays * 24 * 3600 * 1000);
    data.deactivatedBy = (opts.deactivatedBy ?? 'SELF') as 'SELF' | 'ADMIN';
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
    await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
    console.log(`[updated] ${username}`);
  } else {
    const created = await prisma.user.create({ data });
    console.log(
      `[created] ${username}  id=${created.id}  email=${created.email ?? '(none)'}  phone=${created.phone ?? '(none)'}  status=${created.status}  emailVerified=${created.emailVerified}  deletedAt=${created.deletedAt ?? '(none)'}  password=${effectivePassword === null ? '(none)' : effectivePassword}`
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
