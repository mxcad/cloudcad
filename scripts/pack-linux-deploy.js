/**
 * CloudCAD Linux 部署包打包入口脚本
 * 
 * 功能：
 * 1. 构建 Docker 打包镜像
 * 2. 在容器内执行打包脚本
 * 3. 导出压缩包到 release/
 * 
 * 使用方式：
 *   node scripts/pack-linux-deploy.js              # 打包
 *   node scripts/pack-linux-deploy.js --help       显示帮助
 * 
 * 验证（独立脚本）：
 *   node scripts/verify-linux-deploy.js            # 验证最新包
 *   node scripts/verify-linux-deploy.js --package xxx.tar.gz  # 验证指定包
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'runtime', 'docker');
const DOCKERFILE = 'Dockerfile.linux-deploy';
const IMAGE_NAME = 'cloudcad-pack-linux';

const PACKAGE_JSON = require(path.join(PROJECT_ROOT, 'package.json'));
const VERSION = PACKAGE_JSON.version || '1.0.0';

// ==================== 二进制缓存配置 ====================

const CACHE_DIR = path.join(PROJECT_ROOT, 'runtime', 'cache');
const NODE_VERSION = '20.19.5';
const NODE_FILENAME = `node-v${NODE_VERSION}-linux-x64-glibc-217.tar.xz`;
const NODE_BASE_URL = `https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}`;
const NODE_URL = `${NODE_BASE_URL}/${NODE_FILENAME}`;
const NODE_CACHE_FILE = path.join(CACHE_DIR, NODE_FILENAME);
const SHASUMS_URL = `${NODE_BASE_URL}/SHASUMS256.txt`;

// ==================== 工具函数 ====================

function log(msg) { console.log(`[Pack-Linux-Deploy] ${msg}`); }
function error(msg) { console.error(`[Pack-Linux-Deploy] ERROR: ${msg}`); }
function warn(msg) { console.warn(`[Pack-Linux-Deploy] WARN: ${msg}`); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

/**
 * 执行命令并实时输出
 */
function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      cwd: options.cwd || PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...options.env },
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`命令退出码: ${code}`));
      }
    });
    
    proc.on('error', reject);
  });
}

/**
 * 构建打包镜像
 */
async function buildPackImage() {
  log('构建打包镜像...');
  
  const dockerfilePath = path.join(DOCKER_DIR, DOCKERFILE);
  
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`找不到 Dockerfile: ${dockerfilePath}`);
  }
  
  await runCommand(`docker build -t ${IMAGE_NAME} -f "${dockerfilePath}" "${PROJECT_ROOT}"`);
  
  log('✓ 打包镜像构建完成');
}

/**
 * 执行打包
 */
async function runPack() {
  log('执行打包...');
  
  // 确保输出目录存在
  ensureDir(OUTPUT_DIR);
  
  // 只挂载 release 目录用于输出（项目代码已在镜像构建时复制）
  // 注意：Windows 路径在 Docker 中需要转换格式
  const releaseDir = OUTPUT_DIR.replace(/\\/g, '/');
  await runCommand(`docker run --rm -v "${releaseDir}:/app/release" ${IMAGE_NAME}`);
  
  log('✓ 打包完成');
}

/**
 * 查找生成的部署包
 */
function findDeployPackage() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return null;
  }
  
  const files = fs.readdirSync(OUTPUT_DIR);
  const pattern = /^cloudcad-deploy-.*-linux\.(tar\.gz|7z)$/;
  
  for (const file of files) {
    if (pattern.test(file)) {
      return path.join(OUTPUT_DIR, file);
    }
  }
  
  return null;
}

/**
 * 显示使用说明
 */
function showHelp() {
  console.log(`
CloudCAD Linux 部署包打包入口

使用方式：
  node scripts/pack-linux-deploy.js              打包
  node scripts/pack-linux-deploy.js --help       显示帮助

流程说明：
  1. 构建 Docker 打包镜像 (Dockerfile.linux-deploy)
  2. 在容器内执行:
     - node scripts/extract-linux-runtime.js
     - node scripts/pack-offline.js --deploy --linux
  3. 输出: release/cloudcad-deploy-*.tar.gz

验证部署包（独立脚本）：
  node scripts/verify-linux-deploy.js            验证最新包
  node scripts/verify-linux-deploy.js --package xxx.tar.gz  验证指定包

输出目录：
  ${OUTPUT_DIR}
`);
}

/**
 * 计算文件的 SHA256
 * @param {string} filePath 文件路径
 * @returns {string} SHA256 十六进制字符串
 */
function calculateSHA256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

/**
 * 验证文件的 SHA256
 * @param {string} filePath 文件路径
 * @param {string} expectedHash 期望的 SHA256
 * @returns {boolean} 是否匹配
 */
function verifySHA256(filePath, expectedHash) {
  try {
    const actualHash = calculateSHA256(filePath);
    return actualHash.toLowerCase() === expectedHash.toLowerCase();
  } catch (err) {
    error(`计算 SHA256 失败: ${err.message}`);
    return false;
  }
}

/**
 * 从 SHASUMS256.txt 获取指定文件的 SHA256
 * @param {string} shasumsUrl SHASUMS256.txt 的 URL
 * @param {string} filename 要查找的文件名
 * @returns {string|null} SHA256 或 null
 */
