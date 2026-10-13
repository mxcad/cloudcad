/**
 * L1 特征测试 —— lib/mobile-access-path.js 纯函数
 *
 * 目的：把「移动端访问路径名」的解析钉在唯一出口上。此前该解析有 3 份内联副本
 * （lib/context.js 2 候选 / serve-static.js 3 候选 / pack-assertions.js 1 候选），
 * 候选清单互不相同，导致运维入口提示的路径与静态服务实际服务的路径可以不一致。
 *
 * 关键不变量：
 * - RUNTIME 候选清单里 data/configs 优先于仓库模板与 dist（客户改过的值生效）；
 * - PACKAGE 候选清单刻意**不**读 data/configs（打包机本地配置不得进入部署包）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_MOBILE_ACCESS_PATH,
  readMobileAccessPath,
  resolveMobileAccessPath,
  getMobileAccessPathForRuntime,
  getMobileAccessPathForPackage,
} = require('../../../runtime/scripts/lib/mobile-access-path');

let tmp;
function writeConfig(relSegments, value) {
  const p = path.join(tmp, ...relSegments);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ mobileAccessPath: value }), 'utf8');
  return p;
}
const RUNTIME_CFG = ['data', 'configs', 'frontend', 'ini', 'myServerConfig.json'];
const PUBLIC_CFG = ['packages', 'frontend', 'public', 'ini', 'myServerConfig.json'];
const DIST_CFG = ['packages', 'frontend', 'dist', 'ini', 'myServerConfig.json'];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-access-path-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('readMobileAccessPath', () => {
  it('文件缺失 → null（由调用方继续探测下一个候选）', () => {
    expect(readMobileAccessPath(path.join(tmp, 'nope', 'myServerConfig.json'))).toBeNull();
  });

  it('字符串字段 → 返回值', () => {
    expect(readMobileAccessPath(writeConfig(['a'], 'mx_mobile'))).toBe('mx_mobile');
  });

  it('字段非字符串 / 非真值 / 缺字段 → null', () => {
    expect(readMobileAccessPath(writeConfig(['a'], 42))).toBeNull();
    expect(readMobileAccessPath(writeConfig(['b'], ''))).toBeNull();
    expect(readMobileAccessPath(writeConfig(['c'], null))).toBeNull();
    const p = path.join(tmp, 'd', 'myServerConfig.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ other: 1 }), 'utf8');
    expect(readMobileAccessPath(p)).toBeNull();
  });

  it('JSON 损坏 → null（不抛错）', () => {
    const p = path.join(tmp, 'e', 'myServerConfig.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{ not json', 'utf8');
    expect(readMobileAccessPath(p)).toBeNull();
  });
});

describe('resolveMobileAccessPath', () => {
  it('按优先级返回首个命中的候选', () => {
    writeConfig(['first'], 'first_path');
    writeConfig(['second'], 'second_path');
    expect(
      resolveMobileAccessPath(tmp, [['first'], ['second']])
    ).toBe('first_path');
  });

  it('跳过不可读候选，继续探测下一个', () => {
    const bad = path.join(tmp, 'bad', 'myServerConfig.json');
    fs.mkdirSync(path.dirname(bad), { recursive: true });
    fs.writeFileSync(bad, '{ not json', 'utf8');
    writeConfig(['good'], 'good_path');
    expect(
      resolveMobileAccessPath(tmp, [['bad'], ['good']])
    ).toBe('good_path');
  });

  it('无候选命中 → 默认值', () => {
    expect(resolveMobileAccessPath(tmp, [['never', 'written']])).toBe(
      DEFAULT_MOBILE_ACCESS_PATH
    );
    expect(DEFAULT_MOBILE_ACCESS_PATH).toBe('mxcad_mobile');
  });
});

describe('运行时解析（部署后）', () => {
  it('客户改过的运行时配置优先于仓库模板', () => {
    writeConfig(RUNTIME_CFG, 'customer_path');
    writeConfig(PUBLIC_CFG, 'template_path');
    expect(getMobileAccessPathForRuntime(tmp)).toBe('customer_path');
  });

  it('运行时配置缺失时回落到仓库模板', () => {
    writeConfig(PUBLIC_CFG, 'template_path');
    expect(getMobileAccessPathForRuntime(tmp)).toBe('template_path');
  });

  it('运行时配置与模板都缺时回落到 dist 内的配置', () => {
    writeConfig(DIST_CFG, 'dist_path');
    expect(getMobileAccessPathForRuntime(tmp)).toBe('dist_path');
  });

  it('全部缺失 → 默认值', () => {
    expect(getMobileAccessPathForRuntime(tmp)).toBe('mxcad_mobile');
  });
});

describe('打包期解析（部署前）', () => {
  it('只认仓库内模板配置：忽略 data/configs 里的打包机本地值', () => {
    writeConfig(RUNTIME_CFG, 'packer_local_path');
    writeConfig(PUBLIC_CFG, 'template_path');
    expect(getMobileAccessPathForPackage(tmp)).toBe('template_path');
  });

  it('模板缺失时不回落到运行时配置，直接默认值', () => {
    writeConfig(RUNTIME_CFG, 'packer_local_path');
    expect(getMobileAccessPathForPackage(tmp)).toBe('mxcad_mobile');
  });
});
