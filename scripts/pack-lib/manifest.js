/**
 * @fileoverview 打包清单单一事实源
 *
 * P9 工程化：把全量部署包（pack-offline.js getDeployIncludeList）与增量升级包
 * （pack-offline.js getUpgradeIncludeList）两处高度重叠的正向清单收敛为单一来源，
 * 消除"改一处漏一处"的双清单硬编码漂移。
 *
 * 设计：
 * - getSharedEntries()        —— 两类包共享的条目（单一事实源）
 * - getDeployIncludeList()    —— 全量部署包 = 共享 + deploy 独有（平台运行时/store/说明）
 * - getUpgradeIncludeList()   —— 增量升级包 = 共享（不含平台运行时与部署说明）
 *
 * 顺序约定：deploy 独有的平台运行时与 store 须保持在 pnpm-lock.yaml 之前，
 * 部署说明保持在末尾 —— 与原 pack-offline.js 两处清单的复制顺序逐字节一致，
 * 确保打包产物顺序审计（V6）无回归。
 *
 * 依赖方向：本模块只声明条目，不含任何 IO；可被单测直接断言。
 */

// 两类包共享的核心条目（顺序 = 复制顺序，与历史清单保持一致）
function getSharedEntries() {
  return [
    // 后端
    {
      src: 'packages/backend/dist',
      dest: 'packages/backend/dist',
      isDir: true,
    },
    // prisma migrations 全量目录（migrate deploy 要求目录与 _prisma_migrations 表自洽）
    {
      src: 'packages/backend/prisma',
      dest: 'packages/backend/prisma',
      isDir: true,
    },
    // .env.example：目标机 bootstrap 用它合并新增配置项（mergeExampleIntoEnv）
    {
      src: 'packages/backend/.env.example',
      dest: 'packages/backend/.env.example',
    },
    {
      src: 'packages/backend/package.json',
      dest: 'packages/backend/package.json',
    },
    // 共享 Prisma Client 包（schema 单一源 + 编译产物，backend 运行时 require）
    {
      src: 'packages/db/prisma',
      dest: 'packages/db/prisma',
      isDir: true,
    },
    {
      src: 'packages/db/prisma.config.ts',
      dest: 'packages/db/prisma.config.ts',
    },
    {
      src: 'packages/db/dist',
      dest: 'packages/db/dist',
      isDir: true,
    },
    {
      src: 'packages/db/package.json',
      dest: 'packages/db/package.json',
    },
    // 共享契约包（DI token + 接口，backend 运行时 require）
    {
      src: 'packages/contracts/dist',
      dest: 'packages/contracts/dist',
      isDir: true,
    },
    {
      src: 'packages/contracts/package.json',
      dest: 'packages/contracts/package.json',
    },
    // 前端（构建产物；升级包配置经 renameFrontendConfigFiles 改名 .example）
    {
      src: 'packages/frontend/dist',
      dest: 'packages/frontend/dist',
      isDir: true,
    },
    {
      src: 'packages/frontend/package.json',
      dest: 'packages/frontend/package.json',
    },
    // SVN 版本工具（CommonJS 源码，无 build）
    {
      src: 'packages/mxVersionTool',
      dest: 'packages/mxVersionTool',
      isDir: true,
    },
    // 部署配置中心（0 依赖独立服务）
    {
      src: 'packages/config-service',
      dest: 'packages/config-service',
      isDir: true,
    },
    // 运行时脚本
    { src: 'runtime/scripts', dest: 'runtime/scripts', isDir: true },
    { src: 'runtime/ecosystem.config.js', dest: 'runtime/ecosystem.config.js' },
    // 根目录文件（pnpm-lock.yaml 是目标机依赖重装检测的触发器）
    { src: 'pnpm-lock.yaml', dest: 'pnpm-lock.yaml' },
    { src: 'pnpm-workspace.yaml', dest: 'pnpm-workspace.yaml' },
    { src: 'package.json', dest: 'package.json' },
    // 启动/停止脚本（单一事实源 = scripts/pack-lib/templates/，
    // 仓库根目录不常驻这些文件，打包时复制到部署包/升级包根目录）
    { src: 'scripts/pack-lib/templates/cloudcad.bat', dest: 'cloudcad.bat' },
    { src: 'scripts/pack-lib/templates/cloudcad.sh', dest: 'cloudcad.sh' },
    { src: 'scripts/pack-lib/templates/start.bat', dest: 'start.bat' },
    { src: 'scripts/pack-lib/templates/start.sh', dest: 'start.sh' },
    { src: 'scripts/pack-lib/templates/stop.bat', dest: 'stop.bat' },
    { src: 'scripts/pack-lib/templates/stop.sh', dest: 'stop.sh' },
    // 离线命令行入口模板（部署包/升级包根目录附带，方便打开离线 Node shell）
    { src: 'scripts/pack-lib/templates/cloudcad-shell.sh', dest: 'cloudcad-shell.sh' },
    { src: 'scripts/pack-lib/templates/cloudcad-shell.cmd', dest: 'cloudcad-shell.cmd' },
  ];
}

// 私有 variant 额外包含 impl-mx/dist（append 到末尾，与历史一致）
function appendPrivateEntries(items, variant) {
  if (variant === 'private') {
    items.push({
      src: 'packages/impl-mx/dist',
      dest: 'packages/impl-mx/dist',
      isDir: true,
    });
  }
  return items;
}

/**
 * 全量部署包正向清单
 * = 共享条目，其中：
 *   - 平台运行时二进制（deploy 独有）插在 ecosystem 之后、pnpm-lock.yaml 之前
 *   - 生产依赖 store（deploy 独有）紧随平台运行时
 *   - 部署说明（deploy 独有）保持在末尾
 */
function getDeployIncludeList(platform, variant = 'oss') {
  const runtimeDir =
    platform === 'linux' ? 'runtime/linux' : 'runtime/windows';

  const items = [];
  for (const entry of getSharedEntries()) {
    items.push(entry);
    // deploy 独有：平台运行时二进制 + 生产依赖 store，插在根目录文件之前
    if (entry.src === 'runtime/ecosystem.config.js') {
      items.push({ src: runtimeDir, dest: runtimeDir, isDir: true });
      items.push({
        src: '.pnpm-store-deploy',
        dest: '.pnpm-store-deploy',
        isDir: true,
      });
    }
  }
  // deploy 独有：部署说明文档（末尾）
  items.push({ src: '部署说明.txt', dest: '部署说明.txt' });

  return appendPrivateEntries(items, variant);
}

/**
 * 增量升级包正向清单
 * = 共享条目（不含平台运行时二进制 / 完整 store / 部署说明）
 * 依赖更新由目标机自动完成：start → cli.js bootstrap → shouldReinstallDependencies
 * （.deploy-lock-hash vs pnpm-lock.yaml 对比）→ 不一致时自动 pnpm install --offline --prod
 */
function getUpgradeIncludeList(platform, variant = 'oss') {
  const items = getSharedEntries().slice();
  return appendPrivateEntries(items, variant);
}

module.exports = {
  getSharedEntries,
  getDeployIncludeList,
  getUpgradeIncludeList,
};
