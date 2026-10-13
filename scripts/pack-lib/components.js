/**
 * 标准运行时组件清单（单一事实源）
 *
 * extract-linux-runtime.js / pack-offline.js / ensure-runtime.js 共用，
 * 消灭 4 份内联定义（架构审查 ⑪）。此前各脚本各写一份关键可执行文件清单，
 * 且内容寻址资产 gate 只查 4 个顶层组件目录、漏掉嵌在 node 内的 pm2——
 * 残缺资产指纹不变会被永久复用，目标机 start.sh 报"找不到 Node.js 运行时"。
 * 收敛到此：关键文件路径只在此定义一次。
 *
 * 命名约定：目录名用 'subversion'（runtime/linux/ 下的实际目录名）；
 * extract-linux-runtime 内部逻辑名 'svn' 经 componentDirName 映射到 'subversion'。
 * Windows 侧无 subversion 组件——svn 能力由产品二进制 mxversion（mx.exe）提供，
 * 见 packages/mxVersionTool/mxpath.js。
 */

// Linux 组件目录名（runtime/linux/<dir>，也是提取缓存 runtime/cache/linux-extract/<os>/ 下的目录名）。
const LINUX_COMPONENT_DIRS = ['node', 'postgres', 'redis', 'subversion'];

// 各组件关键可执行文件（相对组件目录）。缓存命中判定 + 提取后断言 + 出包前 gate 共用。
// 只查"目录存在"会把"目录在但内容残缺"（如 node/bin/node 缺失）误判为就绪。
const LINUX_CRITICAL_FILES = {
  node: 'bin/node',
  postgres: 'bin/postgres',
  redis: 'redis-server',
  subversion: 'svn',
};

// Windows 标准组件关键可执行文件（相对组件目录）。
// 目录名与 Linux 不同：postgresql（Linux 为 postgres）；Windows 无 subversion。
const WINDOWS_CRITICAL_FILES = {
  node: 'node.exe',
  redis: 'redis-server.exe',
  postgresql: 'pgsql/bin/initdb.exe',
};

// Windows 资产/部署包 gate 的完整必需文件清单（相对 runtime/windows）。
// 在 3 个标准组件关键文件之外额外断言两项：
// - node/node_modules/pm2/bin/pm2 —— 与 Linux 侧同构，嵌在 node 内，缺了目标机 PM2 起不来
// - postgresql/pgsql/bin/pg_ctl.exe —— 启动/停止 PG 必需（initdb 只用于初始化）
// Windows 侧此前无此清单：gate 清单内联在 pack-assertions.js（5 项）、readiness 断言
// 又内联在 build-windows-runtime.js（3 项），与本文件的 WINDOWS_CRITICAL_FILES 三份不一致。
const WINDOWS_ASSET_REQUIRED_FILES = [
  `node/${WINDOWS_CRITICAL_FILES.node}`,
  'node/node_modules/pm2/bin/pm2',
  `postgresql/${WINDOWS_CRITICAL_FILES.postgresql}`,
  'postgresql/pgsql/bin/pg_ctl.exe',
  `redis/${WINDOWS_CRITICAL_FILES.redis}`,
];

// 产品二进制（mxcad / mxversion）关键可执行文件，按平台区分。
// ensure-runtime 用此判定"已下载解压的目录是否完整"：部分解压（下载中断）留下的
// 非空目录会被"目录非空"判定误判为就绪，而实际缺关键二进制。
// 文件名取代码实际解析的那个，不是发行包里的别名：
//   mxcad      → packages/backend/src/config/configuration.ts 解析 mxcadassembly(.exe)
//                （发行包另带 0 字节的 mx 符号链接，不可作就绪判据）
//   mxversion  → packages/mxVersionTool/mxpath.js 解析 mx.exe（Windows svn 能力）
const PRODUCT_CRITICAL_FILES = {
  mxcad: { linux: 'mxcadassembly', windows: 'mxcadassembly.exe' },
  mxversion: { windows: 'mx.exe' },
};

// 资产/部署包 gate 的完整必需文件清单（相对 runtime/linux 或提取缓存根）。
// 在 4 个标准组件关键文件之外，额外断言嵌在 node 内的 pm2——pm2 缺失与 node 残缺
// 同构（内容寻址资产会被永久复用），故必须纳入 gate。
const LINUX_ASSET_REQUIRED_FILES = [
  `node/${LINUX_CRITICAL_FILES.node}`,
  'node/node_modules/pm2/bin/pm2',
  `postgres/${LINUX_CRITICAL_FILES.postgres}`,
  `redis/${LINUX_CRITICAL_FILES.redis}`,
  `subversion/${LINUX_CRITICAL_FILES.subversion}`,
];

module.exports = {
  LINUX_COMPONENT_DIRS,
  LINUX_CRITICAL_FILES,
  LINUX_ASSET_REQUIRED_FILES,
  WINDOWS_CRITICAL_FILES,
  WINDOWS_ASSET_REQUIRED_FILES,
  PRODUCT_CRITICAL_FILES,
};
