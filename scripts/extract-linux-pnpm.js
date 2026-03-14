/**
 * Linux pnpm-store 提取脚本
 * 
 * 功能：在 Docker 容器中执行 pnpm install，生成 Linux 平台的依赖缓存
 * 
 * 使用方式：
 *   node scripts/extract-linux-pnpm.js          # 提取 Linux 依赖
 *   node scripts/extract-linux-pnpm.js --force  # 强制重新提取
 * 
 * 输出位置：
 *   .pnpm-store-linux/
 * 
 * 注意事项：
 *   1. 会临时修改 .npmrc，完成后恢复
 *   2. 使用 --ignore-scripts 避免执行 postinstall（防止 store 被 mutated）
 *   3. 通过 pnpm-lock.yaml hash 检测是否需要重新提取
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const NPMRC_PATH = path.join(PROJECT_ROOT, '.npmrc');
const NPMRC_BAK_PATH = path.join(PROJECT_ROOT, '.npmrc.bak');
const LOCK_FILE = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');
const HASH_FILE = path.join(PROJECT_ROOT, '.pnpm-store-linux', '.hash');

const LINUX_STORE_DIR = '.pnpm-store-linux';

// Docker 镜像
const IMAGE = 'node:20.19.5-alpine';

// pnpm 版本（与 Dockerfile 一致）
const PNPM_VERSION = '9.15.4';

// ==================== 工具函数 ====================

function log(message) {
  console.log(`[Extract-Linux-Pnpm] ${message}`);
}

function error(message) {
  console.error(`[Extract-Linux-Pnpm] ERROR: ${message}`);
}

function warn(message) {
  console.warn(`[Extract-Linux-Pnpm] WARN: ${message}`);
}

function runCommand(command, options = {}) {
  try {
    return execSync(command, {
      cwd: options.cwd || PROJECT_ROOT,
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf8',
      shell: os.platform() === 'win32',
      env: {
        ...process.env,
        ...options.env,
      },
    });
  } catch (err) {
    if (!options.ignoreError) {
      throw err;
    }
    return null;
  }
}

/**
 * 检查 Docker 是否可用
 */
function checkDocker() {
  try {
    const result = execSync('docker --version', { encoding: 'utf8' });
    log(`Docker 版本: ${result.trim()}`);
    return true;
  } catch (err) {
    error('Docker 未安装或未运行');
    return false;
  }
}

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
  if (!fs.existsSync(HASH_FILE)) {
    return null;
  }
  return fs.readFileSync(HASH_FILE, 'utf8').trim();
}

/**
 * 保存 hash 到缓存
 */
function saveHash(hash) {
  const hashDir = path.dirname(HASH_FILE);
  if (!fs.existsSync(hashDir)) {
    fs.mkdirSync(hashDir, { recursive: true });
  }
  fs.writeFileSync(HASH_FILE, hash);
}

/**
 * 备份 .npmrc
 */
function backupNpmrc() {
  if (fs.existsSync(NPMRC_PATH)) {
    fs.copyFileSync(NPMRC_PATH, NPMRC_BAK_PATH);
    log('已备份 .npmrc');
  }
}

/**
 * 修改 .npmrc 指向 Linux store
 */
function modifyNpmrcForLinux() {
  const content = `store-dir=./${LINUX_STORE_DIR}\n`;
  fs.writeFileSync(NPMRC_PATH, content);
  log(`已修改 .npmrc 指向 ${LINUX_STORE_DIR}`);
}

/**
 * 恢复 .npmrc
 */
function restoreNpmrc() {
  if (fs.existsSync(NPMRC_BAK_PATH)) {
    fs.renameSync(NPMRC_BAK_PATH, NPMRC_PATH);
    log('已恢复 .npmrc');
  } else if (fs.existsSync(NPMRC_PATH)) {
    // 如果没有备份，恢复为默认配置
    fs.writeFileSync(NPMRC_PATH, 'store-dir=./.pnpm-store\n');
    log('已恢复 .npmrc 为默认配置');
  }
}

/**
 * 检查是否需要重新提取
 */
function needsExtraction(force) {
  if (force) {
    log('强制重新提取');
    return true;
  }
  
  const currentHash = calculateLockHash();
  if (!currentHash) {
    warn('pnpm-lock.yaml 不存在，需要先运行 pnpm install');
    return false;
  }
  
  const cachedHash = readCachedHash();
  if (!cachedHash) {
    log('未找到缓存 hash，需要提取');
    return true;
  }
  
  if (currentHash !== cachedHash) {
    log('pnpm-lock.yaml 已变化，需要重新提取');
    return true;
  }
  
  log('pnpm-lock.yaml 未变化，跳过提取');
  return false;
}

/**
 * 确保 .pnpm-store-linux 目录存在
 */
function ensureStoreDir() {
  const storePath = path.join(PROJECT_ROOT, LINUX_STORE_DIR);
  if (!fs.existsSync(storePath)) {
    fs.mkdirSync(storePath, { recursive: true });
    log(`创建目录: ${storePath}`);
  }
}

/**
 * 清理 node_modules 目录
 * 避免跨平台状态残留
 */
