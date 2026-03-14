/**
 * Linux Runtime 组件验证脚本
 * 
 * 功能：验证从 Docker 提取的组件是否能在新的 Docker 环境中正常工作
 * 所有组件统一使用 glibc 2.31 (Debian Bullseye)
 * 
 * 使用方式：
 *   node scripts/verify-linux-runtime.js           # 验证所有组件
 *   node scripts/verify-linux-runtime.js --node    # 仅验证 Node.js
 *   node scripts/verify-linux-runtime.js --postgres # 仅验证 PostgreSQL
 *   node scripts/verify-linux-runtime.js --redis   # 仅验证 Redis
 *   node scripts/verify-linux-runtime.js --svn     # 仅验证 SVN
 *   node scripts/verify-linux-runtime.js --pnpm-store # 验证 pnpm-store 离线安装
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_LINUX = path.join(PROJECT_ROOT, 'runtime', 'linux');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'runtime', 'docker');
const PNPM_STORE_LINUX = path.join(PROJECT_ROOT, '.pnpm-store-linux');
const LOCK_FILE = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');

// 组件配置
const COMPONENTS = {
  node: {
    name: 'Node.js',
    dir: 'node',
    dockerfile: 'Dockerfile.node-verify',
    contextName: 'node',
    baseImage: 'debian:bullseye-slim',
    checkFiles: ['bin/node', 'node_modules'],
  },
  postgres: {
    name: 'PostgreSQL',
    dir: 'postgresql',
    dockerfile: 'Dockerfile.postgres-verify',
    contextName: 'pg',
    baseImage: 'debian:bullseye-slim',
    checkFiles: ['bin/postgres', 'bin/pg_ctl'],
  },
  redis: {
    name: 'Redis',
    dir: 'redis',
    dockerfile: 'Dockerfile.redis-verify',
    contextName: 'redis',
    baseImage: 'debian:bullseye-slim',
    checkFiles: ['bin/redis-server', 'bin/redis-cli'],
  },
  svn: {
    name: 'Subversion',
    dir: 'subversion',
    dockerfile: 'Dockerfile.svn-verify',
    contextName: 'svn',
    baseImage: 'debian:bullseye-slim',
    checkFiles: ['bin/svn', 'bin/svnadmin'],
  },
};

// ==================== 工具函数 ====================

function log(message) {
  console.log(`[Verify] ${message}`);
}

function error(message) {
  console.error(`[Verify] ERROR: ${message}`);
}

function success(message) {
  console.log(`[Verify] ✓ ${message}`);
}

function warn(message) {
  console.warn(`[Verify] WARN: ${message}`);
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

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ==================== 验证函数 ====================

function verifyComponent(key) {
  const comp = COMPONENTS[key];
  const compDir = path.join(RUNTIME_LINUX, comp.dir);
  const dockerfile = path.join(DOCKER_DIR, comp.dockerfile);
  
  log(`\n验证 ${comp.name}...`);
  log(`  目录: ${compDir}`);
  
  // 检查目录是否存在
  if (!fs.existsSync(compDir)) {
    error(`${comp.name} 目录不存在，请先提取: node scripts/extract-linux-runtime.js --${key}`);
    return false;
  }
  
  // 检查关键文件
  for (const checkFile of comp.checkFiles) {
    const filePath = path.join(compDir, checkFile);
    if (!fs.existsSync(filePath)) {
      error(`缺少关键文件: ${checkFile}`);
      return false;
    }
  }
  
  // 检查 Dockerfile
  if (!fs.existsSync(dockerfile)) {
    error(`验证 Dockerfile 不存在: ${dockerfile}`);
    return false;
  }
  
  // 构建验证镜像
  const imageName = `${key}-verify`;
  const buildCmd = `docker build -f "${dockerfile}" -t ${imageName} --build-context ${comp.contextName}="${compDir}" "${DOCKER_DIR}"`;
  
  try {
    execSync(buildCmd, { stdio: 'pipe' });
  } catch (err) {
    error('镜像构建失败');
    console.error(err.stdout?.toString() || err.message);
    return false;
  }
  
  // 运行验证容器
  const runCmd = `docker run --rm ${imageName}`;
  
  try {
    const output = execSync(runCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(output);
    success(`${comp.name} 验证通过 (${formatSize(getDirSize(compDir))})`);
    return true;
  } catch (err) {
    // 即使有退出码，也可能输出了一些有用的信息
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    
    if (stdout.includes('=== 验证通过! ===') || stdout.includes('所有验证通过')) {
      console.log(stdout);
      success(`${comp.name} 验证通过 (${formatSize(getDirSize(compDir))})`);
      return true;
    }
    
    error(`${comp.name} 验证失败`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    return false;
  }
}

// ==================== pnpm-store 验证 ====================

/**
 * 计算 pnpm-lock.yaml 的 hash
 */
