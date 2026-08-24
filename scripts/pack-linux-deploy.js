/**
 * 梦想网页CAD实时协同平台 Linux 部署包打包入口脚本
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
const os = require('os');
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

// 品牌单一事实源（runtime/scripts/lib/branding.js）
const { PRODUCT_NAME } = require('../runtime/scripts/lib/branding');

// ==================== OS 镜像映射 ====================

const OS_BASE_IMAGES = {
  centos7: 'centos:7',
  debian: 'node:20-bullseye-slim',
  ubuntu22: 'ubuntu:22.04',
  ubuntu24: 'ubuntu:24.04',
  rocky8: 'rockylinux:8',
  rocky9: 'rockylinux:9',
};

// glibc >= 2.35 的系统需要 SystemLib 版本的 mxcad 二进制
const NEEDS_SYSTEM_LIB = ['ubuntu22', 'ubuntu24'];

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

/**
 * 检测 Docker 是否可连接（docker version 能返回 Server 端信息）
 * @returns {boolean}
 */
function dockerReady() {
  try {
    const result = execSync('docker version --format "{{.Server.Version}}"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * 尝试启动 Docker 引擎（跨平台）。
 * - Windows：拉起 Docker Desktop.exe（探测常见安装路径）
 * - Linux：systemctl / service 启动 docker
 * @returns {boolean} 是否发起了启动动作（不代表已就绪）
 */
function tryStartDocker() {
  if (os.platform() === 'win32') {
    const candidates = [
      'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
      process.env['ProgramFiles'] + '\\Docker\\Docker\\Docker Desktop.exe',
      process.env['LOCALAPPDATA'] + '\\Docker\\Docker Desktop.exe',
    ];
    for (const exe of candidates) {
      if (exe && fs.existsSync(exe)) {
        try {
          spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
          log(`已尝试启动 Docker Desktop: ${exe}`);
          return true;
        } catch (err) {
          error(`启动 Docker Desktop 失败: ${err.message}`);
        }
      }
    }
    log('未找到 Docker Desktop.exe，无法自动启动（请手动打开 Docker Desktop）');
    return false;
  }

  // Linux
  try {
    execSync('systemctl start docker 2>/dev/null || service docker start 2>/dev/null || true', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    log('已尝试启动 Docker 服务（systemctl/service）');
    return true;
  } catch (err) {
    log('自动启动 Docker 服务失败，请手动检查');
    return false;
  }
}

/**
 * 检测 Docker，未就绪则自动启动并轮询等待就绪（最多 WAIT_SECONDS 秒）。
 * @returns {Promise<boolean>} true=就绪
 */
async function checkDocker() {
  const WAIT_SECONDS = 60;

  if (dockerReady()) {
    const result = execSync('docker --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    log(`Docker 版本: ${result.trim()}`);
    return true;
  }

  log('Docker 未运行，尝试自动启动...');
  tryStartDocker();

  // 轮询等待 Docker 引擎就绪
  for (let i = 0; i < WAIT_SECONDS; i += 3) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (dockerReady()) {
      const result = execSync('docker --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      log(`✓ Docker 已就绪: ${result.trim()}`);
      return true;
    }
    process.stdout.write(`  ...等待 Docker 启动 ${i + 3}s\r`);
  }
  process.stdout.write('\n');

  error('Docker 启动超时（60s）。请手动启动 Docker Desktop / Docker 服务后重试。');
  return false;
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
 * @param {string} targetOs 目标操作系统
 * @param {string} npmRegistry 自定义 npm registry（可选）
 * @param {string} variant oss / private（private 时通过命名上下文注入 packages/impl-mx）
 */
async function buildPackImage(targetOs = 'centos7', npmRegistry = '', variant = 'oss') {
  log('构建打包镜像...');

  const dockerfilePath = path.join(DOCKER_DIR, DOCKERFILE);
  const baseImage = OS_BASE_IMAGES[targetOs] || OS_BASE_IMAGES.centos7;

  if (!fs.existsSync(dockerfilePath)) {
    throw new Error(`找不到 Dockerfile: ${dockerfilePath}`);
  }

  const useSystemLib = NEEDS_SYSTEM_LIB.includes(targetOs);
  
  log(`基础镜像: ${baseImage}`);
  log(`SystemLib 覆盖: ${useSystemLib ? '是 (glibc >= 2.35)' : '否'}`);
  if (npmRegistry) log(`npm registry: ${npmRegistry}`);
  
  const buildArgs = [
    `--build-arg BASE_IMAGE=${baseImage}`,
    useSystemLib ? '--build-arg USE_SYSTEM_LIB=true' : '',
    npmRegistry ? `--build-arg NPM_CONFIG_REGISTRY=${npmRegistry}` : '',
    `--build-arg VARIANT=${variant}`,
  ].filter(Boolean).join(' ');

  // impl-mx 命名上下文：private 注入真实包；oss 注入空目录占位（Dockerfile 的
  // COPY --from=implmx 需要上下文存在，空目录不含 package.json 不会进入 pnpm workspace）
  let implMxContext;
  if (variant === 'private') {
    const implMxPkg = path.join(PROJECT_ROOT, 'packages', 'impl-mx', 'package.json');
    if (!fs.existsSync(implMxPkg)) {
      throw new Error('私有版本打包需要 packages/impl-mx/package.json 存在');
    }
    implMxContext = path.join(PROJECT_ROOT, 'packages', 'impl-mx').replace(/\\/g, '/');
  } else {
    implMxContext = path.join(os.tmpdir(), 'cloudcad-implmx-empty').replace(/\\/g, '/');
    fs.mkdirSync(implMxContext, { recursive: true });
  }
  const buildCtxArgs = `--build-context implmx=${implMxContext}`;
  
  await runCommand(`docker build -t ${IMAGE_NAME} -f "${dockerfilePath}" ${buildArgs} ${buildCtxArgs} "${PROJECT_ROOT}"`);
  
  log('✓ 打包镜像构建完成');
}

/**
 * 执行打包
 * @param {string} targetOs 目标操作系统（用于传递给容器内 pack-offline.js）
 * @param {string} variant oss / private
 * @param {string} mode deploy / upgrade（升级包模式复用镜像层缓存的 .pnpm-store-deploy，不做运行时提取）
 */
/**
 * Linux 平台物料提取缓存目录（按目标发行版隔离，避免 glibc 版本混用）
 * @param {string} targetOs - 目标操作系统（centos7/ubuntu22/...）
 */
function getRuntimeExtractCacheDir(targetOs) {
  return path.join(CACHE_DIR, 'linux-extract', targetOs);
}

async function runPack(targetOs = 'centos7', variant = 'oss', mode = 'deploy') {
  log('执行打包...');

  // 确保输出目录存在
  ensureDir(OUTPUT_DIR);

  // 平台物料提取缓存目录（按发行版隔离）：挂载到容器 /app/runtime/linux，
  // 首次提取后持久化到本地，后续打包容器内 extract-linux-runtime.js 检测到
  // 已有产物即跳过提取，省去每次 apt/yum install + 收集依赖库的慢步骤。
  const runtimeLinuxCache = getRuntimeExtractCacheDir(targetOs);
  ensureDir(runtimeLinuxCache);

  // 只挂载 release 目录用于输出与 store 基线，以及 runtime/linux 提取缓存
  // 注意：缓存挂载 /app/runtime/linux 会遮蔽镜像内 COPY runtime 带入的 mxcad，
  // 但 mxcad 由 Dockerfile 独立 COPY 到 /opt/mxcad-runtime 并在 CMD 运行时合并回
  // runtime/linux/mxcad，不依赖本缓存目录（见 Dockerfile.linux-deploy）。
  // 注意：Windows 路径在 Docker 中需要转换格式
  const releaseDir = OUTPUT_DIR.replace(/\\/g, '/');
  const cacheDir = runtimeLinuxCache.replace(/\\/g, '/');
  await runCommand(`docker run --rm -e TARGET_OS=${targetOs} -e VARIANT=${variant} -e PACK_MODE=${mode} -v "${releaseDir}:/app/release" -v "${cacheDir}:/app/runtime/linux" ${IMAGE_NAME}`);

  log('✓ 打包完成');
}

/**
 * 查找生成的部署包/升级包
 */
function findDeployPackage(mode = 'deploy') {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return null;
  }
  
  const files = fs.readdirSync(OUTPUT_DIR);
  // 匹配 cloudcad-deploy[-private]-{VERSION}-{DATE}-{OS}.tar.gz 或 cloudcad-upgrade[-private]-...tar.gz
  const prefix = mode === 'upgrade' ? 'upgrade' : 'deploy';
  const pattern = new RegExp(`^cloudcad-${prefix}(-private)?-.+\\.(tar\\.gz|7z)$`);
  
  // 按修改时间倒序取最新包（release/ 目录可能残留大量历史包，
  // 字母序最早的是最旧的，直接取第一个会返回过期文件）
  const matches = files
    .filter((f) => pattern.test(f))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  
  if (matches.length === 0) {
    return null;
  }
  
  return path.join(OUTPUT_DIR, matches[0].name);
}

/**
 * 显示使用说明
 */
function showHelp() {
  console.log(`
${PRODUCT_NAME} Linux 部署包打包入口

使用方式：
  node scripts/pack-linux-deploy.js                        打包 (默认 CentOS 7, OSS)
  node scripts/pack-linux-deploy.js --os ubuntu22          打包 Ubuntu 22.04
  node scripts/pack-linux-deploy.js --os rocky9            打包 Rocky Linux 9
  node scripts/pack-linux-deploy.js --variant private      打包私有版本 (含 impl-mx)
  node scripts/pack-linux-deploy.js --upgrade              打包增量升级包（免 Docker 本机直打，仅业务产物不含 store/engine）
  node scripts/pack-linux-deploy.js --upgrade --os ubuntu22 --variant private
  node scripts/pack-linux-deploy.js --help                 显示帮助
  node scripts/pack-linux-deploy.js --npm-registry https://registry.npmmirror.com  自定义 npm registry

支持的 OS：
  centos7   - CentOS 7 (默认，glibc 2.17，兼容性最广)
  ubuntu22  - Ubuntu 22.04 (glibc 2.35)
  ubuntu24  - Ubuntu 24.04 (glibc 2.39)
  rocky8    - Rocky Linux 8 (glibc 2.28)
  rocky9    - Rocky Linux 9 (glibc 2.34)
  debian    - Debian 11 (glibc 2.31)

流程说明：
  --upgrade（免 Docker 本机直打）:
    0. 本地构建前端（三端通用静态文件）
    1. 本机执行 node scripts/pack-offline.js --upgrade --linux（构建后端 dist + 打包 tar.gz）
    2. 升级包仅含业务产物（dist/migrations/scripts），不含生产依赖 store 与 engine 二进制
    3. 输出: release/cloudcad-upgrade-{VERSION}-{DATE}-{OS}-{ARCH}.tar.gz
  --deploy（Docker 容器打包）:
    0. 本地构建前端（三端通用静态文件）
    1. 构建 Docker 打包镜像 (Dockerfile.linux-deploy)
    2. 在容器内执行: node scripts/extract-linux-runtime.js && node scripts/pack-offline.js --deploy --linux
    3. 输出: release/cloudcad-deploy-{VERSION}-{DATE}-{OS}-{ARCH}.tar.gz
    例: cloudcad-deploy-1.0.0-20260618-ubuntu22-x86_64.tar.gz

验证部署包（独立脚本）：
  node scripts/verify-linux-deploy.js            验证最新包
  node scripts/verify-linux-deploy.js --os ubuntu22  在 Ubuntu 22.04 环境验证
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

/**
 * 在本地构建前端（前端为纯静态文件，三端通用，无需在 Docker 内构建）
 * 注意：移动端 dist 也会打包进部署包/升级包（合并到 frontend/dist/<mobileAccessPath>），必须构建
 */
function buildFrontendLocally() {
  log('构建前端 (本地)...');
  execSync('pnpm build', {
    cwd: path.join(PROJECT_ROOT, 'packages/frontend'),
    stdio: 'inherit',
  });
  execSync('pnpm build', {
    cwd: path.join(PROJECT_ROOT, 'packages/frontend_mobile'),
    stdio: 'inherit',
  });
  log('✓ 前端构建完成');
}

// ==================== 主函数 ====================

async function main() {
  const args = process.argv.slice(2);

  // 打包前同步静态文件品牌名，保证部署包产物与 branding.js 一致（幂等）
  try {
    require('./sync-brand').applySyncBrand();
  } catch (err) {
    console.warn(`[Pack-Linux-Deploy] 品牌名同步跳过: ${err.message}`);
  }

  // 显示帮助
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  // 解析 --os 参数
  let targetOs = 'centos7';
  const osIndex = args.indexOf('--os');
  if (osIndex !== -1 && args[osIndex + 1]) {
    const osArg = args[osIndex + 1].toLowerCase();
    if (OS_BASE_IMAGES[osArg]) {
      targetOs = osArg;
    } else {
      error(`不支持的 OS: ${osArg}`);
      error(`支持的 OS: ${Object.keys(OS_BASE_IMAGES).join(', ')}`);
      process.exit(1);
    }
  }

  // 解析 --npm-registry 参数（默认使用宿主环境变量或项目 .npmrc）
  let npmRegistry = process.env.NPM_CONFIG_REGISTRY || '';
  const regIndex = args.indexOf('--npm-registry');
  if (regIndex !== -1 && args[regIndex + 1]) {
    npmRegistry = args[regIndex + 1];
  }

  // 解析 --variant 参数
  let variant = 'oss';
  const variantIndex = args.indexOf('--variant');
  if (variantIndex !== -1 && args[variantIndex + 1]) {
    const v = args[variantIndex + 1].toLowerCase();
    if (v === 'oss' || v === 'private') variant = v;
    else { error(`不支持的 variant: ${v}，可选 oss/private`); process.exit(1); }
  }

  // 解析 --upgrade 参数（增量升级包模式）
  const mode = args.includes('--upgrade') ? 'upgrade' : 'deploy';
  
  log('============================================');
  log(` ${PRODUCT_NAME} Linux ${mode === 'upgrade' ? '增量升级包' : '部署包'}打包工具`);
  log('============================================');
  log(`版本: ${VERSION}`);
  log(`目标 OS: ${targetOs} (${OS_BASE_IMAGES[targetOs]})`);
  log(`Variant: ${variant}`);
  log(`模式: ${mode === 'upgrade' ? 'upgrade（增量升级包，免 Docker 本机直打，仅业务产物不含 store/engine）' : 'deploy（全量部署包，Docker 容器构建）'}`);
  log('');

  // 升级包模式：免 Docker 本机直打。
  // 升级包是"构建产物增量覆盖包"，只复制 dist 等 JS 产物、不含生产依赖 store 与
  // engine 二进制（线上 engine 不动），因此无需 Docker 容器，也不受平台强校验限制。
  // 直接委托本机 pack-offline.js --upgrade --linux 完成构建 + 打包。
  // 注意：若本机为 Windows，后端 dist 重建出的 Prisma engine 为 Windows 二进制，
  // 但升级包内容为纯 JS/dist 增量（engine 在目标机 node_modules），不影响线上 Linux。
  if (mode === 'upgrade') {
    log('升级包模式：跳过 Docker，本机直打...');
    const upgradeArgs = [
      'scripts/pack-offline.js',
      '--upgrade',
      '--linux',
      '--os',
      targetOs,
      ...(variant === 'private' ? ['--variant', 'private'] : []),
    ];
    const env = { ...process.env, SKIP_PLATFORM_GUARD: '1' };
    try {
      await runCommand(`node ${upgradeArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`, { env });
      log('✓ 升级包打包完成（免 Docker 本机直打）');
    } catch (err) {
      error(`升级包打包失败: ${err.message}`);
      process.exit(1);
    }
    return;
  }
  
  // 部署包模式：检查 Docker（未就绪则自动启动并等待）
  if (!(await checkDocker())) {
    process.exit(1);
  }
  
  // 确保二进制缓存存在（部署包模式需要；升级包模式不需要 runtime，已在上方早退）
  log('[0/2] 检查二进制缓存...');
  ensureBinaryCache();
  
  // 确保输出目录存在
  ensureDir(OUTPUT_DIR);
  
  try {
    // 0. 在本地构建前端（三端通用，无需在 Docker 内构建；移动端合并进前端 dist）
    log('[0/3] 构建前端 (本地)...');
    buildFrontendLocally();

    // 1. 构建打包镜像
    log('');
    log('[1/3] 构建打包镜像...');
    await buildPackImage(targetOs, npmRegistry, variant);

    // 2. 执行打包
    log('');
    log('[2/3] 执行打包...');
    await runPack(targetOs, variant, mode);
    
    // 查找生成的包
    const packageFile = findDeployPackage(mode);
    
    if (!packageFile) {
      error(`未找到生成的${mode === 'upgrade' ? '升级包' : '部署包'}`);
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
    if (mode === 'upgrade') {
      log('使用说明:');
      log('  1. 复制升级包到目标部署根目录（覆盖现有文件）');
      log('  2. 解压: tar -xzf cloudcad-upgrade-*.tar.gz');
      log('  3. 启动: ./start.sh（自动完成依赖重装检测与数据库迁移）');
    } else {
      log('使用说明:');
      log('  1. 复制部署包到目标服务器');
      log('  2. 解压: tar -xzf cloudcad-deploy-*.tar.gz');
      log('  3. 配置: 编辑 packages/backend/.env');
      log('  4. 启动: ./start.sh');
      log('');
      log('验证部署包:');
      log('  node scripts/verify-linux-deploy.js');
    }
    
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
