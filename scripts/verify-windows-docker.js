#!/usr/bin/env node
/**
 * @fileoverview Docker 部署包（Windows 宿主）验证脚本（ADR-0075 #444 / ADR-0059 模式）
 *
 * 用法: node scripts/verify-windows-docker.js [--package <.7z>] [--keep]
 *
 * 原理（与 verify-linux-docker-deploy.js 的分工，C8：按形态保留 verify 脚本）：
 *   - Linux 宿主包能整包塞进 DinD 容器（--privileged --network none），断网是物理隔离；
 *   - Windows 宿主包的部署横跨「宿主进程（协同/转换）+ Docker Desktop WSL2 VM（app 容器）」，
 *     无法整体塞进一个 --network none 容器，断网隔离在 Windows 上不可行。
 *   - 故本脚本的门禁 = 完整 start.bat E2E（12 步编排含包内 13 项验证：物料自足断言、
 *     端口处理、mxcad 真实转换探针、容器/宿主进程、健康检查）+ 独立二次探针（宿主 node
 *     http 直探健康端点，不走包内 node）+ stop.bat 干净停止。
 *   - 「离线」属性由包设计保证：start 全程零下载（node/mxcad/镜像全在包内，Docker Desktop
 *     是目标机前置而非包依赖），start 的 12 步检查即自足性断言。
 *
 * 前置：Windows x64 + Docker Desktop（**Linux 容器模式**——app 镜像是 linux 镜像）+ 7-Zip。
 * 任一前置缺失即明确报错（非静默跳过，与 verify-windows-deploy.js 同约定）。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PACKAGE = getArg('--package');
const KEEP = args.includes('--keep');

// 挑包正则按形态过滤（ADR-0075 C8）：docker windows 侧只匹配 -docker- 段，
// 与裸机侧 findDeployPackage（排除 -docker-）对称，避免误挑裸机 windows 包。
// 命名契约：cloudcad-deploy-[-private-]{V}-{DATE}-docker-windows-x86_64.7z
const WINDOWS_DOCKER_PACKAGE_PATTERN = /^cloudcad-deploy-.*-docker-windows-x86_64\.7z$/;
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release');

function findLatestWindowsDockerPackage() {
  if (!fs.existsSync(RELEASE_DIR)) return null;
  const candidates = fs
    .readdirSync(RELEASE_DIR)
    .filter((f) => WINDOWS_DOCKER_PACKAGE_PATTERN.test(f))
    .sort(); // 名称含 {DATE}，字典序 = 时间序
  return candidates.length ? path.join(RELEASE_DIR, candidates[candidates.length - 1]) : null;
}

function log(msg) {
  console.log(`[verify-windows-docker] ${msg}`);
}
function fail(msg) {
  console.error(`[verify-windows-docker][错误] ${msg}`);
  process.exit(1);
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

/** 宿主侧 HTTP 探针（宿主 node，独立于包内 node；期望 200） */
function httpProbe(port, urlPath, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode === 200, status: res.statusCode });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 'timeout' });
    });
    req.on('error', (e) => resolve({ ok: false, status: e.code || e.message }));
  });
}

/**
 * 跑包内 .bat 入口（cmd /c）：stdin 接 NUL 使尾部 `pause` 立即返回（CI/非交互环境
 * 无按键可等）；stdout/stderr 实时透传 + 环形缓冲（失败时 dump 尾部）。
 * @returns {Promise<{code: number|null, tail: string}>} code=null 表示超时
 */
