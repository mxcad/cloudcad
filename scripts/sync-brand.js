#!/usr/bin/env node
/**
 * @fileoverview 品牌名同步 / 校验工具（产品名单一事实源的一部分）
 *
 * 单一事实源：`runtime/scripts/lib/branding.js` 的 PRODUCT_NAME / PRODUCT_NAME_EN_DISPLAY。
 * - JS 运行时输出：直接 `require('../runtime/scripts/lib/branding')` 引用，本工具不处理；
 * - 静态文件（.sh / .bat / .cmd / .yml / .yaml / .service / .conf / Dockerfile）与
 *   JS 注释中的中文/英文品牌名：由本工具统一同步 / 校验，避免改名时散落 30+ 处遗漏。
 *
 * 用法：
 *   node scripts/sync-brand.js            # 校验（只读，发现漂移即报错并退出 1）
 *   node scripts/sync-brand.js --apply    # 同步（把历史品牌名替换为当前 PRODUCT_NAME）
 *   node scripts/sync-brand.js --list     # 仅列出受管文件（调试）
 *
 * 改名流程（只改这一处）：
 *   1. 修改 runtime/scripts/lib/branding.js 的 PRODUCT_NAME 为新名称；
 *   2. 把旧名追加到本文件的 CN_LEGACY（历史中文名）；
 *   3. 运行 `pnpm brand:sync`：JS 运行时引用立即生效，静态文件同步刷新；
 *   4. 提交改动。
 *
 * 打包入口（pack-offline.js / pack-docker.js / pack-linux-deploy.js 等）打包前会自动
 * 调用 applySyncBrand()，保证部署包内静态文件与 branding.js 一致。
 *
 * 注意：
 * - 逻辑标识（小写 cloudcad：包名 / 命令名 / 数据库名 / 目录路径 / 系统用户等，
 *   以及 CloudCAD-PM2 注册表键、CloudCAD fixed wrapper 升级检测标识）不会被替换；
 * - 编码：start.bat / cloudcad.bat 为 GBK 编码，本工具读写时自动识别并在
 *   Windows 用 PowerShell、Linux 用 iconv 完成 GBK 编解码；
 * - 前端 UI 品牌由 packages/config-service/brand.js 运行时配置管理，不在本工具范围。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { PRODUCT_NAME, PRODUCT_NAME_EN_DISPLAY } = require('../runtime/scripts/lib/branding');

// ==================== 配置 ====================

const ROOT = path.resolve(__dirname, '..');

/** 历史中文品牌名（PRODUCT_NAME 变更时，把旧中文名追加到 CN_LEGACY 即可全量迁移） */
const CN_LEGACY = ['梦想网页CAD实时协同平台'];

/** 历史英文品牌名（静态文件中的用户可见英文名由它迁移到当前展示名；JS 逻辑标识不受影响） */
const EN_LEGACY = ['CloudCAD'];

/** 含 CloudCAD 但属于逻辑标识、禁止替换的复合词（先保护再替换，避免误伤） */
const LOGICAL_COMPOUNDS = ['CloudCAD-PM2', 'CloudCAD fixed wrapper'];

/** 仅参与"中文名替换"（绝不替换独立词 CloudCAD，避免误伤 @cloudcad 等逻辑标识）的扩展名：JS 等代码文件 */
const CN_ONLY_EXT = ['.js', '.ts', '.tsx', '.jsx'];

/** 参与"独立词 CloudCAD + 中文名替换"的扩展名：静态文本文件（不含 .md 文档，避免误伤开发文档） */
const STATIC_EXT = ['.sh', '.bat', '.cmd', '.yml', '.yaml', '.service', '.conf', '.toml', '.ini'];

/** 根目录一级仅纳入 CLI 脚本扩展名（不扫描 README/AGENTS 等项目文档） */
const ROOT_EXT = new Set(['.sh', '.bat', '.cmd']);

/** 扫描目录（相对仓库根；'' 表示根目录本身） */
const SCAN_DIRS = ['', 'runtime', 'scripts', 'docker', 'deploy'];

/** 递归扫描时跳过的子目录（产物 / 依赖 / VCS / 工具生成物） */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.github', '.codebuddy', '.opencode',
  'release', 'dist', 'build', 'coverage',
  'runtime/linux', 'runtime/cache', 'runtime/docker', 'runtime/storage', 'runtime/windows',
  '.pnpm-store', 'generated-images',
]);

/** 永远跳过的文件（源文件 / 工具自身） */
const SKIP_FILES = new Set([
  'scripts/sync-brand.js',
  'runtime/scripts/lib/branding.js',
]);

/** 特殊文件名（无扩展名的 Dockerfile 等） */
const SPECIAL_NAMES = new Set(['Dockerfile', 'Dockerfile.linux-deploy', 'Dockerfile.linux-deploy-verify']);

// ==================== 编码处理（GBK bat 支持） ====================

/**
 * 解码文件字节（UTF-8 优先，失败回退 GBK）
 * @returns {{ text: string, encoding: 'utf8'|'gbk' }}
 */
function decodeText(buf) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { text, encoding: 'utf8' };
  } catch {
    return { text: new TextDecoder('gbk').decode(buf), encoding: 'gbk' };
  }
}

