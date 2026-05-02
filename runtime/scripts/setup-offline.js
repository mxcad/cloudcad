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
const { execSync, spawn } = require('child_process');

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

  // pnpm 需要禁用 Corepack，避免从网络下载
  const extraEnv = command === 'pnpm'
    ? `set "COREPACK_ENABLE=0"\nset "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"\n`
    : '';

  return `@echo off
REM Auto-generated wrapper for ${command}
REM This script uses offline Node.js from CloudCAD runtime

set "OFFLINE_NODE_DIR=${relativeNodeDir}"
set "PATH=%OFFLINE_NODE_DIR%;%PATH%"
${extraEnv}"${relativeNodePath}" "${relativeScriptPath}" %*
`;
}

/**
 * 创建 PM2 专用包装脚本（需要设置 PM2_HOME）
 * 使用相对路径，支持任意目录部署
 * 注意：setlocal 确保环境变量只在此脚本会话中有效，不会污染用户系统
 */
function createWindowsPm2Wrapper() {
  return `@echo off
setlocal
REM CloudCAD offline pm2 entry
REM setlocal ensures PATH changes are isolated to this script session only

set "PM2_HOME=%~dp0data\\pm2"
set "PATH=%~dp0runtime\\windows\\node;%PATH%"
"%~dp0runtime\\windows\\node\\node.exe" "%~dp0runtime\\windows\\node\\node_modules\\pm2\\bin\\pm2" %*
endlocal
`;
}

/**
 * 创建 Linux PM2 专用包装脚本
 * 注意：export PATH 只在此脚本会话中有效，不会污染用户系统
 */
function createLinuxPm2Wrapper() {
  return `#!/bin/bash
# CloudCAD offline pm2 entry
# PATH export is scoped to this script process only

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PM2_HOME="$SCRIPT_DIR/data/pm2"
export PATH="$SCRIPT_DIR/runtime/linux/node/bin:$PATH"
exec "$SCRIPT_DIR/runtime/linux/node/bin/node" "$SCRIPT_DIR/runtime/linux/node/bin/node_modules/pm2/bin/pm2" "$@"
`;
}

function createLinuxShellWrapper(command, targetPath, scriptDir) {
  const relativeNodeDir = path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR);
  const relativeTarget = path.relative(PROJECT_ROOT, targetPath);

  // 计算从脚本目录到项目根目录的回退层数
  const backLevels = scriptDir.split(path.sep).filter(Boolean).length;
  // 修复：Array(n).join('x') 产生 n-1 个 x，所以需要 backLevels + 1
  const backPath = backLevels > 0 ? Array(backLevels + 1).join('../') : '';

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
  // 修复：Array(n).join('x') 产生 n-1 个 x，所以需要 backLevels + 1
  const backPath = backLevels > 0 ? Array(backLevels + 1).join('../') : '';

  // pnpm 需要禁用 Corepack，避免从网络下载
  const extraEnv = command === 'pnpm'
    ? `export COREPACK_ENABLE=0\nexport COREPACK_ENABLE_DOWNLOAD_PROMPT=0\n`
    : '';

  return `#!/bin/bash
# Auto-generated wrapper for ${command}
# This script uses offline Node.js from CloudCAD runtime

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}." && pwd)"
export PATH="$PROJECT_ROOT/${relativeNodeDir}:$PATH"
${extraEnv}exec "$PROJECT_ROOT/${relativeNodePath}" "$PROJECT_ROOT/${relativeScriptPath}" "$@"
`;
}

// ==================== PowerShell 包装脚本 ====================

/**
 * 创建 PowerShell 包装脚本（直接执行命令）
 * @param {string} command 命令名
 * @param {string} targetPath 目标路径（绝对路径）
 * @param {string} scriptDir 脚本所在目录（相对于项目根目录）
 */
function createWindowsPs1Wrapper(command, targetPath, scriptDir) {
  const backLevels = scriptDir.split(path.sep).filter(Boolean).length;
  // 生成正确的回退路径，如 "..\..\"
  const backPath = backLevels > 0 ? Array(backLevels).fill('..').join('\\') : '';
  const relativeTarget = path.relative(PROJECT_ROOT, targetPath).replace(/\\/g, '\\');
  const relativeNodeDir = path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR).replace(/\\/g, '\\');

  return `# Auto-generated wrapper for ${command}
# This script uses offline Node.js from CloudCAD runtime

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = if ("${backPath}") { Join-Path $ScriptDir "${backPath}" } else { $ScriptDir }
$NodeDir = Join-Path $ProjectRoot "${relativeNodeDir}"
$TargetPath = Join-Path $ProjectRoot "${relativeTarget}"

$env:PATH = "$NodeDir;$env:PATH"
& $TargetPath @Args
`;
}

/**
 * 创建 PowerShell 包装脚本（需要 node 执行）
 * @param {string} command 命令名
 * @param {string} nodePath node.exe 路径（绝对路径）
 * @param {string} scriptPath 脚本路径（绝对路径）
 * @param {string} scriptDir 脚本所在目录（相对于项目根目录）
 */
