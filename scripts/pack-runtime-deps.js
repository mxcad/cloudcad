/**
 * runtime 标准组件依赖包打包脚本（ADR-0059 决策 1/2/3）
 *
 * 功能：把 node / postgresql / redis / subversion 标准组件按 os×arch 提取一次，
 * 打成【内容寻址】tarball，上传 Release 供 CI（release.yml）与 dev 机（preinstall）复用，
 * 避免每次 release 重复 apt/dnf/yum 安装 + 提取。
 *
 * 资产名（确定性，由组件版本指纹决定，版本不变则资产名不变、可永久复用）：
 *   cloudcad-runtime-deps-<os>-<arch>-node<node>-pg<pg>-redis<redis>.tar.gz
 *   例：cloudcad-runtime-deps-ubuntu22-x86_64-node20.19.5-pg15-redis5.tar.gz
 *   （subversion 版本随发行版包而定、不固定，由 <os> 覆盖，故不进指纹）
 *
 * 两种模式：
 *   --os <os>   Linux：复用 Dockerfile.linux-deploy 镜像，docker run 命令覆盖只跑
 *               extract-linux-runtime.js（不跑 pack-offline），挂载 runtime/cache/linux-extract/<os>
 *               持久化提取结果，然后 tar 4 个标准组件目录。
 *   --win       Windows：跑 build-windows-runtime.js（node+redis）+ 断言 postgresql 就绪，
 *               tar runtime/windows/{node,redis,postgresql}。
 *
 * 使用方式：
 *   node scripts/pack-runtime-deps.js --os ubuntu22     # Linux（Docker 提取 + tar + manifest）
 *   node scripts/pack-runtime-deps.js --win             # Windows
 *   node scripts/pack-runtime-deps.js --os ubuntu22 --no-docker  # 假设 runtime/linux 已提取，只 tar
 *
 * 产物：release/cloudcad-runtime-deps-<os>-<arch>-<fingerprint>.tar.gz + mxcad-dist/manifest.json 登记
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');
const CACHE_DIR = path.join(PROJECT_ROOT, 'runtime', 'cache');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'mxcad-dist', 'manifest.json');
const DOCKER_DIR = path.join(PROJECT_ROOT, 'runtime', 'docker');
const DOCKERFILE = 'Dockerfile.linux-deploy';
const IMAGE_NAME = 'cloudcad-pack-linux';

// 组件版本指纹单一事实源（与 extract-linux-runtime.js / build-windows-runtime.js 的 VERSIONS 一致）
const COMPONENT_VERSIONS = {
  node: '20.19.5',
  postgres: '15',
  redis: '5',
};

// Linux 发行版 → 基础镜像（与 pack-linux-deploy.js OS_BASE_IMAGES 收敛后 3 档一致）
const OS_BASE_IMAGES = {
  centos7: 'centos:7',
  ubuntu22: 'ubuntu:22.04',
  rocky9: 'rockylinux:9',
};

// 标准组件目录（Linux 提取输出子目录；svn→subversion 映射与 extract-linux-runtime.js 一致）
const LINUX_COMPONENT_DIRS = ['node', 'postgres', 'redis', 'subversion'];
const WIN_COMPONENT_DIRS = ['node', 'redis', 'postgresql'];

// ==================== 工具函数 ====================

function log(msg) {
  console.log(`[Pack-Runtime-Deps] ${msg}`);
}
function error(msg) {
  console.error(`[Pack-Runtime-Deps] ERROR: ${msg}`);
}
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}
function runCommand(command, options = {}) {
  return execSync(command, {
    cwd: options.cwd || PROJECT_ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
  });
}

/**
 * 版本指纹：node20.19.5-pg15-redis5
 */
function fingerprint() {
  return `node${COMPONENT_VERSIONS.node}-pg${COMPONENT_VERSIONS.postgres}-redis${COMPONENT_VERSIONS.redis}`;
}

/**
 * 资产名（确定性）
 */
function assetName(platform, osName, arch) {
  const osTag = platform === 'windows' ? 'windows' : osName;
  return `cloudcad-runtime-deps-${osTag}-${arch}-${fingerprint()}.tar.gz`;
}

