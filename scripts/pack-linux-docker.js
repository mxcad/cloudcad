#!/usr/bin/env node
/**
 * @fileoverview Docker 一键部署包（Linux，架构感知）打包脚本（ADR-0074 半容器化）
 *
 * 用法: node scripts/pack-linux-docker.js [--out <dir>] [--skip-docker-build] [--verify]
 *
 * 架构语义：在对应架构的机器上打对应架构的包——x86_64 机器出 x86_64 包，
 * arm64 机器出 aarch64 包（mxcad 两种架构都有转换器；容器镜像全多架构，
 * docker build 在打包机上直接产出本机架构镜像）。
 *
 * 打包机零假设自举：只需 x86_64/arm64 + Docker + node ≥20.19.5 + 网络（或预置物料），
 * 其余全部兜底——pnpm（PATH → corepack）→ pnpm install（含 preinstall runtime 资产下载）
 * → node 物料（本地三源 → 下载）→ mxcad（本地 → Release 下载）→ schema-engine（本地 → Prisma 官方源）
 * → conversion-service dist（缺失时按依赖链构建：@cloudcad/db → contracts → engine-exec）
 * → swagger_json.json（缺失时跑 backend 构建生成，IMPL 恒空防 .env 劫持）
 * → Docker 静态二进制/compose（多源回退下载）→ 镜像（本地 → pull）。
 * 受限网络：RUNTIME_DOWNLOAD_URLS（下载源）、NPM_REGISTRY（镜像内 pnpm registry）。
 *
 * 流程:
 *   0 打包机自举（node/pnpm/依赖）→ 1 前置检查 + 物料解析（含下载兜底）
 *   → 2 构建 app 镜像 → 3 pg/redis 打 tag → 4 docker save 离线镜像
 *   → 5 下载 Docker 静态二进制 + compose v2 → 6 组装包树（含 .env.example 生成）
 *   → 7 SHA256SUMS + 归档 → 8（--verify）verify-linux-docker-deploy.js 断网验证
 *
 * 产物: <out>/cloudcad-docker-linux-<arch>-<version>.tar.gz（arch = x86_64 | aarch64）
 * 包内布局见 ADR-0074「包布局」节。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ==================== 版本钉死（单一事实源，勿随手升级） ====================

// Docker 静态二进制：20.10.24 是支持 glibc 2.17（CentOS 7 / kernel 3.10）的最后稳定线
const DOCKER_STATIC_VERSION = '20.10.24';
// compose v2 独立二进制（20.10 的 tgz 不含 compose 插件，需单独携带）
const COMPOSE_VERSION = 'v2.29.7';
const PG_IMAGE = 'postgres:15-alpine';
const REDIS_IMAGE = 'redis:7-alpine';
const NODE_VERSION = 'v20.19.5';

// Windows 宿主：PATH 上的 tar 是 Git GNU tar（把 D:\... 当 host:path 远程语法解析，
// 报 "Cannot connect to D: resolve failed"）；System32 的 bsdtar 认盘符路径
const TAR_BIN = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';

// 容器内重活（node tarball xz 解压 / Windows 宿主归档）的工作镜像：
// busybox tar 自带 xz 支持（debian:bookworm-slim 缺 xz，实测 `tar (child): xz: Cannot exec`），
// 且该镜像 app 构建时已拉取，零额外拉取
const WORK_IMAGE = 'node:20.19.5-alpine';

// ==================== 架构感知：按打包机架构出对应架构的包 ====================

// mxcad Release 仓库/标签（与 ensure-runtime.js 同一约定，可被环境变量覆盖）
const MXCAD_RELEASE_REPO = process.env.RUNTIME_RELEASE_REPO || 'mxcad/cloudcad';
const MXCAD_RELEASE_TAG = process.env.RUNTIME_RELEASE_TAG || 'mxcad-stable';

const ARCH = {
  x64: {
    pkgArch: 'x86_64',
    composeAsset: `docker-compose-linux-x86_64`,
    // glibc-217 通用构建（CentOS 7 兼容）——unofficial-builds 特有
    nodeFallbackUrl: `https://unofficial-builds.nodejs.org/download/release/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64-glibc-217.tar.xz`,
    nodeFallbackTarball: `node-${NODE_VERSION}-linux-x64-glibc-217.tar.xz`,
    nodeCachePattern: /^node-v[\d.]+-linux-x64-glibc-217\.tar\.xz$/,
    mxcadRegistryKey: 'mxcad-linux-x86_64',
    prismaTarget: 'linux-musl',
  },
  arm64: {
    pkgArch: 'aarch64',
    composeAsset: `docker-compose-linux-aarch64`,
    // unofficial-builds 无 arm64 构建 → 官方 nodejs.org（ARM 目标机一般 glibc 2.28+，官方构建够用）
    nodeFallbackUrl: `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-arm64.tar.xz`,
    nodeFallbackTarball: `node-${NODE_VERSION}-linux-arm64.tar.xz`,
    nodeCachePattern: /^node-v[\d.]+-linux-arm64\.tar\.xz$/,
    mxcadRegistryKey: 'mxcad-linux-aarch64',
    // binaries.prisma.sh 的 arm64 musl target 带 openssl 后缀（实测 2026-10，无后缀 404）
    prismaTarget: 'linux-musl-arm64-openssl-3.0.x',
  },
}[process.arch];

// ==================== 参数 ====================

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SKIP_DOCKER_BUILD = args.includes('--skip-docker-build');
const RUN_VERIFY = args.includes('--verify');
const OUT_DIR = path.resolve(getArg('--out') || path.join(PROJECT_ROOT, 'release'));

function log(msg) {
  console.log(`[pack-docker] ${msg}`);
}
function fail(msg) {
  console.error(`[pack-docker][错误] ${msg}`);
  process.exit(1);
}

function run(cmd, argv, opts = {}) {
  const res = spawnSync(cmd, argv, {
    cwd: opts.cwd || PROJECT_ROOT,
    encoding: opts.capture ? 'utf8' : undefined,
    timeout: opts.timeoutMs || 10 * 60000,
    stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: opts.env || process.env,
    shell: opts.shell || false,
  });
  if (res.error) throw new Error(`${cmd} ${argv.join(' ')}: ${res.error.message}`);
  return res;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) fail(`缺少源目录: ${src}`);
  fs.cpSync(src, dest, { recursive: true, dereference: false, force: true });
}

/**
 * 解引用符号链接的递归拷贝：pnpm 的 node_modules 全是符号链接，Windows 上
 * cpSync/copyFileSync 无法复制符号链接（EPERM，缺 SeCreateSymbolicLink 特权）。
 * 符号链接 → realpath → 拷贝真实内容（目录递归 / 文件直拷）。
 */
