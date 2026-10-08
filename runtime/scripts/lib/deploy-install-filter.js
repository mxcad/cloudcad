'use strict';

/**
 * 部署包后端生产依赖的 pnpm --filter 清单（运行时侧单一事实源）。
 *
 * setup-offline.js（部署时重建依赖）与 verify-deploy.js（断网验证）共用。
 * 此前两处各手写一份，verify-deploy 漏掉 @cloudcad/impl-mx 的条件项，导致私有
 * 部署包断网验证时不会为 impl-mx 建 workspace 链接（CI 只打 OSS 包，故潜伏）。
 *
 * 注意：打包侧 scripts/pack-offline.js 的清单不在此 —— 它跨打包边界（部署包只含
 * runtime/scripts，不含 scripts/pack-lib/），无法与运行时侧共享模块，见其自身注释。
 */

const fs = require('fs');
const path = require('path');

// 后端生产依赖的 workspace filter 包（不含 impl-mx，见 buildDeployInstallFilters）。
const DEPLOY_PROD_FILTER_PACKAGES = [
  'backend',
  '@cloudcad/db',
  '@cloudcad/contracts',
  '@cloudcad/engine-exec',
  '@cloudcad/conversion-service',
];

// 私有部署包额外携带 packages/impl-mx（gitignore 的私有包，OSS 包无此目录）。
// 按「目标机是否存在 impl-mx 目录」判定，而非变体参数 —— 部署/验证阶段都拿得到该事实，
// 且避免 pnpm 因找不到 workspace 包而失败。
function hasImplMx(projectRoot) {
  return fs.existsSync(path.join(projectRoot, 'packages', 'impl-mx', 'package.json'));
}

/**
 * 生成 pnpm install 的 --filter 参数数组（含 impl-mx 条件项）。
 * @param {string} projectRoot 部署包根目录（含 packages/）
 * @param {boolean} [includeImplMx] 是否纳入 @cloudcad/impl-mx；省略时按目录存在性判定
 * @returns {string[]} 形如 ['--filter','backend','--filter','@cloudcad/db',...]
 */
function buildDeployInstallFilters(projectRoot, includeImplMx) {
  const withImplMx = includeImplMx === undefined ? hasImplMx(projectRoot) : includeImplMx;
  const pkgs = DEPLOY_PROD_FILTER_PACKAGES.slice();
  if (withImplMx) pkgs.push('@cloudcad/impl-mx');
  const args = [];
  for (const p of pkgs) args.push('--filter', p);
  return args;
}

module.exports = { DEPLOY_PROD_FILTER_PACKAGES, hasImplMx, buildDeployInstallFilters };
