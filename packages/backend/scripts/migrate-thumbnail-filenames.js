// 缩略图统一 jpg 迁移脚本
// 背景：历史链路内容与扩展名错位 ——
//   1. MxWebDwg2Jpg 输出的 jpg 内容被误存为 thumbnail.webp（e26a1f95 后查找逻辑只认 jpg，存量被忽略）
//   2. 部分 thumbnail.jpg 实际内容是 PNG、部分节点只有 thumbnail.png（移动端历史上传）
// 目标：所有节点缩略图统一为「内容与扩展名一致」的 thumbnail.jpg（jpg 内容）
// 处理规则（按真实文件内容）：
//   1. thumbnail.webp 且内容为 JPEG → 若无 thumbnail.jpg 则改名，有则删除
//   2. thumbnail.png / thumbnail.jpg（内容为 PNG）→ 转码为 thumbnail.jpg（白底合成防透明黑块），成功则删除源
//   3. 其他异常内容 → 汇总报告（不自动处理）
// 转码依赖：Windows PowerShell + System.Drawing（无需额外安装）
// 用法：node packages/backend/scripts/migrate-thumbnail-filenames.js [--dry-run]

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dryRun = process.argv.includes('--dry-run');
const filesDataPath = path.resolve(
  process.cwd(),
  process.env.FILES_DATA_PATH || 'data/files'
);

const isJpeg = (buf) =>
  buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
const isPng = (buf) => buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a';

let dirs = 0;
let webpRenamed = 0;
let webpRemoved = 0;
let pngTranscoded = 0;
let pngRemoved = 0;
let abnormal = 0;
const abnormalSamples = [];
const transcodeJobs = []; // { in: string, out: string, node: string }

if (!fs.existsSync(filesDataPath)) {
  console.error(`filesDataPath 不存在: ${filesDataPath}`);
  process.exit(1);
}

for (const month of fs.readdirSync(filesDataPath)) {
  if (!/^\d{6}$/.test(month)) continue;
  const monthDir = path.join(filesDataPath, month);
  for (const id of fs.readdirSync(monthDir)) {
    const nodeDir = path.join(monthDir, id);
    if (!fs.statSync(nodeDir).isDirectory()) continue;
    dirs++;

    const webpPath = path.join(nodeDir, 'thumbnail.webp');
    const jpgPath = path.join(nodeDir, 'thumbnail.jpg');
    const pngPath = path.join(nodeDir, 'thumbnail.png');

    // 1. thumbnail.webp（jpg 内容）→ 改名 thumbnail.jpg 或删除
    if (fs.existsSync(webpPath)) {
      const buf = fs.readFileSync(webpPath);
      if (isJpeg(buf)) {
        if (fs.existsSync(jpgPath)) {
          if (!dryRun) fs.unlinkSync(webpPath);
          webpRemoved++;
        } else {
          if (!dryRun) fs.renameSync(webpPath, jpgPath);
          webpRenamed++;
        }
      } else if (!isPng(buf)) {
        abnormal++;
        if (abnormalSamples.length < 10) {
          abnormalSamples.push(
            `${id}@${month} webp sig=${buf.slice(0, 4).toString('hex')}`
          );
        }
      }
    }

    // 2. thumbnail.png → 转码为 thumbnail.jpg（或删除）
    if (fs.existsSync(pngPath)) {
      const buf = fs.readFileSync(pngPath);
      if (isJpeg(buf)) {
        if (fs.existsSync(jpgPath)) {
          if (!dryRun) fs.unlinkSync(pngPath);
          pngRemoved++;
        } else {
          if (!dryRun) fs.renameSync(pngPath, jpgPath);
          webpRenamed++;
        }
      } else if (isPng(buf)) {
        if (fs.existsSync(jpgPath) && isJpeg(fs.readFileSync(jpgPath))) {
          if (!dryRun) fs.unlinkSync(pngPath);
          pngRemoved++;
        } else {
          transcodeJobs.push({ in: pngPath, out: jpgPath, node: `${id}@${month}` });
        }
      } else {
        abnormal++;
        if (abnormalSamples.length < 10) {
          abnormalSamples.push(
            `${id}@${month} png sig=${buf.slice(0, 4).toString('hex')}`
          );
        }
      }
    }

    // 3. thumbnail.jpg（png 内容）→ 原位转码为真 jpg
    if (fs.existsSync(jpgPath)) {
      const buf = fs.readFileSync(jpgPath);
      if (isPng(buf)) {
        transcodeJobs.push({ in: jpgPath, out: jpgPath, node: `${id}@${month}` });
      } else if (!isJpeg(buf)) {
        abnormal++;
        if (abnormalSamples.length < 10) {
          abnormalSamples.push(
            `${id}@${month} jpg sig=${buf.slice(0, 4).toString('hex')}`
          );
        }
      }
    }
  }
}

