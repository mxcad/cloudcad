/**
 * 整理并打包 mxcad / mxversion 到 mxcad-dist/ 目录（首次发版准备）
 *
 * 从 runtime/ 中现有的产品二进制打包到 upload-mxcad.js 需要的目录结构：
 *   mxcad-dist/
 *   ├── linux-x86_64/mxcad.tar.gz      ← runtime/linux/mxcad/
 *   ├── windows-x64/mxcad.zip          ← runtime/windows/mxcad/（排除 tool/ 与 files 图纸）
 *   └── windows-x64/mxversion.zip      ← runtime/windows/mxversion/
 *
 * 说明：
 *   - 仅首次准备时运行一次。后续 mxcad 有更新时，直接把新产物替换到
 *     mxcad-dist/<platform>-<arch>/ 下同名文件即可（内容变化则哈希变化，自动重传）。
 *   - 遵循 pack-lib/packignore.json 的排除规则：
 *       排除 mxcad/tool/（完全排除）
 *       排除 mxcad/files/ 的图纸 .mxweb（保留空目录）
 *   - 打包后运行 node scripts/upload-mxcad.js 上传到 GitHub Release。
 *
 * 使用方式：
 *   node scripts/prepare-mxcad-dist.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'mxcad-dist');

// 需要排除的目录（相对 mxcad 源目录）—— 与 pack-lib/packignore.json 保持一致
const EXCLUDE_DIRS = ['tool'];
// files 目录保留为空目录（其内 .mxweb 图纸不打包）
const FILES_DIR = 'files';

function log(msg) {
  console.log(`[Prepare-MxCAD] ${msg}`);
}
function error(msg) {
  console.error(`[Prepare-MxCAD] ERROR: ${msg}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 复制目录，支持排除子目录与文件
 * @param {string} src
 * @param {string} dest
 * @param {object} opts { excludeDirs: string[], keepEmptyDirs: string[] }
 */
function copyDir(src, dest, opts = {}) {
  const { excludeDirs = [], keepEmptyDirs = [] } = opts;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue; // 完全排除
      if (keepEmptyDirs.includes(entry.name)) {
        // 只创建空目录，不复制内部文件
        ensureDir(d);
        continue;
      }
      copyDir(s, d, opts);
    } else {
      ensureDir(path.dirname(d));
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * 临时目录打包为 tar.gz / zip
 * @param {string} dir 要打包的目录
 * @param {string} outFile 输出文件
 */
function packDir(dir, outFile) {
  if (outFile.endsWith('.tar.gz')) {
    if (os.platform() === 'win32') {
      // Windows 下用 tar（Win10+ 自带）或 git 的 tar
      execSync(`tar -czf "${outFile}" -C "${path.dirname(dir)}" "${path.basename(dir)}"`, { stdio: 'inherit' });
    } else {
      execSync(`tar -czf "${outFile}" -C "${path.dirname(dir)}" "${path.basename(dir)}"`, { stdio: 'inherit' });
    }
  } else if (outFile.endsWith('.zip')) {
    if (os.platform() === 'win32') {
      // Windows 用 PowerShell Compress-Archive
      const script = `Compress-Archive -Path '${dir}\\*' -DestinationPath '${outFile}' -CompressionLevel Optimal -Force`;
      execSync(`powershell -NoProfile -Command "${script}"`, { stdio: 'inherit' });
    } else {
      execSync(`cd "${path.dirname(dir)}" && zip -r "${outFile}" "${path.basename(dir)}"`, { stdio: 'inherit' });
    }
  } else {
    throw new Error(`不支持的输出格式: ${outFile}`);
  }
}

/**
 * 打包一个组件
 * @param {string} srcDir   源目录（runtime/.../<component>）
 * @param {string} platform linux|windows
 * @param {string} arch     x86_64|x64
 * @param {string} component mxcad|mxversion
 * @param {object} opts
 */
async function prepareComponent(srcDir, platform, arch, component, opts = {}) {
  if (!fs.existsSync(srcDir)) {
    log(`跳过（源目录不存在）: ${srcDir}`);
    return;
  }
  const targetDir = path.join(DIST_DIR, `${platform}-${arch}`);
  ensureDir(targetDir);
  const ext = platform === 'windows' ? '.zip' : '.tar.gz';
  const outFile = path.join(targetDir, `${component}${ext}`);

  log(`打包 ${component} (${platform}-${arch}): ${srcDir}`);

  // 复制到临时目录，应用排除规则
  const tmp = path.join(PROJECT_ROOT, 'mxcad-dist', `.tmp-${component}-${platform}-${arch}`);
  if (fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  copyDir(srcDir, tmp, opts);

  // 打包
  packDir(tmp, outFile);

  // 清理临时目录
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`✓ 已生成: ${outFile}`);
}

async function main() {
  ensureDir(DIST_DIR);

  const platform = os.platform() === 'win32' ? 'windows' : 'linux';
  const archSuffix = os.platform() === 'win32' ? 'x64' : 'x86_64';

  // Linux x86_64 mxcad
  await prepareComponent(
    path.join(PROJECT_ROOT, 'runtime', 'linux', 'mxcad'),
    'linux',
    'x86_64',
    'mxcad',
    { excludeDirs: [], keepEmptyDirs: [] }
  );

  // Windows x64 mxcad（排除 tool/ 与 files 图纸）
  await prepareComponent(
    path.join(PROJECT_ROOT, 'runtime', 'windows', 'mxcad'),
    'windows',
    'x64',
    'mxcad',
    { excludeDirs: EXCLUDE_DIRS, keepEmptyDirs: [FILES_DIR] }
  );

  // Windows x64 mxversion
  await prepareComponent(
    path.join(PROJECT_ROOT, 'runtime', 'windows', 'mxversion'),
    'windows',
    'x64',
    'mxversion',
    { excludeDirs: [], keepEmptyDirs: [] }
  );

  log('');
  log('全部产物已生成到 mxcad-dist/');
  log('下一步运行: node scripts/upload-mxcad.js 上传到 GitHub Release');
  log('');
  log(`提示: 当前平台为 ${platform}-${archSuffix}，若需准备其他平台的产物，请在该平台环境运行本脚本。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
