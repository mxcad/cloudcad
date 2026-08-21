/**
 * 产品二进制（mxcad 图纸转换器 / mxversion 版本工具）—— 哈希去重上传脚本
 *
 * 功能：
 *   1. 遍历本地 ./mxcad-dist/<platform>-<arch>/ 下的已打包产物
 *      （支持 mxcad.* 与可选 mxversion.*，Windows 平台）
 *   2. 计算每个文件 SHA256 哈希
 *   3. 查询 GitHub Release 是否已存在同哈希附件：
 *        存在  → 跳过上传（复用线上已有，零重复）
 *        不存在 → 上传，附件名携带哈希后缀
 *   4. 生成 ./mxcad-dist/manifest.json（平台×架构×组件 → 哈希），供 release.yml 引用
 *
 * 使用方式：
 *   node scripts/upload-mxcad.js [--repo mxcad/cloudcad] [--tag mxcad-stable]
 *   # 依赖 gh CLI 已登录（gh auth login）
 *
 * 目录约定（mxcad-dist/）：
 *   linux-x86_64/  mxcad.tar.gz
 *   linux-aarch64/ mxcad.tar.gz
 *   linux-armv7l/  mxcad.tar.gz
 *   windows-x64/   mxcad.zip  (+ mxversion.zip，可选)
 *
 * 说明：
 *   - mxcad / mxversion 是公司核心产品，本地已打包好的二进制按平台×架构放入 mxcad-dist/
 *   - 采用内容寻址（SHA256 哈希）标识，内容不变则永不重复上传
 *   - 默认上传到独立 tag mxcad-stable 的 Release，与业务版本解耦
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'mxcad-dist');
const MANIFEST_PATH = path.join(DIST_DIR, 'manifest.json');

/**
 * 自动发现 mxcad-dist/ 下的目标目录与组件。
 * 目录结构约定：
 *   mxcad-dist/<platform>-<arch>/<component>.<ext>
 *   例如：mxcad-dist/linux-x86_64/mxcad.tar.gz
 *         mxcad-dist/windows-x64/mxversion.zip
 * 脚本遍历目录自动发现，不硬编码平台/架构/组件清单。
 *
 * @returns {Array<{platform:string; arch:string; dir:string}>}
 */
