// 删除生成产物目录：Windows 下刚写入的文件可能被 Defender/编辑器短暂锁定，
// 出现瞬态 EPERM。用 rmSync 内置重试（maxRetries/retryDelay），失败后再兜底重试。
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('用法: node clean-dir.js <相对目录>');
  process.exit(1);
}

const resolved = path.resolve(target);
const sleepSync = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const tryRemove = () => {
  try {
    fs.rmSync(resolved, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
    return true;
  } catch (e) {
    console.warn(`清理 ${target} 失败: ${e.code || e.message}`);
    return false;
  }
};

for (let i = 1; i <= 3; i++) {
  tryRemove();
  // 目录已不存在即视为成功
  if (!fs.existsSync(resolved)) process.exit(0);
  sleepSync(1000 * i);
}

console.error(`清理目录失败（已多次重试）: ${resolved}`);
process.exit(1);
