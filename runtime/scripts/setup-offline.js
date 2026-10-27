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
const { execSync, spawn } = require('child_process');
const { PRODUCT_NAME } = require('./lib/branding');
const { brandBox } = require('./lib/logger');
const { OPS_ENTRY, PLATFORM, IS_WINDOWS, IS_LINUX } = require('./lib/context');
// 后端生产依赖 pnpm --filter 清单（与 verify-deploy.js 共用，见 lib/deploy-install-filter）
const { buildDeployInstallFilters } = require('./lib/deploy-install-filter');
// 密钥生成 / 空白密钥填充：单一事实源 lib/secret-generator.js（ADR-0074，
// 与 setup-wizard.js 及 Docker 一键部署包共用；本文件不再持有副本）
const { fillEmptySecrets: fillEmptySecretsCore } = require('./lib/secret-generator');
// .env 模板创建：单一事实源 lib/env-files.js（pnpm install 的 postinstall 共用）
const { createEnvFilesFromExamples } = require('./lib/env-files');

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
  // 部署包根目录只保留 start/stop 两个启动入口，环境文件归入 runtime/。
  // 文件内部路径全部锚定 _PROJECT_ROOT（部署根目录绝对路径），落位不影响解析。
  const envPath = path.join(PROJECT_ROOT, 'runtime', 'project-env.sh');
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
#   source "${projectRootUnix}/runtime/project-env.sh"
#
# Then in any project subdirectory, type pnpm/node/npm/npx directly.
# Outside the project, the global command is used automatically.

_PROJECT_ROOT="${projectRootUnix}"
_NODE_EXE="\${_PROJECT_ROOT}/${nodeExeRel}"
_NODE_DIR="\${_PROJECT_ROOT}/${nodeDirRel}"
_NPM_BIN="\${_PROJECT_ROOT}/${npmBinRel}"
_PNPM_CLI="\${_PROJECT_ROOT}/${pnpmCliRel}"

# 仅当当前目录位于项目目录内时，才使用离线运行时。
# _PROJECT_ROOT 是 Node 生成的 Windows 形态绝对路径（D:/foo），而 Git Bash 里的
# $PWD 是 Unix 形态（/d/foo），直接比较恒不相等，故先把 $PWD 归一化成 Windows 形态。
# Linux 上两边都是 Unix 形态：非单字符盘符的路径原样透传，不参与归一化。
_in_project() {
  local cwd stripped drive winroot
  cwd="\$PWD"
  case "\$cwd" in
    /*/*)
      stripped="\${cwd#/}"
      drive="\${stripped%%/*}"
      case "\$drive" in
        [a-z]|[A-Z])
          winroot="\$(printf '%s' "\$drive" | tr '[:lower:]' '[:upper:]'):/\${stripped#*/}"
          ;;
        *) winroot="\$cwd" ;;
      esac
      ;;
    *) winroot="\$cwd" ;;
  esac
  [[ "\$winroot" == "\${_PROJECT_ROOT}" || "\$winroot" == "\${_PROJECT_ROOT}"/* ]]
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

# 注：切勿在此 unset 上面的守卫函数 —— bash 的 unset 会连函数定义一起删除，
# 导致 node/npm/npx/pnpm 四个 wrapper 判定 _in_project 时报 command not found，
# 恒走全局分支，离线运行时永不生效（下划线前缀即为此处保留的私有函数）。
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
 * 检测 node_modules 是否真实可用（而非仅"目录存在"）。
 *
 * Windows 上 pnpm 用**绝对路径 junction** 建 node_modules（顶层包链接与
 * .bin shim 的 NODE_PATH 都指向安装时的绝对路径）。部署目录被改名/移动后
 * 整棵树随迁，但所有 junction 指向旧路径而失效：安装门禁
 * （shouldReinstallDependencies）只查"目录存在 + lock 哈希匹配"会误判就绪，
 * 随后 prisma CLI 找不到（MODULE_NOT_FOUND）。Linux 上 pnpm 用相对符号链接，
 * 改名不受影响，本探测天然通过。
 *
 * 两级判据：
 * 1. 根 node_modules/.pnpm 虚拟仓与 backend 的包级链接目录须存在（缺失=安装不完整）；
 * 2. 金丝雀：packages/backend 下的 prisma 包链接。lstat 只查链接本身（失效的
 *    junction 仍是重解析点，lstat 成功）；链接存在时再用 existsSync 跟随 junction
 *    验证目标文件——目标缺失 = 链接指向旧路径（目录被改名/移动）。链接本身
 *    不存在（如该变体未装 prisma）时此金丝雀无法判定，不误报失效。
 * @returns {boolean} true = 健康（或无法判定，交由其余门禁把关）
 */
function checkNodeModulesHealth() {
  if (!fs.existsSync(path.join(PROJECT_ROOT, 'node_modules', '.pnpm'))) {
    return false;
  }
  const backendNm = path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules');
  if (!fs.existsSync(backendNm)) return false;
  const prismaLink = path.join(backendNm, 'prisma');
  let linkExists = false;
  try {
    fs.lstatSync(prismaLink);
    linkExists = true;
  } catch {
    /* 链接不存在：此金丝雀无法判定，不误报 */
  }
  if (!linkExists) return true;
  return fs.existsSync(path.join(prismaLink, 'build', 'index.js'));
}

/**
 * 删除根与包级 node_modules（链接失效后从零重建用）。
 * @returns {boolean} true = 全部删除成功（不存在视为成功）
 */
function removeNodeModulesDirs() {
  const dirs = [path.join(PROJECT_ROOT, 'node_modules')];
  const packagesDir = path.join(PROJECT_ROOT, 'packages');
  let entries = [];
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    /* 无 packages 目录 */
  }
  for (const e of entries) {
    if (e.isDirectory()) dirs.push(path.join(packagesDir, e.name, 'node_modules'));
  }
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch (err) {
      error(`删除 ${d} 失败: ${err.message}`);
      return false;
    }
  }
  return true;
}

