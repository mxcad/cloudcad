#!/usr/bin/env node
/**
 * @fileoverview Docker 一键部署包断网验证（ADR-0074 D8 硬门禁 / ADR-0059 模式）
 *
 * 用法: node scripts/verify-linux-docker-deploy.js --package <tar.gz> [--keep]
 *
 * 原理（DinD 断网验证）：
 *   - 外层容器 = debian:bookworm-slim（glibc 用户态——包内自带 node/mxcad 是 glibc 二进制，
 *     alpine 用户态跑不起来；外层只当「一台断网的 glibc 服务器」）
 *   - --privileged：内层 dockerd（包内静态二进制）需要创建命名空间/挂载
 *   - --network none：外层网络命名空间无外网；内层 dockerd 以 --bridge=none --iptables=false
 *     启动，内层容器全部 host 网络 = 外层 netns → 整个部署（含 3 容器 + 宿主进程）完全离线
 *   - 在容器内跑包内 start.sh：完整 12 步（静态 Docker 自装 → 离线镜像加载 → 端口处理
 *     → mxcad 探针 → 容器/宿主进程 → 13 项验证）
 *   - start.sh 退出码 0 = 验证通过，本包方可上传 Release；非 0 则 dump 日志后失败
 *   - 另做独立二次探针（curl 健康端点），不信任单一出口
 *
 * 前置：验证机有 docker 且可拉取 debian:bookworm-slim（验证框架自身需要网络；
 * 被验证的部署全程离线）。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BASE_IMAGE = 'debian:bookworm-slim';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PACKAGE = getArg('--package');
const KEEP = args.includes('--keep');

// 挑包正则按形态过滤（ADR-0075 C8）：docker 侧只匹配 -docker- 段，
// 与裸机侧 findDeployPackage（排除 -docker-）对称，避免误挑裸机包。
// 命名契约：cloudcad-deploy-[-private-]{V}-{DATE}-docker-linux-{arch}.tar.gz
const DOCKER_PACKAGE_PATTERN = /^cloudcad-deploy-.*-docker-linux-(x86_64|aarch64)\.tar\.gz$/;
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release');

function findLatestDockerPackage() {
  if (!fs.existsSync(RELEASE_DIR)) return null;
  const candidates = fs
    .readdirSync(RELEASE_DIR)
    .filter((f) => DOCKER_PACKAGE_PATTERN.test(f))
    .sort(); // 名称含 {DATE}，字典序 = 时间序
  return candidates.length ? path.join(RELEASE_DIR, candidates[candidates.length - 1]) : null;
}

function log(msg) {
  console.log(`[verify-docker] ${msg}`);
}
function fail(msg) {
  console.error(`[verify-docker][错误] ${msg}`);
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

/** 极简 .env 解析（与 runtime/scripts/lib/env.js 同口径：剥引号、跳注释） */
function parseEnvSimple(filePath) {
  const result = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.substring(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    result[t.substring(0, i).trim()] = v;
  }
  return result;
}

let containerName = null;
let tmpDir = null;

