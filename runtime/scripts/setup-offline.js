/**
 * 离线环境设置脚本
 *
 * 功能：
 * 1. 在 node_modules/.bin 中注入包装脚本（npm scripts 使用）
 * 2. 在离线 node 目录中注入 pnpm 包装脚本（用户直接运行命令使用）
 *
 * 使用方式：
 *   node runtime/scripts/setup-offline.js
 *   或通过 start.js 自动执行
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

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

// 离线 node 目录
const OFFLINE_NODE_DIR = IS_WINDOWS
  ? path.join(PLATFORM_DIR, 'node')
  : path.join(PLATFORM_DIR, 'node', 'bin');

const OFFLINE_NODE_EXE = IS_WINDOWS
  ? path.join(OFFLINE_NODE_DIR, 'node.exe')
  : path.join(OFFLINE_NODE_DIR, 'node');

// node_modules/.bin 目录
const NODE_MODULES_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin');

// ==================== 包装脚本模板 ====================

/**
 * 获取从脚本目录到目标路径的相对路径（Windows）
 * @param {string} scriptDir 脚本所在目录（相对于项目根目录）
 * @param {string} targetPath 目标绝对路径
 * @returns {string} 相对路径表达式
 */
function getWindowsRelativePath(scriptDir, targetPath) {
  // 计算从脚本目录到项目根目录的回退层数
  const backLevels = scriptDir.split(path.sep).filter(Boolean).length;
  const backPath = backLevels > 0 ? Array(backLevels).join('..\\') : '';

  // 计算目标路径相对于项目根目录的路径
  const relativeToRoot = path.relative(PROJECT_ROOT, targetPath).replace(/\\/g, '\\');

  return `%~dp0${backPath}${relativeToRoot}`;
}

/**
 * 获取从脚本目录到目标路径的相对路径（Linux）
 * @param {string} scriptDir 脚本所在目录（相对于项目根目录）
 * @param {string} targetPath 目标绝对路径
 * @returns {string} 相对路径表达式
 */
function getLinuxRelativePath(scriptDir, targetPath) {
  // 计算从脚本目录到项目根目录的回退层数
  const backLevels = scriptDir.split(path.sep).filter(Boolean).length;
  const backPath = backLevels > 0 ? Array(backLevels).join('../') : '';

  // 计算目标路径相对于项目根目录的路径
  const relativeToRoot = path.relative(PROJECT_ROOT, targetPath);

  return `"\${SCRIPT_DIR}/${backPath}${relativeToRoot}"`;
}

function createWindowsCmdWrapper(command, targetPath, scriptDir) {
  const relativeTarget = getWindowsRelativePath(scriptDir, targetPath);
  const relativeNodeDir = getWindowsRelativePath(scriptDir, OFFLINE_NODE_DIR);

  return `@echo off
REM Auto-generated wrapper for ${command}
REM This script uses offline Node.js from CloudCAD runtime

set "OFFLINE_NODE_DIR=${relativeNodeDir}"
set "PATH=%OFFLINE_NODE_DIR%;%PATH%"

"${relativeTarget}" %*
`;
}

function createWindowsNodeWrapper(command, nodePath, scriptPath, scriptDir) {
  const relativeNodeDir = getWindowsRelativePath(scriptDir, OFFLINE_NODE_DIR);
  const relativeNodePath = getWindowsRelativePath(scriptDir, nodePath);
  const relativeScriptPath = getWindowsRelativePath(scriptDir, scriptPath);

  return `@echo off
REM Auto-generated wrapper for ${command}
REM This script uses offline Node.js from CloudCAD runtime

set "OFFLINE_NODE_DIR=${relativeNodeDir}"
set "PATH=%OFFLINE_NODE_DIR%;%PATH%"

"${relativeNodePath}" "${relativeScriptPath}" %*
`;
}

/**
 * 创建 PM2 专用包装脚本（需要设置 PM2_HOME）
 * 使用相对路径，支持任意目录部署
 */
function createWindowsPm2Wrapper() {
  return `@echo off
setlocal
REM CloudCAD offline pm2 entry
REM PM2_HOME is set locally and won't affect system pm2

set "PM2_HOME=%~dp0offline-data\\pm2"
"%~dp0runtime\\windows\\node\\node.exe" "%~dp0runtime\\windows\\node\\node_modules\\pm2\\bin\\pm2" %*
endlocal
`;
}