/**
 * tar 目录列表 → tar.gz（用系统 tar，跨平台）
 *
 * 关键：用【相对路径】（相对 PROJECT_ROOT）——Windows 下 GNU tar 会把绝对路径的
 * 盘符 `D:` 误判为远程 `host:path`（报 "Cannot connect to D: resolve failed"），
 * 相对路径无盘符即规避。runCommand 的 cwd=PROJECT_ROOT，故相对路径可解析。
 */
function tarDirs(sourceDir, dirNames, outTarGz) {
  ensureDir(path.dirname(outTarGz));
  const toRel = (p) => path.relative(PROJECT_ROOT, p).replace(/\\/g, '/');
  // 进入 sourceDir，tar 各子目录（保留子目录名，解压后即为 <component>/）
  const args = dirNames.map((d) => `"${d}"`).join(' ');
  runCommand(`tar -czf "${toRel(outTarGz)}" -C "${toRel(sourceDir)}" ${args}`);
}

/**
 * 登记 manifest（复用 mxcad-dist/manifest.json 的「组件×平台×架构 → 哈希」机制）
 */
function registerManifest(platform, osName, arch, asset, hash) {
  ensureDir(path.dirname(MANIFEST_PATH));
  let manifest = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }
  const key = `runtime-deps-${osName}-${arch}`;
  manifest[key] = {
    component: 'runtime-deps',
    platform,
    arch,
    hash,
    asset,
    versions: { ...COMPONENT_VERSIONS },
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  log(`manifest 登记: ${key} → ${asset}`);
}

// ==================== Linux 模式 ====================