function createWindowsPs1NodeWrapper(command, nodePath, scriptPath, scriptDir) {
  const backLevels = scriptDir.split(path.sep).filter(Boolean).length;
  // 生成正确的回退路径，如 "..\..\"
  const backPath = backLevels > 0 ? Array(backLevels).fill('..').join('\\') : '';
  const relativeNodeExe = path.relative(PROJECT_ROOT, nodePath).replace(/\\/g, '\\');
  const relativeScriptPath = path.relative(PROJECT_ROOT, scriptPath).replace(/\\/g, '\\');

  // pnpm 需要禁用 Corepack，避免从网络下载
  const extraEnv = command === 'pnpm'
    ? `$env:COREPACK_ENABLE = "0"\n$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"\n`
    : '';

  return `# Auto-generated wrapper for ${command}
# This script uses offline Node.js from CloudCAD runtime

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = if ("${backPath}") { Join-Path $ScriptDir "${backPath}" } else { $ScriptDir }
$NodePath = Join-Path $ProjectRoot "${relativeNodeExe}"
$ScriptPath = Join-Path $ProjectRoot "${relativeScriptPath}"

${extraEnv}& $NodePath $ScriptPath @Args
`;
}

/**
 * 创建 PM2 专用 PowerShell 包装脚本
 * 注意：$env:PATH 只在此脚本会话中有效，不会污染用户系统
 */
