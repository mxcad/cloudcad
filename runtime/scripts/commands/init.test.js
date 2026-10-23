/**
 * init 命令的 mxcad 目录解析回归测试（node:test，0 外部依赖）
 *
 * 回归背景（2026-10-23 Linux 部署实例）：旧实现写死
 * `path.join(RUNTIME_DIR, '..', 'linux', 'mxcad')`，而 RUNTIME_DIR 已是
 * <root>/runtime，多退一级落到 <root>/linux/mxcad——部署包内实际目录是
 * runtime/linux/mxcad。结果 init 恒报「mxcad 目录不存在 / MxCAD 转换功能将不可用」
 * 并 return，chmod 二进制、chmod mx/so、复制 mx/locale 三步全部跳过：部署包明明
 * 自带 mxcad，用户却只看到"转换不可用，请手动配置"而摸不着门。
 *
 * 锁定两点：
 * - 解析结果落在 runtime/<platform>/mxcad（不多退一级、不越出 runtime/）
 * - 后端 .env 配了 MXCAD_ASSEMBLY_PATH 时解析到该二进制所在目录
 *   （与 start.js 探针同一事实源 lib/mxcad-path，避免"探针测 A、init 修 B"）
 *
 * mock 手法同 start-auto-migrate.test.js：init.js 在模块加载期解构 fs / spawnSync /
 * 各 lib，故须在 require('./init') 之前打补丁，用完还原。
 * 期望值一律用 path.join 拼（不从字面量手抄分隔符），Windows/Linux 主机上结果一致。
 *
 * 运行：node --test runtime/scripts/commands/init.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const { LINUX_DEFAULT, WINDOWS_DEFAULT } = require('../lib/mxcad-path');

const ROOT = '/home/root2/docs/CloudCAD';
const MXCAD_DIR = path.join(ROOT, 'runtime', 'linux', 'mxcad');
const BIN_NAME = path.basename(LINUX_DEFAULT);
// init 命令仅 Linux 生效，此处只需一个两平台都算「绝对路径」的自定义安装位置
const CUSTOM_ABS_BIN = path.join(
  process.platform === 'win32' ? 'D:\\opt\\mxcad\\bin' : '/opt/mxcad/bin',
  BIN_NAME
);
const CUSTOM_ABS_DIR = path.dirname(CUSTOM_ABS_BIN);

const origExistsSync = fs.existsSync;
const origSpawnSync = child_process.spawnSync;

/** 清掉 init.js 缓存后重新 require（补丁必须先于 require 生效） */
function loadInit() {
  delete require.cache[require.resolve('./init')];
  return require('./init');
}

function stub(relPath, exports) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
  return resolved;
}

/**
 * 安装 init 运行所需的全部桩，返回 { patched, logLines, spawnCalls }。
 *
 * context 必须一并打桩：非 Linux 主机上真实 IS_LINUX 为 false，
 * linuxInit 会在平台判定处早退，测不到 mxcad 分支。
 */
function installInitStubs({ envValues = {}, exists = () => true } = {}) {
  const logLines = [];
  const spawnCalls = [];
  const patched = [
    stub('../lib/context', {
      IS_LINUX: true,
      PLATFORM: 'linux',
      PROJECT_ROOT: ROOT,
      BACKEND_ENV_PATH: path.join(ROOT, 'packages', 'backend', '.env'),
      RUNTIME_DIR: path.join(ROOT, 'runtime'),
      DATA_DIR: path.join(ROOT, 'data'),
      USE_RUNTIME: true,
    }),
    stub('../lib/logger', {
      log: (_color, msg) => logLines.push(msg),
      clearScreen: () => {},
      printHeader: () => {},
    }),
    stub('../lib/env', { parseEnvFile: () => envValues }),
  ];
  fs.existsSync = exists;
  child_process.spawnSync = (cmd, args) => {
    spawnCalls.push([cmd, args.join(' ')]);
    return { status: 0, stdout: '', stderr: '' };
  };
  return { patched, logLines, spawnCalls };
}