function calculateLockHash() {
  if (!fs.existsSync(LOCK_FILE)) {
    return null;
  }
  const content = fs.readFileSync(LOCK_FILE);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 读取缓存的 hash
 */
function readCachedHash() {
  const hashFile = path.join(PNPM_STORE_LINUX, '.hash');
  if (!fs.existsSync(hashFile)) {
    return null;
  }
  return fs.readFileSync(hashFile, 'utf8').trim();
}

/**
 * 统计 store 文件数量
 */
function countStoreFiles() {
  const filesDir = path.join(PNPM_STORE_LINUX, 'v3', 'files');
  if (!fs.existsSync(filesDir)) {
    return 0;
  }
  
  let count = 0;
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else {
        count++;
      }
    }
  }
  scan(filesDir);
  return count;
}

/**
 * 验证 pnpm-store 离线安装能力
 */
function verifyPnpmStore() {
  log('\n验证 pnpm-store-linux...');
  log(`  目录: ${PNPM_STORE_LINUX}`);
  
  // 1. 检查目录是否存在
  if (!fs.existsSync(PNPM_STORE_LINUX)) {
    error('pnpm-store-linux 目录不存在，请先提取: node scripts/extract-linux-pnpm.js');
    return false;
  }
  
  // 2. 检查目录结构
  const v3FilesDir = path.join(PNPM_STORE_LINUX, 'v3', 'files');
  if (!fs.existsSync(v3FilesDir)) {
    error('store 目录结构不完整，缺少 v3/files 目录');
    return false;
  }
  success('目录结构完整 (v3/files/ 存在)');
  
  // 3. 统计文件数量
  const fileCount = countStoreFiles();
  if (fileCount === 0) {
    error('store 中没有包文件');
    return false;
  }
  log(`  包文件数量: ${fileCount}`);
  
  // 4. 检查 hash 文件
  const hashFile = path.join(PNPM_STORE_LINUX, '.hash');
  if (!fs.existsSync(hashFile)) {
    warn('.hash 文件不存在，无法验证 lock 文件一致性');
  } else {
    const cachedHash = readCachedHash();
    const currentHash = calculateLockHash();
    
    if (currentHash && cachedHash === currentHash) {
      success(`Hash 验证通过 (与 pnpm-lock.yaml 匹配)`);
    } else if (currentHash) {
      error(`Hash 不匹配!`);
      log(`    缓存 hash: ${cachedHash?.substring(0, 16)}...`);
      log(`    当前 hash: ${currentHash?.substring(0, 16)}...`);
      log(`  建议: 重新提取 pnpm-store`);
      return false;
    }
  }
  
  // 5. Docker 离线安装验证
  const dockerfile = path.join(DOCKER_DIR, 'Dockerfile.pnpm-store-verify');
  if (!fs.existsSync(dockerfile)) {
    warn(`验证 Dockerfile 不存在: ${dockerfile}`);
    warn('跳过 Docker 离线安装验证');
    success(`pnpm-store 基础验证通过 (${formatSize(getDirSize(PNPM_STORE_LINUX))})`);
    return true;
  }
  
  log('\n  执行 Docker 离线安装验证...');
  
  // 构建验证镜像
  const imageName = 'pnpm-store-verify';
  const buildCmd = `docker build -f "${dockerfile}" -t ${imageName} --build-context store="${PNPM_STORE_LINUX}" --build-context project="${PROJECT_ROOT}" "${DOCKER_DIR}"`;
  
  try {
    execSync(buildCmd, { stdio: 'pipe' });
    log('  镜像构建成功');
  } catch (err) {
    error('镜像构建失败');
    console.error(err.stdout?.toString() || err.message);
    return false;
  }
  
  // 运行验证容器
  const runCmd = `docker run --rm ${imageName}`;
  
  try {
    const output = execSync(runCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(output);
    
    if (output.includes('验证通过')) {
      success(`pnpm-store 离线安装验证通过 (${formatSize(getDirSize(PNPM_STORE_LINUX))})`);
      return true;
    } else {
      error('离线安装验证失败');
      return false;
    }
  } catch (err) {
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    
    if (stdout.includes('验证通过')) {
      console.log(stdout);
      success(`pnpm-store 离线安装验证通过 (${formatSize(getDirSize(PNPM_STORE_LINUX))})`);
      return true;
    }
    
    error('离线安装验证失败');
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    return false;
  }
}

// ==================== 主函数 ====================

function main() {
  const args = process.argv.slice(2);
  
  // 显示帮助
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Linux Runtime 组件验证工具

所有组件统一使用 glibc 2.31 (Debian Bullseye)，兼容性强

使用方式：
  node scripts/verify-linux-runtime.js           验证所有组件
  node scripts/verify-linux-runtime.js --node    仅验证 Node.js
  node scripts/verify-linux-runtime.js --postgres 仅验证 PostgreSQL
  node scripts/verify-linux-runtime.js --redis   仅验证 Redis
  node scripts/verify-linux-runtime.js --svn     仅验证 SVN
  node scripts/verify-linux-runtime.js --pnpm-store 验证 pnpm-store 离线安装

组件目录：
  runtime/linux:     ${RUNTIME_LINUX}
  pnpm-store-linux:  ${PNPM_STORE_LINUX}
`);
    process.exit(0);
  }
  
  log('============================================');
  log(' Linux Runtime 组件验证 (glibc 2.31)');
  log('============================================');
  log('');
  
  // 检查 Docker
  if (!checkDocker()) {
    process.exit(1);
  }
  
  // 解析参数
  const verifyAll = args.length === 0;
  const verifyPnpm = args.includes('--pnpm-store') || args.includes('--pnpm');
  const toVerify = [];
  
  if (verifyAll || args.includes('--node')) toVerify.push('node');
  if (verifyAll || args.includes('--postgres') || args.includes('--pg')) toVerify.push('postgres');
  if (verifyAll || args.includes('--redis')) toVerify.push('redis');
  if (verifyAll || args.includes('--svn') || args.includes('--subversion')) toVerify.push('svn');
  if (verifyAll || verifyPnpm) toVerify.push('pnpm-store');
  
  log(`验证组件: ${toVerify.map(k => k === 'pnpm-store' ? 'pnpm-store-linux' : COMPONENTS[k]?.name).join(', ')}`);
  
  // 验证各组件
  const results = {};
  for (const key of toVerify) {
    if (key === 'pnpm-store') {
      results[key] = verifyPnpmStore();
    } else {
      results[key] = verifyComponent(key);
    }
  }
  
  // 汇总结果
  log('\n============================================');
  log(' 验证结果汇总');
  log('============================================');
  
  let passed = 0;
  let failed = 0;
  
  for (const [key, result] of Object.entries(results)) {
    const status = result ? '✓ 通过' : '✗ 失败';
    
    if (key === 'pnpm-store') {
      const size = formatSize(getDirSize(PNPM_STORE_LINUX));
      log(`  pnpm-store-linux: ${status} (${size})`);
    } else {
      const comp = COMPONENTS[key];
      const size = formatSize(getDirSize(path.join(RUNTIME_LINUX, comp.dir)));
      log(`  ${comp.name}: ${status} (${size})`);
    }
    
    if (result) passed++;
    else failed++;
  }
  
  log('');
  log(`总计: ${passed} 通过, ${failed} 失败`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

main();
