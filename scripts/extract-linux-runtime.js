/**
 * CloudCAD Linux Runtime 提取工具
 * 
 * 功能：提取 Linux 运行时组件（Node.js, PostgreSQL, Redis, SVN）
 * 
 * 运行环境：
 *   - Windows: 通过 Docker 容器提取（需要 Docker）
 *   - Linux: 直接使用包管理器安装并收集（无需 Docker）
 * 
 * 使用方式：
 *   node scripts/extract-linux-runtime.js           # 提取所有组件
 *   node scripts/extract-linux-runtime.js --node    # 仅提取 Node.js
 *   node scripts/extract-linux-runtime.js --postgres # 仅提取 PostgreSQL
 *   node scripts/extract-linux-runtime.js --redis   # 仅提取 Redis
 *   node scripts/extract-linux-runtime.js --svn     # 仅提取 Subversion
 *   node scripts/extract-linux-runtime.js --output /path/to/output  # 指定输出目录
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, 'runtime', 'linux');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'runtime', 'docker');

// 版本信息
const VERSIONS = {
  node: '20.19.5',
  postgres: '15',
  redis: '5',
};

// 系统核心库（不打包，使用目标系统版本）
// 重要：glibc 核心库必须使用目标系统的版本，否则会导致兼容性问题
const SYSTEM_LIBS = ['libc.so.6', 'libdl.so.2', 'libm.so.6', 'libpthread.so.0', 'librt.so.1', 'ld-linux-x86-64.so.2'];

// ==================== 工具函数 ====================

function log(message) {
  console.log(`[Extract-Linux] ${message}`);
}

function error(message) {
  console.error(`[Extract-Linux] ERROR: ${message}`);
}

function warn(message) {
  console.warn(`[Extract-Linux] WARN: ${message}`);
}

function isWindows() {
  return os.platform() === 'win32';
}

function isLinux() {
  return os.platform() === 'linux';
}

function checkDocker() {
  try {
    const result = execSync('docker --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    log(`Docker 版本: ${result.trim()}`);
    return true;
  } catch (err) {
    error('Docker 未安装或未运行');
    return false;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getDirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  
  let totalSize = 0;
  
  function scan(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else {
        try {
          totalSize += fs.statSync(fullPath).size;
        } catch (e) { /* ignore */ }
      }
    }
  }
  
  scan(dir);
  return totalSize;
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  
  const result = {
    showHelp: false,
    outputDir: null,
    components: [],
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      result.showHelp = true;
    } else if (arg === '--output' || arg === '-o') {
      result.outputDir = args[++i] || null;
    } else if (arg === '--node') {
      result.components.push('node');
    } else if (arg === '--postgres' || arg === '--pg') {
      result.components.push('postgres');
    } else if (arg === '--redis') {
      result.components.push('redis');
    } else if (arg === '--svn' || arg === '--subversion') {
      result.components.push('svn');
    }
  }
  
  // 默认提取所有组件
  if (result.components.length === 0 && !result.showHelp) {
    result.components = ['node', 'postgres', 'redis', 'svn'];
  }
  
  // 默认输出目录
  if (!result.outputDir) {
    result.outputDir = DEFAULT_OUTPUT;
  }
  
  return result;
}

function showHelp() {
  console.log(`
CloudCAD Linux Runtime 提取工具

使用方式：
  node scripts/extract-linux-runtime.js           提取所有组件
  node scripts/extract-linux-runtime.js --node    仅提取 Node.js
  node scripts/extract-linux-runtime.js --postgres 仅提取 PostgreSQL
  node scripts/extract-linux-runtime.js --redis   仅提取 Redis
  node scripts/extract-linux-runtime.js --svn     仅提取 Subversion
  node scripts/extract-linux-runtime.js --output /path  指定输出目录

运行环境：
  - Windows: 使用 Docker 容器提取（需要 Docker）
  - Linux: 直接使用 apt-get 安装并收集（无需 Docker）

组件版本：
  Node.js:    ${VERSIONS.node}
  PostgreSQL: ${VERSIONS.postgres}
  Redis:      ${VERSIONS.redis}

输出目录：
  默认: ${DEFAULT_OUTPUT}
  可通过 --output 参数指定
`);
}

