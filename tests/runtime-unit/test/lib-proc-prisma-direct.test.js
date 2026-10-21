/**
 * L1 特征测试 —— lib/proc.js isDirectPrismaCall + runPnpm 的直调守卫
 *
 * 背景：backend 包没有名为 `prisma` 的 script（全仓无任何一个包有），
 * `pnpm --filter backend prisma …` 会被 pnpm 静默丢弃且 exit 0——调用方拿到的
 * success 是「什么都没跑」。hasPendingMigrations 曾因此恒判「无待应用迁移」而
 * 跳过迁移前备份（eb6b08c）。此守卫把「静默成功」变成编译期之外的第二道兜底：
 * 未来任何 runPnpm 直调 prisma 都会大声失败，而不是又一次静默 no-op。
 *
 * 纯函数走 isDirectPrismaCall；守卫的 throw 行为用一个不真正调用 pnpm 的
 * 最小 args 触发（守卫在任何 pnpm 动作之前求值）。
 */
describe('isDirectPrismaCall', () => {
  let proc;

  beforeAll(() => {
    proc = require('../../../runtime/scripts/lib/proc');
  });

  test('裸直调 prisma → true（`pnpm -F backend prisma migrate status`）', () => {
    expect(
      proc.isDirectPrismaCall(['--filter', 'backend', 'prisma', 'migrate', 'status'])
    ).toBe(true);
    expect(proc.isDirectPrismaCall(['-F', 'backend', 'prisma', 'migrate', 'status'])).toBe(
      true
    );
  });

  test('exec prisma → false（正确写法）', () => {
    expect(
      proc.isDirectPrismaCall(['--filter', 'backend', 'exec', 'prisma', 'migrate', 'status'])
    ).toBe(false);
    expect(
      proc.isDirectPrismaCall(['-F', 'backend', 'exec', 'prisma', 'migrate', 'resolve', '--applied', 'x'])
    ).toBe(false);
  });

  test('run <script> 放行：prisma 跟在 run 后不算裸直调', () => {
    expect(proc.isDirectPrismaCall(['--filter', 'backend', 'run', 'prisma'])).toBe(false);
    expect(proc.isDirectPrismaCall(['--filter', 'backend', 'run', 'build'])).toBe(false);
  });

  test('整条 shell 命令串（模板串形态）也能识别', () => {
    expect(proc.isDirectPrismaCall(['--filter backend prisma migrate status'])).toBe(true);
    expect(proc.isDirectPrismaCall(['--filter backend exec prisma migrate status'])).toBe(false);
  });

  test('与 prisma 无关的调用全部放行', () => {
    expect(proc.isDirectPrismaCall(['build'])).toBe(false);
    expect(proc.isDirectPrismaCall(['install', '--frozen-lockfile'])).toBe(false);
    expect(proc.isDirectPrismaCall(['--version'])).toBe(false);
    expect(proc.isDirectPrismaCall(['--filter', 'backend', 'db:generate'])).toBe(false);
    expect(proc.isDirectPrismaCall(['--filter', 'backend', 'db:seed'])).toBe(false);
    expect(proc.isDirectPrismaCall(['--filter', '@cloudcad/conversion-service...', 'run', 'build'])).toBe(
      false
    );
    expect(proc.isDirectPrismaCall([])).toBe(false);
  });

  test('容错：非数组 / 非字符串元素', () => {
    expect(proc.isDirectPrismaCall('prisma migrate status')).toBe(true);
    expect(proc.isDirectPrismaCall('exec prisma migrate status')).toBe(false);
    expect(proc.isDirectPrismaCall(undefined)).toBe(false);
    expect(proc.isDirectPrismaCall(['--filter', 'backend', 123, 'prisma'])).toBe(true);
  });
});

describe('runPnpm 直调守卫', () => {
  let proc;

  beforeEach(() => {
    jest.resetModules();
    proc = require('../../../runtime/scripts/lib/proc');
  });

  test('裸直调 prisma → 抛错，且文案给出正确写法', () => {
    expect(() =>
      proc.runPnpm(['--filter', 'backend', 'prisma', 'migrate', 'status'])
    ).toThrow(/直调 prisma/);
    expect(() =>
      proc.runPnpm(['--filter', 'backend', 'prisma', 'migrate', 'status'])
    ).toThrow(/exec prisma/);
    expect(() =>
      proc.runPnpm(['--filter', 'backend', 'prisma', 'migrate', 'status'])
    ).toThrow(/--filter backend prisma migrate status/);
  });

  test('exec prisma 形式 → 不抛（守卫放行，后续走真实 pnpm 流程）', () => {
    expect(() =>
      proc.runPnpm(['--filter', 'backend', 'exec', 'prisma', '--version'])
    ).not.toThrow();
  });

  test('普通调用 → 不抛', () => {
    expect(() => proc.runPnpm(['--version'])).not.toThrow();
    expect(() => proc.runPnpm(['--filter', 'backend', 'db:generate'])).not.toThrow();
  });
});
