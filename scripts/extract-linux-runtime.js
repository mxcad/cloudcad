/**
 * CloudCAD Linux Runtime 提取工具
 * 
 * 功能：从 Docker 镜像提取 Linux 运行时组件
 * 
 * 使用方式：
 *   node scripts/extract-linux-runtime.js           # 提取所有组件
 *   node scripts/extract-linux-runtime.js --node    # 仅提取 Node.js
 *   node scripts/extract-linux-runtime.js --postgres # 仅提取 PostgreSQL
 *   node scripts/extract-linux-runtime.js --redis   # 仅提取 Redis
 *   node scripts/extract-linux-runtime.js --svn     # 仅提取 Subversion
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_LINUX = path.join(PROJECT_ROOT, 'runtime', 'linux');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'runtime', 'docker');
const COMPOSE_FILE = path.join(DOCKER_DIR, 'docker-compose.linux.yml');

// 版本信息
const VERSIONS = {
  node: '20.19.5',
  postgres: '15',
  redis: '5',
};

// ==================== 工具函数 ====================

function log(message) {
  console.log(`[Extract-Linux] ${message}`);
}

function error(message) {
  console.error(`[Extract-Linux] ERROR: ${message}`);
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

// ==================== 提取函数 ====================

/**
 * 使用 docker build + docker create + docker cp 方式提取组件
 * 这比 docker-compose up 更可靠，因为 scratch 镜像无法运行容器
 */
function extractComponents(components) {
  for (const comp of components) {
    log(`\n提取 ${comp}...`);
    
    const imageName = `cloudcad-${comp}`;
    const dockerfile = `Dockerfile.${comp}`;
    const outputDir = comp === 'svn' ? 'subversion' : comp;
    const outputPath = path.join(RUNTIME_LINUX, outputDir);
    
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

function createCloudcadSh() {
  const content = `#!/bin/bash
# CloudCAD 运维管理中心

cd "$(dirname "$0")"

# 使用内嵌的 Node.js
NODE_EXE="./runtime/linux/node/node"

if [ ! -f "$NODE_EXE" ]; then
    echo "[错误] 找不到 Node.js 运行时: $NODE_EXE"
    echo "请确保 runtime/linux/node 目录包含 Node.js"
    exit 1
fi

exec "$NODE_EXE" runtime/scripts/cli.js "$@"
`;

  const shPath = path.join(PROJECT_ROOT, 'cloudcad.sh');
  fs.writeFileSync(shPath, content, { encoding: 'utf8' });
  
  // 设置可执行权限（在 Windows 上可能无效，但打包后会有）
  try {
    fs.chmodSync(shPath, 0o755);
  } catch (e) { /* Windows 上忽略 */ }
  
  log(`创建入口脚本: ${shPath}`);
}

// ==================== 主函数 ====================

function main() {
  const args = process.argv.slice(2);
  
  // 显示帮助
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
CloudCAD Linux Runtime 提取工具

使用方式：
  node scripts/extract-linux-runtime.js           提取所有组件
  node scripts/extract-linux-runtime.js --node    仅提取 Node.js
  node scripts/extract-linux-runtime.js --postgres 仅提取 PostgreSQL
  node scripts/extract-linux-runtime.js --redis   仅提取 Redis
  node scripts/extract-linux-runtime.js --svn     仅提取 Subversion

组件版本：
  Node.js:    ${VERSIONS.node}
  PostgreSQL: ${VERSIONS.postgres}
  Redis:      ${VERSIONS.redis}

输出目录：
  ${RUNTIME_LINUX}
`);
    process.exit(0);
  }
  
  log('============================================');
  log(' CloudCAD Linux Runtime 提取工具');
  log('============================================');
  log(`输出目录: ${RUNTIME_LINUX}`);
  log('');
  
  // 检查 Docker
  if (!checkDocker()) {
    process.exit(1);
  }
  
  // 检查 docker-compose 文件
  if (!fs.existsSync(COMPOSE_FILE)) {
    error(`找不到 docker-compose 文件: ${COMPOSE_FILE}`);
    process.exit(1);
  }
  
  // 解析参数
  const extractAll = args.length === 0;
  const components = [];
  
  if (extractAll || args.includes('--node')) components.push('node');
  if (extractAll || args.includes('--postgres') || args.includes('--pg')) components.push('postgres');
  if (extractAll || args.includes('--redis')) components.push('redis');
  if (extractAll || args.includes('--svn') || args.includes('--subversion')) components.push('svn');
  
  log(`提取组件: ${components.join(', ')}`);
  log('');
  
  // 确保 runtime/linux 目录存在
  ensureDir(RUNTIME_LINUX);
  
  // 提取组件
  extractComponents(components);
  
  // 创建入口脚本
  if (components.includes('node')) {
    createCloudcadSh();
  }
  
  log('\n============================================');
  log(' 提取完成');
  log('============================================');
  
  // 显示结果
  log('\n输出目录:');
  for (const comp of components) {
    const dirName = comp === 'svn' ? 'subversion' : comp;
    const dir = path.join(RUNTIME_LINUX, dirName);
    if (fs.existsSync(dir)) {
      const size = getDirSize(dir);
      log(`  ✓ ${dirName}: ${formatSize(size)}`);
    }
  }
  
  log('\n下一步：');
  log('  1. 运行 node scripts/extract-linux-pnpm.js 提取 Linux npm 依赖');
  log('  2. 运行 node scripts/pack-offline.js --linux 打包 Linux 版本');
}

main();