/** 路径比较归一化（Windows 大小写不敏感 + 反斜杠 + 结尾分隔符） */
function normPathForCompare(p) {
  return String(p || '')
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
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

  // 1.5 node_modules 存在但链接失效（目录被改名/移动：Windows 上 pnpm 用绝对
  //     路径 junction，目录一移全部失效）→ 需要重装
  if (!checkNodeModulesHealth()) {
    log('⚠ 检测到 node_modules 链接失效（部署目录可能被改名/移动），需要重新安装依赖');
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

  // 5. 部署目录改名/移动检测（仅 Windows：pnpm 绝对路径 junction 随目录移动
  //    全部失效；Linux 相对符号链接不受影响）。标记由 markInstalledVersion 在
  //    安装成功后写入。旧包无标记：链接健康则回填（把当前目录记为安装目录），
  //    链接失效已被第 1.5 步拦截。
  if (IS_WINDOWS) {
    const rootMarkerFile = path.join(PROJECT_ROOT, '.deploy-root');
    if (fs.existsSync(rootMarkerFile)) {
      const installedRoot = normPathForCompare(
        fs.readFileSync(rootMarkerFile, 'utf8').trim()
      );
      const currentRoot = normPathForCompare(PROJECT_ROOT);
      if (installedRoot && installedRoot !== currentRoot) {
        log('⚠ 检测到部署目录被改名/移动，node_modules 链接已失效，需要重新安装依赖');
        log(`  安装时目录: ${installedRoot}`);
        log(`  当前目录:   ${currentRoot}`);
        return true;
      }
    } else {
      try {
        fs.writeFileSync(rootMarkerFile, PROJECT_ROOT);
        log('  ✓ 已回填部署目录标记（.deploy-root）');
      } catch {
        /* 写失败不阻塞启动，下次再补 */
      }
    }
  }

  log('  ✓ node_modules 已存在且版本匹配，跳过安装');
  return false;
}

/**
 * 记录当前已安装的 Lock Hash 与部署目录绝对路径
 * 在安装完成后调用，用于下次启动时对比
 */
function markInstalledVersion() {
  const deployHashFile = path.join(PROJECT_ROOT, '.deploy-lock-hash');
  const currentHash = calcLockHash();
  if (currentHash) {
    fs.writeFileSync(deployHashFile, currentHash);
    log('  ✓ 已记录依赖版本标记');
  }
  // 记录安装时的部署目录绝对路径：Windows 上 pnpm 用绝对路径 junction 建
  // node_modules，目录改名/移动后链接全部失效，门禁（shouldReinstallDependencies
  // 第 5 步）对比此标记触发自愈重装
  try {
    fs.writeFileSync(path.join(PROJECT_ROOT, '.deploy-root'), PROJECT_ROOT);
  } catch {
    /* 写失败不阻塞启动，门禁退化为金丝雀判据 */
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

  // 链接失效（目录被改名/移动）时先删旧 node_modules 再从零重建：其中的
  // .modules.yaml 记录着旧绝对路径（storeDir），不删的话 pnpm 可能误判状态
  // 而不重建链接。删除失败（文件被运行中的服务占用）立即中止——在失效的
  // 树上叠装不可靠，与其装出半坏状态不如明确报错让用户先停服务。
  if (!checkNodeModulesHealth()) {
    log('  → 删除失效的 node_modules，从离线仓重建...');
    if (!removeNodeModulesDirs()) {
      error('删除失效的 node_modules 失败（文件可能被运行中的服务占用）');
      error('请先停止全部服务（stop）再重新运行 start');
      return false;
    }
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
  // 注意：必须把 @cloudcad/db、@cloudcad/contracts、@cloudcad/engine-exec、
  // @cloudcad/conversion-service 也纳入 filter ——
  // pnpm --filter backend 不会安装 workspace 依赖（@cloudcad/db）自己的依赖
  // （如 @prisma/client），导致 packages/db/node_modules 为空、运行时
  // require('@prisma/client/runtime/client') 失败（MODULE_NOT_FOUND）；
  // engine-exec 与 conversion-service 现依赖 @cloudcad/contracts（ADR-0069），
  // 不在 filter 里就不会建它们的 node_modules 链接，dist 里的 require 解析失败
  // （backend 转换路径炸 / 3100 端口无监听）。
  // 私有部署包（--variant private）额外携带 packages/impl-mx，需显式纳入
  // filter 才会为其建立 workspace 链接并安装依赖；OSS 包无此目录则跳过，
  // 避免 pnpm 因找不到 workspace 包而失败。engine-exec 与 conversion-service
  // 目录两种变体都有，无需条件判断。
  // filter 清单走 lib/deploy-install-filter 单一事实源（与 verify-deploy.js 共用），
  // impl-mx 条件项由 buildDeployInstallFilters 按目录存在性判定。
  const installArgs = deployBackendOnly || isDeployStore
    ? [...buildDeployInstallFilters(PROJECT_ROOT), 'install', '--offline', '--prod']
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
 * 填充 .env 空白必填密钥（委托 lib/secret-generator.js 单一事实源，绑定本文件日志）
 * @param {string} envFile - .env 文件路径
 */
function fillEmptySecrets(envFile) {
  return fillEmptySecretsCore(envFile, log);
}

function copyEnvExampleToEnv() {
  log('检查并创建 .env 配置文件...');
  createEnvFilesFromExamples(PROJECT_ROOT, { log, error });
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
    log(`4. 部署/运维命令由 ${OPS_ENTRY} 统一处理，自动使用离线 Node.js`);
    log('5. Git Bash 用户: 将以下命令加入 ~/.bashrc，即可在项目子目录使用:');
    const projectRootUnix = PROJECT_ROOT.replace(/\\/g, '/');
    log('   source ' + projectRootUnix + '/runtime/project-env.sh');
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
  log(`4. 部署/运维命令由 ${OPS_ENTRY} 统一处理，自动使用离线 Node.js`);
  log('5. Git Bash: 执行以下命令即可在项目子目录直接使用 pnpm:');
  const projectRootUnix = PROJECT_ROOT.replace(/\\/g, '/');
  log('   source ' + projectRootUnix + '/runtime/project-env.sh');
  console.log('');
}

module.exports = {
  setup,
  setupWrappers,
  runPnpmInstallOffline,
  copyEnvExampleToEnv,
  checkPrismaClientExists,
  calcLockHash,
  checkNodeModulesHealth,
  removeNodeModulesDirs,
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
  // 独立运行时镜像落盘到 data/logs/deploy/；经 cli.js bootstrap 调用时是
  // silent 模式且每次命令都会跑，不镜像（否则每条命令都生成一个日志文件）
  const { runWithDeployLog } = require('./lib/deploy-log');
  runWithDeployLog('setup-offline', () => main());
}
