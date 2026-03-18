/**
 * CloudCAD Linux 部署包验证脚本（独立）
 * 
 * 功能：
 * 1. 查找已生成的部署包
 * 2. 构建验证镜像
 * 3. 执行断网验证
 * 
 * 使用方式：
 *   node scripts/verify-linux-deploy.js                    # 验证最新的部署包
 *   node scripts/verify-linux-deploy.js --package xxx.tar.gz  # 验证指定包
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'runtime', 'docker');
const DOCKERFILE_VERIFY = 'Dockerfile.linux-deploy-verify';
const VERIFY_IMAGE_NAME = 'cloudcad-verify';

// OS 到基础镜像的映射
const OS_BASE_IMAGES = {
  debian: 'node:20-bullseye-slim',
  ubuntu22: 'ubuntu:22.04',
  ubuntu24: 'ubuntu:24.04',
  centos7: 'centos:7',
  rocky8: 'rockylinux:8',
  rocky9: 'rockylinux:9',
};

// ==================== 工具函数 ====================

function log(msg) { console.log(`[Verify-Linux-Deploy] ${msg}`); }
function error(msg) { console.error(`[Verify-Linux-Deploy] ERROR: ${msg}`); }
function warn(msg) { console.warn(`[Verify-Linux-Deploy] WARN: ${msg}`); }

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
 * 查找最新的部署包
 */
function findLatestDeployPackage() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return null;
  }
  
  const files = fs.readdirSync(OUTPUT_DIR);
  const pattern = /^cloudcad-deploy-.*-linux\.(tar\.gz|7z)$/;
  
  const packages = files
    .filter(f => pattern.test(f))
    .map(f => ({
      name: f,
      path: path.join(OUTPUT_DIR, f),
      time: fs.statSync(path.join(OUTPUT_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);
  
  return packages.length > 0 ? packages[0].path : null;
}

/**
 * 查找指定的部署包
 */
function findPackageByName(packageName) {
  const packagePath = path.join(OUTPUT_DIR, packageName);
  if (fs.existsSync(packagePath)) {
    return packagePath;
  }
  return null;
}

/**
 * 构建验证镜像
 */
async function buildVerifyImage(packageFile, os = 'debian') {
  log('构建验证镜像...');
  
  const dockerfilePath = path.join(DOCKER_DIR, DOCKERFILE_VERIFY);
  const packageName = path.basename(packageFile);
  const baseImage = OS_BASE_IMAGES[os] || OS_BASE_IMAGES.debian;
  const imageName = os === 'debian' ? VERIFY_IMAGE_NAME : `${VERIFY_IMAGE_NAME}-${os}`;
  
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`找不到 Dockerfile: ${dockerfilePath}`);
  }
  
  if (!fs.existsSync(packageFile)) {
    throw new Error(`找不到部署包: ${packageFile}`);
  }
  
  log(`基础镜像: ${baseImage}`);
  await runCommand(`docker build -t ${imageName} -f "${dockerfilePath}" --build-arg PACKAGE=${packageName} --build-arg BASE_IMAGE=${baseImage} "${PROJECT_ROOT}"`);
  
  log('✓ 验证镜像构建完成');
  return imageName;
}

/**
 * 执行断网验证
 */
async function runVerify(imageName) {
  log('执行断网验证...');
  log('注意: 验证容器将运行在 --network none 模式下');
  
  await runCommand(`docker run --rm --network none ${imageName}`);
  
  log('✓ 验证通过');
}

/**
 * 显示使用说明
 */
function showHelp() {
  console.log(`
CloudCAD Linux 部署包验证脚本（独立）

使用方式：
  node scripts/verify-linux-deploy.js                       验证最新的部署包 (Debian)
  node scripts/verify-linux-deploy.js --os centos7          在 CentOS 7 环境验证
  node scripts/verify-linux-deploy.js --os rocky8           在 Rocky Linux 8 环境验证
  node scripts/verify-linux-deploy.js --os rocky9           在 Rocky Linux 9 环境验证
  node scripts/verify-linux-deploy.js --package xxx.tar.gz  验证指定包
  node scripts/verify-linux-deploy.js --help                显示帮助

支持的 OS：
  debian   - Debian 11 (默认)
  centos7  - CentOS 7
  rocky8   - Rocky Linux 8
  rocky9   - Rocky Linux 9

验证流程：
  1. 查找 release 目录中的部署包
  2. 构建验证镜像 (Dockerfile.linux-deploy-verify)
  3. 在断网容器中执行:
     - 解压部署包
     - 安装生产依赖
     - 启动 PostgreSQL + Redis
     - 启动后端 + 前端
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
  
  // 解析 --os 参数
  let os = 'debian';
  const osIndex = args.indexOf('--os');
  if (osIndex !== -1 && args[osIndex + 1]) {
    const osArg = args[osIndex + 1].toLowerCase();
    if (OS_BASE_IMAGES[osArg]) {
      os = osArg;
    } else {
      error(`不支持的 OS: ${osArg}`);
      error(`支持的 OS: ${Object.keys(OS_BASE_IMAGES).join(', ')}`);
      process.exit(1);
    }
  }
  
  // 查找指定的包或最新的包
  let packageFile = null;
  const packageIndex = args.indexOf('--package');
  if (packageIndex !== -1 && args[packageIndex + 1]) {
    packageFile = findPackageByName(args[packageIndex + 1]);
    if (!packageFile) {
      error(`找不到指定的部署包: ${args[packageIndex + 1]}`);
      process.exit(1);
    }
  } else {
    packageFile = findLatestDeployPackage();
  }
  
  log('============================================');
  log(' CloudCAD Linux 部署包验证工具');
  log('============================================');
  
  // 检查 Docker
  if (!checkDocker()) {
    process.exit(1);
  }
  
  // 检查部署包
  if (!packageFile) {
    error('未找到部署包');
    error('请先运行 node scripts/pack-linux-deploy.js 生成部署包');
    process.exit(1);
  }
  
  const stat = fs.statSync(packageFile);
  log(`部署包: ${packageFile}`);
  log(`大小: ${formatSize(stat.size)}`);
  log(`时间: ${stat.mtime.toLocaleString()}`);
  log(`目标 OS: ${os} (${OS_BASE_IMAGES[os]})`);
  log('');
  
  try {
    // 1. 构建验证镜像
    log('[1/2] 构建验证镜像...');
    const imageName = await buildVerifyImage(packageFile, os);
    
    // 2. 执行验证
    log('');
    log('[2/2] 执行断网验证...');
    await runVerify(imageName);
    
    log('');
    log('============================================');
    log(' 验证完成');
    log('============================================');
    
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
