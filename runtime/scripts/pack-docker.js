/**
 * CloudCAD Docker 部署包打包脚本
 *
 * 功能：打包源码，供服务器 Docker 构建使用
 * 
 * 打包内容：
 *   - packages/          源代码
 *   - docker/            Docker 配置
 *   - runtime/linux/mxcad/  MxCAD 闭源组件
 *   - 配置文件
 *
 * 不包含：
 *   - node_modules（服务器构建时安装）
 *   - 构建产物（服务器构建时生成）
 *   - 用户数据
 *
 * 使用方式：
 *   node scripts/pack-docker.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');

const PACKAGE_JSON = require(path.join(PROJECT_ROOT, 'package.json'));
const VERSION = PACKAGE_JSON.version || '1.0.0';
const DATE = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ==================== 工具函数 ====================

function log(msg) {
  console.log(`[Pack] ${msg}`);
}

function error(msg) {
  console.error(`[Pack] ERROR: ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function find7z() {
  if (os.platform() === 'win32') {
    const candidates = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      path.join(
        os.homedir(),
        'AppData',
        'Local',
        'Programs',
        '7-Zip',
        '7z.exe'
      ),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    try {
      const result = execSync('where 7z', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const found = result.trim().split('\n')[0];
      if (found && fs.existsSync(found)) return found;
    } catch (e) {}
  }
  return null;
}

// ==================== 打包配置 ====================

// 需要包含的文件和目录
const INCLUDE_LIST = [
  // 后端源码
  { src: 'apps/backend/src', dest: 'apps/backend/src', isDir: true },
  { src: 'apps/backend/prisma', dest: 'apps/backend/prisma', isDir: true },
  { src: 'apps/backend/prisma.config.ts', dest: 'apps/backend/prisma.config.ts' },
  { src: 'apps/backend/package.json', dest: 'apps/backend/package.json' },
  { src: 'apps/backend/tsconfig.json', dest: 'apps/backend/tsconfig.json' },
  { src: 'apps/backend/tsconfig.build.json', dest: 'apps/backend/tsconfig.build.json' },
  { src: 'apps/backend/nest-cli.json', dest: 'apps/backend/nest-cli.json' },
  { src: 'apps/backend/.env.example', dest: 'apps/backend/.env.example' },
  
  // 前端源码
  { src: 'apps/frontend/src', dest: 'apps/frontend/src', isDir: true },
  { src: 'apps/frontend/public', dest: 'apps/frontend/public', isDir: true },
  { src: 'apps/frontend/package.json', dest: 'apps/frontend/package.json' },
  { src: 'apps/frontend/tsconfig.json', dest: 'apps/frontend/tsconfig.json' },
  { src: 'apps/frontend/vite.config.ts', dest: 'apps/frontend/vite.config.ts' },
  { src: 'apps/frontend/vitest.config.ts', dest: 'apps/frontend/vitest.config.ts' },
  { src: 'apps/frontend/index.html', dest: 'apps/frontend/index.html' },
  { src: 'apps/frontend/vite-env.d.ts', dest: 'apps/frontend/vite-env.d.ts' },
  { src: 'apps/frontend/types.ts', dest: 'apps/frontend/types.ts' },
  { src: 'apps/frontend/metadata.json', dest: 'apps/frontend/metadata.json' },
  
  // 配置中心服务
  { src: 'packages/config-service', dest: 'packages/config-service', isDir: true },
  
  // SVN 版本工具
  { src: 'packages/svnVersionTool', dest: 'packages/svnVersionTool', isDir: true },
  
  // Docker 配置
  { src: 'docker', dest: 'docker', isDir: true },
  
  // MxCAD 闭源组件（关键！）
  { src: 'runtime/linux/mxcad', dest: 'runtime/linux/mxcad', isDir: true },
  
  // 协同服务管理脚本
  { src: 'runtime/scripts/cooperate-manager.js', dest: 'runtime/scripts/cooperate-manager.js' },
  
  // Swagger JSON（前端 API 客户端依赖）
  { src: 'swagger_json.json', dest: 'swagger_json.json' },
  
  // 根目录配置
  { src: 'pnpm-lock.yaml', dest: 'pnpm-lock.yaml' },
  { src: 'pnpm-workspace.yaml', dest: 'pnpm-workspace.yaml' },
  { src: 'package.json', dest: 'package.json' },
  { src: 'tsconfig.json', dest: 'tsconfig.json' },
  { src: '.npmrc', dest: '.npmrc' },
  { src: '.prettierrc', dest: '.prettierrc' },
  { src: '.eslintrc.js', dest: '.eslintrc.js' },
  
];

// VERSION 文件可选（可能不存在）

// 需要排除的目录（从 isDir=true 的目录中排除）
const EXCLUDE_IN_DIRS = [
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.next',
  'build',
];

// ==================== 复制函数 ====================

/**
 * 复制目录（递归，排除指定子目录）
 */