function copyDirDeref(src, dest) {
  if (!fs.existsSync(src)) fail(`缺少源目录: ${src}`);
  ensureDir(dest);
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) {
      const target = fs.realpathSync(s);
      if (fs.statSync(target).isDirectory()) copyDirDeref(target, d);
      else fs.copyFileSync(target, d);
    } else if (st.isDirectory()) {
      copyDirDeref(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ==================== 打包机零假设自举（打包机可能什么都没有，脚本全部兜底） ====================

function resolvePnpm() {
  // Windows 上 pnpm/corepack 是 .CMD shim，spawnSync 无 shell 无法执行（EINVAL/ENOENT）→ win32 一律 shell
  const shell = process.platform === 'win32';
  // run() 对 ENOENT（命令不存在）抛错而非返回非零状态，探测须捕获
  try {
    const direct = run('pnpm', ['--version'], { capture: true, shell });
    if (direct.status === 0) return ['pnpm'];
  } catch (e) {
    /* PATH 无 pnpm，走 corepack 兜底 */
  }
  try {
    const corepack = run('corepack', ['pnpm', '--version'], { capture: true, shell });
    if (corepack.status === 0) return ['corepack', 'pnpm'];
  } catch (e) {
    /* corepack 也不可用 */
  }
  fail('pnpm 不可用（PATH 无 pnpm 且 node 未带 corepack）：打包机装 pnpm 9.15.9，或用带 corepack 的 node ≥20.19.5');
}

/** pnpm 统一调用出口（Windows .CMD shim 需 shell） */
function runPnpm(argv, opts = {}) {
  const pnpm = resolvePnpm();
  return run(pnpm[0], [...pnpm.slice(1), ...argv], { ...opts, shell: process.platform === 'win32' });
}

/**
 * step0 打包机自举：node 版本 / pnpm / 仓库依赖（pnpm install，顺带触发 preinstall
 * 的 runtime 资产下载，ADR-0059）。全新 clone 只需 node + docker + 网络。
 */
function step0Bootstrap() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  // AbortSignal.any（download-sources.js 两阶段超时用）需 node ≥20.3；仓库 engines 要求 20.19.5
  if (major < 20 || typeof AbortSignal.any !== 'function') {
    fail(`打包机需 node ≥20.3（AbortSignal.any；仓库 engines 要求 20.19.5，当前 ${process.versions.node}）`);
  }
  resolvePnpm(); // 不可用即 fail
  log(`pnpm: ${runPnpm(['--version'], { capture: true }).stdout.trim()}`);
  if (!fs.existsSync(path.join(PROJECT_ROOT, 'node_modules', '.pnpm'))) {
    log('node_modules 缺失，执行 pnpm install（含 preinstall runtime 资产下载，可能数分钟）...');
    const res = runPnpm(['install', '--frozen-lockfile'], { timeoutMs: 30 * 60000 });
    if (res.status !== 0) fail('pnpm install 失败：打包机需可访问 npm registry（或机器上预装好依赖）');
  }
}

/**
 * node 物料下载兜底：本地三源全 miss 时按架构下载（落 runtime/cache/ 供复用）。
 * @returns {Promise<string>} tarball 绝对路径
 */
async function ensureNodeTarball() {
  const cacheDir = path.join(PROJECT_ROOT, 'runtime', 'cache');
  const dest = path.join(cacheDir, ARCH.nodeFallbackTarball);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10 * 1024 * 1024) return dest;
  log(`node 资产缺失，下载 ${ARCH.nodeFallbackUrl} ...`);
  const { downloadFile } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'download-sources'));
  await downloadFile(ARCH.nodeFallbackUrl, dest);
  if (fs.statSync(dest).size < 10 * 1024 * 1024) fail('node 资产下载体积异常');
  return dest;
}

/**
 * schema-engine 下载兜底：缺失时从 Prisma 官方引擎源获取。
 * commit 读自仓库安装的 @prisma/engines-version 的 `enginesVersion` 导出（node_modules/.pnpm
 * 下，跟随 lockfile，不手写漂移；package.json 的 version 串不是干净的 commit，勿用）。
 * URL 形态与 @prisma/fetch-engine 一致：`<base>/all_commits/<commit>/<target>/schema-engine.gz`
 * （.gz 后缀必须，否则 404），下载后解压。
 * 本地文件名恒为 schema-engine-linux-musl（逻辑名，内容按打包机架构；Dockerfile.app 按此名烘焙）。
 * 受限网络：PRISMA_ENGINES_MIRROR（官方镜像机制）或 RUNTIME_DOWNLOAD_URLS。
 */
async function ensureSchemaEngine() {
  const dest = path.join(PROJECT_ROOT, 'runtime', 'prisma-engines', 'schema-engine-linux-musl');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024 * 1024) return;
  const pnpmStore = path.join(PROJECT_ROOT, 'node_modules', '.pnpm');
  let commit = null;
  if (fs.existsSync(pnpmStore)) {
    const entry = fs.readdirSync(pnpmStore).find((d) => d.startsWith('@prisma+engines-version@'));
    if (entry) {
      const pkgDir = path.join(pnpmStore, entry, 'node_modules', '@prisma', 'engines-version');
      try {
        commit = require(pkgDir).enginesVersion;
      } catch (e) {
        commit = null;
      }
    }
  }
  if (!commit) fail('读不到 Prisma engines commit（node_modules 缺 @prisma/engines-version）：先 pnpm install');
  const base = process.env.PRISMA_ENGINES_MIRROR || 'https://binaries.prisma.sh';
  const url = `${base}/all_commits/${commit}/${ARCH.prismaTarget}/schema-engine.gz`;
  log(`schema-engine 缺失，获取 ${url} ...`);
  const { downloadFile } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'download-sources'));
  ensureDir(path.dirname(dest));
  const gz = `${dest}.gz`;
  await downloadFile(url, gz);
  const buf = require('zlib').gunzipSync(fs.readFileSync(gz));
  fs.rmSync(gz, { force: true });
  if (buf.length < 1024 * 1024 || buf[0] !== 0x7f) fail('schema-engine 获取结果异常（体积/ELF 魔数）');
  fs.writeFileSync(dest, buf);
}