/**
 * 创建 Linux PM2 专用包装脚本
 */
function createLinuxPm2Wrapper() {
  return `#!/bin/bash
# CloudCAD offline pm2 entry
# PM2_HOME is set locally and won't affect system pm2

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PM2_HOME="$SCRIPT_DIR/offline-data/pm2"
exec "$SCRIPT_DIR/runtime/linux/node/bin/node" "$SCRIPT_DIR/runtime/linux/node/bin/node_modules/pm2/bin/pm2" "$@"
`;
}

function createLinuxShellWrapper(command, targetPath, scriptDir) {
  const relativeNodeDir = path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR);
  const relativeTarget = path.relative(PROJECT_ROOT, targetPath);

  // 计算从脚本目录到项目根目录的回退层数
  const backLevels = scriptDir.split(path.sep).filter(Boolean).length;
  const backPath = backLevels > 0 ? Array(backLevels).join('../') : '';

  return `#!/bin/bash
# Auto-generated wrapper for ${command}
# This script uses offline Node.js from CloudCAD runtime

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}." && pwd)"
export PATH="$PROJECT_ROOT/${relativeNodeDir}:$PATH"
exec "$PROJECT_ROOT/${relativeTarget}" "$@"
`;
}

function createLinuxNodeWrapper(command, nodePath, scriptPath, scriptDir) {
  const relativeNodeDir = path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR);
  const relativeNodePath = path.relative(PROJECT_ROOT, nodePath);
  const relativeScriptPath = path.relative(PROJECT_ROOT, scriptPath);

  // 计算从脚本目录到项目根目录的回退层数
  const backLevels = scriptDir.split(path.sep).filter(Boolean).length;
  const backPath = backLevels > 0 ? Array(backLevels).join('../') : '';

  return `#!/bin/bash
# Auto-generated wrapper for ${command}
# This script uses offline Node.js from CloudCAD runtime

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}." && pwd)"
export PATH="$PROJECT_ROOT/${relativeNodeDir}:$PATH"
exec "$PROJECT_ROOT/${relativeNodePath}" "$PROJECT_ROOT/${relativeScriptPath}" "$@"
`;
}

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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`创建目录: ${dir}`);
  }
}

/**
 * 在指定目录创建包装脚本（直接执行）
 * @param {string} dir 脚本所在目录（绝对路径）
 * @param {string} command 命令名
 * @param {string} targetPath 目标路径（绝对路径）
 */
function createWrapper(dir, command, targetPath) {
  const wrapperPath = IS_WINDOWS
    ? path.join(dir, `${command}.cmd`)
    : path.join(dir, command);

  // 计算脚本目录相对于项目根目录的路径
  const scriptDir = path.relative(PROJECT_ROOT, dir);

  const content = IS_WINDOWS
    ? createWindowsCmdWrapper(command, targetPath, scriptDir)
    : createLinuxShellWrapper(command, targetPath, scriptDir);

  fs.writeFileSync(wrapperPath, content, { encoding: 'utf8' });

  if (IS_LINUX) {
    fs.chmodSync(wrapperPath, 0o755);
  }

  log(`创建包装脚本: ${wrapperPath}`);
}

/**
 * 在指定目录创建需要 node 执行的包装脚本
 * @param {string} dir 脚本所在目录（绝对路径）
 * @param {string} command 命令名
 * @param {string} scriptPath 脚本路径（绝对路径）
 */
function createNodeWrapper(dir, command, scriptPath) {
  const wrapperPath = IS_WINDOWS
    ? path.join(dir, `${command}.cmd`)
    : path.join(dir, command);

  // 计算脚本目录相对于项目根目录的路径
  const scriptDir = path.relative(PROJECT_ROOT, dir);

  const content = IS_WINDOWS
    ? createWindowsNodeWrapper(command, OFFLINE_NODE_EXE, scriptPath, scriptDir)
    : createLinuxNodeWrapper(command, OFFLINE_NODE_EXE, scriptPath, scriptDir);

  fs.writeFileSync(wrapperPath, content, { encoding: 'utf8' });

  if (IS_LINUX) {
    fs.chmodSync(wrapperPath, 0o755);
  }

  log(`创建 node 包装脚本: ${wrapperPath}`);
}

/**
 * 查找 pnpm.js 路径（corepack 提供）
 */
