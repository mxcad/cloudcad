/**
 * Docker 形态 CLI 薄 adapter 命令映射 单元测试（ADR-0075 C4，v1 Step 3）
 *
 * 断言目标（resolveCommand 纯函数）：
 * 1. deploy / start → start（12 步编排）
 * 2. stop / kill-all → stop
 * 3. status → status（容器 + 宿主进程，#434）
 * 4. --help / -h → help
 * 5. 无参数 → menu（交互菜单）
 * 6. 其余命令（logs / db:* / 密码重置等长尾）→ unsupported（v1 未接线，v2）
 *
 * 执行路径（run → docker-runtime cmdStart/cmdStop/cmdStatus）不在单测覆盖：
 * 12 步编排的行为由断网验证门禁（verify-linux-docker-deploy.js）兜底；
 * cmdStatus 的纯格式化逻辑由 docker-status-format.test.js 覆盖。
 */
const { resolveCommand } = require('../../../runtime/scripts/docker-form-adapter');

describe('docker-form-adapter resolveCommand (ADR-0075 C4)', () => {
  test('deploy / start → start', () => {
    expect(resolveCommand(['deploy'])).toBe('start');
    expect(resolveCommand(['deploy', '--skip-build'])).toBe('start');
    expect(resolveCommand(['start'])).toBe('start');
  });

  test('stop / kill-all → stop', () => {
    expect(resolveCommand(['stop'])).toBe('stop');
    expect(resolveCommand(['kill-all'])).toBe('stop');
  });

  test('status → status（#434 容器 + 宿主进程）', () => {
    expect(resolveCommand(['status'])).toBe('status');
  });

  test('--help / -h → help', () => {
    expect(resolveCommand(['--help'])).toBe('help');
    expect(resolveCommand(['-h'])).toBe('help');
  });

  test('无参数 → menu', () => {
    expect(resolveCommand([])).toBe('menu');
  });

  test('长尾命令 → unsupported（v1 docker 形态未接线）', () => {
    expect(resolveCommand(['logs'])).toBe('unsupported');
    expect(resolveCommand(['db:backup'])).toBe('unsupported');
    expect(resolveCommand(['admin:reset-password'])).toBe('unsupported');
    expect(resolveCommand(['init'])).toBe('unsupported');
  });
});
