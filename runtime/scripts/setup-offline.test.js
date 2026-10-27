/**
 * 安装门禁「部署目录改名/移动自愈」回归测试（node:test，0 外部依赖）
 *
 * 背景事故（2026-10-27）：Windows 部署包目录被改名后，pnpm 建的 node_modules
 * 绝对路径 junction 全部失效，而门禁只查「目录存在 + lock 哈希匹配」误判就绪
 * → prisma CLI MODULE_NOT_FOUND、数据库迁移失败。修复 = 门禁两层判据：
 * 1.5 金丝雀健康检查（checkNodeModulesHealth：backend 的 prisma 链接目标须可
 *     解析；链接缺失时无法判定，不误报）；
 * 5.  .deploy-root 标记对比（markInstalledVersion 安装成功后写入，仅 Windows
 *     生效——Linux 相对符号链接不受改名影响；旧包无标记则回填）。
 *
 * 测试手法：把被测 setup-offline.js 复制到临时目录结构（<tmp>/runtime/scripts/），
 * 其 lib 依赖用桩文件替代，在 <tmp> 根下搭合成 node_modules 树（junction/符号
 * 链接金丝雀）。被测模块按 __dirname 推导 PROJECT_ROOT，沙箱根即其「部署目录」。
 *
 * 运行：node --test runtime/scripts/setup-offline.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const REAL_SETUP = path.join(__dirname, 'setup-offline.js');

/** 建沙箱：临时根 + 被测模块副本 + lib 依赖桩。load() 按副本路径 require。 */
function makeSandbox({ isWindows = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-offline-test-'));
  const scriptsDir = path.join(root, 'runtime', 'scripts');
  const libDir = path.join(scriptsDir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  fs.copyFileSync(REAL_SETUP, path.join(scriptsDir, 'setup-offline.js'));
  fs.writeFileSync(
    path.join(libDir, 'context.js'),
    `module.exports = { OPS_ENTRY: '', PLATFORM: ${JSON.stringify(
      isWindows ? 'win32' : 'linux'
    )}, IS_WINDOWS: ${isWindows}, IS_LINUX: ${!isWindows} };\n`
  );
  fs.writeFileSync(
    path.join(libDir, 'branding.js'),
    "module.exports = { PRODUCT_NAME: 'TestProduct' };\n"
  );
  fs.writeFileSync(
    path.join(libDir, 'logger.js'),
    "module.exports = { brandBox: () => {} };\n"
  );
  fs.writeFileSync(
    path.join(libDir, 'deploy-install-filter.js'),
    "module.exports = { buildDeployInstallFilters: () => [] };\n"
  );
  fs.writeFileSync(
    path.join(libDir, 'secret-generator.js'),
    "module.exports = { fillEmptySecrets: () => {} };\n"
  );
  fs.writeFileSync(
    path.join(libDir, 'env-files.js'),
    "module.exports = { createEnvFilesFromExamples: () => {} };\n"
  );
  return {
    root,
    load() {
      return require(path.join(scriptsDir, 'setup-offline.js'));
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** 搭合成 node_modules：.pnpm 虚拟仓 + backend 的 prisma 包链接（金丝雀）。 */
function makeHealthyNodeModules(root) {
  fs.mkdirSync(path.join(root, 'node_modules', '.pnpm'), { recursive: true });
  const target = path.join(root, 'prisma-pkg-target');
  fs.mkdirSync(path.join(target, 'build'), { recursive: true });
  fs.writeFileSync(path.join(target, 'build', 'index.js'), '// canary\n');
  const link = path.join(root, 'packages', 'backend', 'node_modules', 'prisma');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  try {
    fs.symlinkSync(target, link, 'junction'); // Windows：junction（无需特权）
  } catch {
    fs.symlinkSync(target, link, 'dir'); // Linux：目录符号链接
  }
}

/** 写 lock 文件并同步 .deploy-lock-hash（门禁第 4 步哈希匹配）。 */
function writeLockWithHash(root) {
  const lock = path.join(root, 'pnpm-lock.yaml');
  fs.writeFileSync(lock, `lockfileVersion: ${Date.now()}\n`);
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(lock))
    .digest('hex');
  fs.writeFileSync(path.join(root, '.deploy-lock-hash'), hash);
}

// ==================== shouldReinstallDependencies 门禁阶梯 ====================

test('门禁：node_modules 不存在 → 重装', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  assert.equal(sb.load().shouldReinstallDependencies(), true);
});

test('门禁：金丝雀链接目标失效（目录被改名/移动）→ 重装', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  writeLockWithHash(sb.root);
  // 模拟「目录改名后链接悬空」：链接目标目录消失（junction 仍为重解析点）
  fs.rmSync(path.join(sb.root, 'prisma-pkg-target'), {
    recursive: true,
    force: true,
  });
  assert.equal(sb.load().shouldReinstallDependencies(), true);
});

test('门禁：健康但无版本标记 → 重装', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  assert.equal(sb.load().shouldReinstallDependencies(), true);
});

test('门禁：健康 + 哈希不匹配 → 重装', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  writeLockWithHash(sb.root);
  fs.writeFileSync(path.join(sb.root, '.deploy-lock-hash'), 'deadbeef');
  assert.equal(sb.load().shouldReinstallDependencies(), true);
});