function findPnpmJs() {
  const pnpmJs = path.join(OFFLINE_NODE_DIR, 'node_modules', 'corepack', 'dist', 'pnpm.js');
  if (fs.existsSync(pnpmJs)) {
    return pnpmJs;
  }
  return null;
}

/**
 * 查找 pm2.js 路径
 */
function findPm2Js() {
  const pm2Js = path.join(OFFLINE_NODE_DIR, 'node_modules', 'pm2', 'bin', 'pm2');
  if (fs.existsSync(pm2Js)) {
    return pm2Js;
  }
  return null;
}

/**
 * 设置 node_modules/.bin 中的包装脚本
 */
function setupNodeModulesBin() {
  let count = 0;

  ensureDir(NODE_MODULES_BIN);

  // 1. node 包装脚本
  createWrapper(NODE_MODULES_BIN, 'node', OFFLINE_NODE_EXE);
  count++;

  // 2. 离线 node 目录中的其他命令
  const offlineCommands = ['npm', 'npx', 'corepack'];
  for (const cmd of offlineCommands) {
    const cmdPath = IS_WINDOWS
      ? path.join(OFFLINE_NODE_DIR, `${cmd}.cmd`)
      : path.join(OFFLINE_NODE_DIR, cmd);

    if (fs.existsSync(cmdPath)) {
      createWrapper(NODE_MODULES_BIN, cmd, cmdPath);
      count++;
    }
  }

  // 3. pnpm
  const pnpmJs = findPnpmJs();
  if (pnpmJs) {
    createNodeWrapper(NODE_MODULES_BIN, 'pnpm', pnpmJs);
    count++;
  }

  return count;
}

/**
 * 设置离线 node 目录中的包装脚本
 */
function setupOfflineNodeDir() {
  let count = 0;

  // pnpm
  const pnpmJs = findPnpmJs();
  if (pnpmJs) {
    createNodeWrapper(OFFLINE_NODE_DIR, 'pnpm', pnpmJs);
    count++;
  }

  return count;
}

/**
 * 在项目根目录创建入口脚本（用户直接运行命令时优先命中）
 * 仅创建 .cmd 脚本，适用于 CMD 环境
 */