function cleanup() {
  if (containerName && !KEEP) {
    run('docker', ['rm', '-f', containerName], { capture: true });
    containerName = null;
  }
  if (tmpDir && !KEEP) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

process.on('exit', () => {
  if (containerName && !KEEP) {
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  }
});

async function main() {
  // --package 缺省时挑 release/ 下最新 docker 包（只匹配 -docker-，C8）
  let packagePath;
  if (PACKAGE) {
    if (!fs.existsSync(PACKAGE)) {
      fail(`包不存在: ${PACKAGE}`);
    }
    packagePath = path.resolve(PACKAGE);
  } else {
    packagePath = findLatestDockerPackage();
    if (!packagePath) {
      fail('用法: node scripts/verify-linux-docker-deploy.js [--package <tar.gz>] [--keep]（release/ 下无 docker 包可挑）');
    }
    log(`未指定 --package，挑最新 docker 包: ${packagePath}`);
  }
  log(`验证包: ${packagePath}`);

  // 1. docker 可用
  const dv = run('docker', ['version', '--format', '{{.Server.Version}}'], { capture: true });
  if (dv.status !== 0) fail(`docker 不可用：${dv.stderr}`);
  log(`docker ${dv.stdout.trim()}`);

  // 2. 外层基础镜像（glibc 用户态）
  const hasBase = run('docker', ['image', 'inspect', BASE_IMAGE], { capture: true });
  if (hasBase.status !== 0) {
    log(`拉取外层基础镜像 ${BASE_IMAGE}...`);
    const pull = run('docker', ['pull', BASE_IMAGE], { timeoutMs: 15 * 60000 });
    if (pull.status !== 0) fail(`拉取 ${BASE_IMAGE} 失败（验证机需可访问 Docker Hub）`);
  }

  // 3. 解压包
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcad-docker-verify-'));
  const pkgDir = path.join(tmpDir, 'pkg');
  fs.mkdirSync(pkgDir, { recursive: true });
  log('解压部署包...');
  const extract = run('tar', ['-xzf', packagePath, '-C', pkgDir]);
  if (extract.status !== 0) fail('解压失败');
  // tar 顶层是包目录
  const entries = fs.readdirSync(pkgDir);
  const rootDir = entries.length === 1 && fs.statSync(path.join(pkgDir, entries[0])).isDirectory() ? path.join(pkgDir, entries[0]) : pkgDir;
  for (const required of ['start.sh', 'stop.sh', 'docker-compose.yml', '.env.example', 'images', 'docker', 'runtime', 'packages']) {
    if (!fs.existsSync(path.join(rootDir, required))) fail(`包内缺少: ${required}/`);
  }
  log(`包根: ${rootDir}`);

  // 4. DinD 断网运行 start.sh（完整 12 步，含包内 13 项验证）
  // 容器常驻（tail -f 保活）：start.sh 在容器内后台跑，退出码落 /tmp/start.exit；
  // 跑完后容器还活着，独立二次探针（docker exec）才有目标
  containerName = `cloudcad-verify-${crypto.randomBytes(3).toString('hex')}`;
  log(`启动断网验证容器（--privileged --network none）...`);
  const up = run(
    'docker',
    [
      'run',
      '-d',
      '--name',
      containerName,
      '--privileged',
      '--network',
      'none',
      '-v',
      `${rootDir}:/pkg`,
      BASE_IMAGE,
      'bash',
      '-c',
      'bash /pkg/start.sh > /tmp/start.log 2>&1; echo $? > /tmp/start.exit; tail -f /dev/null',
    ],
    { capture: true, timeoutMs: 60000 }
  );
  if (up.status !== 0) {
    cleanup();
    fail(`验证容器启动失败：${up.stderr}`);
  }

  // 45 分钟总超时：2 核打包机上断网 DinD 验证（dockerd+3 容器+3 宿主进程）CPU 严重受限，
  // 后端多个 Redis/PG 客户端重连要 10+ 分钟才全部就绪（2026-10 实测 12 分钟）；step10 就绪窗口
  // 已放宽到 25 分钟，总超时须覆盖 step10 + 其余步骤 + 13 项验证，留足余量避免慢环境误判超时。
  const deadline = Date.now() + 45 * 60000;
  let exitCode = null;
  while (Date.now() < deadline) {
    const probe = run('docker', ['exec', containerName, 'cat', '/tmp/start.exit'], { capture: true, timeoutMs: 15000 });
    if (probe.status === 0 && probe.stdout.trim()) {
      exitCode = parseInt(probe.stdout.trim(), 10);
      break;
    }
    const alive = run('docker', ['inspect', '-f', '{{.State.Running}}', containerName], { capture: true, timeoutMs: 15000 });
    if (alive.status === 0 && alive.stdout.trim() === 'false') {
      const logs = run('docker', ['logs', '--tail', '80', containerName], { capture: true });
      console.error(logs.stdout || logs.stderr);
      cleanup();
      fail('验证容器意外退出（start.sh 未产生退出码）');
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (exitCode === null) {
    const logs = run('docker', ['logs', '--tail', '80', containerName], { capture: true });
    console.error(logs.stdout || logs.stderr);
    cleanup();
    fail('45 分钟内 start.sh 未结束');
  }
  if (exitCode !== 0) {
    const logs = run('docker', ['exec', containerName, 'tail', '-n', '80', '/tmp/start.log'], { capture: true });
    console.error(logs.stdout || logs.stderr);
    cleanup();
    fail(`start.sh 退出码 ${exitCode}，断网验证失败，本包不得上传 Release`);
  }
  log('start.sh 全流程通过（含包内 13 项验证）');

  // 5. 独立二次探针：直接探测健康端点（端口读包内 .env，start.sh 已生成）
  const env = parseEnvSimple(path.join(rootDir, '.env'));
  // 纯 bash /dev/tcp 原始 HTTP 探针：外层容器是 debian:bookworm-slim（无 curl/wget，
  // --network none 下 apt 也装不了），旧版 curl 探针在任何机器上都必失败（2026-10 暴露）。
  // /dev/tcp 是 bash 内建，零依赖；且不走包内 node，与包内 13 项验证（node 实现）保持独立。
  // 15s 读超时：慢环境（2 核断网 DinD）下 /api/health/live 要等 redis.ping()+db healthCheck
  // 完成才响应（30s+ 量级）；此时 start.sh 已退出 0（包内验证已过），实际响应远快于 15s。
  // 「后端 ready」用 /api/health/public（db+storage 均健康→200，任一不可用→503）；
  // 后端无 /api/health/ready 端点（health.controller 只有 live/public/full/db/storage）。
  // 全部探针期望 200（live 恒 200；public/前端/运维/转换 健康即 200）。
  const httpProbe = (port, urlPath) =>
    `( exec 3<>/dev/tcp/127.0.0.1/${port} && ` +
    `printf 'GET ${urlPath} HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nConnection: close\\r\\n\\r\\n' >&3 && ` +
    `IFS= read -r -t 15 line <&3 && ` +
    `case "$line" in *" 200 "*) exit 0;; *) echo "status line: $line" >&2; exit 1;; esac ) || exit 1`;
  const probes = [
    [`后端 live`, httpProbe(env.PORT || 3001, '/api/health/live')],
    [`后端 ready`, httpProbe(env.PORT || 3001, '/api/health/public')],
    [`前端`, httpProbe(env.FRONTEND_PORT || 8000, '/')],
    [`运维中心`, httpProbe(env.CONFIG_SERVICE_PORT || 3002, '/')],
    [`转换服务`, httpProbe(env.CONVERSION_SERVICE_PORT || 3100, '/health')],
  ];
  for (const [name, cmd] of probes) {
    const res = run('docker', ['exec', containerName, 'bash', '-c', cmd], { capture: true, timeoutMs: 30000 });
    if (res.status !== 0) {
      cleanup();
      fail(`二次探针失败: ${name}（${res.stderr || res.stdout}）`);
    }
    log(`✓ ${name}`);
  }

  cleanup();
  log('\n断网验证通过：本包可上传 Release');
}

main().catch((err) => fail(err.stack || err.message));
