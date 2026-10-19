/**
 * Docker 形态 status 命令状态格式化 单元测试（#434，ADR-0075 D3）
 *
 * 断言目标（status-format.js 纯函数）：
 * 1. formatContainerState：running → 运行中（有健康检查时附 / healthy 等）；
 *    非 running（exited/created/...）→ 已停止（<state>）
 * 2. formatHostProcState：无 pid → 未运行；pid 不存活 → 已停止；
 *    存活且端口可连 → 运行中；存活但端口未就绪 → 运行中（端口未就绪）
 *
 * 只测格式化层；cmdStatus 的 docker/pidfile/端口 IO 由断网验证门禁兜底。
 */
const {
  formatContainerState,
  formatHostProcState,
} = require('../../../runtime/docker-runtime/lib/status-format');

describe('formatContainerState (#434)', () => {
  test('running 无健康检查 → 运行中', () => {
    expect(formatContainerState('running', '-')).toBe('运行中');
  });

  test('running + healthy → 运行中 / healthy', () => {
    expect(formatContainerState('running', 'healthy')).toBe('运行中 / healthy');
  });

  test('running + starting → 运行中 / starting', () => {
    expect(formatContainerState('running', 'starting')).toBe('运行中 / starting');
  });

  test('running + unhealthy → 运行中 / unhealthy', () => {
    expect(formatContainerState('running', 'unhealthy')).toBe('运行中 / unhealthy');
  });

  test('exited → 已停止（exited）', () => {
    expect(formatContainerState('exited', 'unhealthy')).toBe('已停止（exited）');
  });

  test('created → 已停止（created）', () => {
    expect(formatContainerState('created', '-')).toBe('已停止（created）');
  });
});

describe('formatHostProcState (#434)', () => {
  test('无 pid（未拉起过）→ 未运行', () => {
    expect(formatHostProcState(null, false, false)).toBe('未运行');
  });

  test('pid 不存活 → 已停止', () => {
    expect(formatHostProcState(1234, false, false)).toBe('已停止');
  });

  test('存活且端口可连 → 运行中', () => {
    expect(formatHostProcState(1234, true, true)).toBe('运行中');
  });

  test('存活但端口未就绪 → 运行中（端口未就绪）', () => {
    expect(formatHostProcState(1234, true, false)).toBe('运行中（端口未就绪）');
  });
});