function restoreStubs({ patched }) {
  for (const resolved of patched.splice(0)) delete require.cache[resolved];
  fs.existsSync = origExistsSync;
  child_process.spawnSync = origSpawnSync;
}

test('未配置 MXCAD_ASSEMBLY_PATH → runtime/linux/mxcad（不多退一级）', () => {
  const { resolveMxcadDir } = loadInit();

  assert.equal(
    resolveMxcadDir({}, { isLinux: true, projectRoot: ROOT }),
    MXCAD_DIR
  );
});

test('Windows 平台 → runtime/windows/mxcad', () => {
  const { resolveMxcadDir } = loadInit();

  assert.equal(
    resolveMxcadDir({}, { isLinux: false, projectRoot: 'D:/CloudCAD' }),
    path.dirname(path.join('D:/CloudCAD', WINDOWS_DEFAULT))
  );
});

test('.env 配绝对 MXCAD_ASSEMBLY_PATH → 解析到该二进制所在目录', () => {
  const { resolveMxcadDir } = loadInit();

  assert.equal(
    resolveMxcadDir(
      { MXCAD_ASSEMBLY_PATH: CUSTOM_ABS_BIN },
      { isLinux: true, projectRoot: ROOT }
    ),
    CUSTOM_ABS_DIR
  );
});

test('.env 配相对 MXCAD_ASSEMBLY_PATH → 相对部署根解析', () => {
  const { resolveMxcadDir } = loadInit();

  assert.equal(
    resolveMxcadDir(
      { MXCAD_ASSEMBLY_PATH: path.join('tools', 'mxcad', BIN_NAME) },
      { isLinux: true, projectRoot: ROOT }
    ),
    path.join(ROOT, 'tools', 'mxcad')
  );
});

test('.env 在 Linux 上误配 Windows .exe → 回退 linux 默认目录', () => {
  const { resolveMxcadDir } = loadInit();

  assert.equal(
    resolveMxcadDir(
      { MXCAD_ASSEMBLY_PATH: WINDOWS_DEFAULT },
      { isLinux: true, projectRoot: ROOT }
    ),
    MXCAD_DIR
  );
});

test('目录确实缺失时，提示给出的是正确解析路径（防回归到 <root>/linux/mxcad）', async () => {
  const stubs = installInitStubs({ exists: () => false });
  try {
    const { linuxInit } = loadInit();
    await linuxInit();
  } finally {
    restoreStubs(stubs);
  }

  assert.ok(
    stubs.logLines.some((l) => l.includes(MXCAD_DIR)),
    `缺失提示应指向实际约定路径，实际日志: ${JSON.stringify(stubs.logLines)}`
  );
  assert.ok(
    !stubs.logLines.some((l) => l.includes(path.join(ROOT, 'linux', 'mxcad'))),
    '不能多退一级到 <root>/linux/mxcad'
  );
  assert.equal(
    stubs.spawnCalls.length,
    0,
    '目录缺失应早退，不执行任何 chmod/cp'
  );
});

test('目录齐全时，chmod/locale 三步都落在解析出的目录', async () => {
  const stubs = installInitStubs();
  try {
    const { linuxInit } = loadInit();
    await linuxInit();
  } finally {
    restoreStubs(stubs);
  }

  assert.deepEqual(stubs.spawnCalls, [
    ['chmod', `+x ${path.join(MXCAD_DIR, BIN_NAME)}`],
    ['chmod', `-R 755 ${path.join(MXCAD_DIR, 'mx', 'so')}`],
    ['mkdir', '-p /usr/local/share/locale'],
    [
      'cp',
      `-r -f ${path.join(MXCAD_DIR, 'mx', 'locale')} /usr/local/share/locale`,
    ],
  ]);
  assert.ok(
    stubs.logLines.some((l) => l.includes('Linux 环境初始化完成')),
    '三步全成功应给出完成提示'
  );
});