/** 写回文件（GBK 时经系统命令编码） */
function writeText(filePath, text, encoding) {
  if (encoding === 'utf8') {
    fs.writeFileSync(filePath, text, 'utf8');
    return;
  }
  const tmp = `${filePath}.sync-brand.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    if (process.platform === 'win32') {
      const ps = `$c = [System.IO.File]::ReadAllText('${tmp.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8); [System.IO.File]::WriteAllText('${filePath.replace(/'/g, "''")}', $c, [System.Text.Encoding]::GetEncoding(936));`;
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' });
    } else {
      const out = execFileSync('iconv', ['-f', 'UTF-8', '-t', 'GBK', tmp], { encoding: 'buffer' });
      fs.writeFileSync(filePath, out);
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// ==================== 文件收集 ====================

/** 相对 ROOT 的正斜杠路径 */
function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function shouldSkipDir(dirPath) {
  const r = rel(dirPath);
  for (const skip of SKIP_DIRS) {
    if (r === skip || r.startsWith(`${skip}/`)) return true;
  }
  return false;
}

function shouldSkipFile(filePath) {
  const r = rel(filePath);
  if (SKIP_FILES.has(r)) return true;
  return false;
}

/** 收集受管文件：{ filePath, kind: 'cn' | 'static' } */
function collectFiles() {
  const files = [];
  const push = (filePath) => {
    if (shouldSkipFile(filePath)) return;
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath);
    if (STATIC_EXT.includes(ext) || SPECIAL_NAMES.has(base)) {
      files.push({ filePath, kind: 'static' });
    } else if (CN_ONLY_EXT.includes(ext)) {
      files.push({ filePath, kind: 'cn' });
    }
  };

  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    if (dir === '') {
      // 根目录只扫一级的 CLI 脚本（.sh/.bat/.cmd），不碰 README/AGENTS 等项目文档
      for (const name of fs.readdirSync(abs)) {
        const p = path.join(abs, name);
        if (fs.statSync(p).isFile() && ROOT_EXT.has(path.extname(name).toLowerCase())) push(p);
      }
    } else {
      const walk = (cur) => {
        for (const name of fs.readdirSync(cur)) {
          const p = path.join(cur, name);
          if (fs.statSync(p).isDirectory()) {
            if (!shouldSkipDir(p)) walk(p);
          } else {
            push(p);
          }
        }
      };
      walk(abs);
    }
  }
  return files;
}

// ==================== 替换逻辑 ====================

/** 对静态文件内容做品牌替换（保护逻辑复合词后替换独立英文品牌名 + 中文名） */
function replaceStatic(text) {
  // 1. 保护逻辑复合词
  const protectedText = LOGICAL_COMPOUNDS.reduce(
    (t, word, i) => t.split(word).join(`__SYNCBRAND_${i}__`),
    text
  );
  // 2. 替换独立英文品牌名（历史英文名 → 当前英文展示名，如 CloudCAD → MxCloudCAD）
  let out = protectedText;
  for (const legacy of EN_LEGACY) {
    if (legacy === PRODUCT_NAME_EN_DISPLAY) continue;
    const esc = legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${esc}\\b`, 'g'), PRODUCT_NAME_EN_DISPLAY);
  }
  // 3. 还原复合词
  out = LOGICAL_COMPOUNDS.reduce((t, word, i) => t.split(`__SYNCBRAND_${i}__`).join(word), out);
  // 4. 历史中文名 → 当前中文名
  for (const legacy of CN_LEGACY) {
    if (legacy === PRODUCT_NAME) continue;
    out = out.split(legacy).join(PRODUCT_NAME);
  }
  return out;
}

/** 对代码文件内容做品牌替换（仅历史中文名 → 当前名；绝不替换 CloudCAD，避免误伤 @cloudcad 等逻辑标识） */
function replaceCn(text) {
  let out = text;
  for (const legacy of CN_LEGACY) {
    if (legacy === PRODUCT_NAME) continue;
    out = out.split(legacy).join(PRODUCT_NAME);
  }
  return out;
}

// ==================== 主流程 ====================

/**
 * 同步 / 校验受管文件
 * @param {boolean} apply 为 true 时写回文件；为 false 时只校验
 * @returns {string[]} 有变更的文件相对路径列表
 */
function syncBrand(apply) {
  const files = collectFiles();
  const changed = [];
  for (const { filePath, kind } of files) {
    const buf = fs.readFileSync(filePath);
    const { text, encoding } = decodeText(buf);
    const next = kind === 'static' ? replaceStatic(text) : replaceCn(text);
    if (next === text) continue;
    changed.push(rel(filePath));
    if (apply) writeText(filePath, next, encoding);
  }
  return changed;
}

/** 打包入口调用：同步受管静态文件品牌名（幂等，仅品牌名变化时产生差异） */
function applySyncBrand() {
  const changed = syncBrand(true);
  if (changed.length > 0) {
    console.log(`[SyncBrand] 已同步 ${changed.length} 个文件的品牌名:`);
    for (const f of changed) console.log(`  - ${f}`);
  }
  return changed;
}

/** 校验：发现漂移返回 false */
function checkSyncBrand() {
  const changed = syncBrand(false);
  if (changed.length > 0) {
    console.error(`[SyncBrand] 以下 ${changed.length} 个文件的品牌名与 branding.js 不一致：`);
    for (const f of changed) console.error(`  - ${f}`);
    console.error(`[SyncBrand] 请运行 \`node scripts/sync-brand.js --apply\` 或 \`pnpm brand:sync\` 同步。`);
    return false;
  }
  console.log('[SyncBrand] 品牌名校验通过，所有受管文件与 branding.js 一致。');
  return true;
}

function listFiles() {
  const files = collectFiles();
  for (const { filePath, kind } of files) console.log(`${kind === 'static' ? 'STATIC' : '   CN'}  ${rel(filePath)}`);
  console.log(`[SyncBrand] 共 ${files.length} 个受管文件。`);
}

module.exports = { syncBrand, applySyncBrand, checkSyncBrand, collectFiles };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    listFiles();
  } else if (args.includes('--apply')) {
    const changed = applySyncBrand();
    process.exit(changed.length > 0 ? 0 : 0);
  } else {
    const ok = checkSyncBrand();
    process.exit(ok ? 0 : 1);
  }
}
