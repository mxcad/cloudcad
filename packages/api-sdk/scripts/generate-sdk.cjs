/**
 * @cloudcad/api-sdk SDK 生成脚本
 *
 * Windows 下 @hey-api/openapi-ts 清理输出目录（src/）时使用 Node 内置 rimraf
 * （rmSync recursive），目录正被 vite watcher / 杀软 / 编辑器持有句柄时会抛
 * ENOTEMPTY 导致生成失败（历史 32 次失败记录，见 issue #220）。
 *
 * 本脚本在运行生成器之前对输出目录做 Windows 安全预清理：
 *  1. 先把 src/ 原子 rename 成临时目录 —— Windows 上 rename 目录是元数据操作，
 *     不要求目录内容可枚举删除，占用场景下成功率远高于递归删除
 *  2. 再递归删除临时目录，失败重试 3 次（间隔 500ms）—— 覆盖句柄延迟释放场景
 *  3. rename 后 src/ 不存在 → openapi-ts 内部 rmSync 被跳过 → 消除 ENOTEMPTY 崩溃路径
 *  4. rename/删除兜底失败时只警告并继续；生成失败时以非 0 退出码 fail loudly
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const sdkDir = path.resolve(__dirname, '..');
const outputDir = path.join(sdkDir, 'src');
const runner = path.join(
  sdkDir,
  'node_modules',
  '@hey-api',
  'openapi-ts',
  'dist',
  'run.mjs'
);

const CLEANUP_PREFIX = 'src.openapi-ts-cleanup-';
const RETRY_TIMES = 3;
const RETRY_DELAY_MS = 500;

function syncDelay(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function rmDirSyncWithRetry(dir, label) {
  for (let attempt = 1; attempt <= RETRY_TIMES; attempt++) {
    try {
      fs.rmSync(dir, { force: true, recursive: true });
      return true;
    } catch (err) {
      if (attempt < RETRY_TIMES) {
        syncDelay(RETRY_DELAY_MS);
      } else {
        console.warn(`[generate-sdk] ${label} 清理失败: ${err.message}`);
      }
    }
  }
  return false;
}

// 1. 清理历史残留的临时目录（上次运行 rename 后删除失败留下的）
for (const entry of fs.readdirSync(sdkDir)) {
  if (entry.startsWith(CLEANUP_PREFIX)) {
    rmDirSyncWithRetry(path.join(sdkDir, entry), `历史临时目录 ${entry}`);
  }
}

// 2. 输出目录 Windows 安全预清理
if (fs.existsSync(outputDir)) {
  const tmpDir = path.join(
    sdkDir,
    `${CLEANUP_PREFIX}${process.pid}-${Date.now()}`
  );
  let renamed = false;
  for (let attempt = 1; attempt <= RETRY_TIMES && !renamed; attempt++) {
    try {
      fs.renameSync(outputDir, tmpDir);
      renamed = true;
    } catch (err) {
      if (attempt < RETRY_TIMES) {
        syncDelay(RETRY_DELAY_MS);
      } else {
        console.warn(
          `[generate-sdk] 输出目录 rename 失败（${err.message}），回退为直接删除`
        );
      }
    }
  }

  if (renamed) {
    rmDirSyncWithRetry(tmpDir, `旧输出目录 ${path.basename(tmpDir)}`);
  } else if (!rmDirSyncWithRetry(outputDir, '旧输出目录 src')) {
    console.warn(
      '[generate-sdk] 输出目录清理失败，继续尝试生成（若再失败请检查占用进程）'
    );
  }
}

// 3. 运行 @hey-api/openapi-ts
const result = spawnSync(process.execPath, [runner], {
  cwd: sdkDir,
  stdio: 'inherit',
  timeout: 60000,
});

// 4. fail loudly：生成失败时输出清晰错误并以非 0 退出码结束
if (result.status !== 0) {
  console.error(
    '\n[generate-sdk] @hey-api/openapi-ts 生成失败（exit ' +
      (result.status ?? 'signal: ' + (result.signal ?? 'unknown')) +
      '）'
  );
  if (result.error) {
    console.error(`[generate-sdk] spawn 错误: ${result.error.message}`);
  }
  console.error('[generate-sdk] 失败原因见上方 openapi-ts 输出。');
  console.error(
    '[generate-sdk] 常见原因：Windows 下 src/ 目录被 vite watcher / 杀软 / 编辑器句柄占用。'
  );
  console.error(
    '[generate-sdk] 本脚本已执行 rename + 重试清理，若仍失败请关闭占用进程后重试。'
  );
  process.exit(result.status ?? 1);
}
