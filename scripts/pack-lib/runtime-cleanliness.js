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

/**
 * 只复制 node_modules 顶层白名单内的包，返回实际复制与排除的条目。
 *
 * findUnexpectedPackages 是出包前门禁（拦截），本函数是源头治理：
 * extract-linux-runtime.js 原以 `cp -rL ${nodeModulesPath}/*` 整目录搬打包机
 * 全局 node_modules，打包机全局装过的任何 npm 包都会随部署包静默发货。
 *
 * 语义对齐原 shell `cp -rL`：recursive 递归、dereference 解引用软链
 * （pnpm 全局包内指向 .pnpm store 的软链不解引用会断链）。
 * 隐藏条目（`.` 开头）跳过——它们是 pnpm/npm 元数据，原 shell glob `*` 亦不匹配。
 * 复制失败直接抛错中止，与原 execSync 失败即中止一致。
 *
 * @param {string} srcDir 打包机全局 node_modules 目录
 * @param {string} dstDir 部署包内的 node_modules 目录
 * @param {string[]} [allowlist] 允许复制的顶层包，默认 RUNTIME_NODE_DIRECT_PACKAGES
 * @returns {{copied: string[], skipped: string[]}}
 */
function copyNodeModulesOnly(srcDir, dstDir, allowlist = RUNTIME_NODE_DIRECT_PACKAGES) {
  let names = [];
  try {
    names = fs.readdirSync(srcDir);
  } catch {
    return { copied: [], skipped: [] };
  }
  const allowSet = new Set(allowlist);
  const copied = [];
  const skipped = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    if (!allowSet.has(name)) {
      skipped.push(name);
      continue;
    }
    fs.cpSync(path.join(srcDir, name), path.join(dstDir, name), {
      recursive: true,
      dereference: true,
    });
    copied.push(name);
  }
  return { copied, skipped };
}

/**
 * 校验运行时工具是否齐全，返回缺失的包名。
 *
 * 供复制后断言用：nodeModulesPath 探测路径写错（node 装在自定义前缀时探测只认
 * /usr/local/lib 与 /usr/lib 两个硬编码路径）或 `npm install -g` 失败时，
 * 白名单复制会产出空目录——没有此断言，部署包会静默缺 pnpm/pm2 后照常出包。
 *
 * @returns {string[]} 缺失的包名
 */
function missingNodePackages(dstDir, required = RUNTIME_NODE_DIRECT_PACKAGES) {
  return required.filter((name) => {
    try {
      return !fs.existsSync(path.join(dstDir, name));
    } catch {
      return true;
    }
  });
}

// ==================== PG JIT 死重识别（extract 与 pack 出包清理共用） ====================

/**
 * PostgreSQL JIT 组件识别（d8ce83f 裁定移除，运行时 pg-manager 写 jit=off）：
 *   - libLLVM-*.so.N  LLVM 运行时（~110MB，llvmjit.so 运行时 dlopen 它，postgres 本身不链）
 *   - llvmjit*        JIT 插件本体
 *   - bitcode/        LLVM 位码目录（供 JIT 内联优化，~30-60MB）
 * OLTP 业务用不上 JIT（只加速秒级以上分析型大查询），纯部署包死重。
 */
const PG_JIT_LIB_PREFIXES = ['libLLVM-', 'llvmjit'];
const PG_JIT_DIR_NAMES = ['bitcode'];

/** 是否为 JIT 死重条目（文件名或目录名） */
function isPgJitEntry(name) {
  return (
    PG_JIT_LIB_PREFIXES.some((prefix) => name.startsWith(prefix)) ||
    PG_JIT_DIR_NAMES.includes(name)
  );
}

/**
 * 扫描 postgres/lib 下的 JIT 死重，返回绝对路径列表（文件与目录混排）。
 *
 * copyPgLibs 只在「复制」时按前缀排除，删除不了更早版本遗留的同名文件/目录：
 * 旧缓存（含 bitcode/ 的 cp -r 时代产物）会经 isRuntimeExtracted 关键文件检查
 * 被判「缓存命中」直接复用，JIT 死重随包回来。故复用与出包两条路径都必须
 * 主动检查（extract 的缓存命中自愈 + pack-offline 的出包前清理）。
 *
 * @param {string} pgLibDir 部署产物 postgres/lib 目录绝对路径
 * @returns {string[]}
 */
function findPgJitJunk(pgLibDir) {
  let entries;
  try {
    entries = fs.readdirSync(pgLibDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => isPgJitEntry(e.name))
    .map((e) => path.join(pgLibDir, e.name));
}

module.exports = {
  RUNTIME_NODE_DIRECT_PACKAGES,
  copyNodeModulesOnly,
  findUnexpectedPackages,
  missingNodePackages,
  PG_JIT_LIB_PREFIXES,
  PG_JIT_DIR_NAMES,
  isPgJitEntry,
  findPgJitJunk,
  pathSize,
};
