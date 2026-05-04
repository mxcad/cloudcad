/**
 * CloudCAD 统一打包脚本
 *
 * 功能：
 * 1. 离线包模式: 包含源码、完整依赖、开发工具（排除模式）
 * 2. 部署包模式: 仅包含构建产物、生产依赖（正向包含，更安全）
 *
 * 使用方式：
 *   node scripts/pack-offline.js                 # 离线包，当前平台
 *   node scripts/pack-offline.js --win           # 离线包，Windows
 *   node scripts/pack-offline.js --linux         # 离线包，Linux
 *   node scripts/pack-offline.js --all           # 离线包，全平台
 *   node scripts/pack-offline.js --deploy        # 部署包，当前平台
 *   node scripts/pack-offline.js --deploy --win  # 部署包，Windows
 *
 * 注意：
 *   start.bat 会自动检测是否有构建产物，决定进入交互式菜单还是部署模式
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');

// ==================== 配置 ====================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');

const PACKAGE_JSON = require(path.join(PROJECT_ROOT, 'package.json'));
const VERSION = PACKAGE_JSON.version || '1.0.0';
const DATE = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// ==================== 公共工具函数 ====================

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
    } catch (e) {
      /* ignore */
    }
  } else {
    const candidates = [
      '/usr/bin/7z',
      '/usr/local/bin/7z',
      '/usr/bin/7za',
      '/usr/local/bin/7za',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function calcLockHash() {
  const lockFile = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');
  if (!fs.existsSync(lockFile)) return null;
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(lockFile))
    .digest('hex');
}

function readCachedHash(storeName) {
  const hashFile = path.join(PROJECT_ROOT, storeName, '.hash');
  if (!fs.existsSync(hashFile)) return null;
  return fs.readFileSync(hashFile, 'utf8').trim();
}

/**
 * 清理 node_modules
 */
function cleanNodeModules() {
  const paths = [
    path.join(PROJECT_ROOT, 'node_modules'),
    path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules'),
    path.join(PROJECT_ROOT, 'packages', 'frontend', 'node_modules'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
        log(`清理 ${path.relative(PROJECT_ROOT, p)}`);
      } catch (e) {
        log(`警告: 无法清理 ${path.relative(PROJECT_ROOT, p)}`);
      }
    }
  }
}

/**
 * 复制目录（递归）
 */
function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // 处理符号链接（pnpm node_modules 结构）
    if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(srcPath);
      // 如果链接目标是目录，递归复制实际内容
      const realPath = fs.realpathSync(srcPath);
      if (fs.statSync(realPath).isDirectory()) {
        copyDir(realPath, destPath);
      } else {
        // 文件链接，复制实际文件
        fs.copyFileSync(realPath, destPath);
      }
    } else if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 压缩目录
 * @param {string} sourceDir - 要压缩的目录
 * @param {string} outputPath - 输出文件路径
 * @param {string} format - 压缩格式: '7z', 'tar.gz', 'zip'
 */
async function createArchive(sourceDir, outputPath, format = null) {
  // 根据文件扩展名或参数确定格式
  if (!format) {
    if (outputPath.endsWith('.tar.gz') || outputPath.endsWith('.tgz')) {
      format = 'tar.gz';
    } else if (outputPath.endsWith('.7z')) {
      format = '7z';
    } else {
      format = 'zip';
    }
  }

  if (format === 'tar.gz') {
    return createTarGzArchive(sourceDir, outputPath);
  }

  const sevenZip = find7z();

  if (sevenZip && format === '7z') {
    return create7zArchive(sevenZip, sourceDir, outputPath);
  } else {
    log('未找到 7-Zip 或使用 zip 格式...');
    return createZipArchive(sourceDir, outputPath.replace(/\.7z$/, '.zip'));
  }
}

/**
 * 创建 tar.gz 压缩包（Linux 默认格式，无需额外工具）
 */
function createTarGzArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    log('创建 tar.gz 压缩包...');

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    // 使用 tar 命令（Windows 10+ 自带，Linux/macOS 原生支持）
    const tarArgs = ['-czf', outputPath, '.'];

    const proc = spawn('tar', tarArgs, {
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

function create7zArchive(sevenZip, sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    log(`使用 7-Zip: ${sevenZip}`);

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const args = [
      'a',
      '-t7z',
      '-mx=5',
      '-m0=lzma2',
      '-mmt=on',
      outputPath,
      '.',
    ];

    const proc = spawn(`"${sevenZip}"`, args, {
      cwd: sourceDir,
      stdio: 'inherit',
      shell: true,
    });

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

function createZipArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    let archiver;
    try {
      archiver = require('archiver');
    } catch (e) {
      try {
        archiver = require(
          path.join(
            PROJECT_ROOT,
            'packages',
            'backend',
            'node_modules',
            'archiver'
          )
        );
      } catch (e2) {
        reject(new Error('archiver 模块未安装，请运行: pnpm add archiver -D'));
        return;
      }
    }

    log('使用 archiver 创建 zip...');

    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(outputPath));
    archive.on('error', reject);
    archive.pipe(output);

    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// ==================== 离线包 ====================

const OFFLINE_EXCLUDES = {
  dirs: [
    // 版本控制
    '.git',
    '.github',
    '.gitignore',
    '.gitmodules',
    // IDE
    '.vscode',
    '.idea',
    // iFlow
    '.iflow',
    // 数据目录（用户数据，不打包）
    'data',
    // 发布目录
    'release',
    'dist',
    // 测试
    'coverage',
    // 依赖
    'node_modules',
  ],
  files: [
    '*.tsbuildinfo',
    '*.log',
    '*.bak',
    '*.tmp',
    '*.temp',
    '.DS_Store',
    'Thumbs.db',
    '.deploy',
  ],
  envFiles: [
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.test',
    '.env.staging',
  ],
};

const PLATFORM_RUNTIME_EXCLUDE = {
  win: ['runtime/linux', 'runtime\\linux'],
  linux: ['runtime/windows', 'runtime\\windows'],
  all: [],
};

const PLATFORM_PNPM_STORE_EXCLUDE = {
  win: ['.pnpm-store-linux'],
  linux: ['.pnpm-store'],
  all: [],
};

/**
 * 离线包：确保 pnpm store 完整
 */
async function ensureOfflinePnpmStore(platform) {
  const storeName = platform === 'linux' ? '.pnpm-store-linux' : '.pnpm-store';
  const storePath = path.join(PROJECT_ROOT, storeName);

  // 检查是否需要重建
  if (fs.existsSync(storePath) && fs.readdirSync(storePath).length > 0) {
    const currentHash = calcLockHash();
    const cachedHash = readCachedHash(storeName);
    if (currentHash && currentHash === cachedHash) {
      log(`✓ ${storeName} 已存在且未变化`);
      return;
    }
    log(`pnpm-lock.yaml 已变化，重建 ${storeName}...`);
  }

  cleanNodeModules();

  // 临时修改 .npmrc
  const npmrcPath = path.join(PROJECT_ROOT, '.npmrc');
  const originalNpmrc = fs.existsSync(npmrcPath)
    ? fs.readFileSync(npmrcPath, 'utf8')
    : null;
  fs.writeFileSync(npmrcPath, `store-dir=./${storeName}\n`);

  try {
    log(`安装全部依赖...`);
    execSync('pnpm install --frozen-lockfile --ignore-scripts', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });

    const currentHash = calcLockHash();
    if (currentHash) {
      ensureDir(storePath);
      fs.writeFileSync(path.join(storePath, '.hash'), currentHash);
    }

    log(`✓ ${storeName} 准备完成`);
  } finally {
    if (originalNpmrc) {
      fs.writeFileSync(npmrcPath, originalNpmrc);
    } else if (fs.existsSync(npmrcPath)) {
      fs.unlinkSync(npmrcPath);
    }
  }
}

/**
 * 离线包：排除模式打包
 */
async function packOffline(platform) {
  log('============================================');
  log(` CloudCAD v${VERSION} 离线包打包工具`);
  log('============================================');
  log(`输出目录: ${OUTPUT_DIR}`);
  log(
    `目标平台: ${platform === 'all' ? '全平台' : platform === 'win' ? 'Windows' : 'Linux'}`
  );
  log('');

  // 检查 Linux runtime
  if (platform === 'linux' || platform === 'all') {
    const linuxRuntime = path.join(PROJECT_ROOT, 'runtime', 'linux');
    if (
      !fs.existsSync(linuxRuntime) ||
      fs.readdirSync(linuxRuntime).length === 0
    ) {
      error(
        'runtime/linux/ 不存在，请先运行: node scripts/extract-linux-runtime.js'
      );
      process.exit(1);
    }
  }

  // 准备依赖 store
  log('[1/2] 准备依赖 store...');
  if (platform === 'all') {
    await ensureOfflinePnpmStore('win');
    await ensureOfflinePnpmStore('linux');
  } else {
    await ensureOfflinePnpmStore(platform);
  }

  // 创建压缩包
  log('');
  log('[2/2] 创建压缩包...');

  const platformSuffix =
    platform === 'all'
      ? 'all-platforms'
      : platform === 'win'
        ? 'windows'
        : 'linux';
  const baseName = `cloudcad-${VERSION}-${DATE}-${platformSuffix}`;
  const output7z = path.join(OUTPUT_DIR, `${baseName}.7z`);

  ensureDir(OUTPUT_DIR);

  try {
    await createOfflineArchive(output7z, platform);

    const stat = fs.statSync(output7z);
    log('');
    log('============================================');
    log(' 打包完成');
    log('============================================');
    log(`✓ ${output7z}`);
    log(`大小: ${formatSize(stat.size)}`);
    log('');
    log('使用说明:');
    log('  1. 解压到目标目录');
    log('  2. 运行: start.bat');
    log('  3. 首次使用选择 [开发模式] 或 [部署模式]');
  } catch (err) {
    error(`打包失败: ${err.message}`);
    process.exit(1);
  }
}

/**
 * 离线包：创建排除模式压缩包
 */
function createOfflineArchive(outputPath, platform) {
  return new Promise((resolve, reject) => {
    const sevenZip = find7z();

    if (!sevenZip) {
      reject(new Error('需要 7-Zip'));
      return;
    }

    log(`使用 7-Zip: ${sevenZip}`);

    const excludeArgs = [];

    // 目录排除
    for (const dir of OFFLINE_EXCLUDES.dirs) {
      excludeArgs.push(`-x!${dir}`, `-x!*\\${dir}`);
    }
    // 平台 runtime 排除
    for (const p of PLATFORM_RUNTIME_EXCLUDE[platform] || []) {
      excludeArgs.push(`-x!${p}`);
    }
    // 平台 pnpm store 排除
    for (const p of PLATFORM_PNPM_STORE_EXCLUDE[platform] || []) {
      excludeArgs.push(`-x!${p}`);
    }
    // 文件排除
    for (const f of OFFLINE_EXCLUDES.files) {
      excludeArgs.push(`-x!${f}`);
    }
    // env 文件排除
    for (const f of OFFLINE_EXCLUDES.envFiles) {
      excludeArgs.push(`-x!${f}`, `-x!*\\${f}`);
    }

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const args = [
      'a',
      '-t7z',
      '-mx=5',
      '-m0=lzma2',
      '-mmt=on',
      outputPath,
      '.',
      ...excludeArgs,
    ];

    const proc = spawn(`"${sevenZip}"`, args, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0 || code === 1) {
        resolve(outputPath);
      } else {
        reject(new Error(`7z 退出码: ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// ==================== 部署包 ====================

/**
 * 部署包需要包含的文件（正向列表）
 * start.bat 会自动检测是否有构建产物，决定进入部署模式还是交互式菜单
 */
function getDeployIncludeList(platform) {
  const runtimeDir = platform === 'linux' ? 'runtime/linux' : 'runtime/windows';

  return [
    // 后端
    {
      src: 'packages/backend/dist',
      dest: 'packages/backend/dist',
      isDir: true,
    },
    {
      src: 'packages/backend/prisma',
      dest: 'packages/backend/prisma',
      isDir: true,
    },
    // Prisma 7.x 配置文件（定义 datasource URL）
    {
      src: 'packages/backend/.env.example',
      dest: 'packages/backend/.env.example',
    },
    {
      src: 'packages/backend/package.json',
      dest: 'packages/backend/package.json',
    },
    // 前端
    {
      src: 'packages/frontend/dist',
      dest: 'packages/frontend/dist',
      isDir: true,
    },
    {
      src: 'packages/frontend/package.json',
      dest: 'packages/frontend/package.json',
    },
    // SVN 版本工具
    {
      src: 'packages/svnVersionTool',
      dest: 'packages/svnVersionTool',
      isDir: true,
    },
    // 部署配置中心（0 依赖独立服务）
    {
      src: 'packages/config-service',
      dest: 'packages/config-service',
      isDir: true,
    },
    // 运行时脚本
    { src: 'runtime/scripts', dest: 'runtime/scripts', isDir: true },
    { src: 'runtime/ecosystem.config.js', dest: 'runtime/ecosystem.config.js' },
    // 平台运行时
    { src: runtimeDir, dest: runtimeDir, isDir: true },
    // pnpm store（备用，用于添加新依赖）
    { src: '.pnpm-store-deploy', dest: '.pnpm-store-deploy', isDir: true },
    // 根目录文件
    { src: 'pnpm-lock.yaml', dest: 'pnpm-lock.yaml' },
    { src: 'pnpm-workspace.yaml', dest: 'pnpm-workspace.yaml' },
    { src: 'package.json', dest: 'package.json' },
    // 启动脚本（自动检测模式）
    { src: 'cloudcad.bat', dest: 'cloudcad.bat' },
    { src: 'cloudcad.sh', dest: 'cloudcad.sh' },
    { src: 'start.bat', dest: 'start.bat' },
    { src: 'start.ps1', dest: 'start.ps1' },
    { src: 'start.sh', dest: 'start.sh' },
    // 停止脚本
    { src: 'stop.bat', dest: 'stop.bat' },
    { src: 'stop.ps1', dest: 'stop.ps1' },
    { src: 'stop.sh', dest: 'stop.sh' },
    // 部署说明文档
    { src: '部署说明.txt', dest: '部署说明.txt' },
  ];
}

/**
 * 部署包：安装完整依赖
 */
async function installFullDeps() {
  cleanNodeModules();

  try {
    execSync('pnpm install --frozen-lockfile', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    log('✓ 完整依赖安装完成');
  } catch (err) {
    error('依赖安装失败');
    throw err;
  }
}

/**
 * 部署包：构建项目
 */
async function buildProject() {
  log('构建前后端...');

  // 清理旧构建
  const dirs = [
    path.join(PROJECT_ROOT, 'packages', 'backend', 'dist'),
    path.join(PROJECT_ROOT, 'packages', 'frontend', 'dist'),
  ];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // 先生成 Prisma client
  log('生成 Prisma client...');
  try {
    execSync('pnpm --filter backend db:generate', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  } catch (err) {
    error('Prisma client 生成失败');
    return false;
  }

  // 构建
  try {
    execSync('pnpm build', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    log('✓ 构建完成');
    return true;
  } catch (err) {
    error('构建失败');
    return false;
  }
}

/**
 * 统计 node_modules 中的包数量
 */
function countPackages(nodeModulesPath) {
  if (!fs.existsSync(nodeModulesPath)) {
    return 0;
  }
  try {
    const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });
    return entries.filter((e) => {
      if (e.isDirectory() && !e.name.startsWith('.pnpm')) return true;
      if (e.isSymbolicLink()) return true;
      return false;
    }).length;
  } catch {
    return 0;
  }
}

function verifyDeployStore(storePath) {
  if (!fs.existsSync(storePath)) {
    return { valid: false, reason: 'store 目录不存在' };
  }
  const filesDir = path.join(storePath, 'v3', 'files');
  if (!fs.existsSync(filesDir)) {
    return { valid: false, reason: 'store/v3/files 目录不存在' };
  }
  try {
    const files = fs.readdirSync(filesDir);
    if (files.length < 100) {
      return { valid: false, reason: `仅有 ${files.length} 个包，不符合预期` };
    }
    return { valid: true, count: files.length };
  } catch {
    return { valid: false, reason: '无法读取 store 内容' };
  }
}

/**
 * 获取 lockfile hash，用于检测依赖是否变化
 */
function getLockfileHash() {
  const lockfilePath = path.join(PROJECT_ROOT, 'pnpm-lock.yaml');
  if (!fs.existsSync(lockfilePath)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(lockfilePath, 'utf8'));
  return hash.digest('hex').slice(0, 16);
}

/**
 * 部署包：准备生产依赖 store
 *
 * 关键：必须生成 Prisma Client 并下载引擎二进制，确保完全离线可用
 * 优化：无 lockfile 变化时跳过重建
 */
async function prepareDeployStore() {
  const storeName = '.pnpm-store-deploy';
  const storePath = path.join(PROJECT_ROOT, storeName);
  const hashFile = path.join(storePath, '.lockfile-hash');

  // 增量检查：lockfile 无变化且 store 存在则跳过
  const currentHash = getLockfileHash();
  const storedHash = fs.existsSync(hashFile)
    ? fs.readFileSync(hashFile, 'utf8').trim()
    : null;

  if (storedHash === currentHash && fs.existsSync(storePath)) {
    const storeCheck = verifyDeployStore(storePath);
    if (storeCheck.valid) {
      log(
        `✓ lockfile 无变化，跳过 prepareDeployStore (已有 ${storeCheck.count} 个包)`
      );
      return;
    }
  }

  // 清理旧 store
  if (fs.existsSync(storePath)) {
    fs.rmSync(storePath, { recursive: true, force: true });
  }

  cleanNodeModules();

  // Prisma 7.x schema engine 仍然是 Rust 二进制，需要为每个目标平台下载
  // binaryTargets 配置只在当前平台生效，需要通过环境变量强制下载所有平台
  // 参考：https://www.prisma.io/docs/orm/reference/prisma-schema-reference#binary-targets
  // 注意：PRISMA_CLI_BINARY_TARGETS 不支持 "native"，必须指定具体平台
  const PRISMA_BINARY_TARGETS = [
    'windows', // Windows 系统
    'debian-openssl-1.1.x', // Debian 10/11, Ubuntu 20.04 (OpenSSL 1.1)
    'debian-openssl-3.0.x', // Debian 12, Ubuntu 22.04+ (OpenSSL 3.0)
    'rhel-openssl-1.0.x', // CentOS 7 (OpenSSL 1.0) - 打包环境
    'rhel-openssl-3.0.x', // Rocky 9, RHEL 9, AlmaLinux 9 (OpenSSL 3.0)
    'linux-musl', // Alpine Linux
  ].join(',');

  // 使用环境变量设置 store 目录（比修改 .npmrc 更可靠）
  const env = {
    ...process.env,
    NPM_CONFIG_STORE_DIR: storePath,
    PRISMA_CLI_BINARY_TARGETS: PRISMA_BINARY_TARGETS,
  };

  // 1. 先安装后端完整依赖（不使用 --ignore-scripts，让 Prisma postinstall 正常运行）
  log('安装后端依赖（包含 Prisma）...');
  execSync('pnpm --filter backend install --frozen-lockfile --prod', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env,
  });

  // 2. 显式生成 Prisma Client 和下载引擎二进制
  // PRISMA_CLI_BINARY_TARGETS 确保下载所有平台的 schema engine
  log('生成 Prisma Client 并下载所有平台引擎二进制...');
  execSync('pnpm --filter backend db:generate', {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env,
  });

  // 验证 store 是否创建成功
  const storeCheck = verifyDeployStore(storePath);
  if (!storeCheck.valid) {
    log(`警告: ${storeName} ${storeCheck.reason}，执行重试...`);
    cleanNodeModules();
    execSync('pnpm --filter backend install --frozen-lockfile --prod', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env,
    });
  }

  // 验证安装结果
  const nodeModulesPath = path.join(
    PROJECT_ROOT,
    'packages',
    'backend',
    'node_modules'
  );
  const finalCount = countPackages(nodeModulesPath);
  if (finalCount < 10) {
    error(`${storeName} 安装结果异常：仅安装了 ${finalCount} 个包`);
    error('请检查网络连接后重新打包');
    throw new Error('node_modules 安装不完整');
  }

  log(
    `✓ ${storeName} 准备完成 (${finalCount} 个包, store: ${storeCheck.count || 'unknown'})`
  );

  // 保存 lockfile hash，用于下次增量检查
  fs.mkdirSync(storePath, { recursive: true });
  fs.writeFileSync(hashFile, currentHash);
}

/**
 * 重命名前端静态资源配置为 .example
 * 避免部署包覆盖用户自定义配置
 * 处理 public 目录下所有子目录中的：
 *   - JSON 配置文件 → *.json.example
 *   - 品牌资源文件（如 logo.png）→ *.png.example
 *
 * @param {string} tempDir - 临时目录路径
 */
function renameFrontendConfigFiles(tempDir) {
  const publicDir = path.join(tempDir, 'packages', 'frontend', 'dist');

  if (!fs.existsSync(publicDir)) {
    log('警告：前端 public 目录不存在，跳过配置文件重命名');
    return;
  }

  let totalRenamed = 0;

  // 递归遍历 public 目录下所有子目录
  function processDirectory(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // 递归处理子目录
        processDirectory(fullPath);
      } else if (entry.isFile()) {
        // 检查是否需要重命名
        const fileName = entry.name;
        let shouldRename = false;
        let newFileName = null;

        // JSON 文件：重命名为 .json.example
        if (fileName.endsWith('.json') && !fileName.endsWith('.example')) {
          newFileName = `${fileName}.example`;
          shouldRename = true;
        }
        // brand 目录下的图片文件：重命名为 .example
        // 这些是用户上传的品牌资源，需要保留用户的
        else if (
          dir.includes(path.sep + 'brand' + path.sep) ||
          dir.endsWith(path.sep + 'brand')
        ) {
          if (
            (fileName.endsWith('.png') ||
              fileName.endsWith('.jpg') ||
              fileName.endsWith('.jpeg') ||
              fileName.endsWith('.svg') ||
              fileName.endsWith('.gif')) &&
            !fileName.endsWith('.example')
          ) {
            newFileName = `${fileName}.example`;
            shouldRename = true;
          }
        }

        // 执行重命名
        if (shouldRename && newFileName) {
          const newPath = path.join(dir, newFileName);
          try {
            fs.renameSync(fullPath, newPath);
            log(
              `重命名：${path.relative(publicDir, fullPath)} -> ${path.relative(publicDir, newPath)}`
            );
            totalRenamed++;
          } catch (err) {
            error(`重命名失败：${fullPath} - ${err.message}`);
          }
        }
      }
    }
  }

  processDirectory(publicDir);

  if (totalRenamed > 0) {
    log(`✓ 前端配置文件重命名完成：${totalRenamed} 个文件`);
  }
}

/**
 * 部署包：复制文件到临时目录
 */
function prepareDeployDir(platform) {
  const tempDir = path.join(PROJECT_ROOT, 'temp', `deploy-${Date.now()}`);

  // 清理可能存在的旧目录
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  ensureDir(tempDir);

  const includeList = getDeployIncludeList(platform);

  for (const item of includeList) {
    const srcPath = path.join(PROJECT_ROOT, item.src);
    const destPath = path.join(tempDir, item.dest);

    if (!fs.existsSync(srcPath)) {
      log(`警告: ${item.src} 不存在，跳过`);
      continue;
    }

    if (item.isDir) {
      copyDir(srcPath, destPath);
      log(`复制 ${item.src}/`);
    } else {
      ensureDir(path.dirname(destPath));
      fs.copyFileSync(srcPath, destPath);
      log(`复制 ${item.src}`);
    }
  }

  // 创建部署包标记文件（让 start.bat 能够识别这是部署包）
  fs.writeFileSync(path.join(tempDir, '.deploy'), '');
  log('创建 .deploy 标记文件');

  // 重命名前端 JSON 配置文件为 .example（避免覆盖用户自定义配置）
  renameFrontendConfigFiles(tempDir);

  // 创建 .npmrc 文件，指向部署包专用的 pnpm store
  fs.writeFileSync(
    path.join(tempDir, '.npmrc'),
    'store-dir=./.pnpm-store-deploy\n'
  );
  log('创建 .npmrc (store-dir=./.pnpm-store-deploy)');

  // 生成 Prisma 7.x 配置文件（ES Module 格式）
  const prismaConfigContent = `import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node dist/prisma/seed.js',
  },
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/cloudcad',
  },
});
`;
  const prismaConfigPath = path.join(
    tempDir,
    'packages',
    'backend',
    'prisma.config.mjs'
  );
  ensureDir(path.dirname(prismaConfigPath));
  fs.writeFileSync(prismaConfigPath, prismaConfigContent);
  log('创建 prisma.config.mjs');

  return tempDir;
}

/**
 * 部署包打包
 */
async function packDeploy(platform) {
  log('============================================');
  log(` CloudCAD v${VERSION} 部署包打包工具`);
  log('============================================');
  log(`输出目录: ${OUTPUT_DIR}`);
  log(
    `目标平台: ${platform === 'all' ? '全平台' : platform === 'win' ? 'Windows' : 'Linux'}`
  );
  log('');

  // 检查 Linux runtime
  if (platform === 'linux' || platform === 'all') {
    const linuxRuntime = path.join(PROJECT_ROOT, 'runtime', 'linux');
    if (
      !fs.existsSync(linuxRuntime) ||
      fs.readdirSync(linuxRuntime).length === 0
    ) {
      error(
        'runtime/linux/ 不存在，请先运行: node scripts/extract-linux-runtime.js'
      );
      process.exit(1);
    }
  }

  // 1. 安装完整依赖
  log('[1/4] 安装完整依赖...');
  await installFullDeps();

  // 2. 构建
  log('');
  log('[2/4] 构建前后端...');
  if (!(await buildProject())) {
    process.exit(1);
  }

  // 3. 准备生产依赖 store
  log('');
  log('[3/4] 准备生产依赖 store...');
  await prepareDeployStore();

  // 4. 准备打包目录
  log('');
  log('[4/4] 打包...');
  const tempDir = prepareDeployDir(platform);

  try {
    const platformSuffix =
      platform === 'all'
        ? 'all-platforms'
        : platform === 'win'
          ? 'windows'
          : 'linux';
    const baseName = `cloudcad-deploy-${VERSION}-${DATE}-${platformSuffix}`;

    // Linux 平台使用 tar.gz（Linux 默认支持，无需额外工具）
    // Windows 平台使用 7z（压缩率更高，Windows 用户通常有 7-Zip）
    const archiveExt = platform === 'linux' ? 'tar.gz' : '7z';
    const outputPath = path.join(OUTPUT_DIR, `${baseName}.${archiveExt}`);

    ensureDir(OUTPUT_DIR);

    await createArchive(tempDir, outputPath);

    const stat = fs.statSync(outputPath);
    log('');
    log('============================================');
    log(' 打包完成');
    log('============================================');
    log(`✓ ${outputPath}`);
    log(`大小: ${formatSize(stat.size)}`);
    log('');
    log('使用说明:');
    log('  1. 解压到目标目录');
    log('  2. 配置 packages/backend/.env');
    if (platform === 'linux') {
      log('  3. 运行: tar -xzf *.tar.gz && ./start.sh');
    } else {
      log('  3. 运行: start.bat');
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

// ==================== 入口 ====================

async function main() {
  const args = process.argv.slice(2);

  let platform = null;
  let mode = 'offline';

  if (args.includes('--win')) platform = 'win';
  else if (args.includes('--linux')) platform = 'linux';
  else if (args.includes('--all')) platform = 'all';
  else platform = os.platform() === 'win32' ? 'win' : 'linux';

  if (args.includes('--deploy')) mode = 'deploy';

  try {
    if (mode === 'deploy') {
      if (platform === 'all') {
        // 全平台：分别打包
        await packDeploy('win');
        log('');
        await packDeploy('linux');
      } else {
        await packDeploy(platform);
      }
    } else {
      await packOffline(platform);
    }
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
