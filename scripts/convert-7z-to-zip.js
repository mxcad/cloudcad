/**
 * 梦想网页CAD实时协同平台 部署包 7z → zip 转换工具（构建机侧）
 *
 * 背景：Windows 部署包默认用 7z 压缩（lzma2 压缩率高），但目标机若无 7-Zip 无法解压。
 * 本脚本在【构建机】（装有 7-Zip）上把 release/ 里的 .7z 部署包转成标准 .zip，
 * 供没有 7-Zip 的目标机用系统自带解压（Windows 资源管理器）直接解压。
 *
 * 原理：7z 解压 .7z 到临时目录 → archiver 重新打包成 .zip（与 pack-offline.js 的
 * zip 产物同一代码路径，zlib level 9），输出到 .7z 同目录同名 .zip。
 * 注：zip（deflate）压缩率低于 7z（lzma2），产物体积通常更大，属正常现象。
 *
 * 使用方式：
 *   node scripts/convert-7z-to-zip.js              # 菜单选择 release/ 下的 .7z
 *   node scripts/convert-7z-to-zip.js <file.7z>    # 直接转换指定 .7z（可相对/绝对路径）
 *   或 pnpm convert:7z2zip
 *
 * 依赖：7-Zip（解压 .7z 必需）+ archiver（重打包 zip，root 或 packages/backend 下任一即可）。
 * find7z / createZipArchive 与 pack-offline.js 同源——该脚本无 module.exports 无法 require
 * 复用，故此处各复制一份（保持本脚本独立可跑；如需去重应抽到 scripts/pack-lib/，另行处理）。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execSync, spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'release');

function log(msg) {
  console.log(`[7z2zip] ${msg}`);
}
function error(msg) {
  console.error(`[7z2zip] ERROR: ${msg}`);
}

/** 定位 7-Zip 可执行文件（与 pack-offline.js find7z 同源，复制一份） */
function find7z() {
  if (os.platform() === 'win32') {
    const candidates = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      path.join(os.homedir(), 'AppData', 'Local', 'Programs', '7-Zip', '7z.exe'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    try {
      const result = execSync('where 7z', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const found = result.trim().split('\n')[0];
      if (found && fs.existsSync(found)) return found;
    } catch (e) {
      /* ignore */
    }
  } else {
    const candidates = ['/usr/bin/7z', '/usr/local/bin/7z', '/usr/bin/7za', '/usr/local/bin/7za'];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/** 用 7z 把 .7z 解压到 destDir（7z 退出码 0=成功 / 1=警告仍成功） */
function extract7z(sevenZip, inputPath, destDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(`"${sevenZip}"`, ['x', inputPath, `-o${destDir}`, '-y'], {
      stdio: 'inherit',
      shell: true,
    });
    proc.on('close', (code) => {
      if (code === 0 || code === 1) resolve();
      else reject(new Error(`7z 解压退出码: ${code}`));
    });
    proc.on('error', reject);
  });
}

/** 用 archiver 把 sourceDir 打包成 zip（与 pack-offline.js createZipArchive 同源，复制一份） */
function createZipArchive(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    let archiver;
    try {
      archiver = require('archiver');
    } catch (e) {
      try {
        archiver = require(path.join(PROJECT_ROOT, 'packages', 'backend', 'node_modules', 'archiver'));
      } catch (e2) {
        reject(new Error('archiver 模块未安装，请运行: pnpm add archiver -D'));
        return;
      }
    }

    log('使用 archiver 创建 zip...');
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(outputPath));
    archive.on('error', reject);
    archive.pipe(output);
    // false = 不包一层 sourceDir 根目录，保持与 .7z 相同的顶层扁平结构
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 列出 release/ 下所有 .7z，按修改时间倒序（最新在前，默认选 [1]） */
function list7zFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith('.7z'))
    .map((f) => {
      const p = path.join(OUTPUT_DIR, f);
      const st = fs.statSync(p);
      return { name: f, path: p, size: st.size, mtime: st.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

// ---- 交互式选择（readline 行缓冲模式，与 pack-menu.js 一致：管道/非 TTY 下不丢输入）----
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const inputBuffer = [];
const pendingAnswers = [];
rl.on('line', (line) => {
  const resolve = pendingAnswers.shift();
  if (resolve) {
    resolve(line.trim());
  } else {
    inputBuffer.push(line.trim());
  }
});
rl.on('close', () => {
  while (pendingAnswers.length) {
    const resolve = pendingAnswers.shift();
    resolve(inputBuffer.length ? inputBuffer.shift() : '');
  }
});

function ask(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    const buffered = inputBuffer.shift();
    if (buffered !== undefined) {
      resolve(buffered);
    } else {
      pendingAnswers.push(resolve);
    }
  });
}

/** 菜单选择：列出 .7z，输入序号（空=默认 [1] 最新） */
async function pickFromList(files) {
  console.log('');
  console.log(`release/ 下共 ${files.length} 个 .7z 部署包（最新在前）：`);
  files.forEach((f, i) => {
    console.log(`  [${i + 1}] ${f.name}  (${humanSize(f.size)}, ${f.mtime.toISOString().slice(0, 10)})`);
  });
  console.log('');
  const ans = (await ask('输入序号选择要转换为 zip 的 7z 包 [1]: ')).trim();
  const idx = ans === '' ? 1 : parseInt(ans, 10);
  if (!Number.isInteger(idx) || idx < 1 || idx > files.length) {
    throw new Error(`无效选择: "${ans}"（应为 1-${files.length} 的整数）`);
  }
  return files[idx - 1];
}

async function main() {
  try {
    const arg = process.argv[2];
    let target;

    if (arg) {
      const p = path.resolve(arg);
      if (!p.toLowerCase().endsWith('.7z')) throw new Error(`仅支持 .7z 文件: ${arg}`);
      if (!fs.existsSync(p)) throw new Error(`文件不存在: ${p}`);
      target = p;
    } else {
      const files = list7zFiles();
      if (!files.length) throw new Error(`release/ 下没有 .7z 文件（${OUTPUT_DIR}）`);
      target = (await pickFromList(files)).path;
    }

    const sevenZip = find7z();
    if (!sevenZip) {
      throw new Error('未找到 7-Zip（解压 .7z 必需）。请安装 7-Zip 或将其加入 PATH。');
    }

    const zipPath = target.replace(/\.7z$/i, '.zip');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudcad-7z2zip-'));
    log(`7z:  ${target}`);
    log(`zip: ${zipPath}`);

    try {
      log('解压 .7z 到临时目录...');
      await extract7z(sevenZip, target, tmpDir);
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      await createZipArchive(tmpDir, zipPath);
      const size = fs.statSync(zipPath).size;
      log(`完成: ${path.basename(zipPath)} (${humanSize(size)})`);
      log('提示: zip 体积通常大于 7z（deflate 压缩率低于 lzma2），属正常。');
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        /* 临时目录清理失败不影响结果 */
      }
    }
  } catch (err) {
    error(err.message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
