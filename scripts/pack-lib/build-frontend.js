/**
 * 前端构建唯一出口（PC + 移动端）
 *
 * 背景（2026-10-09）：`buildFrontendLocally` 曾在 pack-offline.js 与
 * pack-linux-deploy.js 各有一份且形状漂移——pack-offline.js 版自带
 * try/catch + process.exit(1)，pack-linux-deploy.js 版依赖调用方外层 try。
 * 收敛为单一出口后，任一入口（部署包/升级包/Docker 容器通道）失败都硬失败，
 * 不再存在"前端没构建出来但照常吃 dist 残留"的通道。
 *
 * 与 pack-assertions.js 分工：那边是纯判定（返回数据、不 exit），
 * 这里是纯副作用（execSync + log + exit）。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 需构建的前端包（顺序 = 构建顺序：PC 端先，移动端 dist 随后合并进 PC dist）
const FRONTEND_PACKAGES = ['frontend', 'frontend_mobile'];

function log(msg) {
  console.log(`[Pack-Frontend] ${msg}`);
}

function error(msg) {
  console.error(`[Pack-Frontend] ERROR: ${msg}`);
}

/**
 * 确保 mxcad-app 引擎 dist 已解压（直接跑包自带的 postinstall.js）。
 *
 * 私有 mxcad-app 包发布态只带 .gz（大 chunk 如 chunks/lib.js 仅 .gz），解压靠
 * pnpm install 时的 postinstall。但 pnpm 增量安装对已链接的包不会重跑
 * postinstall——构建机 node_modules 可能停留在发布态，前端构建把 gz-only 的
 * chunks 原样复制进 dist/mxcad-app，不理解 gz-only 文件的静态服务器会走 SPA
 * 回退把 index.html 当 JS 下发 → 模块脚本 MIME 校验失败 → CAD 页白屏
 * （2026-10-26 部署包事故）。postinstall.js 幂等（已有未压缩版本则跳过），
 * 构建前直接跑一遍即可，无需自造解压逻辑。
 */
function ensureMxcadAppDecompressed(projectRoot) {
  const script = path.join(
    projectRoot,
    'packages',
    'frontend',
    'node_modules',
    'mxcad-app',
    'postinstall.js'
  );
  if (!fs.existsSync(script)) {
    log(`警告: 未找到 ${script}，跳过 mxcad-app 解压（mxcad-app 包未安装时前端构建本身会失败）`);
    return;
  }
  log('解压 mxcad-app dist（包自带 postinstall，幂等）...');
  try {
    execSync(`node "${script}"`, { stdio: 'inherit' });
  } catch (err) {
    error(`mxcad-app 解压失败，中止打包: ${String(err.message).split('\n')[0]}`);
    process.exit(1);
  }
}

/**
 * 在本地构建 PC + 移动端前端（纯静态产物，三端通用）。
 *
 * 必须 cd 进包目录跑裸 `pnpm build`（不能用 `pnpm --filter <pkg> build` +
 * cwd: PROJECT_ROOT）：pnpm 会把 INIT_CWD 设成仓库根，@voerkai18n/plugins 按
 * INIT_CWD 解析 i18n 目录（仓库根无 src/ → 回落 <仓库根>/languages），找不到
 * messages/idMap.json 直接 ENOENT，vite 配置加载阶段即失败。
 *
 * 任一端失败即 process.exit(1)——不得产出缺前端的部署包/升级包。
 *
 * @param {string} projectRoot 项目根绝对路径
 */
function buildFrontendLocally(projectRoot) {
  log('构建前端 (本地)...');
  ensureMxcadAppDecompressed(projectRoot);
  for (const pkg of FRONTEND_PACKAGES) {
    log(`构建 ${pkg}...`);
    try {
      execSync('pnpm build', {
        cwd: path.join(projectRoot, 'packages', pkg),
        stdio: 'inherit',
      });
    } catch (err) {
      error(`${pkg} 构建失败，中止打包: ${String(err.message).split('\n')[0]}`);
      process.exit(1);
    }
  }
  log('✓ 前端构建完成');
}

module.exports = { buildFrontendLocally, FRONTEND_PACKAGES };
