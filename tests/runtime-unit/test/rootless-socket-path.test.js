/**
 * rootless dockerd socket 路径解析 单元测试（ADR-0075）
 *
 * Linux unix socket 路径上限 108 字节（sun_path 含结尾 NUL，路径本身须 < 108）。
 * 部署目录由用户解压位置决定、深度任意；包内影子 socket 全路径（<deployDir>/docker-data/
 * shadow-run/docker-rootless.sock）超限后 dockerd 报 "bind: invalid argument"（EINVAL）
 * 且无指向性（2026-10-19 实机：解压到 /home/mx/Music/ 全路径 109 字节，差 1 字节即挂；
 * CI 断网验证容器路径短，暴露不了此类问题）。超限必须回退 /tmp 短路径。
 *
 * 断言目标（resolveSocketPath 的契约）：
 * 1. 包内路径未超限 → 原样返回（与既有部署的 socket 位置兼容，幂等重启不受影响）
 * 2. 包内路径超限 → 回退 /tmp 短路径，且回退路径恒 < 108 字节
 * 3. 边界：包内路径 107 字节合法（原样返回）、108 字节非法（回退）
 * 4. 回退路径确定性：同一 dataRoot 恒同一路径（幂等探测依赖）；不同 dataRoot 不共用
 *    （同一用户多份部署包各用各的 socket，互不串）
 *
 * 跨平台说明：rootless 栈只跑在 Linux，但本测试只验证「路径解析逻辑」（纯字符串运算，
 * 无 fs 副作用），Windows 亦可跑；回退分支用到 process.getuid → 测试内临时覆盖为固定 uid。
 */
const path = require('path');
const rootless = require('../../../runtime/docker-runtime/lib/rootless');

describe('rootless socket path（unix socket 108 字节上限）', () => {
  let origGetuid;

  beforeEach(() => {
    origGetuid = process.getuid;
    process.getuid = () => 1000;
  });

  afterEach(() => {
    if (typeof origGetuid === 'function') {
      process.getuid = origGetuid;
    } else {
      delete process.getuid;
    }
  });

  test('包内路径未超限 → 原样返回（既有部署兼容）', () => {
    // 解压到 /home/mx/：全路径 103 字节，合法
    const dataRoot = '/home/mx/cloudcad-deploy-1.0.0-20261020-docker-linux-x86_64/docker-data';
    const p = rootless.resolveSocketPath(dataRoot);
    expect(p).toBe(path.join(dataRoot, 'shadow-run', 'docker-rootless.sock'));
    expect(p.length).toBeLessThan(108);
  });

  test('实机失败场景：解压到 /home/mx/Music/ 全路径 109 字节 → 回退 /tmp 短路径', () => {
    const dataRoot = '/home/mx/Music/cloudcad-deploy-1.0.0-20261020-docker-linux-x86_64/docker-data';
    const inPkg = path.join(dataRoot, 'shadow-run', 'docker-rootless.sock');
    expect(inPkg.length).toBe(109); // 前提锁定：该路径确实超限（108 上限含 NUL）
    const p = rootless.resolveSocketPath(dataRoot);
    expect(p).not.toBe(inPkg);
    expect(p.startsWith('/tmp/')).toBe(true);
    expect(p.length).toBeLessThan(108);
  });

  test('边界：包内路径 107 字节合法原样返回、108 字节回退', () => {
    // inPkg = dataRoot + '/shadow-run/docker-rootless.sock'（后缀 32 字节）
    const suffixLen = path.join('shadow-run', 'docker-rootless.sock').length + 1;
    const makeRoot = (len) => '/' + 'x'.repeat(len - 1);
    const okRoot = makeRoot(107 - suffixLen); // inPkg = 107 < 108 → 合法
    const badRoot = makeRoot(108 - suffixLen); // inPkg = 108 → 含 NUL 后达上限，非法
    expect(rootless.resolveSocketPath(okRoot)).toBe(path.join(okRoot, 'shadow-run', 'docker-rootless.sock'));
    const p = rootless.resolveSocketPath(badRoot);
    expect(p.startsWith('/tmp/')).toBe(true);
    expect(p.length).toBeLessThan(108);
  });

  test('回退路径确定性：同 dataRoot 恒同路径，不同 dataRoot 不共用 socket', () => {
    const a = '/home/mx/Music/cloudcad-deploy-1.0.0-20261020-docker-linux-x86_64/docker-data';
    const b = '/home/mx/Music/cloudcad-deploy-2.0.0-20261021-docker-linux-x86_64/docker-data';
    expect(rootless.resolveSocketPath(a)).toBe(rootless.resolveSocketPath(a));
    expect(rootless.resolveSocketPath(a)).not.toBe(rootless.resolveSocketPath(b));
  });
});