function setupProjectRoot() {
  let count = 0;

  // 计算相对路径
  const relativeNodeDir = path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR).replace(/\\/g, '\\');
  const relativeNodeExe = path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE).replace(/\\/g, '\\');
  const relativePnpmJs = findPnpmJs() ? path.relative(PROJECT_ROOT, findPnpmJs()).replace(/\\/g, '\\') : null;
  const relativePm2Js = findPm2Js() ? path.relative(PROJECT_ROOT, findPm2Js()).replace(/\\/g, '\\') : null;

  // ========== 1. node 入口脚本 ==========
  const nodeCmdPath = IS_WINDOWS
    ? path.join(PROJECT_ROOT, 'node.cmd')
    : path.join(PROJECT_ROOT, 'node');

  const nodeContent = IS_WINDOWS
    ? `@echo off
REM CloudCAD offline Node.js entry
REM Only effective in project directory, does not affect system Node.js

"%~dp0${relativeNodeExe}" %*
`
    : `#!/bin/bash
# CloudCAD offline Node.js entry
# Only effective in project directory, does not affect system Node.js

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE)}" "$@"
`;

  fs.writeFileSync(nodeCmdPath, nodeContent, { encoding: 'utf8' });
  if (IS_LINUX) {
    fs.chmodSync(nodeCmdPath, 0o755);
  }
  log(`创建根目录入口脚本: ${nodeCmdPath}`);
  count++;

  // ========== 2. npm 入口脚本 ==========
  const npmPath = IS_WINDOWS
    ? path.join(OFFLINE_NODE_DIR, 'npm.cmd')
    : path.join(OFFLINE_NODE_DIR, 'npm');

  if (fs.existsSync(npmPath)) {
    const npmCmdPath = IS_WINDOWS
      ? path.join(PROJECT_ROOT, 'npm.cmd')
      : path.join(PROJECT_ROOT, 'npm');

    const relativeNpmPath = path.relative(PROJECT_ROOT, npmPath).replace(/\\/g, '\\');

    const npmContent = IS_WINDOWS
      ? `@echo off
REM CloudCAD offline npm entry
REM Only effective in project directory, does not affect system npm

set "PATH=%~dp0${relativeNodeDir};%PATH%"
"%~dp0${relativeNpmPath}" %*
`
      : `#!/bin/bash
# CloudCAD offline npm entry
# Only effective in project directory, does not affect system npm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$SCRIPT_DIR/${path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR)}:$PATH"
exec "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, npmPath)}" "$@"
`;

    fs.writeFileSync(npmCmdPath, npmContent, { encoding: 'utf8' });
    if (IS_LINUX) {
      fs.chmodSync(npmCmdPath, 0o755);
    }
    log(`创建根目录入口脚本: ${npmCmdPath}`);
    count++;
  }

  // ========== 3. npx 入口脚本 ==========
  const npxPath = IS_WINDOWS
    ? path.join(OFFLINE_NODE_DIR, 'npx.cmd')
    : path.join(OFFLINE_NODE_DIR, 'npx');

  if (fs.existsSync(npxPath)) {
    const npxCmdPath = IS_WINDOWS
      ? path.join(PROJECT_ROOT, 'npx.cmd')
      : path.join(PROJECT_ROOT, 'npx');

    const relativeNpxPath = path.relative(PROJECT_ROOT, npxPath).replace(/\\/g, '\\');

    const npxContent = IS_WINDOWS
      ? `@echo off
REM CloudCAD offline npx entry
REM Only effective in project directory, does not affect system npx

set "PATH=%~dp0${relativeNodeDir};%PATH%"
"%~dp0${relativeNpxPath}" %*
`
      : `#!/bin/bash
# CloudCAD offline npx entry
# Only effective in project directory, does not affect system npx

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$SCRIPT_DIR/${path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR)}:$PATH"
exec "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, npxPath)}" "$@"
`;

    fs.writeFileSync(npxCmdPath, npxContent, { encoding: 'utf8' });
    if (IS_LINUX) {
      fs.chmodSync(npxCmdPath, 0o755);
    }
    log(`创建根目录入口脚本: ${npxCmdPath}`);
    count++;
  }

  // ========== 4. pnpm 入口脚本（需要 node 执行）==========
  if (relativePnpmJs) {
    const pnpmCmdPath = IS_WINDOWS
      ? path.join(PROJECT_ROOT, 'pnpm.cmd')
      : path.join(PROJECT_ROOT, 'pnpm');

    const pnpmContent = IS_WINDOWS
      ? `@echo off
REM CloudCAD offline pnpm entry
REM Only effective in project directory, does not affect system pnpm

"%~dp0${relativeNodeExe}" "%~dp0${relativePnpmJs}" %*
`
      : `#!/bin/bash
# CloudCAD offline pnpm entry
# Only effective in project directory, does not affect system pnpm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE)}" "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, findPnpmJs())}" "$@"
`;

    fs.writeFileSync(pnpmCmdPath, pnpmContent, { encoding: 'utf8' });
    if (IS_LINUX) {
      fs.chmodSync(pnpmCmdPath, 0o755);
    }
    log(`创建根目录入口脚本: ${pnpmCmdPath}`);
    count++;
  }

  // ========== 5. pm2 入口脚本（需要 node 执行）==========
  if (relativePm2Js) {
    const pm2CmdPath = IS_WINDOWS
      ? path.join(PROJECT_ROOT, 'pm2.cmd')
      : path.join(PROJECT_ROOT, 'pm2');

    const pm2Content = IS_WINDOWS
      ? createWindowsPm2Wrapper()
      : createLinuxPm2Wrapper();

    fs.writeFileSync(pm2CmdPath, pm2Content, { encoding: 'utf8' });
    if (IS_LINUX) {
      fs.chmodSync(pm2CmdPath, 0o755);
    }
    log(`创建根目录入口脚本: ${pm2CmdPath}`);
    count++;
  }

  return count;
}

/**
 * 在 packages 子目录创建入口脚本
 */
function setupPackageDirs() {
  let count = 0;

  const packagesDir = path.join(PROJECT_ROOT, 'packages');
  if (!fs.existsSync(packagesDir)) {
    return count;
  }

  const subDirs = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const subDir of subDirs) {
    const targetDir = path.join(packagesDir, subDir);
    count += createEntryScriptsInDir(targetDir);
  }

  return count;
}

/**
 * 在指定目录创建入口脚本
 * @param {string} targetDir 目标目录（绝对路径）
 */