function createWindowsPs1Pm2Wrapper() {
  return `# CloudCAD offline pm2 entry
# PATH change is scoped to this PowerShell session only

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$env:PM2_HOME = Join-Path $ScriptDir "data\\pm2"
$env:PATH = "$(Join-Path $ScriptDir 'runtime\\windows\\node');$env:PATH"
$NodePath = Join-Path $ScriptDir "runtime\\windows\\node\\node.exe"
$Pm2Path = Join-Path $ScriptDir "runtime\\windows\\node\\node_modules\\pm2\\bin\\pm2"

& $NodePath $Pm2Path @Args
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
 * 在指定目录创建包装脚本（直接执行）
 * Windows 上同时生成 .cmd 和 .ps1 文件
 * @param {string} dir 脚本所在目录（绝对路径）
 * @param {string} command 命令名
 * @param {string} targetPath 目标路径（绝对路径）
 */
function createWrapper(dir, command, targetPath) {
  // 计算脚本目录相对于项目根目录的路径
  const scriptDir = path.relative(PROJECT_ROOT, dir);

  if (IS_WINDOWS) {
    // 生成 .cmd 文件
    const cmdPath = path.join(dir, `${command}.cmd`);
    const cmdContent = createWindowsCmdWrapper(command, targetPath, scriptDir);
    fs.writeFileSync(cmdPath, cmdContent, { encoding: 'utf8' });
    log(`创建包装脚本: ${cmdPath}`);

    // 生成 .ps1 文件（PowerShell 兼容）
    const ps1Path = path.join(dir, `${command}.ps1`);
    const ps1Content = createWindowsPs1Wrapper(command, targetPath, scriptDir);
    fs.writeFileSync(ps1Path, ps1Content, { encoding: 'utf8' });
    log(`创建包装脚本: ${ps1Path}`);
  } else {
    const wrapperPath = path.join(dir, command);
    const content = createLinuxShellWrapper(command, targetPath, scriptDir);
    fs.writeFileSync(wrapperPath, content, { encoding: 'utf8' });
    fs.chmodSync(wrapperPath, 0o755);
    log(`创建包装脚本: ${wrapperPath}`);
  }
}

/**
 * 在指定目录创建需要 node 执行的包装脚本
 * Windows 上同时生成 .cmd 和 .ps1 文件
 * @param {string} dir 脚本所在目录（绝对路径）
 * @param {string} command 命令名
 * @param {string} scriptPath 脚本路径（绝对路径）
 */
function createNodeWrapper(dir, command, scriptPath) {
  // 计算脚本目录相对于项目根目录的路径
  const scriptDir = path.relative(PROJECT_ROOT, dir);

  if (IS_WINDOWS) {
    // 生成 .cmd 文件
    const cmdPath = path.join(dir, `${command}.cmd`);
    const cmdContent = createWindowsNodeWrapper(command, OFFLINE_NODE_EXE, scriptPath, scriptDir);
    fs.writeFileSync(cmdPath, cmdContent, { encoding: 'utf8' });
    log(`创建 node 包装脚本: ${cmdPath}`);

    // 生成 .ps1 文件（PowerShell 兼容）
    const ps1Path = path.join(dir, `${command}.ps1`);
    const ps1Content = createWindowsPs1NodeWrapper(command, OFFLINE_NODE_EXE, scriptPath, scriptDir);
    fs.writeFileSync(ps1Path, ps1Content, { encoding: 'utf8' });
    log(`创建 node 包装脚本: ${ps1Path}`);
  } else {
    const wrapperPath = path.join(dir, command);
    const content = createLinuxNodeWrapper(command, OFFLINE_NODE_EXE, scriptPath, scriptDir);
    fs.writeFileSync(wrapperPath, content, { encoding: 'utf8' });
    fs.chmodSync(wrapperPath, 0o755);
    log(`创建 node 包装脚本: ${wrapperPath}`);
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
        path.join(PLATFORM_DIR, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      ]
    : [
        // 新结构：runtime/linux/node/node_modules/pnpm/bin/pnpm.cjs
        path.join(PLATFORM_DIR, 'node', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
        // 旧结构：runtime/linux/node/lib/node_modules/pnpm/bin/pnpm.cjs
        path.join(PLATFORM_DIR, 'node', 'lib', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
        // bin 同级的 node_modules
        path.join(OFFLINE_NODE_DIR, '..', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
      ];
  
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  // 回退到 corepack（不推荐，需要网络下载）
  const corepackCandidates = IS_WINDOWS
    ? [
        path.join(OFFLINE_NODE_DIR, 'node_modules', 'corepack', 'dist', 'pnpm.js'),
        path.join(PLATFORM_DIR, 'node', 'node_modules', 'corepack', 'dist', 'pnpm.js'),
      ]
    : [
        path.join(PLATFORM_DIR, 'node', 'node_modules', 'corepack', 'dist', 'pnpm.js'),
        path.join(PLATFORM_DIR, 'node', 'lib', 'node_modules', 'corepack', 'dist', 'pnpm.js'),
        path.join(OFFLINE_NODE_DIR, '..', 'node_modules', 'corepack', 'dist', 'pnpm.js'),
      ];
  
  for (const p of corepackCandidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  return null;
}

/**
 * 查找 pm2.js 路径
 */
function findPm2Js() {
  // Windows: runtime/windows/node/node_modules/pm2/bin/pm2
  // Linux: runtime/linux/node/node_modules/pm2/bin/pm2 (新结构)
  //        runtime/linux/node/lib/node_modules/pm2/bin/pm2 (旧结构)
  const candidates = IS_WINDOWS
    ? [
        path.join(OFFLINE_NODE_DIR, 'node_modules', 'pm2', 'bin', 'pm2'),
        path.join(PLATFORM_DIR, 'node', 'node_modules', 'pm2', 'bin', 'pm2'),
      ]
    : [
        // 新结构：runtime/linux/node/node_modules/pm2/bin/pm2
        path.join(PLATFORM_DIR, 'node', 'node_modules', 'pm2', 'bin', 'pm2'),
        // 旧结构：runtime/linux/node/lib/node_modules/pm2/bin/pm2
        path.join(PLATFORM_DIR, 'node', 'lib', 'node_modules', 'pm2', 'bin', 'pm2'),
        // bin 同级的 node_modules
        path.join(OFFLINE_NODE_DIR, '..', 'node_modules', 'pm2', 'bin', 'pm2'),
      ];
  
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
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
  // Windows: runtime/windows/node/npm.cmd
  // Linux: runtime/linux/node/bin/npm (或 runtime/linux/node/lib/node_modules/npm/bin/npm-cli.js)
  const offlineCommands = ['npm', 'npx', 'corepack'];
  for (const cmd of offlineCommands) {
    const cmdPathCandidates = IS_WINDOWS
      ? [path.join(OFFLINE_NODE_DIR, `${cmd}.cmd`)]
      : [
          path.join(OFFLINE_NODE_DIR, cmd),
          path.join(PLATFORM_DIR, 'node', 'bin', cmd),
          path.join(PLATFORM_DIR, 'node', 'lib', 'node_modules', 'npm', 'bin', `${cmd}-cli.js`),
        ];
    
    for (const cmdPath of cmdPathCandidates) {
      if (fs.existsSync(cmdPath)) {
        createWrapper(NODE_MODULES_BIN, cmd, cmdPath);
        count++;
        break;
      }
    }
  }

  // 3. pnpm
  const pnpmJs = findPnpmJs();
  if (pnpmJs) {
    createNodeWrapper(NODE_MODULES_BIN, 'pnpm', pnpmJs);
    count++;
  }

  // 4. 修复所有 node_modules/.bin 中的硬编码路径脚本
  // pnpm install 时会创建包含绝对路径的脚本，需要修复为正确的 node 路径
  count += fixBinScripts();

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
  let count = 0;
  
  // 需要修复的 .bin 目录列表
  const binDirs = [
    NODE_MODULES_BIN, // 根目录 node_modules/.bin
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.bin'),
    path.join(PROJECT_ROOT, 'packages', 'frontend', 'node_modules', '.bin'),
    path.join(PROJECT_ROOT, 'packages', 'config-service', 'node_modules', '.bin'),
  ];
  
  for (const binDir of binDirs) {
    if (!fs.existsSync(binDir)) continue;
    
    const binFiles = fs.readdirSync(binDir).filter(f => 
      !f.endsWith('.cmd') && !f.endsWith('.ps1') && !f.startsWith('.')
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
          const pnpmMatch = content.match(/exec\s+["']?\$basedir\/(.+?)["']?\s+\$@/);
          if (pnpmMatch) {
            targetJs = path.resolve(binDir, pnpmMatch[1].replace(/^\.\.\//g, '../'));
          }
          
          // 方法2：解析 node + 路径格式
          if (!targetJs) {
            const nodeMatch = content.match(/node\s+["']?\$basedir\/(.+?)["']?\s+/);
            if (nodeMatch) {
              targetJs = path.resolve(binDir, nodeMatch[1].replace(/^\.\.\//g, '../'));
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
            log(`跳过脚本（找不到入口）: ${path.relative(PROJECT_ROOT, binPath)}`);
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
 * 设置离线 node 目录中的包装脚本
 * 同时生成 .cmd 和 .ps1 文件，兼容 CMD 和 PowerShell
 */
function setupOfflineNodeDir() {
  let count = 0;

  // pnpm - 同时生成 .cmd 和 .ps1
  const pnpmJs = findPnpmJs();
  if (pnpmJs) {
    createNodeWrapper(OFFLINE_NODE_DIR, 'pnpm', pnpmJs);
    count++;
  }

  return count;
}

/**
 * 在项目根目录创建入口脚本（用户直接运行命令时优先命中）
 * 同时生成 .cmd 和 .ps1 文件，兼容 CMD 和 PowerShell
 */
function setupProjectRoot() {
  let count = 0;

  // 计算相对路径
  const relativeNodeDir = path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR).replace(/\\/g, '\\');
  const relativeNodeExe = path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE).replace(/\\/g, '\\');
  const relativePnpmJs = findPnpmJs() ? path.relative(PROJECT_ROOT, findPnpmJs()).replace(/\\/g, '\\') : null;
  const relativePm2Js = findPm2Js() ? path.relative(PROJECT_ROOT, findPm2Js()).replace(/\\/g, '\\') : null;

  // ========== 1. node 入口脚本 ==========
  if (IS_WINDOWS) {
    // .cmd 文件
    const nodeCmdPath = path.join(PROJECT_ROOT, 'node.cmd');
    const nodeCmdContent = `@echo off
REM CloudCAD offline Node.js entry
REM Only effective in project directory, does not affect system Node.js

"%~dp0${relativeNodeExe}" %*
`;
    fs.writeFileSync(nodeCmdPath, nodeCmdContent, { encoding: 'utf8' });
    log(`创建根目录入口脚本: ${nodeCmdPath}`);
    count++;

    // .ps1 文件
    const nodePs1Path = path.join(PROJECT_ROOT, 'node.ps1');
    const nodePs1Content = `# CloudCAD offline Node.js entry
# Only effective in project directory, does not affect system Node.js

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$NodePath = Join-Path $ScriptDir "${relativeNodeExe}"

& $NodePath @Args
`;
    fs.writeFileSync(nodePs1Path, nodePs1Content, { encoding: 'utf8' });
    log(`创建根目录入口脚本: ${nodePs1Path}`);
    count++;
  } else {
    const nodeCmdPath = path.join(PROJECT_ROOT, 'node');
    const nodeContent = `#!/bin/bash
# CloudCAD offline Node.js entry
# Only effective in project directory, does not affect system Node.js

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE)}" "$@"
`;
    fs.writeFileSync(nodeCmdPath, nodeContent, { encoding: 'utf8' });
    fs.chmodSync(nodeCmdPath, 0o755);
    log(`创建根目录入口脚本: ${nodeCmdPath}`);
    count++;
  }

  // ========== 2. npm 入口脚本 ==========
  const npmPath = IS_WINDOWS
    ? path.join(OFFLINE_NODE_DIR, 'npm.cmd')
    : path.join(OFFLINE_NODE_DIR, 'npm');

  if (fs.existsSync(npmPath)) {
    if (IS_WINDOWS) {
      const relativeNpmPath = path.relative(PROJECT_ROOT, npmPath).replace(/\\/g, '\\');

      // .cmd 文件
      const npmCmdPath = path.join(PROJECT_ROOT, 'npm.cmd');
      const npmCmdContent = `@echo off