function dockerReady() {
  try {
    const r = execSync('docker version --format "{{.Server.Version}}"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return r.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Linux：Docker 提取（命令覆盖只跑 extract-linux-runtime.js）→ tar → manifest
 */
async function packLinux(targetOs, { noDocker = false } = {}) {
  if (!OS_BASE_IMAGES[targetOs]) {
    error(`不支持的 OS: ${targetOs}（支持: ${Object.keys(OS_BASE_IMAGES).join(', ')}）`);
    process.exit(1);
  }
  const arch = 'x86_64';
  const extractCacheDir = path.join(CACHE_DIR, 'linux-extract', targetOs);
  ensureDir(extractCacheDir);

  if (!noDocker) {
    if (!dockerReady()) {
      error('Docker 未就绪。请启动 Docker 或加 --no-docker（假设 runtime 已提取）');
      process.exit(1);
    }
    log(`构建镜像（base=${OS_BASE_IMAGES[targetOs]}）...`);
    runCommand(
      `docker build -t ${IMAGE_NAME} -f "${path.join(DOCKER_DIR, DOCKERFILE)}" ` +
        `--build-arg TARGET_OS=${targetOs} "${PROJECT_ROOT}"`
    );
    log(`运行提取容器（命令覆盖只跑 extract-linux-runtime.js，挂载 ${extractCacheDir}）...`);
    // 命令覆盖：只跑提取，不跑 mxcad 合并 + pack-offline（那是完整部署包的事）
    runCommand(
      `docker run --rm -e TARGET_OS=${targetOs} ` +
        `-v "${extractCacheDir}:/app/runtime/linux" ${IMAGE_NAME} ` +
        `node scripts/extract-linux-runtime.js --output runtime/linux`
    );
  } else {
    log(`--no-docker：跳过 Docker，假设 ${extractCacheDir} 已提取`);
  }

  // 校验 4 个标准组件的关键可执行文件（而非仅目录存在）：
  // 空/残缺的 node 目录若被打进资产，后续所有部署包都会复用这份坏资产
  // （内容寻址，指纹不变则一直复用），目标机 start.sh 报"找不到 Node.js 运行时"。
  const criticalFiles = {
    node: 'bin/node',
    postgres: 'bin/postgres',
    redis: 'redis-server',
    subversion: 'svn',
  };
  const missing = LINUX_COMPONENT_DIRS.filter(
    (d) => !fs.existsSync(path.join(extractCacheDir, d, criticalFiles[d]))
  );
  if (missing.length > 0) {
    error(
      `标准组件关键可执行文件缺失: ${missing
        .map((d) => `${d}/${criticalFiles[d]}`)
        .join(', ')}（${extractCacheDir}）`
    );
    process.exit(1);
  }

  const asset = assetName('linux', targetOs, arch);
  const outTarGz = path.join(OUTPUT_DIR, asset);
  log(`tar ${LINUX_COMPONENT_DIRS.join(' ')} → ${asset}`);
  tarDirs(extractCacheDir, LINUX_COMPONENT_DIRS, outTarGz);
  const hash = sha256File(outTarGz);
  log(`✓ ${asset} (${(fs.statSync(outTarGz).size / 1024 / 1024).toFixed(1)} MB, sha256=${hash.slice(0, 12)}...)`);
  registerManifest('linux', targetOs, arch, asset, hash);
}

// ==================== Windows 模式 ====================

/**
 * Windows：build-windows-runtime.js（node+redis）+ 断言 postgresql → tar → manifest
 */
async function packWindows() {
  const platform = 'windows';
  const arch = 'x64';
  const winRuntimeDir = path.join(PROJECT_ROOT, 'runtime', 'windows');

  log('跑 build-windows-runtime.js（node + redis）...');
  try {
    runCommand(`node scripts/build-windows-runtime.js`, { cwd: PROJECT_ROOT });
  } catch (e) {
    error(`build-windows-runtime.js 失败: ${e.message}`);
    process.exit(1);
  }

  // 校验 3 个标准组件的关键可执行文件（而非仅目录存在；postgresql 由产品二进制通道提供）：
  // 残缺的 node/redis 目录若被打进资产，后续所有 Windows 部署包都会复用这份坏资产。
  const criticalFiles = {
    node: 'node.exe',
    redis: 'redis-server.exe',
    postgresql: path.join('pgsql', 'bin', 'initdb.exe'),
  };
  const missing = WIN_COMPONENT_DIRS.filter(
    (d) => !fs.existsSync(path.join(winRuntimeDir, d, criticalFiles[d]))
  );
  if (missing.length > 0) {
    error(
      `Windows 标准组件关键可执行文件缺失: ${missing
        .map((d) => `${d}/${criticalFiles[d]}`)
        .join(', ')}\n` +
        `  - node/redis: node scripts/build-windows-runtime.js --force\n` +
        `  - postgresql: 本地 PG binaries zip（顶层含 pgsql/）放入 mxcad-dist/windows-x64/postgresql.zip 后运行 scripts/upload-mxcad.js`
    );
    process.exit(1);
  }

  const asset = assetName('windows', 'windows', arch);
  const outTarGz = path.join(OUTPUT_DIR, asset);
  log(`tar ${WIN_COMPONENT_DIRS.join(' ')} → ${asset}`);
  tarDirs(winRuntimeDir, WIN_COMPONENT_DIRS, outTarGz);
  const hash = sha256File(outTarGz);
  log(`✓ ${asset} (${(fs.statSync(outTarGz).size / 1024 / 1024).toFixed(1)} MB, sha256=${hash.slice(0, 12)}...)`);
  registerManifest('windows', 'windows', arch, asset, hash);
}

// ==================== 主函数 ====================

function showHelp() {
  console.log(`
runtime 标准组件依赖包打包（ADR-0059）

使用方式:
  node scripts/pack-runtime-deps.js --os ubuntu22            Linux（Docker 提取 + tar + manifest）
  node scripts/pack-runtime-deps.js --os centos7             Linux（centos7）
  node scripts/pack-runtime-deps.js --os rocky9              Linux（rocky9）
  node scripts/pack-runtime-deps.js --win                    Windows
  node scripts/pack-runtime-deps.js --os ubuntu22 --no-docker  假设 runtime 已提取，只 tar

支持的 OS: ${Object.keys(OS_BASE_IMAGES).join(', ')}
组件版本: node ${COMPONENT_VERSIONS.node} / postgres ${COMPONENT_VERSIONS.postgres} / redis ${COMPONENT_VERSIONS.redis}
产物: release/cloudcad-runtime-deps-<os>-<arch>-<fingerprint>.tar.gz + mxcad-dist/manifest.json
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  const noDocker = args.includes('--no-docker');

  const osIdx = args.indexOf('--os');
  if (osIdx !== -1 && args[osIdx + 1]) {
    await packLinux(args[osIdx + 1], { noDocker });
    return;
  }
  if (args.includes('--win')) {
    await packWindows();
    return;
  }
  showHelp();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
