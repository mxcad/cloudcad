#!/usr/bin/env node
/**
 * @fileoverview Docker 一键部署包（Linux x86_64）打包脚本（ADR-0074 半容器化）
 *
 * 用法: node scripts/pack-linux-docker.js [--out <dir>] [--skip-docker-build] [--verify]
 *
 * 前置条件（打包机，x86_64；Linux 或 Windows+Docker 均可）:
 *   - docker 可用（构建 app 镜像 + docker save 离线镜像；Windows 走 Docker Desktop Linux 容器）
 *   - Linux 运行时物料可解析（按序）：runtime/linux/node → runtime/cache 的
 *     node glibc-217 资产（解压，通用性最好，CentOS 7 可跑）→ runtime/cache/linux-extract/<tier>/node；
 *     mxcad 同理（runtime/linux/mxcad → runtime/cache/linux-extract/<tier>/mxcad）
 *   - runtime/prisma-engines/schema-engine-linux-musl 已就位（Dockerfile.app 烘焙进镜像）
 *   - Windows 打包时归档在 Linux 容器内执行（bsdtar 打不出 Unix 可执行位，
 *     容器内 chmod + tar 保证 start.sh / docker 二进制的 exec 位正确）
 *
 * 注意：断网验证（--verify）依赖 DinD，只在 Linux 机器上可靠（Docker Desktop WSL2
 * 跑嵌套 dockerd 不稳定）——Windows 打包后把包交给 Linux CI 跑 verify-linux-docker-deploy.js。
 *
 * 流程:
 *   1 前置检查 → 2 构建 app 镜像 → 3 pg/redis 打 tag → 4 docker save 离线镜像
 *   → 5 下载 Docker 静态二进制 + compose v2 → 6 组装包树（含 .env.example 生成）
 *   → 7 SHA256SUMS + 归档 → 8（--verify）verify-linux-docker-deploy.js 断网验证
 *
 * 产物: <out>/cloudcad-docker-linux-x86_64-<version>.tar.gz
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
const DOCKER_STATIC_URL = `https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_STATIC_VERSION}.tgz`;
const COMPOSE_URL = `https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64`;
const PG_IMAGE = 'postgres:15-alpine';
const REDIS_IMAGE = 'redis:7-alpine';

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
    env: process.env,
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
 *   → runtime/cache 的 node glibc-217 资产（解压入包；glibc 2.17 通用构建，CentOS 7+ 可跑）
 *   → runtime/cache/linux-extract/<tier>/node（runtime 依赖包已提取产物，ADR-0059）
 */
