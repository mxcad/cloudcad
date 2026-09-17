/**
 * 梦想网页CAD实时协同平台 Windows 部署包验证脚本（独立）
 *
 * 功能（ADR-0059 决策 8）：
 * 1. 查找已生成的 Windows 部署包（.7z）
 * 2. 构建 Windows 验证镜像（Dockerfile.windows-deploy-verify，base=servercore）
 * 3. 在断网容器（--network none）内解压 .7z + 用内嵌 node 跑 verify-deploy.js
 *    （verify-deploy.js 跨平台：启动 postgres/redis/backend/frontend/cooperate/config-service + 全服务健康检查）
 *
 * 使用方式：
 *   node scripts/verify-windows-deploy.js                       验证最新的 .7z
 *   node scripts/verify-windows-deploy.js --package xxx.7z      验证指定包
 *
 * 注意（ADR-0059 风险）：GitHub windows-latest runner 跑 Windows 容器可能慢/不稳。
 * 若环境无 Docker / 无 Windows 容器支持，本脚本明确报错（非静默跳过）。
 * 降级路径：Linux 硬门禁 + Windows 手动验证（见 ADR-0059）。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'runtime', 'docker');
const DOCKERFILE_VERIFY = 'Dockerfile.windows-deploy-verify';
const VERIFY_IMAGE_NAME = 'cloudcad-verify-windows';
const BASE_IMAGE = process.env.WIN_VERIFY_BASE_IMAGE || 'mcr.microsoft.com/windows/servercore:ltsc2022';

// 品牌单一事实源
const { PRODUCT_NAME } = require('../runtime/scripts/lib/branding');

function log(msg) {
  console.log(`[Verify-Windows-Deploy] ${msg}`);
}
function error(msg) {
  console.error(`[Verify-Windows-Deploy] ERROR: ${msg}`);
}
function runCommand(command, options = {}) {
  return execSync(command, {
    cwd: options.cwd || PROJECT_ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
  });
}

function checkDocker() {
  try {
    const result = execSync('docker version --format "{{.Server.Version}}"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * 查找最新的 Windows 部署包（.7z）
 */
function findLatestDeployPackage() {
  if (!fs.existsSync(OUTPUT_DIR)) return null;
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.7z'));
  const packages = files
    .map((f) => ({ name: f, path: path.join(OUTPUT_DIR, f), time: fs.statSync(path.join(OUTPUT_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
  return packages.length > 0 ? packages[0].path : null;
}

function findPackageByName(packageName) {
  const packagePath = path.join(OUTPUT_DIR, packageName);
  return fs.existsSync(packagePath) ? packagePath : null;
}

function showHelp() {
  console.log(`
${PRODUCT_NAME} Windows 部署包验证脚本（独立，ADR-0059）

使用方式:
  node scripts/verify-windows-deploy.js                       验证最新的 .7z
  node scripts/verify-windows-deploy.js --package xxx.7z      验证指定包
  node scripts/verify-windows-deploy.js --help                显示帮助

验证流程（断网容器 --network none）:
  1. 构建 Windows 验证镜像（base=${BASE_IMAGE}）
  2. 容器内 7z 解压 .7z 部署包
  3. 用内嵌 node 跑 runtime/scripts/verify-deploy.js（启动全服务 + 健康检查）

注意: GitHub windows-latest runner 跑 Windows 容器可能慢/不稳。
      降级路径: Linux 硬门禁 + Windows 手动验证（见 ADR-0059）。
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

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

  if (!packageFile) {
    error('未找到 Windows 部署包（.7z）');
    error('请先运行 node scripts/pack-offline.js --deploy --win 生成部署包');
    process.exit(1);
  }

  log(`部署包: ${path.basename(packageFile)} (${(fs.statSync(packageFile).size / 1024 / 1024).toFixed(1)} MB)`);
  log(`基础镜像: ${BASE_IMAGE}`);

  if (!checkDocker()) {
    error('Docker 未就绪。Windows 验证需要 Docker（windows-latest runner 或本地 Docker Desktop）。');
    error('降级路径: Linux 硬门禁 + Windows 手动验证（见 ADR-0059）。');
    process.exit(1);
  }

  const packageName = path.basename(packageFile);
  const dockerfilePath = path.join(DOCKER_DIR, DOCKERFILE_VERIFY);
  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`找不到 Dockerfile: ${dockerfilePath}`);
  }

  // 1. 构建验证镜像
  log('[1/2] 构建 Windows 验证镜像...');
  runCommand(
    `docker build -t ${VERIFY_IMAGE_NAME} -f "${dockerfilePath}" --build-arg PACKAGE=${packageName} --build-arg BASE_IMAGE=${BASE_IMAGE} "${PROJECT_ROOT}"`
  );
  log('✓ 验证镜像构建完成');

  // 2. 断网验证
  log('[2/2] 执行断网验证（--network none）...');
  runCommand(`docker run --rm --network none ${VERIFY_IMAGE_NAME}`);
  log('✓ Windows 部署包断网验证通过');
}

main().catch((e) => {
  error(e.message);
  process.exit(1);
});
