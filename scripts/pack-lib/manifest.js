/**
 * @fileoverview 打包清单单一事实源
 *
 * P9 工程化：把全量部署包（pack-offline.js getDeployIncludeList）与增量升级包
 * （pack-offline.js getUpgradeIncludeList）两处高度重叠的正向清单收敛为单一来源，
 * 消除"改一处漏一处"的双清单硬编码漂移。
 *
 * 设计：
 * - getSharedEntries()        —— 两类包共享的条目（单一事实源）
 * - getLaunchScriptEntries()  —— 启动/停止入口脚本（deploy 独有，理由见函数头注释）
 * - getDeployIncludeList()    —— 全量部署包 = 共享 + 入口脚本 + deploy 独有（平台运行时/store/说明）
 * - getUpgradeIncludeList()   —— 增量升级包 = 共享（不含平台运行时、部署说明与入口脚本）
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
    // PII 字段级加密脚本（#417/#426）：.js 而非 .ts——离线部署只装生产依赖
    //（devDependencies 含 tsx 不装），离线 runtime Node 20 不能原生跑 TS，故用 node 直接运行 .js。
    // pii-backfill.js 由部署链 runPiiBackfill 执行；pii-offline-plaintext.js 为步骤⑤手动收缩脚本。
    // 二者 require dist/ 编译产物（pii-crypto.service.js），dist 已在上方条目中。
    {
      src: 'packages/backend/scripts/pii-backfill.js',
      dest: 'packages/backend/scripts/pii-backfill.js',
    },
    {
      src: 'packages/backend/scripts/pii-offline-plaintext.js',
      dest: 'packages/backend/scripts/pii-offline-plaintext.js',
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
    // 转换服务（现依赖 @cloudcad/contracts，见 ADR-0069；其余为纯 Node 内置 + 相对导入）
    // start.js / verify-deploy.js 在后端 FUNCTION_EXECUTOR=conversion-service 时拉起
    // packages/conversion-service/dist/server.js；两类包（部署/升级）都需携带以支持该模式
    {
      src: 'packages/conversion-service/dist',
      dest: 'packages/conversion-service/dist',
      isDir: true,
    },
    {
      src: 'packages/conversion-service/package.json',
      dest: 'packages/conversion-service/package.json',
    },
    // .env.example：conversion-service 配置模板（QUEUE_DRIVER / REDIS_URL / CONVERSION_SERVICE_SECRET 等），
    // 目标机 bootstrap 合并新增配置项（同 backend .env.example，mergeExampleIntoEnv）
    {
      src: 'packages/conversion-service/.env.example',
      dest: 'packages/conversion-service/.env.example',
    },
    // 运行时脚本
    { src: 'runtime/scripts', dest: 'runtime/scripts', isDir: true },
    { src: 'runtime/ecosystem.config.js', dest: 'runtime/ecosystem.config.js' },
    // Prisma schema-engine 预置二进制（离线 migrate deploy 用，pack-offline.js bundlePrismaSchemaEngine 预置）
    // pnpm store manifest 不引用 postinstall 下载的 schema-engine，部署机重建 @prisma/engines
    // 包目录缺该二进制 → prisma CLI 回退联网下载 → 断网 migrate deploy 失败。
    // 故预置到 runtime/prisma-engines/，verify-deploy.js / migrate.js 设 PRISMA_SCHEMA_ENGINE_BINARY 指向它。
    // 目录可能不存在（构建机未找到 schema-engine 时跳过预置），prepareDeployDir 对缺失源静默跳过。
    { src: 'runtime/prisma-engines', dest: 'runtime/prisma-engines', isDir: true },
    // 根目录文件（pnpm-lock.yaml 是目标机依赖重装检测的触发器）
    { src: 'pnpm-lock.yaml', dest: 'pnpm-lock.yaml' },
    { src: 'pnpm-workspace.yaml', dest: 'pnpm-workspace.yaml' },
    { src: 'package.json', dest: 'package.json' },
  ];
}

// 启动/停止入口脚本（单一事实源 = scripts/pack-lib/templates/，仓库根目录不常驻这些文件）
//
// 【deploy 独有，upgrade 不含】理由两条，缺一条该设计就不成立：
// 1. 升级包不含 runtime/linux 与 .pnpm-store-deploy，无法独立启动，只能解压覆盖
//    在既有部署之上；包内入口脚本唯一作用就是覆盖目标机已存在的同名文件。
// 2. Windows 打包机（pack-linux-deploy.js --upgrade 无条件 SKIP_PLATFORM_GUARD=1）
//    直打 tar.gz 时，tar 无法从 NTFS 读出 Unix 执行位（实测 bsdtar 全部写 0666），
//    于是升级包把部署包带的 -rwxr-xr-x 入口脚本覆盖成 0666，用户 ./start.sh 报
//    Permission denied。入口脚本只是几行 exec 包装，业务逻辑全在 runtime/scripts/
//    cli.js（已在共享清单内、随升级包更新），故升级包不需要自带。
function getLaunchScriptEntries() {
  return [
    { src: 'scripts/pack-lib/templates/cloudcad.bat', dest: 'cloudcad.bat' },
    { src: 'scripts/pack-lib/templates/cloudcad.sh', dest: 'cloudcad.sh' },
    { src: 'scripts/pack-lib/templates/start.bat', dest: 'start.bat' },
    { src: 'scripts/pack-lib/templates/start.sh', dest: 'start.sh' },
    { src: 'scripts/pack-lib/templates/stop.bat', dest: 'stop.bat' },
    { src: 'scripts/pack-lib/templates/stop.sh', dest: 'stop.sh' },
    // 离线命令行入口模板（部署包根目录附带，方便打开离线 Node shell）
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
 * = 共享条目 + 启动入口脚本，其中：
 *   - 平台运行时二进制（deploy 独有）插在 ecosystem 之后、pnpm-lock.yaml 之前
 *   - 生产依赖 store（deploy 独有）紧随平台运行时
 *   - 启动入口脚本（deploy 独有）在 package.json 之后、部署说明之前
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
  // deploy 独有：启动/停止入口脚本（追加在部署说明之前，保持历史复制顺序不变）
  for (const entry of getLaunchScriptEntries()) items.push(entry);
  // deploy 独有：部署说明文档（末尾）
  items.push({ src: '部署说明.txt', dest: '部署说明.txt' });

  return appendPrivateEntries(items, variant);
}

/**
 * 增量升级包正向清单
 * = 共享条目（不含平台运行时二进制 / 完整 store / 部署说明 / 启动入口脚本）
 * 依赖更新由目标机自动完成：start → cli.js bootstrap → shouldReinstallDependencies
 * （.deploy-lock-hash vs pnpm-lock.yaml 对比）→ 不一致时自动 pnpm install --offline --prod
 */
function getUpgradeIncludeList(platform, variant = 'oss') {
  const items = getSharedEntries().slice();
  return appendPrivateEntries(items, variant);
}

module.exports = {
  getSharedEntries,
  getLaunchScriptEntries,
  getDeployIncludeList,
  getUpgradeIncludeList,
};