/**
 * conversion-service dist 构建兜底：dist/ 是 gitignore 的构建产物，干净克隆/工作区重置后不存在，
 * 而包树（step6）与 step1 关键产物清单都依赖它。缺失时按依赖链构建
 * （`...` 过滤 = conversion-service + 全部 workspace 依赖：@cloudcad/db（prisma generate + tsc）
 * → contracts → engine-exec，拓扑序执行，各包 build 脚本自含 prebuild 语义）。
 */
function ensureConversionServiceDist() {
  const dist = path.join(PROJECT_ROOT, 'packages', 'conversion-service', 'dist', 'server.js');
  if (fs.existsSync(dist)) return;
  log('conversion-service dist 缺失，执行构建（含依赖链 @cloudcad/db → contracts → engine-exec）...');
  const res = runPnpm(['--filter', '@cloudcad/conversion-service...', 'run', 'build'], { timeoutMs: 15 * 60000 });
  if (res.status !== 0) fail(`conversion-service 构建失败: ${res.stderr || res.stdout}`);
  if (!fs.existsSync(dist)) fail('conversion-service 构建后 dist/server.js 仍缺失');
}

/**
 * swagger_json.json 生成兜底：backend 构建产物（generate:swagger 生成，gitignore），
 * 干净克隆/工作区重置后不存在，而 Dockerfile.app 的 frontend-builder 阶段要 COPY 它
 * （前端 MSW handler / API 类型源）。缺失时跑 backend 完整构建
 * （prebuild → nest build → generate:swagger → build:seed）。
 * IMPL 恒注入空串（OSS 变体）：dotenv 不覆盖已存在的环境变量，故可挡住打包机
 * packages/backend/.env 里 IMPL=1 的劫持（否则会 require 不存在的 impl-mx/dist 崩溃，
 * 与 bd90de5 的变体修复同机制）。
 */
function ensureSwaggerJson() {
  const dest = path.join(PROJECT_ROOT, 'swagger_json.json');
  if (fs.existsSync(dest)) return;
  log('swagger_json.json 缺失，执行 backend 构建生成（IMPL= 空，OSS 变体）...');
  const res = runPnpm(['--filter', 'backend', 'run', 'build'], {
    timeoutMs: 30 * 60000,
    env: { ...process.env, IMPL: '' },
  });
  if (res.status !== 0) fail(`backend 构建失败: ${res.stderr || res.stdout}`);
  if (!fs.existsSync(dest)) fail('backend 构建完成但未产出 swagger_json.json');
}

/**
 * mxcad 下载兜底：本地缺失时从产品 Release 下载（mxcad-registry.json 单一事实源，
 * 与 ensure-runtime.js 同仓库/标签约定）并解压到 runtime/linux/mxcad。
 * registry 缺条目时走 GitHub API 按前缀解析资产名（与 ensure-runtime.js 同策略）。
 * @returns {Promise<string>} mxcad 目录绝对路径
 */