// ==================== Windows: Docker 提取 ====================

/**
 * Windows 环境：使用 Docker 容器提取
 */
function extractWithDocker(components, outputDir) {
  log('运行环境: Windows (使用 Docker)');
  
  if (!checkDocker()) {
    process.exit(1);
  }
  
  if (!fs.existsSync(COMPOSE_FILE)) {
    error(`找不到 docker-compose 文件: ${COMPOSE_FILE}`);
    process.exit(1);
  }
  
  for (const comp of components) {
    log(`\n提取 ${comp}...`);
    
    const imageName = `cloudcad-${comp}`;
    const dockerfile = `Dockerfile.${comp}`;
    const outputSubdir = comp === 'svn' ? 'subversion' : comp;
    const outputPath = path.join(outputDir, outputSubdir);
    
    ensureDir(outputPath);
    
    try {
      // 1. 构建镜像
      log(`  → 构建镜像 ${imageName}...`);
      execSync(`docker build -t ${imageName} -f ${dockerfile} .`, {
        cwd: DOCKER_DIR,
        stdio: 'inherit',
      });
      
      // 2. 创建临时容器
      log(`  → 创建临时容器...`);
      const containerName = `temp-${comp}-extract`;
      
      // 先删除可能存在的旧容器
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: 'pipe' });
      } catch (e) { /* ignore */ }
      
      // 创建新容器
      execSync(`docker create --name ${containerName} ${imageName}`, {
        stdio: 'pipe',
      });
      
      // 3. 使用 docker cp 提取文件
      log(`  → 复制文件到 ${outputPath}...`);
      execSync(`docker cp ${containerName}:/output/. ${outputPath}`, {
        stdio: 'inherit',
      });
      
      // 4. 清理临时容器
      execSync(`docker rm ${containerName}`, { stdio: 'pipe' });
      
      const size = getDirSize(outputPath);
      if (size > 0) {
        log(`  ✓ ${comp} 提取完成: ${formatSize(size)}`);
      } else {
        log(`  ⚠ ${comp} 提取结果为空，请检查 Dockerfile`);
      }
    } catch (err) {
      error(`${comp} 提取失败: ${err.message}`);
    }
  }
}

// ==================== Linux: 原生提取 ====================

/**
 * Linux 环境：使用 apt-get 安装并收集文件
 */
function extractNative(components, outputDir) {
  log('运行环境: Linux (原生 apt-get)');
  
  // 检查是否有 apt-get
  try {
    execSync('which apt-get', { stdio: 'pipe' });
  } catch (e) {
    error('当前 Linux 发行版不支持 apt-get，仅支持 Debian/Ubuntu 系列');
    process.exit(1);
  }
  
  // 更新包列表
  log('更新包列表...');
  try {
    execSync('apt-get update', { stdio: 'inherit' });
  } catch (e) {
    warn('apt-get update 失败，继续尝试...');
  }
  
  for (const comp of components) {
    log(`\n提取 ${comp}...`);
    
    const outputSubdir = comp === 'svn' ? 'subversion' : comp;
    const outputPath = path.join(outputDir, outputSubdir);
    
    ensureDir(outputPath);
    
    try {
      switch (comp) {
        case 'node':
          extractNodeNative(outputPath);
          break;
        case 'postgres':
          extractPostgresNative(outputPath);
          break;
        case 'redis':
          extractRedisNative(outputPath);
          break;
        case 'svn':
          extractSvnNative(outputPath);
          break;
      }
      
      const size = getDirSize(outputPath);
      if (size > 0) {
        log(`  ✓ ${comp} 提取完成: ${formatSize(size)}`);
      } else {
        log(`  ⚠ ${comp} 提取结果为空`);
      }
    } catch (err) {
      error(`${comp} 提取失败: ${err.message}`);
    }
  }
}

/**
 * Linux 原生提取 Node.js
 */