function createEntryScriptsInDir(targetDir) {
  let count = 0;

  // 计算从目标目录回到项目根目录的回退层数
  const relativeDir = path.relative(PROJECT_ROOT, targetDir);
  const backLevels = relativeDir.split(path.sep).filter(Boolean).length;
  const backPath = IS_WINDOWS
    ? Array(backLevels).fill('..').join('\\')
    : Array(backLevels).fill('..').join('/');

  // 计算各路径相对于目标目录的相对路径
  const relativeNodeExe = path.relative(targetDir, OFFLINE_NODE_EXE).replace(/\\/g, '\\');
  const relativeNodeDir = path.relative(targetDir, OFFLINE_NODE_DIR).replace(/\\/g, '\\');

  // ========== 1. node 入口脚本 ==========
  const nodeCmdPath = IS_WINDOWS
    ? path.join(targetDir, 'node.cmd')
    : path.join(targetDir, 'node');

  const nodeContent = IS_WINDOWS
    ? `@echo off
REM CloudCAD offline Node.js entry
REM Only effective in project directory, does not affect system Node.js

"%~dp0${backPath}\\${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE).replace(/\\/g, '\\')}" %*
`
    : `#!/bin/bash
# CloudCAD offline Node.js entry
# Only effective in project directory, does not affect system Node.js

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
exec "$PROJECT_ROOT/${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE)}" "$@"
`;

  fs.writeFileSync(nodeCmdPath, nodeContent, { encoding: 'utf8' });
  if (IS_LINUX) {
    fs.chmodSync(nodeCmdPath, 0o755);
  }
  count++;

  // ========== 2. npm 入口脚本 ==========
  const npmPath = IS_WINDOWS
    ? path.join(OFFLINE_NODE_DIR, 'npm.cmd')
    : path.join(OFFLINE_NODE_DIR, 'npm');

  if (fs.existsSync(npmPath)) {
    const npmCmdPath = IS_WINDOWS
      ? path.join(targetDir, 'npm.cmd')
      : path.join(targetDir, 'npm');

    const npmContent = IS_WINDOWS
      ? `@echo off
REM CloudCAD offline npm entry
REM Only effective in project directory, does not affect system npm

set "PATH=%~dp0${backPath}\\${path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR).replace(/\\/g, '\\')};%PATH%"
"%~dp0${backPath}\\${path.relative(PROJECT_ROOT, npmPath).replace(/\\/g, '\\')}" %*
`
      : `#!/bin/bash
# CloudCAD offline npm entry
# Only effective in project directory, does not affect system npm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
export PATH="$PROJECT_ROOT/${path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR)}:$PATH"
exec "$PROJECT_ROOT/${path.relative(PROJECT_ROOT, npmPath)}" "$@"
`;

    fs.writeFileSync(npmCmdPath, npmContent, { encoding: 'utf8' });
    if (IS_LINUX) {
      fs.chmodSync(npmCmdPath, 0o755);
    }
    count++;
  }

  // ========== 3. npx 入口脚本 ==========
  const npxPath = IS_WINDOWS
    ? path.join(OFFLINE_NODE_DIR, 'npx.cmd')
    : path.join(OFFLINE_NODE_DIR, 'npx');

  if (fs.existsSync(npxPath)) {
    const npxCmdPath = IS_WINDOWS
      ? path.join(targetDir, 'npx.cmd')
      : path.join(targetDir, 'npx');

    const npxContent = IS_WINDOWS
      ? `@echo off
REM CloudCAD offline npx entry
REM Only effective in project directory, does not affect system npx

set "PATH=%~dp0${backPath}\\${path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR).replace(/\\/g, '\\')};%PATH%"
"%~dp0${backPath}\\${path.relative(PROJECT_ROOT, npxPath).replace(/\\/g, '\\')}" %*
`
      : `#!/bin/bash
# CloudCAD offline npx entry
# Only effective in project directory, does not affect system npx

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
export PATH="$PROJECT_ROOT/${path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR)}:$PATH"
exec "$PROJECT_ROOT/${path.relative(PROJECT_ROOT, npxPath)}" "$@"
`;

    fs.writeFileSync(npxCmdPath, npxContent, { encoding: 'utf8' });
    if (IS_LINUX) {
      fs.chmodSync(npxCmdPath, 0o755);
    }
    count++;
  }

  // ========== 4. pnpm 入口脚本 ==========
  const pnpmJs = findPnpmJs();
  if (pnpmJs) {
    const pnpmCmdPath = IS_WINDOWS
      ? path.join(targetDir, 'pnpm.cmd')
      : path.join(targetDir, 'pnpm');

    const pnpmContent = IS_WINDOWS
      ? `@echo off
REM CloudCAD offline pnpm entry
REM Only effective in project directory, does not affect system pnpm

"%~dp0${backPath}\\${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE).replace(/\\/g, '\\')}" "%~dp0${backPath}\\${path.relative(PROJECT_ROOT, pnpmJs).replace(/\\/g, '\\')}" %*
`
      : `#!/bin/bash
# CloudCAD offline pnpm entry
# Only effective in project directory, does not affect system pnpm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
exec "$PROJECT_ROOT/${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE)}" "$PROJECT_ROOT/${path.relative(PROJECT_ROOT, pnpmJs)}" "$@"
`;

    fs.writeFileSync(pnpmCmdPath, pnpmContent, { encoding: 'utf8' });
    if (IS_LINUX) {
      fs.chmodSync(pnpmCmdPath, 0o755);
    }
    count++;
  }

  // ========== 5. pm2 入口脚本 ==========
  const pm2Js = findPm2Js();
  if (pm2Js) {
    const pm2CmdPath = IS_WINDOWS
      ? path.join(targetDir, 'pm2.cmd')
      : path.join(targetDir, 'pm2');

    // packages 子目录需要回到项目根目录
    const pm2Content = IS_WINDOWS
      ? `@echo off
setlocal
REM CloudCAD offline pm2 entry
REM PM2_HOME is set locally and won't affect system pm2

set "PM2_HOME=%~dp0${backPath}\\offline-data\\pm2"
"%~dp0${backPath}\\${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE).replace(/\\/g, '\\')}" "%~dp0${backPath}\\${path.relative(PROJECT_ROOT, pm2Js).replace(/\\/g, '\\')}" %*
endlocal
`
      : `#!/bin/bash
# CloudCAD offline pm2 entry
# PM2_HOME is set locally and won't affect system pm2

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
export PM2_HOME="$PROJECT_ROOT/offline-data/pm2"
exec "$PROJECT_ROOT/${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE)}" "$PROJECT_ROOT/${path.relative(PROJECT_ROOT, pm2Js)}" "$@"
`;

    fs.writeFileSync(pm2CmdPath, pm2Content, { encoding: 'utf8' });
    if (IS_LINUX) {
      fs.chmodSync(pm2CmdPath, 0o755);
    }
    count++;
  }

  return count;
}

