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
 *
 * copyNodeModulesOnly（源头治理，替换 extract 的 `cp -rL <全局 node_modules>/*`）：
 * 7. 只复制白名单包，其余记入 skipped 且不落盘
 * 8. 隐藏条目跳过且不计入 skipped（原 shell glob `*` 亦不匹配）
 * 9. 以 recursive + dereference 调用 cpSync（语义对齐 shell `cp -rL`）
 * 10. 解引用软链，pnpm 全局包内指向 .pnpm 的软链不会变成断链
 *
 * missingNodePackages（复制后断言）：
 * 11. 探测路径写错或 npm install -g 失败时白名单复制会产出空目录，
 *     无此断言会让部署包静默缺 pnpm/pm2 后照常出包
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  RUNTIME_NODE_DIRECT_PACKAGES,
  copyNodeModulesOnly,
  findUnexpectedPackages,
  missingNodePackages,
  isPgJitEntry,
  findPgJitJunk,
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

/** 铺真实目录结构：{ 顶层条目名: 内部子文件名 }（复制语义需要真实目录，非稀疏文件） */
function makeSrcDirs(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-copy-src-'));
  created.push(dir);
  for (const [name, file] of Object.entries(entries)) {
    const p = path.join(dir, name);
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, file), 'payload');
  }
  return dir;
}

function makeDstDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-copy-dst-'));
  created.push(dir);
  return dir;
}

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