function extractNodeNative(outputPath) {
  // 检测 Node.js 是否已安装
  let nodePath = '/usr/local/bin/node';
  let nodejsAlreadyInstalled = false;
  
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    log(`  → 检测到已安装的 Node.js: ${nodeVersion}`);
    
    // 检查版本是否以 v20 开头
    if (nodeVersion.startsWith('v20')) {
      nodejsAlreadyInstalled = true;
      // 尝试找到 node 的实际路径
      try {
        const whichNode = execSync('which node', { encoding: 'utf8' }).trim();
        if (whichNode) {
          nodePath = path.dirname(whichNode);
        }
      } catch (e) {
        // 使用默认路径
      }
      log('  → Node.js 20 已安装，跳过安装步骤');
    } else {
      log(`  → Node.js 版本不符合要求 (需要 v20.x)，将安装 Node.js 20`);
    }
  } catch (e) {
    log('  → Node.js 未安装，将安装 Node.js 20');
  }
  
  if (!nodejsAlreadyInstalled) {
    log('  → 安装 Node.js 20...');
    // 安装 Node.js 20 (NodeSource)
    execSync('curl -fsSL https://deb.nodesource.com/setup_20.x | bash -', {
      stdio: 'inherit',
    });
    execSync('apt-get install -y nodejs', { stdio: 'inherit' });
  }
  
  // 安装 pnpm 和 pm2
  log('  → 安装 pnpm 和 pm2...');
  execSync('npm install -g pnpm@9.15.4 pm2', { stdio: 'inherit' });
  
  // 创建目录结构
  const binDir = path.join(outputPath, 'bin');
  const libDir = path.join(outputPath, 'lib');
  const nodeModulesDir = path.join(outputPath, 'node_modules');
  
  ensureDir(binDir);
  ensureDir(libDir);
  ensureDir(nodeModulesDir);
  
  // 确定 node 二进制路径
  let nodeBinary = '/usr/local/bin/node';
  let nodeModulesPath = '/usr/local/lib/node_modules';
  
  if (nodejsAlreadyInstalled) {
    try {
      nodeBinary = execSync('which node', { encoding: 'utf8' }).trim();
      // node_modules 可能在不同位置
      const possiblePaths = [
        '/usr/local/lib/node_modules',
        '/usr/lib/node_modules',
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          nodeModulesPath = p;
          break;
        }
      }
    } catch (e) {
      // 使用默认路径
    }
  }
  
  // 复制 Node.js 二进制
  log(`  → 复制 Node.js 二进制 (${nodeBinary})...`);
  execSync(`cp ${nodeBinary} ${binDir}/`, { stdio: 'inherit' });
  
  // 复制 node_modules
  log(`  → 复制 node_modules (${nodeModulesPath})...`);
  execSync(`cp -rL ${nodeModulesPath}/* ${nodeModulesDir}/`, { stdio: 'inherit' });
  
  // 创建启动脚本
  log('  → 创建启动脚本...');
  const scripts = {
    npm: `#!/bin/sh\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$SCRIPT_DIR/node" "$SCRIPT_DIR/../node_modules/npm/bin/npm-cli.js" "$@"\n`,
    npx: `#!/bin/sh\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$SCRIPT_DIR/node" "$SCRIPT_DIR/../node_modules/npm/bin/npx-cli.js" "$@"\n`,
    corepack: `#!/bin/sh\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$SCRIPT_DIR/node" "$SCRIPT_DIR/../node_modules/corepack/dist/corepack.js" "$@"\n`,
    pnpm: `#!/bin/sh\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$SCRIPT_DIR/node" "$SCRIPT_DIR/../node_modules/pnpm/bin/pnpm.cjs" "$@"\n`,
    pnpx: `#!/bin/sh\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$SCRIPT_DIR/node" "$SCRIPT_DIR/../node_modules/pnpm/bin/pnpx.cjs" "$@"\n`,
    pm2: `#!/bin/sh\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$SCRIPT_DIR/node" "$SCRIPT_DIR/../node_modules/pm2/bin/pm2" "$@"\n`,
    'pm2-runtime': `#!/bin/sh\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$SCRIPT_DIR/node" "$SCRIPT_DIR/../node_modules/pm2/bin/pm2-runtime" "$@"\n`,
  };
  
  for (const [name, content] of Object.entries(scripts)) {
    const scriptPath = path.join(binDir, name);
    fs.writeFileSync(scriptPath, content, { mode: 0o755 });
  }
  
  // 收集依赖库
  log('  → 收集依赖库...');
  collectDependencies(nodeBinary, libDir);
  
  // 设置权限
  execSync(`chmod -R 755 ${outputPath}`, { stdio: 'pipe' });
}

