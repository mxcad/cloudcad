/**
 * CloudCAD Linux 部署包打包入口脚本
 * 
 * 功能：
 * 1. 构建 Docker 打包镜像
 * 2. 在容器内执行打包脚本
 * 3. 导出压缩包到 release/
 * 
 * 使用方式：
 *   node scripts/pack-linux-deploy.js              # 仅打包
 *   node scripts/pack-linux-deploy.js --verify     # 打包并验证
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'runtime', 'docker');
const DOCKERFILE = 'Dockerfile.linux-deploy';
const DOCKERFILE_VERIFY = 'Dockerfile.linux-deploy-verify';
const IMAGE_NAME = 'cloudcad-pack-linux';
const VERIFY_IMAGE_NAME = 'cloudcad-verify';

const PACKAGE_JSON = require(path.join(PROJECT_ROOT, 'package.json'));
const VERSION = PACKAGE_JSON.version || '1.0.0';

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
 * 构建验证镜像
 */
async function buildVerifyImage(packageFile) {
  log('构建验证镜像...');
  
  const dockerfilePath = path.join(DOCKER_DIR, DOCKERFILE_VERIFY);
  const packageName = path.basename(packageFile);
  
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`找不到 Dockerfile: ${dockerfilePath}`);
  }
  
  await runCommand(`docker build -t ${VERIFY_IMAGE_NAME} -f "${dockerfilePath}" --build-arg PACKAGE=${packageName} "${PROJECT_ROOT}"`);
  
  log('✓ 验证镜像构建完成');
}

/**
 * 执行断网验证
 */
async function runVerify() {
  log('执行断网验证...');
  log('注意: 验证容器将运行在 --network none 模式下');
  
  await runCommand(`docker run --rm --network none ${VERIFY_IMAGE_NAME}`);
  
  log('✓ 验证通过');
}

/**
 * 显示使用说明
 */
function showHelp() {
  console.log(`
CloudCAD Linux 部署包打包入口

使用方式：
  node scripts/pack-linux-deploy.js              仅打包
  node scripts/pack-linux-deploy.js --verify     打包并验证
  node scripts/pack-linux-deploy.js --help       显示帮助

流程说明：
  1. 构建 Docker 打包镜像 (Dockerfile.linux-deploy)
  2. 在容器内执行:
     - node scripts/extract-linux-runtime.js
     - node scripts/pack-offline.js --deploy --linux
  3. 输出: release/cloudcad-deploy-*.tar.gz

验证说明：
  使用 --verify 参数时，会在独立的断网容器中验证部署包：
  - 解压部署包
  - 启动 PostgreSQL + Redis
  - 启动应用
  - 健康检查

输出目录：
  ${OUTPUT_DIR}
`);
}

// ==================== 主函数 ====================

async function main() {
  const args = process.argv.slice(2);
  
  // 显示帮助
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  const doVerify = args.includes('--verify');
  
  log('============================================');
  log(' CloudCAD Linux 部署包打包工具');
  log('============================================');
  log(`版本: ${VERSION}`);
  log(`验证: ${doVerify ? '是' : '否'}`);
  log('');
  
  // 检查 Docker
  if (!checkDocker()) {
    process.exit(1);
  }
  
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
    
    // 验证
    if (doVerify) {
      log('');
      log('============================================');
      log(' 开始验证');
      log('============================================');
      
      // 构建验证镜像
      log('[1/2] 构建验证镜像...');
      await buildVerifyImage(packageFile);
      
      // 执行验证
      log('');
      log('[2/2] 执行断网验证...');
      await runVerify();
      
      log('');
      log('============================================');
      log(' 验证完成');
      log('============================================');
    }
    
    log('');
    log('使用说明:');
    log('  1. 复制部署包到目标服务器');
    log('  2. 解压: tar -xzf cloudcad-deploy-*.tar.gz');
    log('  3. 配置: 编辑 packages/backend/.env');
    log('  4. 启动: ./start.sh');
    
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