REM CloudCAD offline npm entry
REM Only effective in project directory, does not affect system npm

set "PATH=%~dp0${relativeNodeDir};%PATH%"
"%~dp0${relativeNpmPath}" %*
`;
      fs.writeFileSync(npmCmdPath, npmCmdContent, { encoding: 'utf8' });
      log(`创建根目录入口脚本: ${npmCmdPath}`);
      count++;

      // .ps1 文件
      const npmPs1Path = path.join(PROJECT_ROOT, 'npm.ps1');
      const npmPs1Content = `# CloudCAD offline npm entry
# Only effective in project directory, does not affect system npm

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$env:PATH = "$ScriptDir\\${relativeNodeDir};$env:PATH"
$NpmPath = Join-Path $ScriptDir "${relativeNpmPath}"

& $NpmPath @Args
`;
      fs.writeFileSync(npmPs1Path, npmPs1Content, { encoding: 'utf8' });
      log(`创建根目录入口脚本: ${npmPs1Path}`);
      count++;
    } else {
      const npmCmdPath = path.join(PROJECT_ROOT, 'npm');
      const npmContent = `#!/bin/bash
# CloudCAD offline npm entry
# Only effective in project directory, does not affect system npm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$SCRIPT_DIR/${path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR)}:$PATH"
exec "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, npmPath)}" "$@"
`;
      fs.writeFileSync(npmCmdPath, npmContent, { encoding: 'utf8' });
      fs.chmodSync(npmCmdPath, 0o755);
      log(`创建根目录入口脚本: ${npmCmdPath}`);
      count++;
    }
  }

  // ========== 3. npx 入口脚本 ==========
  const npxPath = IS_WINDOWS
    ? path.join(OFFLINE_NODE_DIR, 'npx.cmd')
    : path.join(OFFLINE_NODE_DIR, 'npx');

  if (fs.existsSync(npxPath)) {
    if (IS_WINDOWS) {
      const relativeNpxPath = path.relative(PROJECT_ROOT, npxPath).replace(/\\/g, '\\');

      // .cmd 文件
      const npxCmdPath = path.join(PROJECT_ROOT, 'npx.cmd');
      const npxCmdContent = `@echo off
REM CloudCAD offline npx entry
REM Only effective in project directory, does not affect system npx

set "PATH=%~dp0${relativeNodeDir};%PATH%"
"%~dp0${relativeNpxPath}" %*
`;
      fs.writeFileSync(npxCmdPath, npxCmdContent, { encoding: 'utf8' });
      log(`创建根目录入口脚本: ${npxCmdPath}`);
      count++;

      // .ps1 文件
      const npxPs1Path = path.join(PROJECT_ROOT, 'npx.ps1');
      const npxPs1Content = `# CloudCAD offline npx entry