function discoverTargets() {
  if (!fs.existsSync(DIST_DIR)) return [];
  return fs
    .readdirSync(DIST_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '.' && e.name !== '..')
    .map((e) => {
      // 目录名约定：<platform>-<arch>，如 linux-x86_64、windows-x64
      const dash = e.name.lastIndexOf('-');
      const platform = dash > 0 ? e.name.slice(0, dash) : e.name;
      const arch = dash > 0 ? e.name.slice(dash + 1) : '';
      return { platform, arch, dir: path.join(DIST_DIR, e.name) };
    });
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    repo: 'mxcad/cloudcad',
    tag: 'mxcad-stable',
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo' && args[i + 1]) opts.repo = args[++i];
    else if (args[i] === '--tag' && args[i + 1]) opts.tag = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(
        [
          '用法: node scripts/upload-mxcad.js [--repo mxcad/cloudcad] [--tag mxcad-stable]',
          '  --repo  目标仓库（默认 mxcad/cloudcad）',
          '  --tag   mxcad Release 标签（默认 mxcad-stable）',
        ].join('\n')
      );
      process.exit(0);
    }
  }
  return opts;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const buf = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(filePath, 'r');
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.slice(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function runGh(args) {
  const stdout = execSync(`gh ${args.join(' ')}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return stdout.trim();
}

function ghApi(urlPath, method = 'GET', body = null) {
  const flags = ['api', urlPath, '--method', method];
  if (body) {
    const tmp = path.join(PROJECT_ROOT, 'mxcad-dist', '.gh-body.json');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(body), 'utf8');
    flags.push('--input', tmp);
  }
  const stdout = execSync(`gh ${flags.join(' ')}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return stdout.trim();
}

/** 确保 mxcad Release 存在，不存在则创建（草稿） */
function ensureRelease(opts) {
  try {
    ghApi(`/repos/${opts.repo}/releases/tags/${opts.tag}`);
  } catch (e) {
    console.log(`创建 mxcad Release tag=${opts.tag} ...`);
    ghApi(
      `/repos/${opts.repo}/releases`,
      'POST',
      {
        tag_name: opts.tag,
        name: `mxcad 图纸转换器 (${opts.tag})`,
        body: 'mxcad 图纸转换器产物，按内容哈希（SHA256 前 8 位）标识，供 release.yml 下载。',
        draft: false,
      }
    );
  }
}

/**
 * 列出 mxcad Release 所有资产的文件名。
 * 注意：GitHub 的 tag-name 版 assets 端点（/releases/tags/{tag}/assets）并非合法端点，
 * 需通过 release 对象（/releases/tags/{tag}）返回的 assets 字段读取。
 */
function listAssetNames(opts) {
  try {
    const out = ghApi(`/repos/${opts.repo}/releases/tags/${opts.tag}`);
    const release = JSON.parse(out);
    if (release && Array.isArray(release.assets)) {
      return release.assets.map((a) => a.name);
    }
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * 生成平台产物文件名（与 CI 下载约定一致）
 * <component>-<platform>-<arch>-<hash8><ext>
 *   例如：mxcad-linux-x86_64-a3f9e2c4.tar.gz、mxversion-windows-x64-5f1d9a07.zip
 */
function makeAssetName(component, platform, arch, hash8, ext) {
  return `${component}-${platform}-${arch}-${hash8}${ext}`;
}

async function main() {
  const opts = parseArgs();

  if (!fs.existsSync(DIST_DIR)) {
    console.error(`错误: 目录不存在 ${DIST_DIR}`);
    console.error('请将各平台打包好的 mxcad 产物放入 mxcad-dist/<platform>-<arch>/');
    process.exit(1);
  }

  // 校验 gh 已登录
  try {
    runGh(['auth', 'status']);
  } catch (e) {
    console.error('错误: gh CLI 未登录，请先运行 gh auth login');
    process.exit(1);
  }

  ensureRelease(opts);
  const existingNames = new Set(listAssetNames(opts));

  const manifest = {};
  const uploads = [];

  // 自动发现 mxcad-dist/ 下所有目标目录
  const targets = discoverTargets();
  if (targets.length === 0) {
    console.error('错误: mxcad-dist/ 下未发现任何 <platform>-<arch>/ 目录');
    console.error('请将产物放入 mxcad-dist/<platform>-<arch>/，如 mxcad-dist/windows-x64/mxcad.zip');
    process.exit(1);
  }

  for (const t of targets) {
    const entries = fs.readdirSync(t.dir, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile() && !e.name.startsWith('.'));
    if (files.length === 0) {
      console.log(`跳过（空目录）: ${t.platform}-${t.arch}`);
      continue;
    }

    // 目录内每个非隐藏文件作为一个组件产物：
    // 文件名 <component>.<ext>（如 mxcad.tar.gz、mxversion.zip）
    // 组件名 = 第一个点之前；扩展名 = 第一个点及之后（完整保留，如 .tar.gz）
    for (const file of files) {
      const baseName = file.name;
      const dot = baseName.indexOf('.');
      const component = dot > 0 ? baseName.slice(0, dot) : baseName;
      const filePath = path.join(t.dir, baseName);
      const hash = sha256File(filePath);
      const hash8 = hash.slice(0, 8);
      const ext = dot > 0 ? baseName.slice(dot) : '.tar.gz';
      const assetName = makeAssetName(component, t.platform, t.arch, hash8, ext);

      manifest[`${component}-${t.platform}-${t.arch}`] = {
        component,
        platform: t.platform,
        arch: t.arch,
        hash,
        asset: assetName,
      };

      if (existingNames.has(assetName)) {
        console.log(`✓ 复用线上（已存在）: ${assetName}`);
      } else {
        uploads.push({ assetName, filePath });
      }
    }
  }

  // 上传缺失的产物（gh release upload 无法重命名资产，
  // 因此先在本地用目标 assetName 复制临时副本再上传，不动用户原始产物）
  for (const u of uploads) {
    const tmpCopy = path.join(DIST_DIR, u.assetName);
    try {
      fs.copyFileSync(u.filePath, tmpCopy);
      console.log(`上传: ${u.assetName} ...`);
      runGh([
        'release', 'upload', opts.tag, tmpCopy,
        '--repo', opts.repo, '--clobber',
      ]);
      console.log(`✓ 已上传: ${u.assetName}`);
    } catch (err) {
      console.error(`✗ 上传失败 ${u.assetName}: ${err.message}`);
    } finally {
      if (fs.existsSync(tmpCopy)) fs.unlinkSync(tmpCopy);
    }
  }

  // 写入 manifest.json
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nmanifest 已写入: ${MANIFEST_PATH}`);
  console.log('请将 manifest.json 提交进 git，release.yml 将据此下载对应哈希的 mxcad。');

  const reused = uploads.length === 0 ? '全部复用线上，零上传' : `${uploads.length} 个新增上传`;
  console.log(`\n完成：${reused}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
