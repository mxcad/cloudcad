/**
 * package.json preinstall 钩子的容错包装
 *
 * 调用 scripts/ensure-runtime.js 检查/下载开发环境的产品二进制（mxcad/mxversion）。
 *
 * 为什么要容错：
 *   - 开发环境：scripts/ 存在 → 正常执行 ensure-runtime.js 下载缺失的运行时
 *   - Docker 打包（Dockerfile.linux-deploy）：在 scripts/ COPY 进镜像之前就会执行
 *     pnpm install，此时 /app/scripts/ensure-runtime.js 不存在。若直接调用会报
 *     MODULE_NOT_FOUND，破坏 Docker 层缓存优化与打包流程。
 *   - 因此这里先检查脚本是否存在，不存在则静默跳过（Docker 打包环境不联网，
 *     runtime 由镜像内预置，无需下载）。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ENSURE_SCRIPT = path.join(__dirname, 'ensure-runtime.js');

function main() {
  if (!fs.existsSync(ENSURE_SCRIPT)) {
    // Docker 打包等场景：脚本尚未 COPY 入镜，跳过运行时自检
    console.log('[Preinstall-Runtime] ensure-runtime.js 不存在，跳过运行时检查（容器/Docker 环境）');
    return 0;
  }
  const result = spawnSync(process.execPath, [ENSURE_SCRIPT], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[Preinstall-Runtime] ensure-runtime.js 执行失败（exit ${result.status}）`);
    // 不强制失败：运行时缺失可稍后手动补齐，避免阻塞 pnpm install
    return 0;
  }
  return 0;
}

process.exit(main());