# Only effective in project directory, does not affect system npx

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$env:PATH = "$ScriptDir\\${relativeNodeDir};$env:PATH"
$NpxPath = Join-Path $ScriptDir "${relativeNpxPath}"

& $NpxPath @Args
`;
      fs.writeFileSync(npxPs1Path, npxPs1Content, { encoding: 'utf8' });
      log(`创建根目录入口脚本: ${npxPs1Path}`);
      count++;
    } else {
      const npxCmdPath = path.join(PROJECT_ROOT, 'npx');
      const npxContent = `#!/bin/bash
# CloudCAD offline npx entry
# Only effective in project directory, does not affect system npx

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$SCRIPT_DIR/${path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR)}:$PATH"
exec "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, npxPath)}" "$@"
`;
      fs.writeFileSync(npxCmdPath, npxContent, { encoding: 'utf8' });
      fs.chmodSync(npxCmdPath, 0o755);
      log(`创建根目录入口脚本: ${npxCmdPath}`);
      count++;
    }
  }

  // ========== 4. pnpm 入口脚本（需要 node 执行）==========
  if (relativePnpmJs) {
    if (IS_WINDOWS) {
      // .cmd 文件
      const pnpmCmdPath = path.join(PROJECT_ROOT, 'pnpm.cmd');
      const pnpmCmdContent = `@echo off
REM CloudCAD offline pnpm entry
REM Only effective in project directory, does not affect system pnpm
REM Disable Corepack to use local pnpm and avoid network download

set "COREPACK_ENABLE=0"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
"%~dp0${relativeNodeExe}" "%~dp0${relativePnpmJs}" %*
`;
      fs.writeFileSync(pnpmCmdPath, pnpmCmdContent, { encoding: 'utf8' });
      log(`创建根目录入口脚本: ${pnpmCmdPath}`);
      count++;

      // .ps1 文件
      const pnpmPs1Path = path.join(PROJECT_ROOT, 'pnpm.ps1');
      const pnpmPs1Content = `# CloudCAD offline pnpm entry
# Only effective in project directory, does not affect system pnpm
# Disable Corepack to use local pnpm and avoid network download

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$NodePath = Join-Path $ScriptDir "${relativeNodeExe}"
$PnpmPath = Join-Path $ScriptDir "${relativePnpmJs}"

$env:COREPACK_ENABLE = "0"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
& $NodePath $PnpmPath @Args
`;
      fs.writeFileSync(pnpmPs1Path, pnpmPs1Content, { encoding: 'utf8' });
      log(`创建根目录入口脚本: ${pnpmPs1Path}`);
      count++;
    } else {
      const pnpmCmdPath = path.join(PROJECT_ROOT, 'pnpm');
      const pnpmContent = `#!/bin/bash
# CloudCAD offline pnpm entry
# Only effective in project directory, does not affect system pnpm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE)}" "$SCRIPT_DIR/${path.relative(PROJECT_ROOT, findPnpmJs())}" "$@"
`;
      fs.writeFileSync(pnpmCmdPath, pnpmContent, { encoding: 'utf8' });
      fs.chmodSync(pnpmCmdPath, 0o755);
      log(`创建根目录入口脚本: ${pnpmCmdPath}`);
      count++;
    }
  }

  // ========== 5. pm2 入口脚本（需要 node 执行）==========
  if (relativePm2Js) {
    if (IS_WINDOWS) {
      // .cmd 文件
      const pm2CmdPath = path.join(PROJECT_ROOT, 'pm2.cmd');
      const pm2CmdContent = createWindowsPm2Wrapper();
      fs.writeFileSync(pm2CmdPath, pm2CmdContent, { encoding: 'utf8' });
      log(`创建根目录入口脚本: ${pm2CmdPath}`);
      count++;

      // .ps1 文件
      const pm2Ps1Path = path.join(PROJECT_ROOT, 'pm2.ps1');
      const pm2Ps1Content = createWindowsPs1Pm2Wrapper();
      fs.writeFileSync(pm2Ps1Path, pm2Ps1Content, { encoding: 'utf8' });
      log(`创建根目录入口脚本: ${pm2Ps1Path}`);
      count++;
    } else {
      const pm2CmdPath = path.join(PROJECT_ROOT, 'pm2');
      const pm2Content = createLinuxPm2Wrapper();
      fs.writeFileSync(pm2CmdPath, pm2Content, { encoding: 'utf8' });
      fs.chmodSync(pm2CmdPath, 0o755);
      log(`创建根目录入口脚本: ${pm2CmdPath}`);
      count++;
    }
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
 * 同时生成 .cmd 和 .ps1 文件，兼容 CMD 和 PowerShell
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

  // 计算各路径相对于项目根目录的路径（用于脚本内容）
  const rootRelativeNodeExe = path.relative(PROJECT_ROOT, OFFLINE_NODE_EXE).replace(/\\/g, '\\');
  const rootRelativeNodeDir = path.relative(PROJECT_ROOT, OFFLINE_NODE_DIR).replace(/\\/g, '\\');

  // ========== 1. node 入口脚本 ==========
  if (IS_WINDOWS) {
    // .cmd 文件
    const nodeCmdPath = path.join(targetDir, 'node.cmd');
    const nodeCmdContent = `@echo off
REM CloudCAD offline Node.js entry
REM Only effective in project directory, does not affect system Node.js