// ── 执行 PNG → JPG 转码（PowerShell System.Drawing，白底合成）──
function transcodeAll(jobs) {
  if (!jobs.length) return;
  const ps = [
    'Add-Type -AssemblyName System.Drawing',
    '$ErrorActionPreference = "Stop"',
    'function Convert-PngToJpg([string]$inPath, [string]$outPath) {',
    '  $src = [System.Drawing.Image]::FromFile($inPath)',
    '  try {',
    '    $bmp = New-Object System.Drawing.Bitmap($src.Width, $src.Height)',
    '    try {',
    '      $g = [System.Drawing.Graphics]::FromImage($bmp)',
    '      $g.Clear([System.Drawing.Color]::White)',
    '      $g.DrawImage($src, 0, 0, $src.Width, $src.Height)',
    '      $g.Dispose()',
    '      $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)',
    '    } finally { $bmp.Dispose() }',
    '  } finally { $src.Dispose() }',
    '}',
  ];
  for (const job of jobs) {
    ps.push(
      `Convert-PngToJpg ${JSON.stringify(job.in)} ${JSON.stringify(job.out)}`
    );
  }
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps.join(';')],
    { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' }
  );
}

if (dryRun) {
  console.log(`将转码 PNG→JPG: ${transcodeJobs.length} 个`);
} else if (transcodeJobs.length) {
  const failed = [];
  try {
    transcodeAll(transcodeJobs);
  } catch (e) {
    // PowerShell 整体失败：逐个重试并标记失败项
    failed.push(...transcodeJobs.map((j) => j.node));
  }
  for (const job of transcodeJobs) {
    if (failed.includes(job.node)) continue;
    try {
      if (!fs.existsSync(job.out)) throw new Error('输出文件缺失');
      const outBuf = fs.readFileSync(job.out);
      if (!isJpeg(outBuf)) throw new Error('输出不是 jpeg');
      if (job.in !== job.out && fs.existsSync(job.in)) fs.unlinkSync(job.in);
      pngTranscoded++;
    } catch (err) {
      failed.push(job.node);
      if (failed.length <= 10) {
        console.error(`转码失败 ${job.node}: ${err.message}`);
      }
    }
  }
  if (failed.length) {
    console.error(`转码失败 ${failed.length} 个（保留原 png 文件，需人工处理）: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

console.log(`节点目录: ${dirs}`);
console.log(`webp(jpg内容)→thumbnail.jpg: ${webpRenamed}`);
console.log(`坏 webp/png(jpg内容) 已删除（存在 jpg 时）: ${webpRemoved + pngRemoved}`);
console.log(`PNG→JPG 转码成功: ${pngTranscoded}`);
console.log(`异常文件保留（需人工确认）: ${abnormal}`);
if (abnormalSamples.length) {
  console.log('异常文件样例:');
  abnormalSamples.forEach((s) => console.log('  ', s));
}
console.log(dryRun ? '[dry-run] 未实际修改' : '[done]');