/**
 * 设置所有包装脚本
 */
function setupWrappers() {
  const binCount = setupNodeModulesBin();
  const offlineCount = setupOfflineNodeDir();
  const rootCount = setupProjectRoot();
  const pkgCount = setupPackageDirs();
  return binCount + offlineCount + rootCount + pkgCount;
}

// ==================== 主函数 ====================

function setup(silent = false) {
  if (!checkOfflineNode()) {
    return false;
  }

  const count = setupWrappers();

  if (!silent) {
    console.log('');
    console.log('╔════════════════════════════════════════╗');
    console.log('║      CloudCAD 离线环境设置             ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');

    log(`平台: ${PLATFORM}`);
    log(`项目根目录: ${PROJECT_ROOT}`);
    log(`离线 Node.js: ${OFFLINE_NODE_EXE}`);
    console.log('');

    log(`完成！已创建 ${count} 个包装脚本`);
    console.log('');
    log('1. 在项目目录下可直接运行 pnpm/npm/node/npx 命令');
    log('2. 这些命令会使用离线 Node.js，不影响系统环境');
    log('3. npm scripts 也会自动使用离线 Node.js');
    console.log('');
  }

  return true;
}

function main() {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║      CloudCAD 离线环境设置             ║');
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
  log('1. 在项目目录下可直接运行 pnpm/npm/node/npx 命令');
  log('2. 这些命令会使用离线 Node.js，不影响系统环境');
  log('3. npm scripts 也会自动使用离线 Node.js');
  console.log('');
}

module.exports = {
  setup,
  setupWrappers,
  OFFLINE_NODE_DIR,
  OFFLINE_NODE_EXE,
  NODE_MODULES_BIN,
};

if (require.main === module) {
  main();
}