"%~dp0${backPath}\\${rootRelativeNodeExe}" %*
`;
    fs.writeFileSync(nodeCmdPath, nodeCmdContent, { encoding: 'utf8' });
    log(`创建子目录入口脚本: ${nodeCmdPath}`);
    count++;

    // .ps1 文件
    const nodePs1Path = path.join(targetDir, 'node.ps1');
    const nodePs1Content = `# CloudCAD offline Node.js entry
# Only effective in project directory, does not affect system Node.js

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Join-Path $ScriptDir "${backPath}"
$NodePath = Join-Path $ProjectRoot "${rootRelativeNodeExe}"

& $NodePath @Args
`;
    fs.writeFileSync(nodePs1Path, nodePs1Content, { encoding: 'utf8' });
    log(`创建子目录入口脚本: ${nodePs1Path}`);
    count++;
  } else {
    const nodeCmdPath = path.join(targetDir, 'node');
    const nodeContent = `#!/bin/bash
# CloudCAD offline Node.js entry
# Only effective in project directory, does not affect system Node.js

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
exec "$PROJECT_ROOT/${rootRelativeNodeExe}" "$@"
`;
    fs.writeFileSync(nodeCmdPath, nodeContent, { encoding: 'utf8' });
    fs.chmodSync(nodeCmdPath, 0o755);
    log(`创建子目录入口脚本: ${nodeCmdPath}`);
    count++;
  }

  // ========== 2. npm 入口脚本 ==========
  const npmPath = IS_WINDOWS
    ? path.join(OFFLINE_NODE_DIR, 'npm.cmd')
    : path.join(OFFLINE_NODE_DIR, 'npm');

  if (fs.existsSync(npmPath)) {
    const rootRelativeNpmPath = path.relative(PROJECT_ROOT, npmPath).replace(/\\/g, '\\');

    if (IS_WINDOWS) {
      // .cmd 文件
      const npmCmdPath = path.join(targetDir, 'npm.cmd');
      const npmCmdContent = `@echo off
REM CloudCAD offline npm entry
REM Only effective in project directory, does not affect system npm

set "PATH=%~dp0${backPath}\\${rootRelativeNodeDir};%PATH%"
"%~dp0${backPath}\\${rootRelativeNpmPath}" %*
`;
      fs.writeFileSync(npmCmdPath, npmCmdContent, { encoding: 'utf8' });
      log(`创建子目录入口脚本: ${npmCmdPath}`);
      count++;

      // .ps1 文件
      const npmPs1Path = path.join(targetDir, 'npm.ps1');
      const npmPs1Content = `# CloudCAD offline npm entry
# Only effective in project directory, does not affect system npm

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Join-Path $ScriptDir "${backPath}"
$env:PATH = "$ProjectRoot\\${rootRelativeNodeDir};$env:PATH"
$NpmPath = Join-Path $ProjectRoot "${rootRelativeNpmPath}"

& $NpmPath @Args
`;
      fs.writeFileSync(npmPs1Path, npmPs1Content, { encoding: 'utf8' });
      log(`创建子目录入口脚本: ${npmPs1Path}`);
      count++;
    } else {
      const npmCmdPath = path.join(targetDir, 'npm');
      const npmContent = `#!/bin/bash
# CloudCAD offline npm entry
# Only effective in project directory, does not affect system npm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
export PATH="$PROJECT_ROOT/${rootRelativeNodeDir}:$PATH"
exec "$PROJECT_ROOT/${rootRelativeNpmPath}" "$@"
`;
      fs.writeFileSync(npmCmdPath, npmContent, { encoding: 'utf8' });
      fs.chmodSync(npmCmdPath, 0o755);
      log(`创建子目录入口脚本: ${npmCmdPath}`);
      count++;
    }
  }

  // ========== 3. npx 入口脚本 ==========
  const npxPath = IS_WINDOWS
    ? path.join(OFFLINE_NODE_DIR, 'npx.cmd')
    : path.join(OFFLINE_NODE_DIR, 'npx');

  if (fs.existsSync(npxPath)) {
    const rootRelativeNpxPath = path.relative(PROJECT_ROOT, npxPath).replace(/\\/g, '\\');

    if (IS_WINDOWS) {
      // .cmd 文件
      const npxCmdPath = path.join(targetDir, 'npx.cmd');
      const npxCmdContent = `@echo off
REM CloudCAD offline npx entry
REM Only effective in project directory, does not affect system npx

set "PATH=%~dp0${backPath}\\${rootRelativeNodeDir};%PATH%"
"%~dp0${backPath}\\${rootRelativeNpxPath}" %*
`;
      fs.writeFileSync(npxCmdPath, npxCmdContent, { encoding: 'utf8' });
      log(`创建子目录入口脚本: ${npxCmdPath}`);
      count++;

      // .ps1 文件
      const npxPs1Path = path.join(targetDir, 'npx.ps1');
      const npxPs1Content = `# CloudCAD offline npx entry
# Only effective in project directory, does not affect system npx

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Join-Path $ScriptDir "${backPath}"
$env:PATH = "$ProjectRoot\\${rootRelativeNodeDir};$env:PATH"
$NpxPath = Join-Path $ProjectRoot "${rootRelativeNpxPath}"

& $NpxPath @Args
`;
      fs.writeFileSync(npxPs1Path, npxPs1Content, { encoding: 'utf8' });
      log(`创建子目录入口脚本: ${npxPs1Path}`);
      count++;
    } else {
      const npxCmdPath = path.join(targetDir, 'npx');
      const npxContent = `#!/bin/bash
