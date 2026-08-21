/**
 * 重建 CloudCAD 离线运行时 node 工具依赖（打包机专用，需联网）
 *
 * 背景：
 *   runtime/windows/node 是随离线部署包分发的便携 Node 运行时，内含
 *   pnpm/pm2/npm/corepack。它的 node_modules 是打包机本地手工装的，一旦
 *   混入垃圾（如 IDE 塞进的 @tencent-ai 缓存）或版本漂移，打出的部署包就
 *   带着脏的/残缺的工具，客户机离线装依赖时对不上。
 *
 * 本脚本用 package.json + package-lock.json 作为唯一事实源，通过
 * `npm ci` 严格还原 node_modules（npm ci 会先清空再按 lockfile 精确安装，
 * 天然清除一切未声明的垃圾依赖），并清理顶层 AI 工具脚本。
 *
 * 使用方式（打包机）：
 *   node scripts/reinstall-node-tools.js
 *   或:  pnpm reinstall:node-tools
 *
 * 注意：
 *   - 仅适用于 Windows 打包机（Windows node 目录结构）。Linux 运行时由
 *     extract-linux-runtime.js 在容器内生成，不受此脚本管理。
 *   - 需要联网访问 npm registry（拉取 pnpm/pm2 等依赖 tarball）。
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const NODE_DIR = path.join(PROJECT_ROOT, 'runtime', 'windows', 'node');
const PACKAGE_JSON = path.join(NODE_DIR, 'package.json');
const LOCKFILE = path.join(NODE_DIR, 'package-lock.json');

// 顶层 AI 工具脚本（.cmd/.ps1/无后缀）—— 不在任何 lockfile 中，属 IDE 缓存垃圾
const TOP_AI_TOOLS = [
  'cbc',
  'cbc-prewarm',
  'codebuddy',
  'codebuddy-code',
  'iflow',
  'ngrok',
  'qodercli',
  'qwen',
];

function log(msg) {
  console.log(`[Reinstall-Node-Tools] ${msg}`);
}

function logStep(step, total, msg) {
  log(`[${step}/${total}] ${msg}`);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  function scan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) scan(full);
      else total += fs.statSync(full).size;
    }
  }
  scan(dir);
  return total;
}

// 清理顶层 AI 工具脚本
function cleanTopLevelAITools() {
  let count = 0;
  for (const t of TOP_AI_TOOLS) {
    for (const ext of ['', '.cmd', '.ps1']) {
      const p = path.join(NODE_DIR, t + ext);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { force: true });
        count++;
        log(`  删除 ${t + ext || t}`);
      }
    }
  }
  return count;
}

// 校验 pnpm / pm2 可运行
function verifyTools(nodeExe) {
  const checks = [
    ['pnpm', path.join(NODE_DIR, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'), ['--version']],
    ['pm2', path.join(NODE_DIR, 'node_modules', 'pm2', 'bin', 'pm2'), ['--version']],
  ];
  let ok = true;
  for (const [name, js, args] of checks) {
    const r = spawnSync(nodeExe, [js, ...args], { encoding: 'utf8' });
    const ver = (r.stdout || '').trim().split('\n')[0];
    if (r.status === 0 && ver) {
      log(`  ✓ ${name} 版本: ${ver}`);
    } else {
      log(`  ✗ ${name} 校验失败: ${(r.stderr || '').trim()}`);
      ok = false;
    }
  }
  return ok;
}

function main() {
  const total = 3;

  log('============================================');
  log('重建 CloudCAD 离线运行时 node 工具依赖');
  log(`node 目录: ${NODE_DIR}`);
  log('============================================');
  log('');

  // 前置校验
  if (!fs.existsSync(PACKAGE_JSON)) {
    log(`错误: 缺少 ${path.relative(PROJECT_ROOT, PACKAGE_JSON)}`);
    process.exit(1);
  }
  if (!fs.existsSync(LOCKFILE)) {
    log(`错误: 缺少 ${path.relative(PROJECT_ROOT, LOCKFILE)}（请先在联网环境生成）`);
    process.exit(1);
  }
  if (fs.existsSync(path.join(NODE_DIR, 'node.exe'))) {
    log('  检测到已有 node 目录（将仅重建 node_modules，保留 node.exe）。');
  }

  const beforeSize = getDirSize(NODE_DIR);
  log(`重建前 node 目录体积: ${formatSize(beforeSize)}`);
  log('');

  // 步骤 1/3：清理顶层 AI 工具脚本
  logStep(1, total, '清理顶层 AI 工具脚本（codebuddy/qwen/qodercli/iflow/ngrok/cbc）...');
  const removed = cleanTopLevelAITools();
  if (removed > 0) {
    log(`  已删除 ${removed} 个 AI 工具脚本。`);
  } else {
    log('  无待清理的 AI 工具脚本。');
  }
  log('');

  // 步骤 2/3：npm ci 严格按 lockfile 重建 node_modules
  logStep(2, total, '运行 npm ci（严格按 package-lock.json 重建 node_modules）...');
  log('  npm ci 会先清空 node_modules 再精确安装，清除一切未声明的垃圾依赖。');
  log('  需要联网下载 pnpm/pm2/npm/corepack 依赖。');
  try {
    execSync('npm ci --no-audit --no-fund', {
      cwd: NODE_DIR,
      stdio: 'inherit',
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    });
  } catch (e) {
    log(`错误: npm ci 失败（${e.message}）。请检查网络与 lockfile 完整性。`);
    process.exit(1);
  }
  log('  npm ci 完成。');
  log('');

  // 步骤 3/3：校验工具可运行
  logStep(3, total, '校验 pnpm / pm2 可运行...');
  const nodeExe = path.join(NODE_DIR, 'node.exe');
  if (!verifyTools(nodeExe)) {
    log('错误: 工具校验失败，请检查 node_modules 完整性。');
    process.exit(1);
  }
  log('');

  const afterSize = getDirSize(NODE_DIR);
  log('============================================');
  log('重建完成');
  log(`重建后 node 目录体积: ${formatSize(afterSize)}（前 ${formatSize(beforeSize)}）`);
  log('现在可以执行 pnpm pack:offline:win 打包干净的部署包。');
  log('============================================');
}

main();