function fetchSHA256FromSums(shasumsUrl, filename) {
  try {
    log(`获取 SHA256 校验和: ${shasumsUrl}`);
    const content = execSync(`curl -sL "${shasumsUrl}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    // 解析 SHASUMS256.txt 格式: "<sha256>  <filename>"
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
      if (match && match[2].trim() === filename) {
        return match[1].toLowerCase();
      }
    }
    
    warn(`在 SHASUMS256.txt 中未找到文件: ${filename}`);
    return null;
  } catch (err) {
    error(`获取 SHA256 失败: ${err.message}`);
    return null;
  }
}

/**
 * 确保二进制缓存存在
 * 1. 检查缓存是否存在
 * 2. 验证缓存的完整性（SHA256）
 * 3. 不存在或不完整则下载并验证
 */
function ensureBinaryCache() {
  ensureDir(CACHE_DIR);
  
  // 获取 SHA256 校验和
  const expectedSHA256 = fetchSHA256FromSums(SHASUMS_URL, NODE_FILENAME);
  
  // 检查缓存是否存在且完整
  if (fs.existsSync(NODE_CACHE_FILE)) {
    const stat = fs.statSync(NODE_CACHE_FILE);
    log(`Node.js 缓存已存在: ${NODE_CACHE_FILE} (${formatSize(stat.size)})`);
    
    // 验证 SHA256
    log('验证缓存完整性...');
    if (expectedSHA256 && verifySHA256(NODE_CACHE_FILE, expectedSHA256)) {
      log('✓ 缓存验证通过');
      return; // 缓存有效，直接返回
    } else if (!expectedSHA256) {
      warn('无法获取 SHA256，跳过验证（缓存可能不完整）');
      return;
    } else {
      warn('缓存文件损坏或不完整，将重新下载');
      fs.unlinkSync(NODE_CACHE_FILE);
    }
  }
  
  // 下载 Node.js
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`下载 Node.js v${NODE_VERSION} (glibc-217) - 尝试 ${attempt}/${maxRetries}...`);
    log(`URL: ${NODE_URL}`);
    
    try {
      // 使用 curl 下载
      execSync(`curl -L -o "${NODE_CACHE_FILE}" "${NODE_URL}"`, {
        stdio: 'inherit',
        cwd: PROJECT_ROOT,
      });
      
      // 检查文件是否创建
      if (!fs.existsSync(NODE_CACHE_FILE)) {
        throw new Error('下载失败，文件未创建');
      }
      
      const stat = fs.statSync(NODE_CACHE_FILE);
      log(`下载完成: ${formatSize(stat.size)}`);
      
      // 验证 SHA256
      if (expectedSHA256) {
        log('验证下载文件完整性...');
        if (verifySHA256(NODE_CACHE_FILE, expectedSHA256)) {
          log('✓ Node.js 下载并验证成功');
          return;
        } else {
          warn('下载文件校验失败，可能是网络中断导致文件不完整');
          fs.unlinkSync(NODE_CACHE_FILE);
          
          if (attempt < maxRetries) {
            log('将重试下载...');
          }
        }
      } else {
        warn('无法获取 SHA256，跳过验证');
        return;
      }
    } catch (err) {
      error(`下载失败: ${err.message}`);
      
      // 清理不完整的文件
      if (fs.existsSync(NODE_CACHE_FILE)) {
        fs.unlinkSync(NODE_CACHE_FILE);
      }
      
      if (attempt >= maxRetries) {
        error('下载失败次数过多，请检查网络连接');
        error(`你也可以手动下载后放到: ${NODE_CACHE_FILE}`);
        error(`下载地址: ${NODE_URL}`);
        error(`SHA256 校验文件: ${SHASUMS_URL}`);
        throw new Error('Node.js 下载失败');
      }
    }
  }
}

// ==================== 主函数 ====================

async function main() {
  const args = process.argv.slice(2);
  
  // 显示帮助
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  log('============================================');
  log(' CloudCAD Linux 部署包打包工具');
  log('============================================');
  log(`版本: ${VERSION}`);
  log('');
  
  // 检查 Docker
  if (!checkDocker()) {
    process.exit(1);
  }
  
  // 确保二进制缓存存在
  log('[0/2] 检查二进制缓存...');
  ensureBinaryCache();
  
  // 确保输出目录存在
  ensureDir(OUTPUT_DIR);
  
  try {
    // 1. 构建打包镜像
    log('[1/2] 构建打包镜像...');
    await buildPackImage();
    
    // 2. 执行打包
    log('');
    log('[2/2] 执行打包...');
    await runPack();
    
    // 查找生成的包
    const packageFile = findDeployPackage();
    
    if (!packageFile) {
      error('未找到生成的部署包');
      process.exit(1);
    }
    
    const stat = fs.statSync(packageFile);
    
    log('');
    log('============================================');
    log(' 打包完成');
    log('============================================');
    log(`✓ ${packageFile}`);
    log(`大小: ${formatSize(stat.size)}`);
    
    log('');
    log('使用说明:');
    log('  1. 复制部署包到目标服务器');
    log('  2. 解压: tar -xzf cloudcad-deploy-*.tar.gz');
    log('  3. 配置: 编辑 packages/backend/.env');
    log('  4. 启动: ./start.sh');
    log('');
    log('验证部署包:');
    log('  node scripts/verify-linux-deploy.js');
    
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
