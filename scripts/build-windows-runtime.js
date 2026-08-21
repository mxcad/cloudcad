/**
 * Windows 运行时标准组件构建脚本
 *
 * 功能：从官方源下载 Windows 运行时标准组件并解压到 runtime/windows/：
 *   - node        官方 nodejs.org
 *   - postgresql  企业版 PostgreSQL 二进制包
 *   - redis       microsoftarchive/redis 官方 Release
 *
 * mxcad / mxversion 为产品二进制，由内部编译后经 scripts/upload-mxcad.js
 * 上传到 Release，再由 release.yml 下载合并，本脚本不处理。
 *
 * 使用方式（仅在 Windows 环境 / GitHub windows runner）：
 *   node scripts/build-windows-runtime.js
 *
 * 说明：
 *   - 幂等：目标组件已存在则跳过（--force 可强制重下）
 *   - 仅负责标准组件，product 二进制（mxcad/mxversion）由 upload-mxcad.js 处理
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_WIN_DIR = path.join(PROJECT_ROOT, 'runtime', 'windows');
const CACHE_DIR = path.join(PROJECT_ROOT, 'runtime', 'cache');

// 版本常量（与下载地址清单 download_address.txt 保持一致）
const VERSIONS = {
  node: '20.19.5',
  postgres: '15',
  redis: '5.0.14.1',
};

// 官方下载源
const SOURCES = {
  node: `https://nodejs.org/dist/v${VERSIONS.node}/node-v${VERSIONS.node}-win-x64.zip`,
  postgres:
    `https://get.enterprisedb.com/postgresql/postgresql-${VERSIONS.postgres}-1-windows-x64-binaries.zip`,
  redis:
    `https://github.com/microsoftarchive/redis/releases/download/win-${VERSIONS.redis}/Redis-x64-${VERSIONS.redis}.zip`,
};

const FORCE = process.argv.includes('--force');

function log(msg) {
  console.log(`[Build-Win-Runtime] ${msg}`);
}
function error(msg) {
  console.error(`[Build-Win-Runtime] ERROR: ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function download(url, destPath) {
  log(`下载: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status} ${res.statusText}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  log(`  → ${destPath} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}

function extractZip(zipPath, targetDir) {
  ensureDir(targetDir);
  if (os.platform() === 'win32') {
    // Windows 用 PowerShell Expand-Archive
    const script =
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force`;
    execSync(`powershell -NoProfile -Command "${script}"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -o "${zipPath}" -d "${targetDir}"`, { stdio: 'inherit' });
  }
}

/**
 * 把解压出的带版本前缀目录内容提升到目标目录（如 node-v20.19.5-win-x64/ 下的内容 → node/）
 */
function flattenVersionDir(extractDir, prefixPattern, targetDir) {
  ensureDir(targetDir);
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  const versionDirs = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith(prefixPattern)
  );
  if (versionDirs.length === 0) {
    // 无版本前缀目录，直接把 extractDir 内容作为目标
    copyDirContents(extractDir, targetDir);
    return;
  }
  for (const vd of versionDirs) {
    copyDirContents(path.join(extractDir, vd.name), targetDir);
  }
}

function copyDirContents(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirContents(s, d);
    } else {
      ensureDir(path.dirname(d));
      fs.copyFileSync(s, d);
    }
  }
}

function extractComponent(name, zipPath, extractDir, targetDir, prefix) {
  extractZip(zipPath, extractDir);
  flattenVersionDir(extractDir, prefix, targetDir);
}

async function buildComponent(name) {
  const targetDir = path.join(RUNTIME_WIN_DIR, name);
  const marker = path.join(targetDir, '.built');
  if (!FORCE && fs.existsSync(marker)) {
    log(`跳过（已构建）: ${name}`);
    return;
  }
  if (!SOURCES[name]) {
    error(`未知组件: ${name}`);
    return;
  }
  ensureDir(RUNTIME_WIN_DIR);
  ensureDir(CACHE_DIR);
  const zipPath = path.join(CACHE_DIR, `${name}.zip`);
  const extractDir = path.join(CACHE_DIR, `${name}-extract`);

  try {
    await download(SOURCES[name], zipPath);
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    extractComponent(name, zipPath, extractDir, targetDir, {
      node: 'node-v',
      postgresql: 'pgsql',
      redis: 'Redis',
    }[name]);
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
    log(`✓ ${name} 构建完成: ${targetDir}`);
  } catch (e) {
    error(`${name} 构建失败: ${e.message}`);
  } finally {
    // 清理临时文件
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

async function main() {
  if (os.platform() !== 'win32' && !process.env.CI) {
    log('提示: 推荐在 Windows 环境或 GitHub windows runner 运行（当前平台: ' + os.platform() + '）');
  }
  const components = ['node', 'postgresql', 'redis'];
  for (const c of components) {
    await buildComponent(c);
  }
  log('全部标准组件构建完成。');
  log('注意: mxcad / mxversion 为产品二进制，需另行运行 scripts/upload-mxcad.js 上传后由 release.yml 下载合并。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