function cleanNodeModules() {
  log('清理 node_modules...');
  
  const nodeModulesPaths = [
    path.join(PROJECT_ROOT, 'node_modules'),
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules'),
    path.join(PROJECT_ROOT, 'packages', 'frontend', 'node_modules'),
    path.join(PROJECT_ROOT, 'packages', 'svnVersionTool', 'node_modules'),
  ];
  
  for (const nmPath of nodeModulesPaths) {
    if (fs.existsSync(nmPath)) {
      try {
        fs.rmSync(nmPath, { recursive: true, force: true });
        log(`  ✓ 已删除 ${path.relative(PROJECT_ROOT, nmPath)}`);
      } catch (e) {
        warn(`  ⚠ 无法删除 ${path.relative(PROJECT_ROOT, nmPath)}: ${e.message}`);
      }
    }
  }
}

/**
 * 在 Docker 容器中执行 pnpm install
 * 
 * 关键点：
 * 1. 挂载项目目录到容器
 * 2. 使用项目内的 .npmrc（已修改为指向 .pnpm-store-linux）
 * 3. 使用 --frozen-lockfile 确保版本一致
 * 4. 使用 --ignore-scripts 避免执行 postinstall
 */
async function runPnpmInstallInDocker() {
  log('\n在 Docker 容器中执行 pnpm install...');
  
  // Docker run 命令
  // -v: 挂载项目目录
  // -w: 设置工作目录
  // --rm: 容器退出后自动删除
  const dockerCommand = [
    'docker run --rm',
    `-v "${PROJECT_ROOT}:/app"`,
    '-w /app',
    IMAGE,
    'sh -c "',
    // 启用 corepack 并安装 pnpm
    `corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate &&`,
    // 执行 pnpm install
    'pnpm install --frozen-lockfile --ignore-scripts',
    '"',
  ].join(' ');
  
  log(`执行命令: ${dockerCommand}`);
  
  try {
    runCommand(dockerCommand);
    log('pnpm install 完成');
    return true;
  } catch (err) {
    error(`pnpm install 失败: ${err.message}`);
    return false;
  }
}

/**
 * 验证 store 状态
 */
function verifyStore() {
  log('验证 store 状态...');
  
  const storePath = path.join(PROJECT_ROOT, LINUX_STORE_DIR);
  if (!fs.existsSync(storePath)) {
    error('store 目录不存在');
    return false;
  }
  
  // 检查 v3/files 目录
  const filesDir = path.join(storePath, 'v3', 'files');
  if (!fs.existsSync(filesDir)) {
    error('store 目录结构不完整');
    return false;
  }
  
  // 统计文件数量
  let fileCount = 0;
  function countFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        countFiles(path.join(dir, entry.name));
      } else {
        fileCount++;
      }
    }
  }
  
  try {
    countFiles(filesDir);
    log(`store 包含 ${fileCount} 个包文件`);
    return fileCount > 0;
  } catch (e) {
    error(`统计文件失败: ${e.message}`);
    return false;
  }
}

// ==================== 主函数 ====================

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  
  log('============================================');
  log(' CloudCAD Linux pnpm-store 提取工具');
  log('============================================');
  log(`输出目录: ${LINUX_STORE_DIR}`);
  log('');
  
  // 检查前置条件
  if (!checkDocker()) {
    process.exit(1);
  }
  
  if (!fs.existsSync(LOCK_FILE)) {
    error('pnpm-lock.yaml 不存在');
    error('请先在 Windows 环境运行 pnpm install 生成 lock 文件');
    process.exit(1);
  }
  
  // 检查是否需要提取
  if (!needsExtraction(force)) {
    log('\n无需重新提取，退出');
    process.exit(0);
  }
  
  try {
    // 1. 清理 node_modules
    cleanNodeModules();
    
    // 2. 备份并修改 .npmrc
    backupNpmrc();
    modifyNpmrcForLinux();
    
    // 3. 确保 store 目录存在
    ensureStoreDir();
    
    // 4. 在 Docker 中执行 pnpm install
    const success = await runPnpmInstallInDocker();
    
    if (!success) {
      throw new Error('pnpm install 失败');
    }
    
    // 5. 验证 store
    if (!verifyStore()) {
      throw new Error('store 验证失败');
    }
    
    // 6. 保存 hash
    const hash = calculateLockHash();
    saveHash(hash);
    log(`已保存 hash: ${hash.substring(0, 8)}...`);
    
    log('\n============================================');
    log(' 提取完成');
    log('============================================');
    
    // 显示 store 大小
    const storePath = path.join(PROJECT_ROOT, LINUX_STORE_DIR);
    let totalSize = 0;
    function calcSize(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          calcSize(fullPath);
        } else {
          try {
            totalSize += fs.statSync(fullPath).size;
          } catch (e) {}
        }
      }
    }
    
    try {
      calcSize(storePath);
      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
      log(`\nstore 大小: ${sizeMB} MB`);
    } catch (e) {}
    
    log('\n下一步：');
    log('  运行 node scripts/pack-offline.js --linux 打包 Linux 版本');
    
  } catch (err) {
    error(`提取失败: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    // 恢复 .npmrc
    restoreNpmrc();
  }
}

main();