# CloudCAD offline npx entry
# Only effective in project directory, does not affect system npx

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
export PATH="$PROJECT_ROOT/${rootRelativeNodeDir}:$PATH"
exec "$PROJECT_ROOT/${rootRelativeNpxPath}" "$@"
`;
      fs.writeFileSync(npxCmdPath, npxContent, { encoding: 'utf8' });
      fs.chmodSync(npxCmdPath, 0o755);
      log(`创建子目录入口脚本: ${npxCmdPath}`);
      count++;
    }
  }

    // ========== 4. pnpm 入口脚本 ==========
    const pnpmJs = findPnpmJs();
    if (pnpmJs) {
      const rootRelativePnpmJs = path.relative(PROJECT_ROOT, pnpmJs).replace(/\\/g, '\\');
  
      if (IS_WINDOWS) {
              // .cmd 文件
              const pnpmCmdPath = path.join(targetDir, 'pnpm.cmd');
              const pnpmCmdContent = `@echo off
        REM CloudCAD offline pnpm entry
        REM Only effective in project directory, does not affect system pnpm
        REM Disable Corepack to use local pnpm and avoid network download
        
        set "COREPACK_ENABLE=0"
        set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
        "%~dp0${backPath}\\${rootRelativeNodeExe}" "%~dp0${backPath}\\${rootRelativePnpmJs}" %*
        `;        fs.writeFileSync(pnpmCmdPath, pnpmCmdContent, { encoding: 'utf8' });
        log(`创建子目录入口脚本: ${pnpmCmdPath}`);
        count++;
  
              // .ps1 文件
              const pnpmPs1Path = path.join(targetDir, 'pnpm.ps1');
              const pnpmPs1Content = `# CloudCAD offline pnpm entry
        # Only effective in project directory, does not affect system pnpm
        # Disable Corepack to use local pnpm and avoid network download
        
        param([Parameter(ValueFromRemainingArguments)]$Args)
        
        $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
        $ProjectRoot = Join-Path $ScriptDir "${backPath}"
        $NodePath = Join-Path $ProjectRoot "${rootRelativeNodeExe}"
        $PnpmPath = Join-Path $ProjectRoot "${rootRelativePnpmJs}"
        
        $env:COREPACK_ENABLE = "0"
        $env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
        & $NodePath $PnpmPath @Args
        `;        fs.writeFileSync(pnpmPs1Path, pnpmPs1Content, { encoding: 'utf8' });
        log(`创建子目录入口脚本: ${pnpmPs1Path}`);
        count++;    } else {
      const pnpmCmdPath = path.join(targetDir, 'pnpm');
      const pnpmContent = `#!/bin/bash
# CloudCAD offline pnpm entry
# Only effective in project directory, does not affect system pnpm

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
exec "$PROJECT_ROOT/${rootRelativeNodeExe}" "$PROJECT_ROOT/${rootRelativePnpmJs}" "$@"
`;
      fs.writeFileSync(pnpmCmdPath, pnpmContent, { encoding: 'utf8' });
      fs.chmodSync(pnpmCmdPath, 0o755);
      log(`创建子目录入口脚本: ${pnpmCmdPath}`);
      count++;
    }
  }

  // ========== 5. pm2 入口脚本 ==========
  const pm2Js = findPm2Js();
  if (pm2Js) {
    const rootRelativePm2Js = path.relative(PROJECT_ROOT, pm2Js).replace(/\\/g, '\\');

    if (IS_WINDOWS) {
      // .cmd 文件
      const pm2CmdPath = path.join(targetDir, 'pm2.cmd');
      const pm2CmdContent = `@echo off
setlocal
REM CloudCAD offline pm2 entry
REM PM2_HOME is set locally and won't affect system pm2

set "PM2_HOME=%~dp0${backPath}\\data\\pm2"
"%~dp0${backPath}\\${rootRelativeNodeExe}" "%~dp0${backPath}\\${rootRelativePm2Js}" %*
endlocal
`;
      fs.writeFileSync(pm2CmdPath, pm2CmdContent, { encoding: 'utf8' });
      log(`创建子目录入口脚本: ${pm2CmdPath}`);
      count++;

      // .ps1 文件
      const pm2Ps1Path = path.join(targetDir, 'pm2.ps1');
      const pm2Ps1Content = `# CloudCAD offline pm2 entry
# PM2_HOME is set locally and won't affect system pm2

param([Parameter(ValueFromRemainingArguments)]$Args)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Join-Path $ScriptDir "${backPath}"
$env:PM2_HOME = Join-Path $ProjectRoot "data\\pm2"
$NodePath = Join-Path $ProjectRoot "${rootRelativeNodeExe}"
$Pm2Path = Join-Path $ProjectRoot "${rootRelativePm2Js}"

& $NodePath $Pm2Path @Args
`;
      fs.writeFileSync(pm2Ps1Path, pm2Ps1Content, { encoding: 'utf8' });
      log(`创建子目录入口脚本: ${pm2Ps1Path}`);
      count++;
    } else {
      const pm2CmdPath = path.join(targetDir, 'pm2');
      const pm2Content = `#!/bin/bash