/**
 * Linux 原生提取 PostgreSQL
 */
function extractPostgresNative(outputPath) {
  log('  → 安装 PostgreSQL 15...');
  
  // 添加 PostgreSQL 官方源
  execSync('apt-get install -y curl gnupg2 lsb-release', { stdio: 'inherit' });
  execSync('curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --batch --yes --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg', { stdio: 'inherit' });
  
  const release = execSync('lsb_release -cs', { encoding: 'utf8' }).trim();
  execSync(`echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt ${release}-pgdg main" > /etc/apt/sources.list.d/pgdg.list`, { stdio: 'inherit' });
  execSync('apt-get update', { stdio: 'inherit' });
  execSync('apt-get install -y postgresql-15', { stdio: 'inherit' });
  
  // 创建目录结构
  const binDir = path.join(outputPath, 'bin');
  const libDir = path.join(outputPath, 'lib');
  const shareDir = path.join(outputPath, 'share');
  
  ensureDir(binDir);
  ensureDir(libDir);
  ensureDir(shareDir);
  
  // 复制 PostgreSQL 二进制文件
  log('  → 复制 PostgreSQL 二进制文件...');
  const pgBinDir = '/usr/lib/postgresql/15/bin';
  const binaries = ['postgres', 'pg_ctl', 'pg_dump', 'pg_restore', 'pg_isready', 'psql', 'createdb', 'dropdb', 'initdb', 'pg_basebackup'];
  
  for (const bin of binaries) {
    const src = path.join(pgBinDir, bin);
    if (fs.existsSync(src)) {
      execSync(`cp ${src} ${binDir}/`, { stdio: 'pipe' });
    }
  }
  
  // 复制 PostgreSQL 库文件
  // 注意：PostgreSQL 的 $libdir 解析为 bin/ 的兄弟目录 lib/
  // 所以扩展库必须直接放在 lib/ 目录下，而不是 lib/postgresql/ 子目录
  log('  → 复制 PostgreSQL 库文件...');
  const pgLibDir = '/usr/lib/postgresql/15/lib';
  if (fs.existsSync(pgLibDir)) {
    // 复制 .so 文件到 lib/ 根目录
    execSync(`cp ${pgLibDir}/*.so ${libDir}/ 2>/dev/null || true`, { stdio: 'pipe' });
    // 复制 bitcode 和 pgxs 子目录
    if (fs.existsSync(path.join(pgLibDir, 'bitcode'))) {
      execSync(`cp -r ${pgLibDir}/bitcode ${libDir}/`, { stdio: 'pipe' });
    }
    if (fs.existsSync(path.join(pgLibDir, 'pgxs'))) {
      execSync(`cp -r ${pgLibDir}/pgxs ${libDir}/`, { stdio: 'pipe' });
    }
  }
  
  // 复制 PostgreSQL share 目录（initdb 需要模板文件）
  log('  → 复制 PostgreSQL share 目录...');
  const pgShareDir = '/usr/share/postgresql/15';
  if (fs.existsSync(pgShareDir)) {
    execSync(`mkdir -p ${shareDir}/postgresql && cp -r ${pgShareDir}/* ${shareDir}/postgresql/`, { stdio: 'inherit' });
  }
  
  // 复制 libpq
  if (fs.existsSync('/usr/lib/x86_64-linux-gnu/libpq.so.5')) {
    execSync(`cp /usr/lib/x86_64-linux-gnu/libpq.so* ${libDir}/`, { stdio: 'pipe' });
  }
  
  // 收集所有二进制文件的依赖库
  log('  → 收集依赖库...');
  for (const bin of binaries) {
    const binPath = path.join(binDir, bin);
    if (fs.existsSync(binPath)) {
      collectDependencies(binPath, libDir);
    }
  }
  
  // 收集 PostgreSQL 库的依赖（排除 glibc 核心库）
  if (fs.existsSync(path.join(libDir, 'postgresql'))) {
    execSync(`for f in ${libDir}/postgresql/*.so; do ldd "$f" 2>/dev/null | grep "=> /" | awk '{print $3}' | while read lib; do libname=$(basename "$lib"); skip=0; for syslib in ${SYSTEM_LIBS.join(' ')}; do [ "$libname" = "$syslib" ] && skip=1 && break; done; [ $skip -eq 0 ] && [ -f "$lib" ] && cp -L "$lib" ${libDir}/ 2>/dev/null; done; done`, { stdio: 'pipe' });
  }
  
  // 设置权限
  execSync(`chmod -R 755 ${outputPath}`, { stdio: 'pipe' });
}

