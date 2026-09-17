/**
 * 离线环境设置脚本
 *
 * 功能：
 * 1. 重建依赖（pnpm install --offline）
 * 2. 生成 .env 配置
 * 3. 生成 project-env.sh 环境文件（Git Bash 用）
 *
 * 变更说明（2026-08）：
 * 原先在 node_modules/.bin、离线 node 目录、项目根目录、各 packages 子目录
 * 自动生成 node/npm/npx/pnpm/pm2 包装脚本（含 .cmd/.ps1/无后缀 shell 变体），
 * 导致大量冗余文件随包分发。现已废弃该机制——部署/运维命令统一通过
 * cli.js 内部 PATH 注入 + 离线 node 直跑（runPnpm/runPm2/runPnpmInstallOffline），
 * 无需在每目录放置包装脚本。仅保留必要的 .bin 路径修复 + project-env.sh。
 *
 * 使用方式：
 *   node runtime/scripts/setup-offline.js
 *   或通过 start.js 自动执行
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { PRODUCT_NAME } = require('./lib/branding');
const { brandBox } = require('./lib/logger');

// ==================== 平台配置 ====================

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.resolve(__dirname, '..');
const PLATFORM_DIR = IS_WINDOWS
  ? path.join(RUNTIME_DIR, 'windows')
  : path.join(RUNTIME_DIR, 'linux');

// 离线 node 目录（使用绝对路径）
const OFFLINE_NODE_DIR = IS_WINDOWS
  ? path.join(PROJECT_ROOT, 'runtime', 'windows', 'node')
  : path.join(PROJECT_ROOT, 'runtime', 'linux', 'node', 'bin');

const OFFLINE_NODE_EXE = IS_WINDOWS
  ? path.join(OFFLINE_NODE_DIR, 'node.exe')
  : path.join(OFFLINE_NODE_DIR, 'node');

// node_modules/.bin 目录
const NODE_MODULES_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin');

// ==================== 主要逻辑 ====================

function log(message) {
  console.log(`[Setup-Offline] ${message}`);
}

function error(message) {
  console.error(`[Setup-Offline] ERROR: ${message}`);
}

function checkOfflineNode() {
  if (!fs.existsSync(OFFLINE_NODE_EXE)) {
    error(`离线 Node.js 不存在: ${OFFLINE_NODE_EXE}`);
    error('请确保 runtime 目录中有离线的 Node.js');
    return false;
  }
  return true;
}

/**
 * 设置 runtime 目录的执行权限（仅 Linux）
 * 解压后可能丢失执行权限，需要修复
 * @returns {boolean} true 表示成功或无需修复
 */
function setRuntimePermissions() {
  if (!IS_LINUX) {
    return true; // Windows 不需要
  }

  const runtimeLinuxDir = path.join(RUNTIME_DIR, 'linux');
  if (!fs.existsSync(runtimeLinuxDir)) {
    return true; // 目录不存在，跳过
  }

  log('设置 runtime/linux 执行权限...');

  try {
    // 设置所有文件和目录的权限为 755
    execSync(`chmod -R 755 "${runtimeLinuxDir}"`, { stdio: 'pipe' });
    log('  ✓ runtime/linux 权限设置完成');
    return true;
  } catch (err) {
    error(`设置权限失败: ${err.message}`);
    error('请手动执行: chmod -R 755 runtime/linux/');
    return false;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`创建目录: ${dir}`);
  }
}

/**
 * 查找 pnpm.cjs 路径（本地安装的 pnpm）
 * 优先使用本地安装的 pnpm，不需要 corepack 代理
 */