describe('copyNodeModulesOnly', () => {
  // 软链能力探测：Windows 非特权环境无法创建目录软链（需管理员或开发者模式），
  // 此时跳过该用例；Linux 容器与 CI 上会真执行。探测在模块加载期做一次。
  let symlinkCase = it;
  try {
    const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-probe-'));
    fs.mkdirSync(path.join(probe, 't'));
    fs.symlinkSync(path.join(probe, 't'), path.join(probe, 'l'), 'dir');
    fs.rmSync(probe, { recursive: true, force: true });
  } catch {
    symlinkCase = it.skip;
  }
  it('只复制白名单包，其余记入 skipped 且不落盘', () => {
    const src = makeSrcDirs({ pnpm: 'pnpm.cjs', '@opencode': 'cli.js', qwen: 'cli.js' });
    const dst = makeDstDir();
    const result = copyNodeModulesOnly(src, dst);
    expect(result.copied).toEqual(['pnpm']);
    expect(result.skipped.sort()).toEqual(['@opencode', 'qwen']);
    expect(fs.existsSync(path.join(dst, 'pnpm', 'pnpm.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(dst, '@opencode'))).toBe(false);
    expect(fs.existsSync(path.join(dst, 'qwen'))).toBe(false);
  });

  it('隐藏条目（pnpm/npm 元数据）跳过且不计入 skipped', () => {
    const result = copyNodeModulesOnly(
      makeSrcDirs({ pnpm: 'a', '.pnpm': 'b', '.modules.yaml': 'c' }),
      makeDstDir()
    );
    expect(result).toEqual({ copied: ['pnpm'], skipped: [] });
  });

  it('源目录不存在返回空（缺件由组件完整性断言负责报缺）', () => {
    expect(copyNodeModulesOnly(path.join(os.tmpdir(), 'no-such-nm-xyz'), makeDstDir())).toEqual({
      copied: [],
      skipped: [],
    });
  });

  it('自定义白名单生效', () => {
    const result = copyNodeModulesOnly(
      makeSrcDirs({ 'custom-tool': 'a', other: 'b' }),
      makeDstDir(),
      ['custom-tool']
    );
    expect(result.copied).toEqual(['custom-tool']);
    expect(result.skipped).toEqual(['other']);
  });

  // dereference 是本修复的关键语义：原 shell `cp -rL` 会解引用所有软链。
  // 漏掉它，pnpm 全局包内指向 .pnpm store 的软链会被原样搬过去（而 .pnpm 不在
  // 白名单会被跳过），部署包内就留下一批断链。
  it('以 recursive + dereference 调用 cpSync（语义对齐 shell cp -rL）', () => {
    const spy = jest.spyOn(fs, 'cpSync').mockImplementation(() => {});
    try {
      copyNodeModulesOnly(makeSrcDirs({ pnpm: 'a', npm: 'b' }), makeDstDir());
      expect(spy).toHaveBeenCalledTimes(2);
      for (const call of spy.mock.calls) {
        expect(call[2]).toEqual({ recursive: true, dereference: true });
      }
    } finally {
      spy.mockRestore();
    }
  });

  symlinkCase('解引用软链，pnpm 全局包内指向 .pnpm 的软链不会变成断链', () => {
    const src = makeSrcDirs({ pm2: 'pm2' });
    const dst = makeDstDir();
    // .pnpm 不在白名单会被跳过——这正是 dereference 必要性的来源
    const store = path.join(src, '.pnpm', 'store');
    fs.mkdirSync(store, { recursive: true });
    fs.writeFileSync(path.join(store, 'data'), 'store-data');
    fs.symlinkSync(store, path.join(src, 'pm2', 'lib'), 'dir');

    const result = copyNodeModulesOnly(src, dst);
    expect(result.copied).toEqual(['pm2']);
    expect(result.skipped).toEqual([]);

    const out = path.join(dst, 'pm2', 'lib', 'data');
    // dereference: true → 软链被展开成真实文件，而非指向 .pnpm 的悬空软链
    expect(fs.lstatSync(out).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(out, 'utf8')).toEqual('store-data');
  });

  it('回归实例：2026-10-04 @opencode 213M 不再随包发货', () => {
    const result = copyNodeModulesOnly(
      makeSrcDirs({
        '@opencode': 'cli.js',
        corepack: 'corepack.js',
        npm: 'npm-cli.js',
        pm2: 'pm2',
        pnpm: 'pnpm.cjs',
      }),
      makeDstDir()
    );
    expect(result.copied.sort()).toEqual(['corepack', 'npm', 'pm2', 'pnpm']);
    expect(result.skipped).toEqual(['@opencode']);
  });
});

describe('missingNodePackages', () => {
  it('四包齐全时返回空', () => {
    expect(
      missingNodePackages(
        makeSrcDirs({ corepack: 'a', npm: 'b', pm2: 'c', pnpm: 'd' })
      )
    ).toEqual([]);
  });

  it('缺失时返回缺失的包名', () => {
    expect(missingNodePackages(makeSrcDirs({ corepack: 'a', npm: 'b' }))).toEqual([
      'pm2',
      'pnpm',
    ]);
  });

  it('目录不存在视为全部缺失', () => {
    expect(missingNodePackages(path.join(os.tmpdir(), 'no-such-nm-xyz'))).toEqual([
      'corepack',
      'npm',
      'pm2',
      'pnpm',
    ]);
  });

  it('自定义必需清单生效', () => {
    expect(
      missingNodePackages(makeSrcDirs({ 'custom-tool': 'a' }), ['custom-tool', 'other'])
    ).toEqual(['other']);
  });
});

// ==================== PG JIT 死重识别（isPgJitEntry / findPgJitJunk） ====================
// d8ce83f 裁定移除 PG JIT（运行时 jit=off，~138M 死重）；旧缓存产物由 pack 出包前
// 自动清理，识别逻辑收在共享模块防 extract/pack 两份清单漂移。

describe('isPgJitEntry（PG JIT 死重条目判定）', () => {
  it('libLLVM- 前缀命中（版本号后缀不影响）', () => {
    expect(isPgJitEntry('libLLVM-15.so.1')).toBe(true);
    expect(isPgJitEntry('libLLVM-19.so')).toBe(true);
  });

  it('llvmjit 前缀命中', () => {
    expect(isPgJitEntry('llvmjit.so')).toBe(true);
    expect(isPgJitEntry('llvmjit.dll')).toBe(true);
  });

  it('bitcode 目录名命中', () => {
    expect(isPgJitEntry('bitcode')).toBe(true);
  });

  it('合法 PG 库不误伤（libpq/libcrypto/pgxs 等大小写前缀近似也要排除误报）', () => {
    expect(isPgJitEntry('libpq.so.5')).toBe(false);
    expect(isPgJitEntry('libcrypto.so.3')).toBe(false);
    expect(isPgJitEntry('libLLVM.so')).toBe(false); // 无版本连字符，非官方 JIT 运行时命名
    expect(isPgJitEntry('pgxs')).toBe(false);
    expect(isPgJitEntry('plpgsql.so')).toBe(false);
  });
});

describe('findPgJitJunk（postgres/lib 扫描，文件与目录混排）', () => {
  it('检出 JIT 文件与 bitcode 目录，返回绝对路径', () => {
    const libDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgjit-'));
    created.push(libDir);
    fs.writeFileSync(path.join(libDir, 'libLLVM-15.so.1'), 'x');
    fs.writeFileSync(path.join(libDir, 'llvmjit.so'), 'x');
    fs.writeFileSync(path.join(libDir, 'libpq.so.5'), 'x');
    fs.mkdirSync(path.join(libDir, 'bitcode'));
    fs.writeFileSync(path.join(libDir, 'bitcode', 'postgres.bc'), 'x');
    fs.mkdirSync(path.join(libDir, 'pgxs'));
    const junk = findPgJitJunk(libDir).map((p) => path.basename(p));
    expect(junk.sort()).toEqual(['bitcode', 'libLLVM-15.so.1', 'llvmjit.so']);
  });

  it('目录不存在返回空数组（交由组件完整性断言报缺件）', () => {
    expect(findPgJitJunk(path.join(os.tmpdir(), 'no-such-pglib-xyz'))).toEqual([]);
  });
});