/**
 * Linux 原生提取 Redis
 */
function extractRedisNative(outputPath) {
  log('  → 安装 Redis...');
  execSync('apt-get install -y redis-server', { stdio: 'inherit' });
  
  const libDir = path.join(outputPath, 'lib');
  ensureDir(libDir);
  
  // 复制 Redis 二进制文件（直接放根目录）
  log('  → 复制 Redis 二进制文件...');
  const binaries = ['redis-server', 'redis-cli', 'redis-benchmark', 'redis-check-rdb', 'redis-check-aof'];
  
  for (const bin of binaries) {
    const src = `/usr/bin/${bin}`;
    if (fs.existsSync(src)) {
      execSync(`cp ${src} ${outputPath}/`, { stdio: 'pipe' });
    }
  }
  
  // 收集依赖库
  log('  → 收集依赖库...');
  for (const bin of binaries) {
    const binPath = path.join(outputPath, bin);
    if (fs.existsSync(binPath)) {
      collectDependencies(binPath, libDir);
    }
  }
  
  // 设置权限
  execSync(`chmod -R 755 ${outputPath}`, { stdio: 'pipe' });
}

/**
 * Linux 原生提取 SVN
 */
function extractSvnNative(outputPath) {
  log('  → 安装 Subversion...');
  execSync('apt-get install -y subversion', { stdio: 'inherit' });
  
  const libDir = path.join(outputPath, 'lib');
  ensureDir(libDir);
  
  // 复制 SVN 二进制文件（直接放根目录）
  log('  → 复制 SVN 二进制文件...');
  const binaries = ['svn', 'svnadmin', 'svnlook', 'svnsync', 'svnversion', 'svnserve'];
  
  for (const bin of binaries) {
    const src = `/usr/bin/${bin}`;
    if (fs.existsSync(src)) {
      execSync(`cp ${src} ${outputPath}/`, { stdio: 'pipe' });
    }
  }
  
  // 收集依赖库
  log('  → 收集依赖库...');
  for (const bin of binaries) {
    const binPath = path.join(outputPath, bin);
    if (fs.existsSync(binPath)) {
      collectDependencies(binPath, libDir);
    }
  }
  
  // 收集库文件的间接依赖（排除 glibc 核心库）
  log('  → 收集间接依赖库...');
  execSync(`for f in ${libDir}/*.so*; do [ -f "$f" ] && ldd "$f" 2>/dev/null | grep "=> /" | awk '{print $3}' | while read lib; do libname=$(basename "$lib"); skip=0; for syslib in ${SYSTEM_LIBS.join(' ')}; do [ "$libname" = "$syslib" ] && skip=1 && break; done; [ $skip -eq 0 ] && [ -f "$lib" ] && cp -L "$lib" ${libDir}/ 2>/dev/null; done; done`, { stdio: 'pipe' });
  
  // 设置权限
  execSync(`chmod -R 755 ${outputPath}`, { stdio: 'pipe' });
}