# CloudCAD offline pm2 entry
# PM2_HOME is set locally and won't affect system pm2

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/${backPath}" && pwd)"
export PM2_HOME="$PROJECT_ROOT/data/pm2"
exec "$PROJECT_ROOT/${rootRelativeNodeExe}" "$PROJECT_ROOT/${rootRelativePm2Js}" "$@"
`;
      fs.writeFileSync(pm2CmdPath, pm2Content, { encoding: 'utf8' });
      fs.chmodSync(pm2CmdPath, 0o755);
      log(`创建子目录入口脚本: ${pm2CmdPath}`);
      count++;
    }
  }

  return count;
}

/**
 * 计算 pnpm-lock.yaml 的 SHA256 哈希值
 * @returns {string|null} 哈希值，文件不存在时返回 null
 */
function calcLockHash() {
  const crypto = require('crypto');
  const lockFile = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');
  if (!fs.existsSync(lockFile)) return null;
  return crypto.createHash('sha256')
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
  const storeCandidates = [
    path.join(PROJECT_ROOT, '.pnpm-store-deploy'),
    path.join(PROJECT_ROOT, IS_LINUX ? '.pnpm-store-linux' : '.pnpm-store'),
  ];
  let storePath = null;
  for (const p of storeCandidates) {
    if (fs.existsSync(p)) {
      storePath = p;
      break;
    }
  }

  if (!storePath) {
    error('pnpm store 不存在，无法进行离线安装');
    error('请确保离线包包含 .pnpm-store 或 .pnpm-store-deploy 目录');
    return false;
  }

  // 构建安装命令参数
  const installArgs = deployBackendOnly
    ? ['--filter', 'backend', 'install', '--offline', '--prod']
    : ['install', '--offline'];

  log(deployBackendOnly ? '安装后端依赖...' : '运行 pnpm install --offline 重建依赖...');
  log(`  → 执行: pnpm ${installArgs.join(' ')}`);

  try {
    const nodeDir = IS_LINUX ? path.join(PLATFORM_DIR, 'node', 'bin') : OFFLINE_NODE_DIR;
    const env = {
      ...process.env,
      PATH: `${nodeDir}${path.delimiter}${process.env.PATH}`,
      COREPACK_ENABLE: '0',
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    };

    execSync(`"${OFFLINE_NODE_EXE}" "${pnpmJs}" ${installArgs.join(' ')}`, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env,
    });

    log(deployBackendOnly ? '  ✓ 后端依赖安装完成' : '  ✓ pnpm install --offline 完成');

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
 * 将所有 .env.example 拷贝为对应的目标文件
 * 离线包不包含 .env 文件，首次启动时需要从模板创建
 * 注：前端使用 .env.local（Vite 项目约定）
 */
function copyEnvExampleToEnv() {
  log('检查并创建 .env 配置文件...');

  // 需要处理的配置列表
  // target: 目标文件名，默认 .env（前端使用 .env.local）
  const envConfigs = [
    { dir: path.join(PROJECT_ROOT, 'packages', 'backend'), target: '.env' },
    { dir: path.join(PROJECT_ROOT, 'packages', 'frontend'), target: '.env.local' },
    { dir: path.join(PROJECT_ROOT, 'docker'), target: '.env' },
  ];

  let copied = 0;
  let skipped = 0;

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
      copied++;
    } catch (err) {
      error(`  ✗ 创建失败: ${path.relative(PROJECT_ROOT, envFile)} - ${err.message}`);
    }
  }

  if (copied > 0) {
    log(`已创建 ${copied} 个 .env 配置文件`);
  }
  if (skipped > 0) {
    log(`跳过 ${skipped} 个已存在的 .env 文件`);
  }

  return true;
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

/**
 * 检查 Prisma Client 是否已存在（来自部署包）
 * 部署包会预生成 Prisma Client 和引擎二进制，无需再次生成
 * @returns {boolean} true 表示已存在，无需生成
 */
function checkPrismaClientExists() {
  const prismaClientDir = path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', '.prisma', 'client');
  const indexPath = path.join(prismaClientDir, 'index.js');
  
  // 检查 Prisma Client 是否存在
  if (!fs.existsSync(indexPath)) {
    return false;
  }
  
  // 检查引擎二进制是否存在（至少有一个平台的引擎）
  // 引擎文件名格式：libquery_engine-{platform}.{ext}
  const files = fs.existsSync(prismaClientDir) ? fs.readdirSync(prismaClientDir) : [];
  const hasEngine = files.some(f => f.includes('query_engine'));
  
  return hasEngine;
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

  // 4. 设置包装脚本
  const count = setupWrappers();

  // 5. 检查 Prisma Client 是否已存在（部署包预生成）
  const prismaReady = checkPrismaClientExists();

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
    log('1. 依赖已通过 pnpm install --offline 从 .pnpm-store 重建');
    log('2. .env 配置文件已从 .env.example 自动创建');
    log('3. 配置文件已增量更新（只新增配置项，不修改已有配置）');
    log('4. 在项目目录下可直接运行 pnpm/npm/node/npx 命令');
    log('5. 这些命令会使用离线 Node.js，不影响系统环境');
    log('6. npm scripts 也会自动使用离线 Node.js');
    if (prismaReady) {
      log('7. Prisma Client 已就绪（来自部署包）');
    } else {
      log('7. Prisma Client 需要在启动时生成');
    }
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
  log('1. 依赖已通过 pnpm install --offline 从 .pnpm-store 重建');
  log('2. .env 配置文件已从 .env.example 自动创建');
  log('3. 在项目目录下可直接运行 pnpm/npm/node/npx 命令');
  log('4. 这些命令会使用离线 Node.js，不影响系统环境');
  log('5. npm scripts 也会自动使用离线 Node.js');
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
  OFFLINE_NODE_DIR,
  OFFLINE_NODE_EXE,
  NODE_MODULES_BIN,
};

if (require.main === module) {
  main();
}