function resolveLinuxNode() {
  const std = path.join(PROJECT_ROOT, 'runtime', 'linux', 'node');
  if (fs.existsSync(path.join(std, 'bin', 'node'))) return { kind: 'dir', src: std };
  const cacheDir = path.join(PROJECT_ROOT, 'runtime', 'cache');
  if (fs.existsSync(cacheDir)) {
    const tarball = fs.readdirSync(cacheDir).find((f) => /^node-v[\d.]+-linux-x64-glibc-217\.tar\.xz$/.test(f));
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

function step1Prechecks(version) {
  log('============================================');
  log(` Docker 一键部署包打包（Linux x86_64，版本 ${version}，打包机 ${process.platform}）`);
  log('============================================');
  if (process.arch !== 'x64') {
    fail(`仅支持 x86_64 打包机（当前 ${process.arch}）：mxcad 是 x86_64 二进制`);
  }
  const docker = run('docker', ['version', '--format', '{{.Server.Version}}'], { capture: true });
  if (docker.status !== 0) fail(`docker 不可用：${docker.stderr}（Windows 需安装 Docker Desktop 并启用 Linux 容器）`);
  log(`docker ${docker.stdout.trim()} 可用`);

  const nodeSrc = resolveLinuxNode();
  if (!nodeSrc) {
    fail('无法解析 Linux node 物料：先跑 pnpm install（preinstall 下载 runtime 依赖资产到 runtime/cache/），或手工放置 runtime/linux/node');
  }
  log(`node 物料: ${nodeSrc.kind === 'tarball' ? path.basename(nodeSrc.src) : nodeSrc.src}`);
  const mxcadSrc = resolveLinuxMxcad();
  if (!mxcadSrc || !fs.existsSync(path.join(mxcadSrc, '1.dwg'))) {
    fail('无法解析 Linux mxcad 物料（需含 mxcadassembly + 1.dwg）：runtime/linux/mxcad 或 runtime/cache/linux-extract/<tier>/mxcad');
  }
  log(`mxcad 物料: ${mxcadSrc}`);

  const required = [
    'runtime/prisma-engines/schema-engine-linux-musl',
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
      const res = run('pnpm', ['install', '--filter', '@cloudcad/conversion-service'], { timeoutMs: 10 * 60000 });
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
  log(`构建 app 镜像 cloudcad/app:${version}（多阶段，耗时较长）...`);
  const res = run(
    'docker',
    ['build', '-f', 'docker/Dockerfile.app', '--build-arg', `APP_VERSION=${version}`, '-t', `cloudcad/app:${version}`, '.'],
    { timeoutMs: 60 * 60000 }
  );
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

  // Docker 静态二进制（tgz 内含 8 个二进制）
  const tgz = path.join(dockerDir, `docker-${DOCKER_STATIC_VERSION}.tgz`);
  if (!fs.existsSync(tgz)) {
    log(`下载 Docker 静态二进制 ${DOCKER_STATIC_VERSION}...`);
    await downloadFile(DOCKER_STATIC_URL, tgz);
  }
  const extractDir = path.join(dockerDir, 'extract');
  ensureDir(extractDir);
  const tgzInner = path.join(extractDir, 'docker');
  const res = run('tar', ['-xzf', tgz, '-C', extractDir]);
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
    log(`下载 compose v2 独立二进制 ${COMPOSE_VERSION}...`);
    await downloadFile(COMPOSE_URL, composeBin);
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
    // glibc-217 tarball：解压后顶层目录（node-v20.19.5-linux-x64-glibc-217）改名为 node
    const staging = path.join(linuxDir, '.node-extract');
    ensureDir(staging);
    const res = run('tar', ['-xJf', nodeSrc.src, '-C', staging]);
    if (res.status !== 0) fail(`node 资产解压失败（系统 tar 需支持 xz，否则换 Linux 打包机）: ${path.basename(nodeSrc.src)}`);
    const inner = fs.readdirSync(staging).find((f) => f.startsWith('node-v'));
    if (!inner) fail('node 资产顶层目录异常');
    fs.renameSync(path.join(staging, inner), nodeDest);
    fs.rmSync(staging, { recursive: true, force: true });
    log(`node 已解压入包: ${path.basename(nodeSrc.src)}`);
  }
  copyDir(mxcadSrc, path.join(linuxDir, 'mxcad'));
  copyDir(path.join(PROJECT_ROOT, 'runtime', 'scripts'), path.join(pkgRoot, 'runtime', 'scripts'));
  copyDir(path.join(PROJECT_ROOT, 'runtime', 'docker-runtime'), path.join(pkgRoot, 'runtime', 'docker-runtime'));

  // packages：宿主进程消费（转换/引擎契约/运维中心）；backend 不在包内（跑在容器里）
  const conv = path.join(pkgRoot, 'packages', 'conversion-service');
  ensureDir(conv);
  fs.copyFileSync(path.join(PROJECT_ROOT, 'packages', 'conversion-service', 'package.json'), path.join(conv, 'package.json'));
  copyDir(path.join(PROJECT_ROOT, 'packages', 'conversion-service', 'dist'), path.join(conv, 'dist'));
  copyDir(path.join(PROJECT_ROOT, 'packages', 'conversion-service', 'node_modules'), path.join(conv, 'node_modules'));
  copyDir(path.join(PROJECT_ROOT, 'packages', 'contracts'), path.join(pkgRoot, 'packages', 'contracts'));
  copyDir(path.join(PROJECT_ROOT, 'packages', 'engine-exec'), path.join(pkgRoot, 'packages', 'engine-exec'));
  copyDir(path.join(PROJECT_ROOT, 'packages', 'config-service'), path.join(pkgRoot, 'packages', 'config-service'));

  // 标记与元信息
  fs.writeFileSync(path.join(pkgRoot, '.deploy-docker'), '1');
  fs.writeFileSync(path.join(pkgRoot, 'VERSION'), version + '\n');
  const { PRODUCT_NAME } = require(path.join(PROJECT_ROOT, 'runtime', 'scripts', 'lib', 'branding'));
  fs.writeFileSync(
    path.join(pkgRoot, '部署说明.txt'),
    [
      `${PRODUCT_NAME} Docker 一键部署包（Linux x86_64）`,
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
  const name = `cloudcad-docker-linux-x86_64-${version}`;
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
    // 已知可执行清单 chmod 755 → 容器内 tar → 取回
    log(`容器内归档（Windows 宿主，保证 exec 位）→ ${archive}`);
    const base = run('docker', ['image', 'inspect', 'debian:bookworm-slim'], { capture: true });
    if (base.status !== 0) {
      const pull = run('docker', ['pull', 'debian:bookworm-slim'], { timeoutMs: 15 * 60000 });
      if (pull.status !== 0) fail(`拉取 debian:bookworm-slim 失败（归档容器需要）`);
    }
    const created = run('docker', ['create', 'debian:bookworm-slim', '/bin/true'], { capture: true, timeoutMs: 60000 });
    if (created.status !== 0) fail(`创建归档容器失败: ${created.stderr}`);
    const cid = created.stdout.trim();
    try {
      const cp = run('docker', ['cp', pkgRoot, `${cid}:/stage`], { timeoutMs: 30 * 60000 });
      if (cp.status !== 0) fail(`docker cp 失败: ${cp.stderr}`);
      const script = [
        `mkdir -p /pkgroot && mv /stage /pkgroot/${name}`,
        `chmod -R u+rwX,go+r /pkgroot/${name}`,
        `chmod 755 /pkgroot/${name}/start.sh /pkgroot/${name}/stop.sh`,
        `chmod 755 /pkgroot/${name}/docker/* 2>/dev/null;`,
        `chmod 755 /pkgroot/${name}/runtime/linux/node/bin/node* 2>/dev/null;`,
        `chmod 755 /pkgroot/${name}/runtime/linux/mxcad/mxcadassembly /pkgroot/${name}/runtime/linux/mxcad/tool/* 2>/dev/null;`,
        `tar -czf /out.tar.gz -C /pkgroot ${name}`,
      ].join(' && ');
      const inContainer = run('docker', ['exec', cid, 'sh', '-c', script], { capture: true, timeoutMs: 30 * 60000 });
      if (inContainer.status !== 0) fail(`容器内归档失败: ${inContainer.stderr}`);
      const out = run('docker', ['cp', `${cid}:/out.tar.gz`, archive], { timeoutMs: 30 * 60000 });
      if (out.status !== 0) fail(`取回归档失败: ${out.stderr}`);
    } finally {
      run('docker', ['rm', '-f', cid], { capture: true });
    }
  }
  log(`完成: ${archive}（${(fs.statSync(archive).size / 1024 / 1024).toFixed(1)} MB）`);
  return archive;
}

async function main() {
  const version = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version;
  const pkgRoot = path.join(OUT_DIR, `staging-${version}`);
  const pkgName = `cloudcad-docker-linux-x86_64-${version}`;
  const pkgDir = path.join(pkgRoot, pkgName);

  const { nodeSrc, mxcadSrc } = step1Prechecks(version);
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
