/**
 * 运行时 node 工具依赖清洁检查 单元测试
 *
 * 断言目标（Linux runtime 整目录复制会把打包机全局 npm 包带进部署包，
 * extract-linux-runtime.js 的 `cp -rL <全局 node_modules>/*` 是根因）：
 * 1. 白名单条目（corepack/npm/pm2/pnpm）被放过
 * 2. 隐藏条目（pnpm/npm 元数据 .pnpm/.modules.yaml/.package-lock.json）跳过
 * 3. 白名单外条目被检出并附体积，按体积降序
 * 4. 目录不存在/空目录返回空数组（缺件由组件完整性断言负责报缺，不在此混判）
 * 5. 白名单与 runtime/windows/node/package.json 的 dependencies 一致（防两端漂移）
 * 6. 回归实例：@opencode/cli 213M 混入 Linux 部署包（2026-10-04）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  RUNTIME_NODE_DIRECT_PACKAGES,
  findUnexpectedPackages,
} = require('../../../scripts/pack-lib/runtime-cleanliness');

/**
 * 建临时 node_modules，按 { 条目名: 字节数 } 铺条目。
 * 用稀疏文件（ftruncate）而非真实字节——门禁只读 statSync.size，
 * 213M 的回归实例无需真实占盘。
 */
function makeNodeModules(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-cleanliness-'));
  created.push(dir);
  for (const [name, size] of Object.entries(entries)) {
    const p = path.join(dir, name);
    fs.mkdirSync(p, { recursive: true });
    const fd = fs.openSync(path.join(p, 'payload'), 'w');
    try {
      fs.ftruncateSync(fd, size);
    } finally {
      fs.closeSync(fd);
    }
  }
  return dir;
}

const created = [];
afterAll(() => {
  for (const d of created) fs.rmSync(d, { recursive: true, force: true });
});

describe('RUNTIME_NODE_DIRECT_PACKAGES', () => {
  // 锁定与 Windows 侧唯一事实源对齐：这两个端声明的是同一组「直接依赖」。
  // 注意语义边界——Windows 侧是 npm 布局，npm ci 会把传递依赖扁平化到顶层
  // （实测 120 个条目），故该白名单对 Windows 侧判定不适用，仅用于 Linux pnpm 布局。
  it('等于两端共同声明的 4 个直接依赖（与 Windows package.json 对齐，防漂移）', () => {
    const pkg = require('../../../runtime/windows/node/package.json');
    expect([...RUNTIME_NODE_DIRECT_PACKAGES].sort()).toEqual(
      Object.keys(pkg.dependencies).sort()
    );
  });
});

describe('findUnexpectedPackages', () => {
  it('目录不存在返回空数组', () => {
    expect(
      findUnexpectedPackages(path.join(os.tmpdir(), 'no-such-nm-dir-xyz'))
    ).toEqual([]);
  });

  it('空目录返回空数组', () => {
    expect(findUnexpectedPackages(makeNodeModules({}))).toEqual([]);
  });

  it('仅含白名单条目时返回空数组', () => {
    expect(
      findUnexpectedPackages(
        makeNodeModules({
          corepack: 1_100_000,
          npm: 17 * 1024 * 1024,
          pm2: 21 * 1024 * 1024,
          pnpm: 19 * 1024 * 1024,
        })
      )
    ).toEqual([]);
  });

  it('白名单外条目被检出', () => {
    const result = findUnexpectedPackages(
      makeNodeModules({ corepack: 1000, pnpm: 2000, '@opencode': 5000 })
    );
    expect(result).toEqual([{ name: '@opencode', size: 5000 }]);
  });

  it('隐藏条目（pnpm/npm 元数据）跳过', () => {
    expect(
      findUnexpectedPackages(
        makeNodeModules({
          pnpm: 1000,
          '.pnpm': 999_999,
          '.modules.yaml': 10,
          '.package-lock.json': 10,
        })
      )
    ).toEqual([]);
  });

  it('按体积降序', () => {
    const result = findUnexpectedPackages(
      makeNodeModules({ 'tool-small': 1000, 'tool-big': 90000 })
    );
    expect(result.map((x) => x.name)).toEqual(['tool-big', 'tool-small']);
  });

  it('自定义白名单生效', () => {
    expect(
      findUnexpectedPackages(
        makeNodeModules({ 'custom-tool': 1000, 'other': 2000 }),
        ['custom-tool']
      )
    ).toEqual([{ name: 'other', size: 2000 }]);
  });

  it('回归实例：2026-10-04 Linux 部署包（@opencode 213M 混入，四个合法包共存）', () => {
    const result = findUnexpectedPackages(
      makeNodeModules({
        '@opencode': 213 * 1024 * 1024,
        corepack: 1_100_000,
        npm: 17 * 1024 * 1024,
        pm2: 21 * 1024 * 1024,
        pnpm: 19 * 1024 * 1024,
      })
    );
    expect(result).toEqual([{ name: '@opencode', size: 213 * 1024 * 1024 }]);
  });

  // 边界锁定（2026-10-04 实测两端部署包得出）：Windows 侧是 npm 布局，
  // npm ci 把 pm2 的全部传递依赖扁平化到顶层（实测 120 个条目），
  // 此白名单在该布局下会误报上百个合法依赖。门禁因此只对 Linux 侧调用。
  it('npm 扁平化布局下会误报上百条目（锁定该白名单仅适用 pnpm 布局）', () => {
    const entries = { corepack: 1000, npm: 1000, pm2: 1000, pnpm: 1000 };
    for (let i = 0; i < 100; i++) entries[`dep-${i}`] = 50_000;
    const result = findUnexpectedPackages(makeNodeModules(entries));
    expect(result.length).toBe(100);
    expect(result.every((x) => x.name.startsWith('dep-'))).toBe(true);
  });
});
