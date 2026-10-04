/**
 * 运行时 node 工具依赖清洁检查（出包前门禁的纯函数部分）
 *
 * 背景：runtime/linux/ 在打包清单中是整目录复制，extract-linux-runtime.js 用
 * `cp -rL <打包机全局 node_modules>/*` 把打包机的 npm 全局包整目录搬进
 * runtime/linux/node。打包机上全局安装过的任何 npm 包（AI CLI、IDE 工具等）
 * 都会随部署包静默出包。
 * 2026-10-04 实例：@opencode/cli 213M（含 4 个平台变体二进制）使 Linux 部署包
 * 凭空多出约 96M 压缩体积；reinstall-node-tools.js 的 TOP_AI_TOOLS 黑名单
 * （codebuddy/qwen/qodercli/iflow/cbc）证实同类污染在 Windows 侧也反复发生。
 *
 * Windows 侧由 reinstall-node-tools.js 以 package.json + package-lock.json 为
 * 唯一事实源 `npm ci` 严格还原（先清空再精确安装，天然清除未声明垃圾）；
 * Linux 侧无同类机制，只有整目录复制，故在此补出包前门禁。
 */

const fs = require('fs');
const path = require('path');

/**
 * runtime node 运行时的**直接安装包**白名单（Linux 侧 pnpm 布局适用）。
 * 与 runtime/windows/node/package.json 的 dependencies 一致（两端共同声明的
 * 四个直接依赖；Linux 侧由 extract-linux-runtime.js 的 `npm install -g pnpm pm2`
 * 加上 Node 发行版自带的 npm/corepack 构成）。
 *
 * ⚠ 仅适用于 pnpm 布局（顶层只挂直接安装的包，传递依赖留在各自子目录）。
 * npm 布局（`npm ci`，有 .package-lock.json）会把全部传递依赖扁平化到顶层——
 * Windows 侧实测 120 个顶层条目，此白名单不可直接用于 Windows 侧判定。
 * 若门禁在 npm 布局上跑，会误报上百个合法依赖，需改用 package-lock 事实源。
 */
const RUNTIME_NODE_DIRECT_PACKAGES = ['corepack', 'npm', 'pm2', 'pnpm'];

/**
 * 统计路径占用字节数（文件或目录，目录递归）。
 * 路径不存在或不可读时返回 0——门禁关心的是"多出了什么"，
 * 单个条目统计失败不应让整体判定崩溃。
 */
function pathSize(p) {
  let stat;
  try {
    stat = fs.statSync(p);
  } catch {
    return 0;
  }
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    total += pathSize(path.join(p, e.name));
  }
  return total;
}

/**
 * 扫描 node_modules 顶层，返回白名单外的条目（按体积降序）。
 *
 * 隐藏条目（`.` 开头）一律跳过：它们来自 pnpm/npm 元数据（.pnpm store、
 * .modules.yaml、.package-lock.json），且提取用的 shell glob `*` 本就不匹配。
 * 条目不存在（目录缺失）时返回空数组，交由组件完整性断言负责报缺件。
 *
 * @param {string} nmDir node_modules 目录绝对路径
 * @param {string[]} [allowed] 合法顶层包白名单，默认 RUNTIME_NODE_DIRECT_PACKAGES
 * @returns {Array<{name: string, size: number}>}
 */
function findUnexpectedPackages(nmDir, allowed = RUNTIME_NODE_DIRECT_PACKAGES) {
  let entries;
  try {
    entries = fs.readdirSync(nmDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const allowedSet = new Set(allowed);
  return entries
    .filter((e) => !e.name.startsWith('.') && !allowedSet.has(e.name))
    .map((e) => ({
      name: e.name,
      size: pathSize(path.join(nmDir, e.name)),
    }))
    .sort((a, b) => b.size - a.size);
}

module.exports = {
  RUNTIME_NODE_DIRECT_PACKAGES,
  findUnexpectedPackages,
};
