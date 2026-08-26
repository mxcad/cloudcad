/**
 * 开发环境运行时自检脚本（package.json preinstall 钩子调用）
 *
 * 功能：
 *   - 检查本平台【产品二进制】是否就绪：
 *       Linux:   runtime/linux/mxcad/           （mxcad 图纸转换器）
 *       Windows: runtime/windows/mxcad/         （mxcad 图纸转换器）
 *                runtime/windows/mxversion/     （mxversion 版本工具）
 *   - 缺失时自动从 GitHub Releases 下载对应平台×架构的产品二进制包
 *   - 幂等：已就绪则直接跳过，零开销，不阻塞日常 pnpm install
 *
 * 使用方式：
 *   node scripts/ensure-runtime.js
 *
 * 说明：
 *   - 仅检查 mxcad / mxversion 这两个【产品二进制】。
 *     node / postgresql / redis / svn 等标准组件，开发环境通常本地已有，
 *     不一定需要离线版本，因此不强制下载。
 *   - postgresql 虽自 2026-08 起登记进 manifest.json（离线打包用，见
 *     build-windows-runtime.js 头注释），但被 DEV_SKIP_COMPONENTS 排除，
 *     开发环境 preinstall 不会下载它。
 *   - 仅用于【开发环境】从源码 clone 后初始化。离线部署包内嵌完整 runtime，
 *     不联网（保持离线纯净，见 docs/git-workflow.md）。
 *   - 下载源可通过环境变量覆盖（私有化部署可指向内网镜像）：
 *       RUNTIME_DOWNLOAD_URL  完整下载基地址（默认 GitHub Releases）
 *       RUNTIME_RELEASE_TAG   mxcad Release 标签（默认 mxcad-stable）
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(PROJECT_ROOT, 'runtime');
const IS_WINDOWS = os.platform() === 'win32';

const RUNTIME_DOWNLOAD_URL = process.env.RUNTIME_DOWNLOAD_URL || '';
const RUNTIME_RELEASE_TAG = process.env.RUNTIME_RELEASE_TAG || 'mxcad-stable';

function log(msg) {
  console.log(`[Ensure-Runtime] ${msg}`);
}
function error(msg) {
  console.error(`[Ensure-Runtime] ERROR: ${msg}`);
}

/**
 * 架构后缀，用于匹配 Release 附件名。
 * 与 scripts/upload-mxcad.js 的命名约定保持一致：
 *   - Windows: x64（mxcad-windows-x64-*）
 *   - Linux:   x86_64 / aarch64 / armv7l（mxcad-linux-<arch>-*）
 */
function getArchSuffix() {
  if (IS_WINDOWS) return 'x64';
  const archMap = { x64: 'x86_64', arm64: 'aarch64', arm: 'armv7l', ia32: 'i686' };
  return archMap[process.arch] || process.arch;
}

/**
 * 目录是否非空
 * @param {string} dir
 * @returns {boolean}
 */