async function ensureLinuxMxcad() {
  const std = path.join(PROJECT_ROOT, 'runtime', 'linux', 'mxcad');
  if (fs.existsSync(path.join(std, 'mxcadassembly'))) return std;
  const registryPath = path.join(PROJECT_ROOT, 'scripts', 'pack-lib', 'mxcad-registry.json');
  let asset = null;
  if (fs.existsSync(registryPath)) {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const entry = registry[ARCH.mxcadRegistryKey];
    if (entry && entry.asset) asset = entry.asset;
  }
  if (!asset) {
    // registry 缺条目：GitHub API 按前缀解析（用户指定自定义下载基地址时无法解析，须显式补 registry）
    const prefix = `mxcad-linux-${ARCH.pkgArch}-`;
    try {
      const res = await fetch(`https://api.github.com/repos/${MXCAD_RELEASE_REPO}/releases/tags/${MXCAD_RELEASE_TAG}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cloudcad-pack-docker' },
      });
      if (res.ok) {
        const release = await res.json();
        const hit = (release.assets || []).find((a) => a.name.startsWith(prefix));
        if (hit) asset = hit.name;
      }
    } catch (e) {
      /* 解析失败走下方 fail */
    }
  }
  if (!asset) fail(`mxcad(${ARCH.pkgArch}) 资产无法确定：mxcad-registry.json 缺 ${ARCH.mxcadRegistryKey} 条目且 GitHub API 解析失败（先跑 scripts/upload-mxcad.js 生成产物索引）`);
  const url = `https://github.com/${MXCAD_RELEASE_REPO}/releases/download/${MXCAD_RELEASE_TAG}/${asset}`;
  log(`mxcad(${ARCH.pkgArch}) 缺失，下载 ${url} ...`);
  const { downloadFile } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'download-sources'));
  const cacheDir = path.join(PROJECT_ROOT, 'runtime', 'cache');
  ensureDir(cacheDir);
  const tgz = path.join(cacheDir, asset);
  if (!fs.existsSync(tgz)) await downloadFile(url, tgz);
  ensureDir(std);
  const res = run(TAR_BIN, ['-xzf', tgz, '-C', std]);
  if (res.status !== 0) fail(`mxcad 资产解压失败: ${asset}`);
  // 部分资产顶层是 .tmp-<name>/ 嵌套目录（upload-mxcad.js 打包结构），提升到目标根
  // （与 ensure-runtime.js flattenExtracted 对齐）
  const nested = fs.readdirSync(std).find((e) => e.startsWith('.tmp-') && fs.statSync(path.join(std, e)).isDirectory());
  if (nested) {
    const nestedDir = path.join(std, nested);
    for (const e of fs.readdirSync(nestedDir)) fs.renameSync(path.join(nestedDir, e), path.join(std, e));
    fs.rmdirSync(nestedDir);
  }
  if (!fs.existsSync(path.join(std, 'mxcadassembly'))) fail('mxcad 资产解压后未见 mxcadassembly（registry 资产结构不符？）');
  return std;
}

// ==================== .env.example 生成（Docker 形态覆盖） ====================

/**
 * 路径键重写表：裸机形态是相对路径（按 cwd 解析），Docker 形态必须绝对
 * （<DEPLOY_DIR> 占位符由 start.sh 首次运行替换；data/ 与 runtime/ 同路径挂载
 * 进 app 容器，故同一份绝对路径宿主与容器都可见）。
 * 例外：FRONTEND_FONTS_PATH 指向镜像内烘焙的前端 dist（/app/...），宿主进程不消费。
 */
const DOCKER_PATH_OVERRIDES = {
  FILES_DATA_PATH: '<DEPLOY_DIR>/data/files',
  AVATAR_PATH: '<DEPLOY_DIR>/data/files/avatars',
  MX_REPO_PATH: '<DEPLOY_DIR>/data/mx-repo',
  MXCAD_UPLOAD_PATH: '<DEPLOY_DIR>/data/uploads',
  MXCAD_TEMP_PATH: '<DEPLOY_DIR>/data/temp',
  MXCAD_DEBUG_PATH: '<DEPLOY_DIR>/data/debug',
  MXCAD_ASSEMBLY_PATH: '<DEPLOY_DIR>/runtime/linux/mxcad/mxcadassembly',
  MXCAD_FONTS_PATH: '<DEPLOY_DIR>/runtime/linux/mxcad/fonts',
  FRONTEND_FONTS_PATH: '/app/packages/frontend/dist/mxcad-app/mxcadAppAssets/fonts',
  BATCH_DOWNLOAD_EXPORT_DIR: '<DEPLOY_DIR>/data/exports',
  CONVERSION_CACHE_DIR: '<DEPLOY_DIR>/data/exports/conversion-cache',
  LOG_DIR: '<DEPLOY_DIR>/data/logs',
  BACKUP_DIR: '<DEPLOY_DIR>/data/backups',
  WECHATPAY_CERT_PATH: '<DEPLOY_DIR>/data/certs/wechat/apiclient_cert.pem',
  WECHATPAY_KEY_PATH: '<DEPLOY_DIR>/data/certs/wechat/apiclient_key.pem',
  // host 网络：服务间地址恒 localhost（覆盖裸机形态可能写死的值）
  DB_HOST: 'localhost',
  REDIS_HOST: 'localhost',
  COOPERATE_HOST: 'localhost',
};

/**
 * 生成 Docker 形态 .env.example：
 * 基础 = packages/backend/.env.example，路径/host 键按 DOCKER_PATH_OVERRIDES 重写
 * （注释行一并激活），末尾追加 Docker 形态专属键（基础里缺失的才追加，
 * dotenv 首值优先，重复追加无效）。
 */
function generateDockerEnvExample(version) {
  const basePath = path.join(PROJECT_ROOT, 'packages', 'backend', '.env.example');
  if (!fs.existsSync(basePath)) fail(`缺少 ${basePath}`);
  const lines = fs.readFileSync(basePath, 'utf8').split('\n');
  const out = [];
  const presentKeys = new Set();
  for (const line of lines) {
    const m = line.match(/^#\s*([A-Z][A-Z0-9_]*)=(.*)$|^([A-Z][A-Z0-9_]*)=(.*)$/);
    const key = m ? m[1] || m[3] : null;
    if (key) presentKeys.add(key);
    if (key && DOCKER_PATH_OVERRIDES[key] !== undefined) {
      out.push(`${key}=${DOCKER_PATH_OVERRIDES[key]}`);
    } else {
      out.push(line);
    }
  }
  const extra = [];
  extra.push('');
  extra.push('# ==================== Docker 一键部署形态覆盖（ADR-0074） ====================');
  extra.push('# start.sh 首次运行把 <DEPLOY_DIR> 替换为实际部署目录；本段键仅 Docker 形态生效');
  extra.push('DEPLOY_FORM=docker');
  extra.push(`APP_VERSION=${version}`);
  for (const key of ['DB_HOST', 'REDIS_HOST', 'COOPERATE_HOST', 'TZ']) {
    if (!presentKeys.has(key)) {
      extra.push(key === 'TZ' ? 'TZ=Asia/Shanghai' : `${key}=localhost`);
    }
  }
  return out.join('\n') + '\n' + extra.join('\n') + '\n';
}

// ==================== 步骤 ====================

// ==================== Linux 运行时物料解析（跨平台打包机） ====================

/**
 * 解析 Linux node 物料。返回 { kind: 'dir', src } 或 { kind: 'tarball', src }。
 * 顺序：runtime/linux/node（Linux 打包机标准布局）
 *   → runtime/cache 的本架构 node 资产 tarball（解压入包）
 *   → runtime/cache/linux-extract/<tier>/node（runtime 依赖包已提取产物，ADR-0059）
 */
function resolveLinuxNode() {
  const std = path.join(PROJECT_ROOT, 'runtime', 'linux', 'node');
  if (fs.existsSync(path.join(std, 'bin', 'node'))) return { kind: 'dir', src: std };
  const cacheDir = path.join(PROJECT_ROOT, 'runtime', 'cache');
  if (fs.existsSync(cacheDir)) {
    const tarball = fs.readdirSync(cacheDir).find((f) => ARCH.nodeCachePattern.test(f));
    if (tarball) return { kind: 'tarball', src: path.join(cacheDir, tarball) };
    const extractRoot = path.join(cacheDir, 'linux-extract');
    if (fs.existsSync(extractRoot)) {
      for (const tier of fs.readdirSync(extractRoot)) {
        const nodeDir = path.join(extractRoot, tier, 'node');
        if (fs.existsSync(path.join(nodeDir, 'bin', 'node'))) return { kind: 'dir', src: nodeDir };
      }
    }
  }
  return null;
}

/** 解析 Linux mxcad 物料（runtime/linux/mxcad → runtime/cache/linux-extract/<tier>/mxcad） */
function resolveLinuxMxcad() {
  const std = path.join(PROJECT_ROOT, 'runtime', 'linux', 'mxcad');
  if (fs.existsSync(path.join(std, 'mxcadassembly'))) return std;
  const extractRoot = path.join(PROJECT_ROOT, 'runtime', 'cache', 'linux-extract');
  if (fs.existsSync(extractRoot)) {
    for (const tier of fs.readdirSync(extractRoot)) {
      const mxcadDir = path.join(extractRoot, tier, 'mxcad');
      if (fs.existsSync(path.join(mxcadDir, 'mxcadassembly'))) return mxcadDir;
    }
  }
  return null;
}

async function step1Prechecks(version) {
  log('============================================');
  log(` Docker 一键部署包打包（Linux ${ARCH ? ARCH.pkgArch : process.arch}，版本 ${version}，打包机 ${process.platform}/${process.arch}）`);
  log('============================================');
  if (!ARCH) {
    fail(`仅支持 x86_64/arm64 打包机（当前 ${process.arch}）：在对应架构的机器上打对应架构的包`);
  }
  const docker = run('docker', ['version', '--format', '{{.Server.Version}}'], { capture: true });
  if (docker.status !== 0) fail(`docker 不可用：${docker.stderr}（Windows 需安装 Docker Desktop 并启用 Linux 容器）`);
  log(`docker ${docker.stdout.trim()} 可用`);

  step0Bootstrap();

  // 本地解析 → 下载兜底（打包机零缓存也能出包）
  let nodeSrc = resolveLinuxNode();
  if (!nodeSrc) {
    nodeSrc = { kind: 'tarball', src: await ensureNodeTarball() };
  }
  log(`node 物料: ${nodeSrc.kind === 'tarball' ? path.basename(nodeSrc.src) : nodeSrc.src}`);
  let mxcadSrc = resolveLinuxMxcad();
  if (!mxcadSrc) {
    mxcadSrc = await ensureLinuxMxcad();
  }
  if (!fs.existsSync(path.join(mxcadSrc, '1.dwg'))) {
    fail(`mxcad 物料缺 1.dwg（SystemLib 运行时探测依赖）: ${mxcadSrc}`);
  }
  log(`mxcad 物料: ${mxcadSrc}`);
  await ensureSchemaEngine();
  ensureConversionServiceDist();
  ensureSwaggerJson();

  const required = [
    'runtime/docker-runtime/index.js',
    'runtime/docker-runtime/docker-compose.yml',
    'runtime/docker-runtime/start.sh',
    'runtime/docker-runtime/stop.sh',
    'docker/Dockerfile.app',
    'docker/app-entrypoint.js',
    'packages/conversion-service/dist/server.js',
    'packages/engine-exec/dist/index.js',
    'packages/contracts/dist/index.js',
    'packages/config-service/server.js',
    'packages/backend/.env.example',
  ];
  for (const rel of required) {
    if (!fs.existsSync(path.join(PROJECT_ROOT, rel))) {
      fail(`缺少关键产物: ${rel}`);
    }
  }
  // conversion-service 的 workspace 链接（node_modules 里指向 contracts/engine-exec 的相对符号链接，
  // 纯 JS 无平台差异，Windows 打包机上同样可用）
  const convNm = path.join(PROJECT_ROOT, 'packages', 'conversion-service', 'node_modules', '@cloudcad');
  for (const dep of ['contracts', 'engine-exec']) {
    if (!fs.existsSync(path.join(convNm, dep))) {
      log(`conversion-service 缺 workspace 链接 @cloudcad/${dep}，执行 pnpm install 补齐...`);
      const res = runPnpm(['install', '--filter', '@cloudcad/conversion-service'], { timeoutMs: 10 * 60000 });
      if (res.status !== 0) fail('pnpm install 失败');
    }
  }
  return { nodeSrc, mxcadSrc };
}

function step2BuildAppImage(version) {
  if (SKIP_DOCKER_BUILD) {
    log('跳过 app 镜像构建（--skip-docker-build）');
    return;
  }
  log(`构建 app 镜像 cloudcad/app:${version}（多阶段，本机架构 ${ARCH.pkgArch}，耗时较长）...`);
  const buildArgs = ['build', '-f', 'docker/Dockerfile.app', '--build-arg', `APP_VERSION=${version}`, '-t', `cloudcad/app:${version}`, '.'];
  // 受限网络：镜像内 pnpm install 走用户指定的 npm registry（Dockerfile.app 的 NPM_REGISTRY build-arg）
  if (process.env.NPM_REGISTRY) buildArgs.push('--build-arg', `NPM_REGISTRY=${process.env.NPM_REGISTRY}`);
  const res = run('docker', buildArgs, { timeoutMs: 60 * 60000 });
  if (res.status !== 0) fail('app 镜像构建失败');
}

function step3TagInfraImages() {
  for (const [src, tag] of [
    [PG_IMAGE, 'cloudcad/pg:15-alpine'],
    [REDIS_IMAGE, 'cloudcad/redis:7-alpine'],
  ]) {
    const has = run('docker', ['image', 'inspect', src], { capture: true });
    if (has.status !== 0) {
      log(`拉取 ${src}...`);
      const pull = run('docker', ['pull', src], { timeoutMs: 30 * 60000 });
      if (pull.status !== 0) fail(`拉取 ${src} 失败（打包机需可访问 Docker Hub，或预先 docker load）`);
    }
    run('docker', ['tag', src, tag]);
    log(`${src} → ${tag}`);
  }
}

function step4SaveImages(imagesDir, version) {
  ensureDir(imagesDir);
  const saves = [
    ['cloudcad/pg:15-alpine', 'cloudcad-pg-15-alpine.tar'],
    ['cloudcad/redis:7-alpine', 'cloudcad-redis-7-alpine.tar'],
    [`cloudcad/app:${version}`, `cloudcad-app-${version}.tar`],
  ];
  for (const [tag, file] of saves) {
    const dest = path.join(imagesDir, file);
    log(`docker save ${tag} → ${file}`);
    const res = run('docker', ['save', '-o', dest, tag], { timeoutMs: 30 * 60000 });
    if (res.status !== 0 || !fs.existsSync(dest) || fs.statSync(dest).size < 1024 * 1024) {
      fail(`docker save ${tag} 失败或产物异常`);
    }
  }
}

async function step5DockerBinaries(dockerDir) {
  const { downloadFile } = require(path.join(PROJECT_ROOT, 'scripts', 'lib', 'download-sources'));
  ensureDir(dockerDir);

  // Docker 静态二进制（tgz 内含 8 个二进制）。
  // URL 布局统一扁平 `<arch>/docker-<ver>.tgz`（两架构一致）：官方源 23.0+ 即此布局，
  // 20.10 官方源已删（EOL 清理，直链恒 404）；TUNA docker-ce 镜像两架构均扁平布局
  // （实测 2026-10-13：x86_64 版本子目录布局 404、扁平 200），经 download-sources.js
  // 的 base 重写镜像（download.docker.com → TUNA）实际下载。
  const dockerStaticUrl = `https://download.docker.com/linux/static/stable/${ARCH.pkgArch}/docker-${DOCKER_STATIC_VERSION}.tgz`;
  const tgz = path.join(dockerDir, `docker-${DOCKER_STATIC_VERSION}.tgz`);
  if (!fs.existsSync(tgz)) {
    log(`下载 Docker 静态二进制 ${DOCKER_STATIC_VERSION}（${ARCH.pkgArch}）...`);
    await downloadFile(dockerStaticUrl, tgz);
  }
  const extractDir = path.join(dockerDir, 'extract');
  ensureDir(extractDir);
  const tgzInner = path.join(extractDir, 'docker');
  const res = run(TAR_BIN, ['-xzf', tgz, '-C', extractDir]);
  if (res.status !== 0) fail('解压 Docker 静态二进制失败');
  const binaries = ['docker', 'dockerd', 'containerd', 'containerd-shim', 'containerd-shim-runc-v2', 'runc', 'docker-init', 'docker-proxy'];
  for (const bin of binaries) {
    const src = path.join(tgzInner, bin);
    if (!fs.existsSync(src)) fail(`静态二进制包内缺少 ${bin}`);
    fs.copyFileSync(src, path.join(dockerDir, bin));
    fs.chmodSync(path.join(dockerDir, bin), 0o755);
  }
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.rmSync(tgz, { force: true });

  // compose v2 独立二进制
  const composeBin = path.join(dockerDir, 'docker-compose');
  if (!fs.existsSync(composeBin)) {
    log(`下载 compose v2 独立二进制 ${COMPOSE_VERSION}（${ARCH.pkgArch}）...`);
    await downloadFile(`https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/${ARCH.composeAsset}`, composeBin);
  }
  fs.chmodSync(composeBin, 0o755);
  log(`Docker 静态二进制 + compose v2 就位（${binaries.length + 1} 个文件）`);
}

function step6Assemble(pkgRoot, version, { nodeSrc, mxcadSrc }) {
  log(`组装包树: ${pkgRoot}`);
  ensureDir(pkgRoot);

  // 入口薄壳 + compose + .env.example
  fs.copyFileSync(path.join(PROJECT_ROOT, 'runtime', 'docker-runtime', 'start.sh'), path.join(pkgRoot, 'start.sh'));
  fs.copyFileSync(path.join(PROJECT_ROOT, 'runtime', 'docker-runtime', 'stop.sh'), path.join(pkgRoot, 'stop.sh'));
  fs.chmodSync(path.join(pkgRoot, 'start.sh'), 0o755);
  fs.chmodSync(path.join(pkgRoot, 'stop.sh'), 0o755);
  fs.copyFileSync(path.join(PROJECT_ROOT, 'runtime', 'docker-runtime', 'docker-compose.yml'), path.join(pkgRoot, 'docker-compose.yml'));
  fs.writeFileSync(path.join(pkgRoot, '.env.example'), generateDockerEnvExample(version), 'utf8');

  // 镜像与 Docker 静态二进制（step4/step5 已产出到包内目录）
  // runtime：宿主进程依赖（node/mxcad）+ 纯函数工具链 + docker-runtime 主控
  const linuxDir = path.join(pkgRoot, 'runtime', 'linux');
  ensureDir(linuxDir);
  const nodeDest = path.join(linuxDir, 'node');
  if (nodeSrc.kind === 'dir') {
    copyDir(nodeSrc.src, nodeDest);
  } else {
    // node tarball：解压放容器内做——Windows 宿主上宿主侧 tar 解 xz 极慢（且 Git tar
    // 不认盘符路径），WORK_IMAGE 的 busybox tar 自带 xz 支持，且该镜像 app 构建时已拉取。
    // docker exec 要求容器处于 running 态，故 create 后必须 start。
    log(`容器内解压 node（${path.basename(nodeSrc.src)}）...`);
    const cname = 'cloudcad-pack-node';
    const created = run('docker', ['create', '--name', cname, WORK_IMAGE, 'sleep', '600'], { capture: true, timeoutMs: 60000 });
    if (created.status !== 0) fail(`创建解压容器失败: ${created.stderr}`);
    const cid = created.stdout.trim();
    try {
      run('docker', ['start', cid], { timeoutMs: 60000 });
      const cpIn = run('docker', ['cp', nodeSrc.src, `${cid}:/node.tar.xz`], { timeoutMs: 10 * 60000 });
      if (cpIn.status !== 0) fail(`docker cp node 资产失败: ${cpIn.stderr}`);
      // node 发行包 bin/ 下是符号链接（npm/npx/corepack → lib/node_modules/...），
      // docker cp 回 Windows 宿主需要 SeCreateSymbolicLink 特权（"A required privilege
      // is not held by the client"）。容器内先解引用为实体文件副本：链接目标都是带
      // shebang 的 JS 文件，Linux 目标机上以普通文件执行行为完全一致。
      const deref = 'find /node-v* -type l -print0 | while IFS= read -r -d "" l; do ' +
        'if [ -f "$l" ]; then cp -f "$l" "$l.tmpcopy" && chmod 755 "$l.tmpcopy" && mv -f "$l.tmpcopy" "$l"; fi; done';
      const ext = run(
        'docker',
        ['exec', cid, 'sh', '-c', `tar -xJf /node.tar.xz -C / && ${deref} && ls -d /node-v*`],
        { capture: true, timeoutMs: 10 * 60000 }
      );
      if (ext.status !== 0) fail(`容器内 node 解压失败: ${ext.stderr}`);
      const inner = (ext.stdout.trim().split('\n').pop() || '').replace(/^\//, '');
      if (!inner.startsWith('node-v')) fail('node 资产顶层目录异常');
      fs.rmSync(nodeDest, { recursive: true, force: true });
      const cpOut = run('docker', ['cp', `${cid}:/${inner}`, nodeDest], { timeoutMs: 15 * 60000 });
      if (cpOut.status !== 0) fail(`docker cp node 回宿主失败: ${cpOut.stderr}`);
    } finally {
      run('docker', ['rm', '-f', cname], { capture: true });
    }
    if (!fs.existsSync(path.join(nodeDest, 'bin', 'node'))) fail('node 解压结果异常（bin/node 缺失）');
    log(`node 已解压入包: ${path.basename(nodeSrc.src)}`);
  }
  copyDir(mxcadSrc, path.join(linuxDir, 'mxcad'));
  copyDir(path.join(PROJECT_ROOT, 'runtime', 'scripts'), path.join(pkgRoot, 'runtime', 'scripts'));
  copyDir(path.join(PROJECT_ROOT, 'runtime', 'docker-runtime'), path.join(pkgRoot, 'runtime', 'docker-runtime'));

  // packages：宿主进程消费（转换/引擎契约/运维中心）；backend 不在包内（跑在容器里）。
  // pnpm 的 node_modules 全是符号链接，Windows 打包机无法复制（EPERM，缺
  // SeCreateSymbolicLink 特权）→ 包树改用**扁平根 node_modules（实体目录）**：
  // Node 从 packages/*/dist 向上解析必然命中 <pkgroot>/node_modules，各包自身
  // 不再带 node_modules。运行时依赖闭包（dependencies 并集，不含 devDeps）：
  //   conversion-service → @cloudcad/contracts, @cloudcad/engine-exec
  //   engine-exec → @cloudcad/contracts；contracts → @cloudcad/db；
  //   db → @prisma/client（generated client 只 require runtime/*，WASM query
  //   compiler，不加载引擎二进制；@prisma/client-runtime-utils 嵌套随包）
  const wsPkg = (name) => path.join(PROJECT_ROOT, 'packages', name);
  const rootNm = path.join(pkgRoot, 'node_modules');
  for (const name of ['contracts', 'engine-exec', 'db']) {
    const dst = path.join(rootNm, '@cloudcad', name);
    ensureDir(dst);
    fs.copyFileSync(path.join(wsPkg(name), 'package.json'), path.join(dst, 'package.json'));
    copyDir(path.join(wsPkg(name), 'dist'), path.join(dst, 'dist'));
  }
  // @prisma/client 的依赖（client-runtime-utils）在 pnpm store 里是包目录的**兄弟项**
  // （虚拟 node_modules 层），不在包内嵌套 → 拷整个 @prisma 虚拟层（client 实体 +
  // client-runtime-utils 符号链接解引用）
  const clientReal = fs.realpathSync(path.join(wsPkg('db'), 'node_modules', '@prisma', 'client'));
  const storeNm = clientReal.slice(0, -'/@prisma/client'.length);
  copyDirDeref(path.join(storeNm, '@prisma'), path.join(rootNm, '@prisma'));
  for (const name of ['conversion-service', 'contracts', 'engine-exec']) {
    const dst = path.join(pkgRoot, 'packages', name);
    ensureDir(dst);
    fs.copyFileSync(path.join(wsPkg(name), 'package.json'), path.join(dst, 'package.json'));
    copyDir(path.join(wsPkg(name), 'dist'), path.join(dst, 'dist'));
  }
  copyDir(path.join(PROJECT_ROOT, 'packages', 'config-service'), path.join(pkgRoot, 'packages', 'config-service'));

  // 标记与元信息
  fs.writeFileSync(path.join(pkgRoot, '.deploy-docker'), '1');
  fs.writeFileSync(path.join(pkgRoot, 'VERSION'), version + '\n');
  const { PRODUCT_NAME } = require(path.join(PROJECT_ROOT, 'runtime', 'scripts', 'lib', 'branding'));
  fs.writeFileSync(
    path.join(pkgRoot, '部署说明.txt'),
    [
      `${PRODUCT_NAME} Docker 一键部署包（Linux ${ARCH.pkgArch}）`,
      `版本: ${version}`,
      '',
      '【部署】',
      '  1. 解压本包到目标目录（如 /opt/cloudcad）',
      '  2. 用 root 或有 sudo 权限的用户运行: ./start.sh',
      '     - 无 Docker 的机器会自动用包内静态二进制安装',
      '     - 首次部署自动生成 .env 与初始密码（见 DEPLOY-PASSWORDS.txt）',
      '  3. 浏览器访问 http://<服务器IP>:3000（端口以 .env 为准）',
      '',
      '【停止】 ./stop.sh（数据保留在 data/ 目录）',
      '',
      '【升级】 新版包解压覆盖本目录后重跑 ./start.sh',
      '  （.env 与 data/ 自动保留；数据库迁移自动执行）',
      '',
      '【引擎替换】 用官方 mxcad 替换 runtime/linux/mxcad/ 后重跑 ./start.sh，',
      '  启动时会自动探测转换能力，SystemLib 不匹配时自动补齐。',
      '',
      '【运维中心】 http://<服务器IP>:3002（只读运维 + 配置管理）',
    ].join('\n'),
    'utf8'
  );
  log('包树组装完成');
}

function step7Archive(pkgRoot, version) {
  const name = `cloudcad-docker-linux-${ARCH.pkgArch}-${version}`;
  ensureDir(OUT_DIR);
  const archive = path.join(OUT_DIR, `${name}.tar.gz`);

  // SHA256SUMS（包内顶层文件）
  const sums = [];
  for (const entry of fs.readdirSync(pkgRoot).sort()) {
    const p = path.join(pkgRoot, entry);
    if (fs.statSync(p).isFile()) {
      sums.push(`${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}  ${entry}`);
    }
  }
  fs.writeFileSync(path.join(pkgRoot, 'SHA256SUMS'), sums.join('\n') + '\n');

  if (process.platform === 'linux') {
    log(`归档 → ${archive}`);
    const res = run('tar', ['-czf', archive, '-C', path.dirname(pkgRoot), path.basename(pkgRoot)], { timeoutMs: 30 * 60000 });
    if (res.status !== 0) fail('归档失败');
  } else {
    // Windows 宿主：bsdtar 写不出 Unix 可执行位，归档在 Linux 容器内完成——
    // 拷入容器自身文件系统（bind mount 上 chmod 不可靠）→ 归一化权限 →
    // 已知可执行清单 chmod 755 → 容器内 tar → 取回。
    // WORK_IMAGE 的 busybox 自带 tar/mkdir/chmod/mv/sh（debian:bookworm-slim 缺 xz 不可用）；
    // 镜像 app 构建时已拉取，--skip-docker-build 时兜底拉取。docker exec 要求 running 态。
    log(`容器内归档（Windows 宿主，保证 exec 位）→ ${archive}`);
    const base = run('docker', ['image', 'inspect', WORK_IMAGE], { capture: true });
    if (base.status !== 0) {
      const pull = run('docker', ['pull', WORK_IMAGE], { timeoutMs: 15 * 60000 });
      if (pull.status !== 0) fail(`拉取 ${WORK_IMAGE} 失败（归档容器需要）`);
    }
    const created = run('docker', ['create', '--name', 'cloudcad-pack-archive', WORK_IMAGE, 'sleep', '600'], { capture: true, timeoutMs: 60000 });
    if (created.status !== 0) fail(`创建归档容器失败: ${created.stderr}`);
    const cid = created.stdout.trim();
    try {
      run('docker', ['start', cid], { timeoutMs: 60000 });
      const cp = run('docker', ['cp', pkgRoot, `${cid}:/stage`], { timeoutMs: 30 * 60000 });
      if (cp.status !== 0) fail(`docker cp 失败: ${cp.stderr}`);
      // `;` 连接（非 `&&`）：glob 未命中时 chmod 失败不应中断后续步骤；
      // 退出码 = 最后一条（tar）的状态，tar 失败仍会 fail。
      const script = [
        `mkdir -p /pkgroot`,
        `mv /stage /pkgroot/${name}`,
        `chmod -R u+rwX,go+r /pkgroot/${name}`,
        `chmod 755 /pkgroot/${name}/start.sh /pkgroot/${name}/stop.sh`,
        `chmod 755 /pkgroot/${name}/docker/* 2>/dev/null`,
        `chmod 755 /pkgroot/${name}/runtime/linux/node/bin/* 2>/dev/null`,
        `chmod 755 /pkgroot/${name}/runtime/linux/mxcad/mxcadassembly /pkgroot/${name}/runtime/linux/mxcad/tool/* 2>/dev/null`,
        `tar -czf /out.tar.gz -C /pkgroot ${name}`,
      ].join(';\n');
      const inContainer = run('docker', ['exec', cid, 'sh', '-c', script], { capture: true, timeoutMs: 30 * 60000 });
      if (inContainer.status !== 0) fail(`容器内归档失败: ${inContainer.stderr}`);
      const out = run('docker', ['cp', `${cid}:/out.tar.gz`, archive], { timeoutMs: 30 * 60000 });
      if (out.status !== 0) fail(`取回归档失败: ${out.stderr}`);
    } finally {
      run('docker', ['rm', '-f', 'cloudcad-pack-archive'], { capture: true });
    }
  }
  log(`完成: ${archive}（${(fs.statSync(archive).size / 1024 / 1024).toFixed(1)} MB）`);
  return archive;
}

async function main() {
  const version = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version;
  const pkgRoot = path.join(OUT_DIR, `staging-${version}`);
  const pkgName = `cloudcad-docker-linux-${ARCH ? ARCH.pkgArch : process.arch}-${version}`;
  const pkgDir = path.join(pkgRoot, pkgName);

  const { nodeSrc, mxcadSrc } = await step1Prechecks(version);
  step2BuildAppImage(version);
  step3TagInfraImages();
  step4SaveImages(path.join(pkgDir, 'images'), version);
  await step5DockerBinaries(path.join(pkgDir, 'docker'));
  step6Assemble(pkgDir, version, { nodeSrc, mxcadSrc });
  const archive = step7Archive(pkgDir, version);

  if (RUN_VERIFY) {
    if (process.platform !== 'linux') {
      fail('--verify（DinD 断网验证）只在 Linux 机器上可靠：Windows 打包后把包交给 Linux CI 跑 scripts/verify-linux-docker-deploy.js');
    }
    log('执行断网验证（verify-linux-docker-deploy.js）...');
    const res = run('node', [path.join(PROJECT_ROOT, 'scripts', 'verify-linux-docker-deploy.js'), '--package', archive], {
      timeoutMs: 30 * 60000,
    });
    if (res.status !== 0) fail('断网验证失败，本包不得上传 Release');
    log('断网验证通过');
  }
  log(`\n产物: ${archive}`);
}

if (require.main === module) {
  main().catch((err) => fail(err.stack || err.message));
}

module.exports = { generateDockerEnvExample, DOCKER_PATH_OVERRIDES };