function findPnpmJs() {
  // Windows: runtime/windows/node/node_modules/pnpm/bin/pnpm.cjs
  // Linux: runtime/linux/node/node_modules/pnpm/bin/pnpm.cjs (新结构)
  //        runtime/linux/node/lib/node_modules/pnpm/bin/pnpm.cjs (旧结构)
  const candidates = IS_WINDOWS
    ? [
        path.join(OFFLINE_NODE_DIR, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
        path.join(
          PLATFORM_DIR,
          'node',
          'node_modules',
          'pnpm',
          'bin',
          'pnpm.cjs'
        ),
      ]
    : [
        // 新结构：runtime/linux/node/node_modules/pnpm/bin/pnpm.cjs
        path.join(
          PLATFORM_DIR,
          'node',
          'node_modules',
          'pnpm',
          'bin',
          'pnpm.cjs'
        ),
        // 旧结构：runtime/linux/node/lib/node_modules/pnpm/bin/pnpm.cjs
        path.join(
          PLATFORM_DIR,
          'node',
          'lib',
          'node_modules',
          'pnpm',
          'bin',
          'pnpm.cjs'
        ),
        // bin 同级的 node_modules
        path.join(
          OFFLINE_NODE_DIR,
          '..',
          'node_modules',
          'pnpm',
          'bin',
          'pnpm.cjs'
        ),
      ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // 回退到 corepack（不推荐，需要网络下载）
  const corepackCandidates = IS_WINDOWS
    ? [
        path.join(
          OFFLINE_NODE_DIR,
          'node_modules',
          'corepack',
          'dist',
          'pnpm.js'
        ),
        path.join(
          PLATFORM_DIR,
          'node',
          'node_modules',
          'corepack',
          'dist',
          'pnpm.js'
        ),
      ]
    : [
        path.join(
          PLATFORM_DIR,
          'node',
          'node_modules',
          'corepack',
          'dist',
          'pnpm.js'
        ),
        path.join(
          PLATFORM_DIR,
          'node',
          'lib',
          'node_modules',
          'corepack',
          'dist',
          'pnpm.js'
        ),
        path.join(
          OFFLINE_NODE_DIR,
          '..',
          'node_modules',
          'corepack',
          'dist',
          'pnpm.js'
        ),
      ];

  for (const p of corepackCandidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * 修复 node_modules/.bin 中的脚本（不再生成包装脚本）
 *
 * 变更说明（2026-08）：原先在此生成 node/npm/npx/pnpm/corepack 的包装脚本，
 * 现已废弃——部署/运维命令统一通过 cli.js 内部的 PATH 注入 + 离线 node 直跑
 * （runPnpm/runPm2/runPnpmInstallOffline），无需在每目录放置包装脚本。
 * 此处仅保留必要的 .bin 路径修复逻辑。
 */
function setupNodeModulesBin() {
  let count = 0;

  // 修复所有 node_modules/.bin 中的硬编码路径脚本
  // pnpm install 时会创建包含绝对路径的脚本，需要修复为正确的 node 路径
  count += fixBinScripts();

  // Windows 上清理 fixBinScripts 之前生成的残留 shell 脚本（含 #!/bin/sh）
  // 这些脚本对 cmd.exe 不可用，会触发 WSL 错误
  // .CMD 文件足以处理 Windows 上的脚本执行
  if (IS_WINDOWS) {
    const binDirs = [
      NODE_MODULES_BIN,
      path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.bin'),
      path.join(PROJECT_ROOT, 'packages', 'frontend', 'node_modules', '.bin'),
      path.join(
        PROJECT_ROOT,
        'packages',
        'config-service',
        'node_modules',
        '.bin'
      ),
    ];
    for (const binDir of binDirs) {
      if (!fs.existsSync(binDir)) continue;
      const binFiles = fs
        .readdirSync(binDir)
        .filter(
          (f) =>
            !f.endsWith('.cmd') &&
            !f.endsWith('.CMD') &&
            !f.endsWith('.ps1') &&
            !f.startsWith('.')
        );
      for (const binFile of binFiles) {
        const binPath = path.join(binDir, binFile);
        try {
          const content = fs.readFileSync(binPath, 'utf8');
          if (
            content.includes('CloudCAD fixed wrapper') ||
            content.includes('#!/bin/sh')
          ) {
            fs.unlinkSync(binPath);
            log(`清理残留 shell 脚本: ${path.relative(PROJECT_ROOT, binPath)}`);
            count++;
          }
        } catch {
          /* ignore binary files */
        }
      }
    }
  }

  return count;
}

/**
 * 修复所有 node_modules/.bin 目录中脚本的硬编码路径
 * pnpm 在安装时会创建包含绝对路径的脚本，部署到不同目录后会失效
 *
 * 解决方案：重写整个脚本，使用动态计算的 PROJECT_ROOT 变量
 * @returns {number} 修复的脚本数量
 */
function fixBinScripts() {
  // Windows 上不重写 shell 脚本：
  // - .cmd 文件本身通过 PATH 中的 node.cmd 找到离线 node，无需修改
  // - 无扩展名的 shell 脚本是为 Git Bash 准备的
  // - 强行重写为 #!/bin/sh 会导致 cmd.exe 执行时通过 WSL 运行 → 报错
  if (IS_WINDOWS) return 0;
  let count = 0;

  // 需要修复的 .bin 目录列表
  const binDirs = [
    NODE_MODULES_BIN, // 根目录 node_modules/.bin
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.bin'),
    path.join(PROJECT_ROOT, 'packages', 'frontend', 'node_modules', '.bin'),
    path.join(
      PROJECT_ROOT,
      'packages',
      'config-service',
      'node_modules',
      '.bin'
    ),
  ];

  for (const binDir of binDirs) {
    if (!fs.existsSync(binDir)) continue;

    const binFiles = fs
      .readdirSync(binDir)
      .filter(
        (f) => !f.endsWith('.cmd') && !f.endsWith('.ps1') && !f.startsWith('.')
      );

    for (const binFile of binFiles) {
      const binPath = path.join(binDir, binFile);
      try {
        let content = fs.readFileSync(binPath, 'utf8');

        // 检查是否需要修复（包含硬编码路径或绝对路径）
        const needsFix =
          content.includes('/runtime/') ||
          (content.includes('/node_modules/') && content.includes('node')) ||
          content.match(/^#![^\n]*\/(usr|app|home)\//m);

        if (needsFix) {
          // 计算 node 的相对路径
          const nodeRelPath = path.relative(binDir, OFFLINE_NODE_EXE);

          // 解析原始脚本中的目标 JS 文件路径
          // pnpm 格式：exec "$basedir/../node_modules/xxx/build/index.js" "$@"
          // 或者：node "$basedir/../xxx.js" "$@"
          let targetJs = null;

          // 方法1：解析 pnpm 标准格式
          const pnpmMatch = content.match(
            /exec\s+["']?\$basedir\/(.+?)["']?\s+\$@/
          );
          if (pnpmMatch) {
            targetJs = path.resolve(
              binDir,
              pnpmMatch[1].replace(/^\.\.\//g, '../')
            );
          }

          // 方法2：解析 node + 路径格式
          if (!targetJs) {
            const nodeMatch = content.match(
              /node\s+["']?\$basedir\/(.+?)["']?\s+/
            );
            if (nodeMatch) {
              targetJs = path.resolve(
                binDir,
                nodeMatch[1].replace(/^\.\.\//g, '../')
              );
            }
          }

          // 方法3：直接查找 node_modules 中的入口文件
          if (!targetJs || !fs.existsSync(targetJs)) {
            // 尝试查找对应的包
            const pkgDir = path.join(binDir, '..', binFile);
            const buildIndex = path.join(pkgDir, 'build', 'index.js');
            const distIndex = path.join(pkgDir, 'dist', 'index.js');
            const cliIndex = path.join(pkgDir, 'cli.js');

            for (const candidate of [buildIndex, distIndex, cliIndex]) {
              if (fs.existsSync(candidate)) {
                targetJs = candidate;
                break;
              }
            }
          }

          if (targetJs && fs.existsSync(targetJs)) {
            const targetRelPath = path.relative(binDir, targetJs);

            // 生成新的脚本内容
            const newScript = `#!/bin/sh
# CloudCAD fixed wrapper - dynamically resolves paths
basedir=\$(dirname "\$(echo "\$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
    *CYGWIN*) basedir=\`cygpath -w "\$basedir"\`;;
esac

exec "\$basedir/${nodeRelPath}" "\$basedir/${targetRelPath}" "\$@"
`;
            fs.writeFileSync(binPath, newScript, { mode: 0o755 });
            log(`重写脚本: ${path.relative(PROJECT_ROOT, binPath)}`);
            count++;
          } else {
            // 无法找到目标文件，跳过
            log(
              `跳过脚本（找不到入口）: ${path.relative(PROJECT_ROOT, binPath)}`
            );
          }
        }
      } catch (e) {
        // 忽略二进制文件或读取错误
      }
    }
  }

  return count;
}

/**
 * 生成 project-env.sh — 包含 shell function 的 Git Bash 环境文件
 * 用户 source 后，在项目子目录中直接输入 pnpm/node/npm/npx 就会自动使用项目的离线运行时
 * 在项目目录外则 fallback 到全局命令
 *
 * 变更说明（2026-08）：不再依赖每目录包装脚本（node/npm/npx/pnpm），改为直接
 * 指向离线 node 运行时 + PATH 注入，与 cli.js 内部实现保持一致。
 * @returns {boolean}
 */
function createProjectEnvFile() {
  const envPath = path.join(PROJECT_ROOT, 'project-env.sh');
  const projectRootUnix = PROJECT_ROOT.replace(/\\/g, '/');

  // 离线 node 可执行文件（相对 PROJECT_ROOT，Unix 风格路径）
  const nodeExeRel = path
    .relative(PROJECT_ROOT, OFFLINE_NODE_EXE)
    .replace(/\\/g, '/');
  const nodeDirRel = path
    .relative(PROJECT_ROOT, OFFLINE_NODE_DIR)
    .replace(/\\/g, '/');

  // 离线 node 可执行文件所在目录（npm/npx shim 在 bin 目录内，直接经 PATH 解析）
  const nodePkgRoot = path.dirname(OFFLINE_NODE_EXE);
  const npmBinRel = path
    .relative(PROJECT_ROOT, nodePkgRoot)
    .replace(/\\/g, '/');

  // pnpm：优先 findPnpmJs()，回退到 node 目录同级 node_modules
  const pnpmAbs = findPnpmJs();
  const pnpmCliRel = pnpmAbs
    ? path.relative(PROJECT_ROOT, pnpmAbs).replace(/\\/g, '/')
    : path
        .relative(
          PROJECT_ROOT,
          path.join(
            nodePkgRoot,
            'node_modules',
            'pnpm',
            'bin',
            'pnpm.cjs'
          )
        )
        .replace(/\\/g, '/');

  const content = `#!/usr/bin/env bash
# ${PRODUCT_NAME} project environment
# Git Bash shell functions for offline runtime auto-detection
#
# Usage: Add the following line to ~/.bashrc or ~/.zshrc:
#   source "${projectRootUnix}/project-env.sh"
#
# Then in any project subdirectory, type pnpm/node/npm/npx directly.
# Outside the project, the global command is used automatically.

_PROJECT_ROOT="${projectRootUnix}"
_NODE_EXE="\${_PROJECT_ROOT}/${nodeExeRel}"
_NODE_DIR="\${_PROJECT_ROOT}/${nodeDirRel}"
_NPM_BIN="\${_PROJECT_ROOT}/${npmBinRel}"
_PNPM_CLI="\${_PROJECT_ROOT}/${pnpmCliRel}"

# 仅当当前目录位于项目目录内时，才使用离线运行时
_in_project() {
  local dir="\$PWD"
  while [[ "\$dir" != "/" ]]; do
    if [[ "\$dir" == "\${_PROJECT_ROOT}" ]]; then
      return 0
    fi
    dir="\$(dirname "\$dir")"
  done
  return 1
}

# node 直接指向离线 node
node() {
  if _in_project; then
    "\${_NODE_EXE}" "\$@"
  else
    command node "\$@"
  fi
}

# npm / npx：将离线 node 的 bin 目录置入 PATH，经其中 shim 解析（会自动用离线 node）
npm() {
  if _in_project; then
    export PATH="\${_NPM_BIN}:\$PATH"
    command npm "\$@"
  else
    command npm "\$@"
  fi
}

npx() {
  if _in_project; then
    export PATH="\${_NPM_BIN}:\$PATH"
    command npx "\$@"
  else
    command npx "\$@"
  fi
}

# pnpm 通过离线 node 执行 pnpm.cjs（禁用 Corepack 避免联网）
pnpm() {
  if _in_project; then
    export PATH="\${_NODE_DIR}:\$PATH"
    export COREPACK_ENABLE=0
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    "\${_NODE_EXE}" "\${_PNPM_CLI}" "\$@"
  else
    command pnpm "\$@"
  fi
}

unset _in_project
`;

  fs.writeFileSync(envPath, content, { encoding: 'utf8' });
  log(`创建 project 环境文件: ${envPath}`);
  return true;
}

/**
 * 计算 pnpm-lock.yaml 的 SHA256 哈希值
 * @returns {string|null} 哈希值，文件不存在时返回 null
 */
function calcLockHash() {
  const crypto = require('crypto');
  const lockFile = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');
  if (!fs.existsSync(lockFile)) return null;
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(lockFile))
    .digest('hex');
}

/**
 * 检查是否需要重新安装依赖
 * 通过对比已记录的 Lock Hash 与当前 lock 文件的哈希值来判断
 * @returns {boolean} true 表示需要重新安装
 */
function shouldReinstallDependencies() {
  const deployHashFile = path.join(PROJECT_ROOT, '.deploy-lock-hash');
  const currentLockFile = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');
  const nodeModulesDir = path.join(PROJECT_ROOT, 'node_modules');

  // 1. node_modules 不存在 → 需要安装
  if (!fs.existsSync(nodeModulesDir)) {
    log('⚠ node_modules 不存在，需要安装依赖');
    return true;
  }

  // 2. 没有 .deploy-lock-hash → 首次部署或标记丢失
  if (!fs.existsSync(deployHashFile)) {
    log('⚠ 未找到版本标记，需要安装依赖');
    return true;
  }

  // 3. 没有 lock 文件 → 异常情况
  if (!fs.existsSync(currentLockFile)) {
    log('⚠ pnpm-lock.yaml 不存在');
    return true;
  }

  // 4. 对比哈希值
  const installedHash = fs.readFileSync(deployHashFile, 'utf8').trim();
  const currentHash = calcLockHash();

  // 防御性检查：理论上不会走到这里，因为前面已检查过
  if (!currentHash) {
    log('⚠ 无法计算 lock 文件哈希，需要重新安装');
    return true;
  }

  if (installedHash !== currentHash) {
    log('⚠ 检测到依赖更新！');
    log(`  已安装: ${installedHash.substring(0, 8)}...`);
    log(`  当前:   ${currentHash.substring(0, 8)}...`);
    return true;
  }

  log('  ✓ node_modules 已存在且版本匹配，跳过安装');
  return false;
}

/**
 * 记录当前已安装的 Lock Hash
 * 在安装完成后调用，用于下次启动时对比
 */
function markInstalledVersion() {
  const deployHashFile = path.join(PROJECT_ROOT, '.deploy-lock-hash');
  const currentHash = calcLockHash();
  if (currentHash) {
    fs.writeFileSync(deployHashFile, currentHash);
    log('  ✓ 已记录依赖版本标记');
  }
}

/**
 * 运行 pnpm install --offline 重建 node_modules
 * 这是离线安装的关键步骤，从 .pnpm-store 创建硬链接
 *
 * 注意：
 * 1. 不需要 --ignore-scripts，postinstall 会自动执行
 * 2. 需要在 PATH 中加入离线 node，让 postinstall 能找到 node 命令
 * 3. env 修改只影响当前进程，不会影响系统环境
 * 4. Linux 使用 .pnpm-store-linux，Windows 使用 .pnpm-store
 *
 * @param {Object} options - 配置选项
 * @param {boolean} options.deployBackendOnly - 只安装后端依赖（部署模式）
 */
function runPnpmInstallOffline(options = {}) {
  const { deployBackendOnly = false } = options;

  // 检查 pnpm 是否可用
  const pnpmJs = findPnpmJs();
  if (!pnpmJs) {
    error('找不到 pnpm.cjs，无法运行离线安装');
    return false;
  }

  // 【新增】检查是否需要重新安装依赖
  const needReinstall = shouldReinstallDependencies();
  if (!needReinstall) {
    return true; // 跳过安装
  }

  // 查找 pnpm store
  // 如果要安装完整依赖：优先 .pnpm-store（全量），找不到则尝试 .pnpm-store-deploy
  // 如果只装生产依赖：优先 .pnpm-store-deploy（仅 prod），找不到则尝试 .pnpm-store（全量也可用）
  const preferDeployStore = deployBackendOnly;
  const fullStore = path.join(PROJECT_ROOT, IS_LINUX ? '.pnpm-store-linux' : '.pnpm-store');
  const deployStore = path.join(PROJECT_ROOT, '.pnpm-store-deploy');
  const storeCandidates = preferDeployStore
    ? [deployStore, fullStore]
    : [fullStore, deployStore];
  let storePath = null;
  let isDeployStore = false;
  for (const p of storeCandidates) {
    if (fs.existsSync(p)) {
      storePath = p;
      isDeployStore = p === deployStore;
      break;
    }
  }

  if (!storePath) {
    error('pnpm store 不存在，无法进行离线安装');
    error('请确保离线包包含 .pnpm-store 或 .pnpm-store-deploy 目录');
    return false;
  }

  // 构建安装命令参数
  // 如果使用 .pnpm-store-deploy（只含 backend prod deps），自动追加 --prod
  // 注意：必须把 @cloudcad/db、@cloudcad/contracts、@cloudcad/conversion-service 也纳入 filter ——
  // pnpm --filter backend 不会安装 workspace 依赖（@cloudcad/db）自己的依赖
  // （如 @prisma/client），导致 packages/db/node_modules 为空、运行时
  // require('@prisma/client/runtime/client') 失败（MODULE_NOT_FOUND）；
  // conversion-service 现依赖 @cloudcad/contracts（ADR-0069），不在 filter 里就不会建
  // packages/conversion-service/node_modules 链接，dist/server.js 起不来（3100 端口无监听）。
  // 私有部署包（--variant private）额外携带 packages/impl-mx，需显式纳入
  // filter 才会为其建立 workspace 链接并安装依赖；OSS 包无此目录则跳过，
  // 避免 pnpm 因找不到 workspace 包而失败。conversion-service 目录两种变体都有，无需条件判断。
  const installArgs = deployBackendOnly || isDeployStore
    ? [
        '--filter', 'backend',
        '--filter', '@cloudcad/db',
        '--filter', '@cloudcad/contracts',
        '--filter', '@cloudcad/conversion-service',
        ...(fs.existsSync(path.join(PROJECT_ROOT, 'packages', 'impl-mx', 'package.json'))
          ? ['--filter', '@cloudcad/impl-mx']
          : []),
        'install', '--offline', '--prod',
      ]
    : ['install', '--offline'];

  const installLabel = isDeployStore
    ? `（生产模式${deployBackendOnly ? '' : '，仅安装可用依赖'}）`
    : '（完整依赖）';
  log(`运行 pnpm install --offline 重建依赖${installLabel}`);
  log(`  → 执行: pnpm ${installArgs.join(' ')}`);

  try {
    const nodeDir = IS_LINUX
      ? path.join(PLATFORM_DIR, 'node', 'bin')
      : OFFLINE_NODE_DIR;
    const env = {
      ...process.env,
      PATH: `${nodeDir}${path.delimiter}${process.env.PATH}`,
      COREPACK_ENABLE: '0',
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      // CI 模式：pnpm 非交互，遇到 peer 冲突/确认自动采用默认值，避免
      // 在交互式控制台等待输入导致"卡住"（Windows 偶发）
      CI: 'true',
    };

    // --reporter=append-only 禁用交互式动态进度条（会占用/刷新终端，造成卡顿观感）
    execSync(
      `"${OFFLINE_NODE_EXE}" "${pnpmJs}" ${installArgs.join(' ')} --reporter=append-only`,
      {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        env,
      }
    );

    log(
      deployBackendOnly
        ? '  ✓ 后端依赖安装完成'
        : '  ✓ pnpm install --offline 完成'
    );

    // 【新增】安装完成后记录哈希
    markInstalledVersion();

    return true;
  } catch (err) {
    error(`pnpm ${installArgs.join(' ')} 失败`);
    error('可能原因：pnpm store 不完整或损坏');
    return false;
  }
}

/**
 * 生成长度为 64 的随机密钥（十六进制）
 */
function generateSecret() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 生成符合口令策略的强随机口令（#416 等保 8.1.4.1）：
 * 长度 16，覆盖小写/大写/数字/特殊字符四类（满足"四类至少三类"），
 * 随机生成不会命中弱口令黑名单。用于填充 INITIAL_ADMIN_PASSWORD。
 */
function generateStrongPassword() {
  const crypto = require('crypto');
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%^&*-_=+?';
  const all = lower + upper + digits + special;
  const rand = (chars) => chars[crypto.randomInt(chars.length)];
  // 保证四类各至少一个，其余随机补齐到 16 位
  const chars = [rand(lower), rand(upper), rand(digits), rand(special)];
  while (chars.length < 16) {
    chars.push(rand(all));
  }
  // Fisher-Yates 洗牌打散位置
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * 填充 .env 中空白的必填密钥（SESSION_SECRET、JWT_SECRET）
 * 首次部署时自动生成随机密钥，避免生产环境校验报错
 * @param {string} envFile - .env 文件路径
 */
function fillEmptySecrets(envFile) {
  if (!fs.existsSync(envFile)) return;
  let content = fs.readFileSync(envFile, 'utf8');
  const secrets = [
    'SESSION_SECRET',
    'JWT_SECRET',
    // #417 等保 8.1.4.8：PII 字段级加密密钥（users.phone/email 的 AES-GCM 加密 +
    // HMAC-SHA256 归一化索引）。首次部署自动生成两个独立密钥；升级部署保留已有值
    // （正则只匹配空白行），避免重启后密钥变化导致存量密文无法解密。
    'PII_ENCRYPTION_KEY',
    'PII_HMAC_KEY',
    // #419 等保 8.1.2.2：Redis requirepass 密码。生产必填（configuration.ts 校验），
    // 首次部署自动生成；升级部署保留已有值（避免 Redis 密码变化导致后端连不上）。
    'REDIS_PASSWORD',
    // #419 等保 8.1.2.2：storage/conversion 内部服务共享密钥（backend 出站带
    // X-Internal-Service-Secret 头，服务侧非 health 路由校验）。
    'INTERNAL_SERVICE_SECRET',
  ];
  let changed = false;
  for (const key of secrets) {
    const regex = new RegExp(`^${key}=[ \\t]*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${generateSecret()}`);
      log(`  ✓ 自动生成 ${key}`);
      changed = true;
    }
  }
  // #416 等保 8.1.4.1：INITIAL_ADMIN_PASSWORD 必填无缺省——首次部署生成符合策略的强随机口令
  const adminPasswordRegex = /^INITIAL_ADMIN_PASSWORD=[ \t]*$/m;
  if (adminPasswordRegex.test(content)) {
    content = content.replace(
      adminPasswordRegex,
      `INITIAL_ADMIN_PASSWORD=${generateStrongPassword()}`
    );
    log('  ✓ 自动生成 INITIAL_ADMIN_PASSWORD（强随机口令，请妥善保存）');
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(envFile, content, 'utf8');
    log(`  ✓ 已填充 ${path.basename(envFile)} 中的空白密钥`);
  }
}

function copyEnvExampleToEnv() {
  log('检查并创建 .env 配置文件...');

  // 需要处理的配置列表
  // target: 目标文件名，默认 .env（前端使用 .env.local）
  const envConfigs = [
    { dir: path.join(PROJECT_ROOT, 'packages', 'backend'), target: '.env' },
    {
      dir: path.join(PROJECT_ROOT, 'packages', 'frontend'),
      target: '.env.local',
    },
    { dir: path.join(PROJECT_ROOT, 'docker'), target: '.env' },
  ];

  let copied = 0;
  let skipped = 0;

  let backendEnvCreated = false;

  for (const config of envConfigs) {
    const envExample = path.join(config.dir, '.env.example');
    const envFile = path.join(config.dir, config.target);

    // 检查 .env.example 是否存在
    if (!fs.existsSync(envExample)) {
      continue;
    }

    // 如果目标文件已存在，跳过
    if (fs.existsSync(envFile)) {
      skipped++;
      continue;
    }

    // 拷贝 .env.example → 目标文件
    try {
      fs.copyFileSync(envExample, envFile);
      log(`  ✓ 创建: ${path.relative(PROJECT_ROOT, envFile)}`);
      if (config.target === '.env') {
        backendEnvCreated = true;
      }
      copied++;
    } catch (err) {
      error(
        `  ✗ 创建失败: ${path.relative(PROJECT_ROOT, envFile)} - ${err.message}`
      );
    }
  }

  if (copied > 0) {
    log(`已创建 ${copied} 个 .env 配置文件`);
  }
  if (skipped > 0) {
    log(`跳过 ${skipped} 个已存在的 .env 文件`);
  }

  // 无论 .env 是新创建还是已存在，都填补空白密钥
  const backendEnv = path.join(PROJECT_ROOT, 'packages', 'backend', '.env');
  if (fs.existsSync(backendEnv)) {
    const label = backendEnvCreated ? '新创建' : '已有';
    log(`填充 ${label} .env 文件中的空白密钥...`);
    fillEmptySecrets(backendEnv);
  }

  // #424：生产 .env 含真密钥，权限收紧 600（仅属主可读写）
  // Windows（NTFS 无 unix 权限位）下 chmod 为无操作，不报错
  for (const config of envConfigs) {
    const envFile = path.join(config.dir, config.target);
    if (fs.existsSync(envFile)) {
      try {
        fs.chmodSync(envFile, 0o600);
      } catch (_) {
        // 权限设置失败不阻断部署（Windows 无权限概念/只读文件系统等）
      }
    }
  }

  return true;
}

/**
 * 静默迁移 SVN 仓库目录（svn-repo → mx-repo）
 * 旧版使用 data/svn-repo，新版使用 data/mx-repo。升级部署时自动重命名。
 */
function migrateSvnRepo() {
  const oldDir = path.join(PROJECT_ROOT, 'data', 'svn-repo');
  const newDir = path.join(PROJECT_ROOT, 'data', 'mx-repo');
  if (!fs.existsSync(oldDir)) return;
  if (fs.existsSync(newDir)) return;
  const svnDbDir = path.join(oldDir, 'db');
  if (!fs.existsSync(svnDbDir)) return;
  try {
    fs.renameSync(oldDir, newDir);
  } catch (_) {}
}

/**
 * 设置所有包装脚本
 * 已精简：不再生成 node/npm/npx/pnpm/pm2 包装脚本，仅保留
 * 1. node_modules/.bin 路径修复（setupNodeModulesBin）
 * 2. project-env.sh 环境文件（Git Bash 用）
 */
function setupWrappers() {
  const binCount = setupNodeModulesBin();
  createProjectEnvFile();
  return binCount;
}

/**
 * 检查 Prisma Client 是否已存在（来自部署包）
 * 部署包会预生成 Prisma Client（编译到 packages/db/dist），无需再次生成
 * @returns {boolean} true 表示已存在，无需生成
 */
function checkPrismaClientExists() {
  // Prisma 7 prisma-client generator：生成物编译进 @cloudcad/db 的 dist
  const dbDistDir = path.join(PROJECT_ROOT, 'packages', 'db', 'dist');
  const generatedDir = path.join(
    PROJECT_ROOT,
    'packages',
    'db',
    'src',
    'generated',
    'client'
  );

  // 优先检查已编译的 dist（backend 运行时 require 的路径）
  const indexJs = path.join(dbDistDir, 'index.js');
  const generatedClientJs = path.join(
    dbDistDir,
    'generated',
    'client',
    'client.js'
  );

  if (fs.existsSync(indexJs) && fs.existsSync(generatedClientJs)) {
    return true;
  }

  // 回退：源码态 generated 存在也可（启动时 db:generate 会补齐 dist）
  return fs.existsSync(path.join(generatedDir, 'client.ts'));
}

// ==================== 主函数 ====================

/**
 * 设置离线环境
 * @param {Object|boolean} options - 配置选项，或兼容旧版本的 silent 布尔值
 * @param {boolean} options.silent - 静默模式
 * @param {boolean} options.skipInstall - 跳过 pnpm install（用于 deploy --skip-build 场景）
 */
function setup(options = {}) {
  // 兼容旧版本：setup(true) → setup({ silent: true })
  if (typeof options === 'boolean') {
    options = { silent: options };
  }

  const { silent = false, deployBackendOnly = false } = options;

  if (!checkOfflineNode()) {
    return false;
  }

  // 0. 设置 runtime 目录执行权限（Linux 解压后可能丢失）
  setRuntimePermissions();

  // 0.1 迁移 SVN 仓库目录（svn-repo → mx-repo）
  // 旧版使用 data/svn-repo，新版使用 data/mx-repo
  migrateSvnRepo();

  // 1. 运行 pnpm install --offline 重建依赖
  // deployBackendOnly 时只安装后端依赖
  if (!runPnpmInstallOffline({ deployBackendOnly })) {
    return false;
  }

  // 2. 将 .env.example 拷贝为 .env（离线包不包含 .env 文件）
  copyEnvExampleToEnv();

  // 3. 配置文件增量更新（前端 JSON + .env）
  // 如果用户已有配置文件，只新增配置项，不修改已有配置
  try {
    const { updateAllConfigs } = require('./config-updater');
    updateAllConfigs(PROJECT_ROOT);
  } catch (err) {
    error(`配置增量更新失败：${err.message}`);
  }

  // 4. 设置包装脚本（已精简：仅修复 .bin 路径 + 生成 project-env.sh）
  const count = setupWrappers();

  // 5. 检查 Prisma Client 是否已存在（部署包预生成）
  const prismaReady = checkPrismaClientExists();

  if (!silent) {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log(brandBox(`${PRODUCT_NAME} 离线环境设置`, 36));
    console.log('╚════════════════════════════════════════╝');
    console.log('');

    log(`平台: ${PLATFORM}`);
    log(`项目根目录: ${PROJECT_ROOT}`);
    log(`离线 Node.js: ${OFFLINE_NODE_EXE}`);
    console.log('');

    log(`完成！已生成 ${count} 个脚本（.bin 路径修复 + project-env.sh）`);
    console.log('');
    log('1. 依赖已通过 pnpm install --offline 从 .pnpm-store 重建');
    log('2. .env 配置文件已从 .env.example 自动创建');
    log('3. 配置文件已增量更新（只新增配置项，不修改已有配置）');
    log('4. 部署/运维命令由 cloudcad.sh 统一处理，自动使用离线 Node.js');
    log('5. Git Bash 用户: 将以下命令加入 ~/.bashrc，即可在项目子目录使用:');
    const projectRootUnix = PROJECT_ROOT.replace(/\\/g, '/');
    log('   source ' + projectRootUnix + '/project-env.sh');
    if (prismaReady) {
      log('6. Prisma Client 已就绪（来自部署包）');
    } else {
      log('6. Prisma Client 需要在启动时生成');
    }
    console.log('');
  }

  return true;
}

function main() {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log(brandBox(`${PRODUCT_NAME} 离线环境设置`, 36));
  console.log('╚════════════════════════════════════════╝');
  console.log('');

  log(`平台: ${PLATFORM}`);
  log(`项目根目录: ${PROJECT_ROOT}`);
  log(`离线 Node.js: ${OFFLINE_NODE_EXE}`);
  console.log('');

  if (!setup(true)) {
    process.exit(1);
  }

  log('完成！');
  console.log('');
  log('1. SVN 仓库目录已迁移: data/svn-repo → data/mx-repo（如存在旧目录）');
  log('2. 依赖已通过 pnpm install --offline 从 .pnpm-store 重建');
  log('3. .env 配置文件已从 .env.example 自动创建');
  log('4. 部署/运维命令由 cloudcad.sh 统一处理，自动使用离线 Node.js');
  log('5. Git Bash: 执行以下命令即可在项目子目录直接使用 pnpm:');
  const projectRootUnix = PROJECT_ROOT.replace(/\\/g, '/');
  log('   source ' + projectRootUnix + '/project-env.sh');
  console.log('');
}

module.exports = {
  setup,
  setupWrappers,
  runPnpmInstallOffline,
  copyEnvExampleToEnv,
  checkPrismaClientExists,
  calcLockHash,
  shouldReinstallDependencies,
  markInstalledVersion,
  // 生成 .env 空白密钥（SESSION_SECRET/JWT_SECRET/PII_*/REDIS_PASSWORD/INTERNAL_SERVICE_SECRET）。
  // start.js 部署时调用；verify-deploy.js 也须调用（验收器不跑 start.js，须自行补齐密钥，
  // 否则后端生产模式校验 SESSION_SECRET/REDIS_PASSWORD 缺失而启动失败）。
  fillEmptySecrets,
  OFFLINE_NODE_DIR,
  OFFLINE_NODE_EXE,
  NODE_MODULES_BIN,
};

if (require.main === module) {
  main();
}