// 系统核心库（不打包，使用目标系统版本）
const SYSTEM_LIBS = ['libc.so.6', 'libdl.so.2', 'libm.so.6', 'libpthread.so.0', 'librt.so.1', 'ld-linux-x86-64.so.2'];

/**
 * 收集二进制文件的依赖库（排除 glibc 核心库）
 * 
 * 重要：不打包 glibc 核心库（libc.so.6, ld-linux-x86-64.so.2 等）
 * 这些库必须使用目标系统的版本，否则会导致兼容性问题
 */
function collectDependencies(binaryPath, libDir) {
  try {
    // 构建排除列表
    const excludePattern = SYSTEM_LIBS.join('|');
    const cmd = `ldd "${binaryPath}" 2>/dev/null | grep "=> /" | awk '{print $3}' | while read lib; do
      libname=$(basename "$lib")
      skip=0
      for syslib in ${SYSTEM_LIBS.join(' ')}; do
        [ "$libname" = "$syslib" ] && skip=1 && break
      done
      [ $skip -eq 0 ] && [ -f "$lib" ] && cp -L "$lib" "${libDir}/" 2>/dev/null
    done`;
    execSync(cmd, { stdio: 'pipe' });
  } catch (e) {
    // 忽略错误
  }
}

// ==================== 入口脚本 ====================

function createCloudcadSh(outputDir) {
  // 找到 node 目录
  const nodeDir = path.join(outputDir, 'node');
  if (!fs.existsSync(nodeDir)) {
    return;
  }
  
  const content = `#!/bin/bash
# CloudCAD 运维管理中心

cd "$(dirname "$0")"

# 使用内嵌的 Node.js
NODE_EXE="./runtime/linux/node/bin/node"

if [ ! -f "$NODE_EXE" ]; then
    echo "[错误] 找不到 Node.js 运行时: $NODE_EXE"
    echo "请确保 runtime/linux/node 目录包含 Node.js"
    exit 1
fi

exec "$NODE_EXE" runtime/scripts/cli.js "$@"
`;

  const shPath = path.join(PROJECT_ROOT, 'cloudcad.sh');
  fs.writeFileSync(shPath, content, { encoding: 'utf8' });
  
  try {
    fs.chmodSync(shPath, 0o755);
  } catch (e) { /* Windows 上忽略 */ }
  
  log(`创建入口脚本: ${shPath}`);
}

// ==================== 主函数 ====================

function main() {
  const args = parseArgs();
  
  // 显示帮助
  if (args.showHelp) {
    showHelp();
    process.exit(0);
  }
  
  const { outputDir, components } = args;
  
  log('============================================');
  log(' CloudCAD Linux Runtime 提取工具');
  log('============================================');
  log(`运行环境: ${isWindows() ? 'Windows (Docker)' : 'Linux (原生)'}`);
  log(`输出目录: ${outputDir}`);
  log(`提取组件: ${components.join(', ')}`);
  log('');
  
  // 确保输出目录存在
  ensureDir(outputDir);
  
  // 根据运行环境选择提取方式
  if (isWindows()) {
    extractWithDocker(components, outputDir);
  } else if (isLinux()) {
    extractNative(components, outputDir);
  } else {
    error(`不支持的操作系统: ${os.platform()}`);
    process.exit(1);
  }
  
  // 创建入口脚本（如果提取了 node）
  if (components.includes('node')) {
    createCloudcadSh(outputDir);
  }
  
  log('\n============================================');
  log(' 提取完成');
  log('============================================');
  
  // 显示结果
  log('\n输出目录:');
  for (const comp of components) {
    const dirName = comp === 'svn' ? 'subversion' : comp;
    const dir = path.join(outputDir, dirName);
    if (fs.existsSync(dir)) {
      const size = getDirSize(dir);
      log(`  ✓ ${dirName}: ${formatSize(size)}`);
    }
  }
  
  if (isWindows()) {
    log('\n下一步：');
    log('  运行 node scripts/pack-linux-deploy.js 打包 Linux 部署包');
  } else {
    log('\n下一步：');
    log('  运行 node scripts/pack-offline.js --deploy --linux 打包部署包');
  }
}

main();