test('门禁：健康 + 哈希匹配 + 目录标记匹配 → 跳过安装', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  writeLockWithHash(sb.root);
  fs.writeFileSync(path.join(sb.root, '.deploy-root'), sb.root);
  assert.equal(sb.load().shouldReinstallDependencies(), false);
});

test('门禁：Windows 目录标记指向旧目录（改名）→ 重装', (t) => {
  const sb = makeSandbox({ isWindows: true });
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  writeLockWithHash(sb.root);
  fs.writeFileSync(path.join(sb.root, '.deploy-root'), sb.root + '-old-name');
  assert.equal(sb.load().shouldReinstallDependencies(), true);
});

test('门禁：Windows 旧包无目录标记 → 回填标记并跳过安装', (t) => {
  const sb = makeSandbox({ isWindows: true });
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  writeLockWithHash(sb.root);
  assert.equal(sb.load().shouldReinstallDependencies(), false);
  assert.equal(
    fs.readFileSync(path.join(sb.root, '.deploy-root'), 'utf8'),
    sb.root,
    '回填的标记 = 当前部署目录'
  );
});

test('门禁：Linux 目录标记不匹配不触发重装（相对符号链接不受改名影响）', (t) => {
  const sb = makeSandbox({ isWindows: false });
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  writeLockWithHash(sb.root);
  fs.writeFileSync(path.join(sb.root, '.deploy-root'), sb.root + '-old-name');
  assert.equal(sb.load().shouldReinstallDependencies(), false);
});

// ==================== checkNodeModulesHealth 金丝雀 ====================

test('金丝雀：.pnpm 虚拟仓缺失 → 不健康', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  assert.equal(sb.load().checkNodeModulesHealth(), false);
});

test('金丝雀：prisma 链接缺失 → 无法判定，不误报（交由其余门禁把关）', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  fs.mkdirSync(path.join(sb.root, 'node_modules', '.pnpm'), { recursive: true });
  fs.mkdirSync(
    path.join(sb.root, 'packages', 'backend', 'node_modules'),
    { recursive: true }
  );
  assert.equal(sb.load().checkNodeModulesHealth(), true);
});

test('金丝雀：链接存在且目标可解析 → 健康', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  assert.equal(sb.load().checkNodeModulesHealth(), true);
});

// ==================== markInstalledVersion / removeNodeModulesDirs ====================

test('markInstalledVersion：写版本标记 + 部署目录标记', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  const lock = path.join(sb.root, 'pnpm-lock.yaml');
  fs.writeFileSync(lock, 'lock\n');
  sb.load().markInstalledVersion();
  const hash = crypto.createHash('sha256').update('lock\n').digest('hex');
  assert.equal(
    fs.readFileSync(path.join(sb.root, '.deploy-lock-hash'), 'utf8'),
    hash
  );
  assert.equal(
    fs.readFileSync(path.join(sb.root, '.deploy-root'), 'utf8'),
    sb.root,
    '目录标记 = 安装时的部署目录绝对路径'
  );
});

test('removeNodeModulesDirs：删根与包级 node_modules，不碰链接目标', (t) => {
  const sb = makeSandbox();
  t.after(sb.cleanup);
  makeHealthyNodeModules(sb.root);
  fs.mkdirSync(
    path.join(sb.root, 'packages', 'other', 'node_modules'),
    { recursive: true }
  );
  const target = path.join(sb.root, 'prisma-pkg-target');
  assert.equal(sb.load().removeNodeModulesDirs(), true);
  assert.equal(fs.existsSync(path.join(sb.root, 'node_modules')), false);
  assert.equal(
    fs.existsSync(path.join(sb.root, 'packages', 'backend', 'node_modules')),
    false
  );
  assert.equal(
    fs.existsSync(path.join(sb.root, 'packages', 'other', 'node_modules')),
    false
  );
  assert.ok(
    fs.existsSync(path.join(target, 'build', 'index.js')),
    '链接目标（包外目录）不得被连带删除'
  );
});