function runBat(batPath, deadlineMs) {
  return new Promise((resolve) => {
    const child = spawn('cmd', ['/c', batPath], {
      cwd: path.dirname(batPath),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const buf = [];
    const push = (chunk) => {
      process.stdout.write(chunk);
      buf.push(chunk);
      if (buf.length > 400) buf.shift();
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: null, tail: buf.join('') });
    }, deadlineMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, tail: buf.join('') + `\n[spawn 错误] ${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, tail: buf.join('') });
    });
  });
}

let tmpDir = null;

function cleanup() {
  if (tmpDir && !KEEP) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // best-effort：验证期间部署进程占用包内文件时删除可能 EBUSY；不影响验证结论
      log(`警告：临时目录清理失败（${e.message}），请手动删除：${tmpDir}`);
    }
  }
}

async function main() {
  // 1. 前置门禁（明确报错，非静默跳过）
  if (process.platform !== 'win32') {
    fail(`Windows 宿主包验证须在 Windows 机器上运行（当前 ${process.platform}）`);
  }
  const dv = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
  if (dv.status !== 0) {
    fail(`docker 不可用：${dv.stderr || dv.stdout}（Windows 宿主包依赖 Docker Desktop；未安装时按包内 部署说明.txt 指引安装）`);
  }
  log(`docker ${dv.stdout.trim()}`);
  // app 镜像是 linux 镜像：Docker Desktop 必须处于 Linux 容器模式
  const ostype = spawnSync('docker', ['info', '--format', '{{.OSType}}'], { encoding: 'utf8' });
  if (ostype.status !== 0 || ostype.stdout.trim() !== 'linux') {
    fail(
      `Docker 当前为 ${ostype.stdout.trim() || '未知'} 容器模式，本包需要 Linux 容器模式：` +
        'Docker Desktop → Settings → General → 取消勾选 Use Windows containers → Restart Docker'
    );
  }
  const { find7z } = require(path.join(PROJECT_ROOT, 'scripts', 'pack-linux-docker.js'));
  const sevenZip = find7z();
  if (!sevenZip) fail('未找到 7-Zip：安装 7-Zip（或把 7z.exe 放入 PATH）');

  // 2. 挑包（--package 缺省时挑 release/ 下最新 docker windows 包，C8）
  let packagePath;
  if (PACKAGE) {
    if (!fs.existsSync(PACKAGE)) fail(`包不存在: ${PACKAGE}`);
    packagePath = path.resolve(PACKAGE);
  } else {
    packagePath = findLatestWindowsDockerPackage();
    if (!packagePath) {
      fail('用法: node scripts/verify-windows-docker.js [--package <.7z>] [--keep]（release/ 下无 docker windows 包可挑）');
    }
    log(`未指定 --package，挑最新 docker windows 包: ${packagePath}`);
  }
  log(`验证包: ${packagePath}`);

  // 3. 解压
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcad-docker-win-verify-'));
  const pkgDir = path.join(tmpDir, 'pkg');
  fs.mkdirSync(pkgDir, { recursive: true });
  log('解压部署包（7z）...');
  const extract = spawnSync(sevenZip, ['x', '-y', '-o' + pkgDir, packagePath], { encoding: 'utf8' });
  if (extract.status !== 0 && extract.status !== 1) fail(`解压失败（7z 退出码 ${extract.status}）`);
  // 7z 顶层是包目录
  const entries = fs.readdirSync(pkgDir);
  const rootDir =
    entries.length === 1 && fs.statSync(path.join(pkgDir, entries[0])).isDirectory() ? path.join(pkgDir, entries[0]) : pkgDir;
  for (const required of [
    'start.bat',
    'stop.bat',
    'docker-compose.windows.yml',
    '.env.example',
    'images',
    path.join('runtime', 'windows', 'node'),
    path.join('runtime', 'windows', 'mxcad'),
    path.join('runtime', 'docker-runtime'),
    path.join('runtime', 'scripts'),
    'packages',
    'node_modules',
  ]) {
    if (!fs.existsSync(path.join(rootDir, required))) fail(`包内缺少: ${required}/`);
  }
  log(`包根: ${rootDir}`);

  // 4. start.bat 完整 E2E（12 步编排 + 包内 13 项验证）
  // 45 分钟总超时：与 verify-linux-docker-deploy.js 同量级（镜像加载 + 3 容器 + 宿主进程
  // + mxcad 探针 + 13 项验证；CI 4 核 runner 通常 10-25 分钟）
  log('运行 start.bat（完整启动编排 + 包内验证）...');
  const startRes = await runBat(path.join(rootDir, 'start.bat'), 45 * 60000);
  if (startRes.code === null) {
    console.error(startRes.tail.split('\n').slice(-80).join('\n'));
    // 超时 kill 只杀 cmd 父进程，孙进程（node cli.js 拉起的容器/宿主进程）会残留：
    // best-effort 跑 stop.bat 清理部署，避免验证失败后机器上留下半启动的部署
    log('start 超时，尝试清理部署（stop.bat）...');
    await runBat(path.join(rootDir, 'stop.bat'), 10 * 60000);
    cleanup();
    fail('45 分钟内 start.bat 未结束');
  }
  if (startRes.code !== 0) {
    console.error(startRes.tail.split('\n').slice(-80).join('\n'));
    cleanup();
    fail(`start.bat 退出码 ${startRes.code}，验证失败，本包不得上传 Release`);
  }
  log('start.bat 全流程通过（含包内 13 项验证）');

  // 5. 独立二次探针：宿主 node 直探健康端点（端口读包内 .env，start 已生成）
  const env = parseEnvSimple(path.join(rootDir, '.env'));
  const probes = [
    ['后端 live', env.PORT || 3001, '/api/health/live'],
    ['后端 ready', env.PORT || 3001, '/api/health/public'],
    ['前端', env.FRONTEND_PORT || 8000, '/'],
    ['运维中心', env.CONFIG_SERVICE_PORT || 3002, '/'],
    ['转换服务', env.CONVERSION_SERVICE_PORT || 3100, '/health'],
  ];
  for (const [name, port, urlPath] of probes) {
    const r = await httpProbe(Number(port), urlPath);
    if (!r.ok) {
      cleanup();
      fail(`二次探针失败: ${name}（127.0.0.1:${port}${urlPath} → ${r.status}）`);
    }
    log(`✓ ${name}`);
  }

  // 6. stop.bat 干净停止
  log('运行 stop.bat（验证干净停止）...');
  const stopRes = await runBat(path.join(rootDir, 'stop.bat'), 15 * 60000);
  if (stopRes.code === null) {
    console.error(stopRes.tail.split('\n').slice(-40).join('\n'));
    cleanup();
    fail('15 分钟内 stop.bat 未结束');
  }
  if (stopRes.code !== 0) {
    console.error(stopRes.tail.split('\n').slice(-40).join('\n'));
    cleanup();
    fail(`stop.bat 退出码 ${stopRes.code}，停止不干净`);
  }
  log('✓ stop.bat 干净停止');

  cleanup();
  log('\n验证通过：本包可上传 Release');
}

if (require.main === module) {
  main().catch((err) => fail(err.stack || err.message));
}

module.exports = {
  WINDOWS_DOCKER_PACKAGE_PATTERN,
  findLatestWindowsDockerPackage,
  parseEnvSimple,
};
