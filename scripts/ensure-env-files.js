/**
 * package.json postinstall 钩子：检查并从模板创建缺失的 .env 配置文件
 *
 * 为什么需要：.env/.env.local 被 .gitignore 排除，干净 clone 后三个包都没有
 * 环境变量文件。离线部署包由 setup-offline.js 创建，但开发环境（pnpm i 后
 * 直接 pnpm dev）没有任何步骤创建，导致 backend 拿不到 SESSION_SECRET/
 * REDIS_PASSWORD、frontend 拿不到 VITE_API_BASE_URL（Vite 不读 .env.example）。
 *
 * 单一事实源：runtime/scripts/lib/env-files.js，与 setup-offline.js 共用同一
 * 份目标清单与拷贝语义。
 *
 * 为什么容错：Docker 打包（Dockerfile.linux-deploy）在 scripts/ COPY 进镜像
 * 之前就会执行 pnpm install，此时 runtime/scripts/ 可能同样不存在。缺失时
 * 静默跳过（容器内 runtime 由镜像预置，env 由部署流程另行生成）。
 */
const fs = require('fs');
const path = require('path');

const ENV_FILES_SCRIPT = path.join(
  __dirname,
  '..',
  'runtime',
  'scripts',
  'lib',
  'env-files.js'
);

function main() {
  if (!fs.existsSync(ENV_FILES_SCRIPT)) {
    console.log(
      '[Ensure-Env-Files] env-files.js 不存在，跳过 .env 检查（容器/Docker 环境）'
    );
    return 0;
  }

  const { createEnvFilesFromExamples } = require(ENV_FILES_SCRIPT);
  const projectRoot = path.resolve(__dirname, '..');
  createEnvFilesFromExamples(projectRoot, {
    log: (message) => console.log(`[Ensure-Env-Files] ${message}`),
    error: (message) => console.error(`[Ensure-Env-Files] ${message}`),
  });
  return 0;
}

// 不强制失败：env 缺失可稍后手动补齐，避免阻塞 pnpm install
try {
  process.exit(main());
} catch (err) {
  console.error(`[Ensure-Env-Files] 执行失败（${err.message}）`);
  process.exit(0);
}