function dirHasContent(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * 开发环境不自动下载的标准组件（即使出现在 manifest.json 中）。
 * postgresql 走产品二进制通道仅为离线打包服务（CI release.yml 下载），
 * 开发环境本地已有 PG，若不排除，preinstall 会在每次 pnpm install 拉 ~300MB 包。
 */
const DEV_SKIP_COMPONENTS = new Set(['postgresql']);

/**
 * 从 manifest.json 自动发现本平台需要就绪的产品二进制。
 * manifest 由 scripts/upload-mxcad.js 生成，包含所有组件×平台×架构条目：
 *   {
 *     "mxcad-linux-x86_64": { component, platform, arch, hash, asset },
 *     "mxversion-windows-x64": { ... },
 *     "postgresql-windows-x64": { ... }   // 打包专用，DEV_SKIP_COMPONENTS 排除
 *   }
 * 脚本按【当前平台×当前架构】过滤，并跳过 DEV_SKIP_COMPONENTS。
 *
 * @returns {Array<{rel:string; component:string; assetPrefix:string}>}
 */
function requiredProductDirs() {
  const arch = getArchSuffix();
  const platform = IS_WINDOWS ? 'windows' : 'linux';
  const prefix = `${platform}-${arch}`;

  const result = [];
  try {
    const manifestPath = path.join(PROJECT_ROOT, 'mxcad-dist', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      for (const key of Object.keys(manifest || {})) {
        const entry = manifest[key];
        if (!entry || entry.platform !== platform || entry.arch !== arch) continue;
        if (DEV_SKIP_COMPONENTS.has(entry.component)) continue;
        result.push({
          rel: path.join('runtime', platform, entry.component),
          component: entry.component,
          assetPrefix: `${entry.component}-${platform}-${arch}-`,
        });
      }
      if (result.length > 0) return result;
    }
  } catch (e) {
    error(`读取 manifest.json 失败: ${e.message}`);
  }

  // 无 manifest 时的兜底：直接扫描 mxcad-dist/<platform>-<arch>/ 目录发现组件
  const distDir = path.join(PROJECT_ROOT, 'mxcad-dist', `${platform}-${arch}`);
  if (fs.existsSync(distDir)) {
    for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
      if (entry.isFile() && !entry.name.startsWith('.')) {
        const dot = entry.name.lastIndexOf('.');
        const component = dot > 0 ? entry.name.slice(0, dot) : entry.name;
        if (DEV_SKIP_COMPONENTS.has(component)) continue;
        result.push({
          rel: path.join('runtime', platform, component),
          component,
          assetPrefix: `${component}-${platform}-${arch}-`,
        });
      }
    }
  }
  return result;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 从 Release 下载并解压某个产品二进制到目标目录
 * @param {string} component  组件名（mxcad / mxversion）
 * @param {string} assetPrefix 附件名前缀
 * @param {string} targetDir   解压目标目录
 * @returns {boolean}
 */
async function downloadProduct(component, assetPrefix, targetDir) {
  const asset = await resolveAssetName(component, assetPrefix);
  if (!asset) return false;

  const baseUrl =
    RUNTIME_DOWNLOAD_URL ||
    `https://github.com/mxcad/cloudcad/releases/download/${RUNTIME_RELEASE_TAG}`;
  const url = `${baseUrl}/${asset}`;

  log(`下载 ${component} (${asset}) 从：`);
  log(`  ${url}`);

  const tmpFile = path.join(PROJECT_ROOT, `${component}-download-${Date.now()}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      error(`下载失败 HTTP ${res.status}: ${url}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpFile, buf);
    log(`已下载 (${(buf.length / 1024 / 1024).toFixed(1)} MB)，解压中...`);

    ensureDir(targetDir);
    const lower = asset.toLowerCase();
    if (lower.endsWith('.zip')) {
      extractZip(tmpFile, targetDir);
    } else if (lower.endsWith('.7z')) {
      extract7z(tmpFile, targetDir);
    } else {
      extractTarGz(tmpFile, targetDir);
    }
    log(`✓ ${component} 就绪: ${targetDir}`);
    return true;
  } catch (e) {
    error(`下载 ${component} 失败: ${e.message}`);
    return false;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

function extractZip(zipPath, targetDir) {
  if (IS_WINDOWS) {
    const script = `Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force`;
    execSync(`powershell -NoProfile -Command "${script}"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -o "${zipPath}" -d "${targetDir}"`, { stdio: 'inherit' });
  }
}

function extract7z(zipPath, targetDir) {
  execSync(`7z x -y "${zipPath}" -o"${targetDir}"`, { stdio: 'inherit' });
}

function extractTarGz(tarPath, targetDir) {
  execSync(`tar -xzf "${tarPath}" -C "${targetDir}"`, { stdio: 'inherit' });
}

/**
 * 解析 Release 中匹配 assetPrefix 的资产名
 * 优先从环境变量 RUNTIME_DOWNLOAD_ASSET 指定，否则查询 GitHub API
 * @returns {Promise<string|null>}
 */
async function resolveAssetName(component, assetPrefix) {
  const forced = process.env[`${component.toUpperCase()}_ASSET`];
  if (forced) return forced;

  // 无 gh CLI 时跳过自动解析，仅提示手动放置
  const baseUrl =
    RUNTIME_DOWNLOAD_URL ||
    `https://github.com/mxcad/cloudcad/releases/download/${RUNTIME_RELEASE_TAG}`;
  // 若用户提供了完整下载基地址（RUNTIME_DOWNLOAD_URL 不含 github.com），
  // 视为内网镜像，无法用 API 解析，返回 null 交由调用方提示。
  if (RUNTIME_DOWNLOAD_URL) return null;

  try {
    const apiUrl = `https://api.github.com/repos/mxcad/cloudcad/releases/tags/${RUNTIME_RELEASE_TAG}/assets`;
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cloudcad-ensure-runtime' },
    });
    if (!res.ok) return null;
    const assets = await res.json();
    const hit = (assets || []).find((a) => a.name.startsWith(assetPrefix));
    return hit ? hit.name : null;
  } catch (e) {
    return null;
  }
}

async function main() {
  const required = requiredProductDirs();
  const missing = [];

  for (const item of required) {
    const abs = path.join(PROJECT_ROOT, item.rel);
    if (dirHasContent(abs)) {
      log(`✓ ${item.component} 已就绪: ${item.rel}`);
    } else {
      missing.push(item);
    }
  }

  if (missing.length === 0) {
    log('✓ 产品二进制全部就绪，无需下载');
    return 0;
  }

  log(`检测到 ${missing.length} 个产品二进制缺失，尝试下载...`);
  let allOk = true;
  for (const item of missing) {
    const abs = path.join(PROJECT_ROOT, item.rel);
    const ok = await downloadProduct(item.component, item.assetPrefix, abs);
    if (!ok) allOk = false;
  }

  if (!allOk) {
    log('');
    log('提示：无法自动获取产品二进制。请通过以下任一方式补齐：');
    log('  1. 解压离线部署包（内嵌完整 mxcad/mxversion）');
    log('  2. 手动将产物放置到 runtime/对应目录');
    log('  3. 设置 RUNTIME_DOWNLOAD_URL 指向可访问的镜像');
    return 1;
  }
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}

module.exports = {
  requiredProductDirs,
  dirHasContent,
  getArchSuffix,
  downloadProduct,
};
