const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const readline = require('readline');
const sharp = require('sharp');

// ─────────────── 配置 ───────────────
const DEFAULT_MAX_WIDTH = 1920;
const DEFAULT_JPEG_QUALITY = 100;
const CONCURRENCY = 8;
const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.gif']);
const BAK_EXT = '.origbak';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const DEFAULT_KEYWORD = 'thumbnail.jpg';   // 默认只处理 thumbnail.jpg

const FORMAT_EXT = { 1: '.png', 2: '.jpg', 3: '.webp' };

// ─────────────── 工具函数 ───────────────
function ask(rl, q) { return new Promise(res => rl.question(q, res)); }

function* walkImages(dir, keyword = '') {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkImages(full, keyword);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMG_EXTS.has(ext) && (!keyword || entry.name.includes(keyword))) {
        yield full;
      }
    }
  }
}

function getNewExt(fmtChoice, originalExt) {
  if (fmtChoice === 4) return originalExt;            // 保持原格式
  const newExt = FORMAT_EXT[fmtChoice] || originalExt;
  // 统一 .jpeg → .jpg
  if (originalExt === '.jpeg') return newExt === '.jpg' ? '.jpg' : newExt;
  if (originalExt === '.jpg' && newExt === '.jpeg') return '.jpg';
  return newExt;
}

async function renameWithRetry(oldPath, newPath, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      await fsp.rename(oldPath, newPath);
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') && i < retries - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        continue;
      }
      throw err;
    }
  }
}

// ─────────────── 核心处理（备份规则：同后缀才备份） ───────────────
async function processOne(imgPath, maxWidth, jpegQuality, fmtChoice) {
  const originalExt = path.extname(imgPath);
  const baseName = path.basename(imgPath, originalExt);
  const dirName = path.dirname(imgPath);
  const newExt = getNewExt(fmtChoice, originalExt);
  const newPath = path.join(dirName, baseName + newExt);
  const sameExt = (newExt === originalExt);

  // 1. 备份
  if (sameExt) {
    const bakPath = imgPath + BAK_EXT;
    if (!fs.existsSync(bakPath)) {
      await fsp.copyFile(imgPath, bakPath);
    }
  }

  // 2. 彩色线条增强（不转灰度，保留原色）
  let pipeline = sharp(imgPath);
  const meta = await pipeline.metadata();

  if (maxWidth > 0 && meta.width && meta.width > maxWidth) {
    pipeline = pipeline
      // 提高全局对比度（乘数 1.3，亮度下压 -50），让线条更深，背景更亮
      .linear(1.3, -50)
      // 缩放到目标尺寸（lanczos3 保留细节）
      .resize({ width: maxWidth, withoutEnlargement: true, kernel: 'lanczos3', fit: 'inside' })
      // 强锐化，突出线条边缘（sigma 小，m2 提高边缘增益）
      .sharpen({ sigma: 0.8, m1: 0.3, m2: 3.5 });
  } else if (maxWidth > 0) {
    // 原图更小，仅增强对比和锐化，不放大
    pipeline = pipeline
      .linear(1.3, -50)
      .sharpen({ sigma: 0.8, m1: 0.3, m2: 3.5 });
  }

  // 3. 编码（与原来完全相同）
  switch (fmtChoice) {
    case 1: pipeline = pipeline.png({ compressionLevel: 9, palette: true }); break;
    case 2: pipeline = pipeline.jpeg({ quality: jpegQuality, mozjpeg: true, chromaSubsampling: '4:4:4' }); break;
    case 3: pipeline = pipeline.webp({ lossless: true }); break;
    case 4:
    default:
      if (meta.format === 'png') pipeline = pipeline.png({ compressionLevel: 9, palette: true });
      else if (meta.format === 'jpeg' || meta.format === 'jpg') pipeline = pipeline.jpeg({ quality: jpegQuality, mozjpeg: true, chromaSubsampling: '4:4:4' });
      else if (meta.format === 'webp') pipeline = pipeline.webp({ lossless: true });
      break;
  }

  // 4. 写出
  const buffer = await pipeline.toBuffer();
  const tmpPath = imgPath + '.tmp';
  await fsp.writeFile(tmpPath, buffer);
  await renameWithRetry(tmpPath, newPath);
}

// ─────────────── 备份管理 ───────────────
async function deleteAllBak(dir, keyword = '') {
  let count = 0;
  for (const imgPath of walkImages(dir, keyword)) {
    const bakFile = imgPath + BAK_EXT;
    if (fs.existsSync(bakFile)) {
      await fsp.unlink(bakFile);
      count++;
    }
  }
  return count;
}

async function restoreAllBak(dir, keyword = '') {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await restoreAllBak(full, keyword);
    } else if (entry.isFile() && entry.name.endsWith(BAK_EXT)) {
      const originalPath = full.slice(0, -BAK_EXT.length);
      const ext = path.extname(originalPath).toLowerCase();
      if (IMG_EXTS.has(ext) && (!keyword || path.basename(originalPath).includes(keyword))) {
        await renameWithRetry(full, originalPath);   // 备份重命名为原始文件名，覆盖当前文件
        count++;
      }
    }
  }
  return count;
}

// ─────────────── 删除图片文件（不含备份） ───────────────
async function deleteImages(dir, keyword = '') {
  let count = 0;
  for (const imgPath of walkImages(dir, keyword)) {
    await fsp.unlink(imgPath);
    count++;
  }
  return count;
}

// ─────────────── 进度显示 & 并发 ───────────────
function updateProgress(done, total, startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const percent = total ? ((done / total) * 100).toFixed(1) : '100';
  process.stdout.write(`\r⏳ 进度 ${done}/${total} (${percent}%) - 耗时 ${elapsed}s`);
}

