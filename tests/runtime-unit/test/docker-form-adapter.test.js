/**
 * Docker 形态 CLI 薄 adapter 命令映射 单元测试（ADR-0075 C4，v1 Step 3；
 * 长尾映射 #442）
 *
 * 断言目标（resolveCommand 纯函数）：
 * 1. deploy / start → start（12 步编排）
 * 2. stop / kill-all → stop
 * 3. status → status（容器 + 宿主进程，#434）
 * 4. --help / -h → help
 * 5. 无参数 → menu（交互菜单）
 * 6. 长尾运维（#442）：db:* / mfa:totp-unbind / 三条密码重置 → 各自映射
 * 7. 其余命令（logs / migrate / seed / init / dev / start:infra / version:*）
 *    → unsupported（migrate 由 app 容器 entrypoint 启动时自动执行）
 *
 * 执行路径（run → docker-runtime cmdStart/cmdStop/cmdStatus 与 commands/*）
 * 不在单测覆盖：12 步编排的行为由断网验证门禁（verify-linux-docker-deploy.js）
 * 兜底；cmdStatus 的纯格式化逻辑由 docker-status-format.test.js 覆盖。
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

  test('长尾运维命令 → 各自映射（#442 docker exec 形态感知）', () => {
    expect(resolveCommand(['db:backup'])).toBe('db-backup');
    expect(resolveCommand(['db:restore', 'backup.sql'])).toBe('db-restore');
    expect(resolveCommand(['db:list'])).toBe('db-list');
    expect(resolveCommand(['db:cleanup', '--keep', '5'])).toBe('db-cleanup');
    expect(resolveCommand(['mfa:totp-unbind', 'admin'])).toBe('mfa-unbind');
    expect(resolveCommand(['admin:reset-password'])).toBe('admin-reset');
    expect(resolveCommand(['db:reset-password', '--no-restart'])).toBe('db-reset');
    expect(resolveCommand(['redis:reset-password', '--interactive'])).toBe('redis-reset');
  });

  test('未接线命令 → unsupported（migrate 由 app 容器 entrypoint 自动执行）', () => {
    expect(resolveCommand(['logs'])).toBe('unsupported');
    expect(resolveCommand(['migrate'])).toBe('unsupported');
    expect(resolveCommand(['seed'])).toBe('unsupported');
    expect(resolveCommand(['init'])).toBe('unsupported');
    expect(resolveCommand(['dev'])).toBe('unsupported');
    expect(resolveCommand(['start:infra'])).toBe('unsupported');
    expect(resolveCommand(['version:check'])).toBe('unsupported');
  });
});