function copyDir(src, dest, excludes = []) {
  if (!fs.existsSync(src)) {
    log(`警告: ${src} 不存在，跳过`);
    return;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    // 跳过排除的目录
    if (excludes.includes(entry.name)) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, excludes);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // 处理符号链接：复制实际内容
      const realPath = fs.realpathSync(srcPath);
      if (fs.statSync(realPath).isDirectory()) {
        copyDir(realPath, destPath, excludes);
      } else {
        fs.copyFileSync(realPath, destPath);
      }
    }
  }
}

// ==================== 准备临时目录 ====================

function prepareTempDir() {
  const tempDir = path.join(PROJECT_ROOT, 'temp', `docker-pack-${Date.now()}`);

  // 清理可能存在的旧目录
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  ensureDir(tempDir);

  // 复制文件
  for (const item of INCLUDE_LIST) {
    const srcPath = path.join(PROJECT_ROOT, item.src);
    const destPath = path.join(tempDir, item.dest);

    if (!fs.existsSync(srcPath)) {
      log(`警告: ${item.src} 不存在，跳过`);
      continue;
    }

    if (item.isDir) {
      copyDir(srcPath, destPath, EXCLUDE_IN_DIRS);
      log(`复制 ${item.src}/`);
    } else {
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(srcPath, destPath);
      log(`复制 ${item.src}`);
    }
  }

  // VERSION 文件（可选）
  const versionFile = path.join(PROJECT_ROOT, 'VERSION');
  if (fs.existsSync(versionFile)) {
    fs.copyFileSync(versionFile, path.join(tempDir, 'VERSION'));
    log('复制 VERSION');
  }

  // 创建部署说明
  const readmeContent = `# CloudCAD v${VERSION} Docker 部署包

## 部署步骤

1. 确保已安装 Docker 和 Docker Compose
   - Docker: https://docs.docker.com/get-docker/
   - Docker Compose: 通常随 Docker 一起安装

2. 配置环境变量
   cd docker
   cp .env.example .env
   # 编辑 .env 文件，设置:
   # - JWT_SECRET (至少32字符)
   # - DB_PASSWORD (数据库密码)

3. 构建并启动
   docker compose -f docker/docker-compose.yml up -d --build

4. 查看状态
   docker compose -f docker/docker-compose.yml ps

5. 查看日志
   docker compose -f docker/docker-compose.yml logs -f

## 常用命令

# 停止服务
docker compose -f docker/docker-compose.yml down

# 重启服务
docker compose -f docker/docker-compose.yml restart

# 更新部署（重新构建应用镜像）
docker compose -f docker/docker-compose.yml build --no-cache app
docker compose -f docker/docker-compose.yml up -d --no-deps app

## 数据备份

数据存储在 ./data/ 目录：
- data/postgres/  数据库
- data/redis/     Redis 缓存
- data/files/     用户文件
- data/svn-repo/  SVN 仓库

备份：复制整个 data/ 目录即可

## 访问地址

- 前端: http://localhost
- API:  http://localhost/api
- 健康检查: http://localhost/api/health/live

生成时间: ${new Date().toISOString()}
`;

  fs.writeFileSync(path.join(tempDir, 'README.txt'), readmeContent);
  log('创建 README.txt');

  return tempDir;
}