async function runWithConcurrency(tasks, limit, onProgress) {
  const executing = new Set();
  let done = 0;
  const startTime = Date.now();
  for (const task of tasks) {
    const p = task().then(() => {
      done++;
      onProgress(done, startTime);
      executing.delete(p);
    }).catch(err => {
      console.error(`\n⚠️  跳过文件: ${err.message}`);
      done++;
      onProgress(done, startTime);
      executing.delete(p);
    });
    executing.add(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
  process.stdout.write('\n');
}

// ─────────────── 主流程 ───────────────
(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n🖼️  图片批量处理工具 v9（智能备份 + 删除图片）');
  console.log('──────────────────────────────────────────\n');

  // 1. 目标目录
  let targetDir = (await ask(rl, '📁 目标目录 (默认: data/files): ')).trim();
  targetDir = targetDir || path.resolve(process.cwd(), '../../data/files');
  targetDir = path.resolve(targetDir);
  if (!fs.existsSync(targetDir)) {
    console.log(`❌ 目录不存在: ${targetDir}`);
    process.exit(1);
  }

  // 2. 文件名关键词（默认 thumbnail.jpg）
  const keywordPrompt = `🔍 文件名关键词 (默认: ${DEFAULT_KEYWORD}, all处理全部): `;
  let keyword = (await ask(rl, keywordPrompt)).trim();
  if(keyword.toLowerCase() === 'all') keyword = '';
  if (keyword === '') keyword = DEFAULT_KEYWORD;

  // 3. 最大宽度
  const maxWidthInput = (await ask(rl, `📐 最大宽度 (0=不缩放, 默认${DEFAULT_MAX_WIDTH}): `)).trim();
  const maxWidth = maxWidthInput === '' ? DEFAULT_MAX_WIDTH : parseInt(maxWidthInput, 10);

  // 4. JPEG 质量
  const qualityInput = (await ask(rl, `🎨 JPEG 质量 (1-100, 默认${DEFAULT_JPEG_QUALITY}): `)).trim();
  const jpegQuality = qualityInput === '' ? DEFAULT_JPEG_QUALITY : parseInt(qualityInput, 10);

  // 5. 输出格式
  console.log('\n📦 输出格式 (扩展名自动匹配)');
  console.log('  1. PNG 无损');
  console.log('  2. JPEG 有损');
  console.log('  3. WebP 无损');
  console.log('  4. 保持原格式');
  const fmtChoiceRaw = (await ask(rl, '输入数字 (1-4, 默认4): ')).trim() || '4';
  const fmtChoice = parseInt(fmtChoiceRaw, 10);

  // 6. 操作选择
  console.log('\n请选择操作:');
  console.log('  1. 压缩图片');
  console.log('  2. 删除所有 .origbak 备份');
  console.log('  3. 从 .origbak 还原原始图片');
  console.log('  4. 删除指定图片文件 (⚠️ 不可恢复)');

  const choice = (await ask(rl, '\n输入数字 (1-4): ')).trim();
  rl.close();

  // ── 分支处理 ──
  if (choice === '2') {
    const count = await deleteAllBak(targetDir, keyword);
    console.log(`✅ 已删除 ${count} 个备份文件`);
    return;
  }
  if (choice === '3') {
    const count = await restoreAllBak(targetDir, keyword);
    console.log(`✅ 已还原 ${count} 张图片`);
    return;
  }
  if (choice === '4') {
    const imgPaths = [...walkImages(targetDir, keyword)];
    if (imgPaths.length === 0) {
      console.log('⚠️  没有匹配的图片文件');
      return;
    }
    console.log(`\n⚠️  即将删除 ${imgPaths.length} 个图片文件（不含备份）`);
    // 二次确认
    const rlConfirm = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = (await ask(rlConfirm, '确认删除？输入 yes 继续: ')).trim().toLowerCase();
    rlConfirm.close();
    if (confirm !== 'yes') {
      console.log('❌ 已取消');
      return;
    }
    const count = await deleteImages(targetDir, keyword);
    console.log(`✅ 已删除 ${count} 个图片文件`);
    return;
  }
  if (choice !== '1') {
    console.log('❌ 无效选项');
    process.exit(1);
  }

  // ── 压缩任务 ──
  const imgPaths = [...walkImages(targetDir, keyword)];
  const total = imgPaths.length;
  console.log(`\n📂 目录: ${targetDir}`);
  console.log(`🔎 关键词: ${keyword || '(无)'}`);
  console.log(`🖼️  图片数: ${total}`);
  console.log(`⚙️  最大宽度: ${maxWidth === 0 ? '不缩放' : maxWidth + 'px'}`);
  console.log(`🎨 JPEG 质量: ${jpegQuality}`);
  console.log(`📦 输出格式: ${['','PNG 无损','JPEG 有损','WebP 无损','保持原格式'][fmtChoice]}`);
  console.log(`💾 备份规则: 仅当输出格式与源相同时创建 ${BAK_EXT}`);
  console.log(`🚀 并发数: ${CONCURRENCY}\n`);

  if (total === 0) {
    console.log('⚠️  没有符合条件的图片');
    return;
  }

  const startTime = Date.now();
  let done = 0;

  const tasks = imgPaths.map(imgPath => async () => {
    await processOne(imgPath, maxWidth, jpegQuality, fmtChoice);
    done++;
  });

  await runWithConcurrency(tasks, CONCURRENCY, () => updateProgress(done, total, startTime));

  console.log(`\n🎉 全部完成！处理了 ${done} 张图片`);
  console.log('💡 仅相同后缀的图片创建了 .origbak 备份，确认后可删除或还原');
})().catch(err => {
  console.error('\n❌ 任务失败:', err);
  process.exit(1);
});