// ==================== 压缩 ====================

function createTarGz(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    log('创建 tar.gz 压缩包...');

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // tar 命令（Windows 10+ 自带，Linux/macOS 原生支持）
    const proc = spawn('tar', ['-czf', outputPath, '.'], {
      cwd: sourceDir,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const stat = fs.statSync(outputPath);
          if (stat.size > 0) {
            resolve(outputPath);
            return;
          }
        } catch (e) {}
      }
      reject(new Error(`tar 退出码: ${code}`));
    });

    proc.on('error', reject);
  });
}

function create7z(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const sevenZip = find7z();

    if (!sevenZip) {
      reject(new Error('未找到 7-Zip，请安装: https://www.7-zip.org/'));
      return;
    }

    log(`使用 7-Zip: ${sevenZip}`);

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const proc = spawn(
      `"${sevenZip}"`,
      ['a', '-t7z', '-mx=5', '-m0=lzma2', '-mmt=on', outputPath, '.'],
      {
        cwd: sourceDir,
        stdio: 'inherit',
        shell: true,
      }
    );

    proc.on('close', (code) => {
      if (code === 0 || code === 1) {
        try {
          const stat = fs.statSync(outputPath);
          if (stat.size > 0) {
            resolve(outputPath);
            return;
          }
        } catch (e) {}
      }
      reject(new Error(`7z 退出码: ${code}`));
    });

    proc.on('error', reject);
  });
}

// ==================== 主函数 ====================

async function main() {
  log('============================================');
  log(` CloudCAD v${VERSION} Docker 部署包打包`);
  log('============================================');
  log(`输出目录: ${OUTPUT_DIR}`);
  log('');

  // 检查 MxCAD
  const mxcadPath = path.join(PROJECT_ROOT, 'runtime', 'linux', 'mxcad');
  if (!fs.existsSync(mxcadPath)) {
    error('runtime/linux/mxcad/ 不存在');
    error('MxCAD 是闭源组件，请从部署包中获取');
    process.exit(1);
  }
  log(`✓ MxCAD 组件存在`);

  // 准备临时目录
  log('');
  log('[1/2] 准备文件...');
  const tempDir = prepareTempDir();

  try {
    // 压缩
    log('');
    log('[2/2] 创建压缩包...');

    ensureDir(OUTPUT_DIR);

    const baseName = `cloudcad-docker-${VERSION}-${DATE}`;
    let outputPath;
    let success = false;

    // Windows 优先用 7z，Linux 用 tar.gz
    if (os.platform() === 'win32') {
      outputPath = path.join(OUTPUT_DIR, `${baseName}.7z`);
      try {
        await create7z(tempDir, outputPath);
        success = true;
      } catch (e) {
        log(`7z 失败: ${e.message}`);
        // 回退到 tar.gz
        outputPath = path.join(OUTPUT_DIR, `${baseName}.tar.gz`);
        await createTarGz(tempDir, outputPath);
        success = true;
      }
    } else {
      outputPath = path.join(OUTPUT_DIR, `${baseName}.tar.gz`);
      await createTarGz(tempDir, outputPath);
      success = true;
    }

    if (success) {
      const stat = fs.statSync(outputPath);
      log('');
      log('============================================');
      log(' 打包完成');
      log('============================================');
      log(`✓ ${outputPath}`);
      log(`大小: ${formatSize(stat.size)}`);
      log('');
      log('使用说明:');
      log('  1. 上传到服务器');
      log('  2. 解压: tar -xzf *.tar.gz');
      log('  3. 配置: cd docker && cp .env.example .env');
      log('  4. 部署: docker compose up -d --build');
    }
  } finally {
    // 清理临时目录
    log('');
    log('清理临时目录...');
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
