/**
 * 组件版本 + 指纹单一事实源（架构审查 ⑪ C5）
 *
 * 此前 node/postgres/redis 版本 + 指纹字面量散在 5 处（pack-runtime-deps /
 * ensure-runtime / extract-linux-runtime / build-windows-runtime / release.yml），
 * 升 node 忘改某处 → runtime-deps 内容寻址资产指纹不变但内容变 → 旧资产被永久复用，
 * 目标机 start.sh 报"找不到 Node.js 运行时"。收敛到此：版本常量 + 指纹派生只定义一次，
 * 所有消费方 require（升组件版本只改这里）。
 *
 * 三类版本须区分（勿混）：
 *   - COMPONENT_VERSIONS：指纹三组件（node/postgres/redis），决定 runtime-deps 资产名。
 *   - PNPM_VERSION：extract-linux-runtime 锁定 pnpm 版本（不参与指纹）。
 *   - WINDOWS_REDIS_VERSION：Windows redis 发行版号（build-windows 下载源用，
 *     与 Linux redis='5' 不同，不参与指纹）。
 */

// 指纹三组件（决定 runtime-deps 内容寻址资产名 cloudcad-runtime-deps-<os>-<arch>-<fp>.tar.gz）
const COMPONENT_VERSIONS = {
  node: '20.19.5',
  postgres: '15',
  redis: '5',
};

// extract-linux-runtime 锁定的 pnpm 版本（npm install -g pnpm@<v>，不参与指纹）
const PNPM_VERSION = '9.15.9';

// Windows redis 发行版号（tporadowski/redis 的 v5.0.14.1，与 Linux redis='5' 不同，不参与指纹）
const WINDOWS_REDIS_VERSION = '5.0.14.1';

/**
 * 组件版本指纹：node20.19.5-pg15-redis5
 * 由 COMPONENT_VERSIONS 派生（勿手写字面量），升组件版本改 COMPONENT_VERSIONS 即自动更新。
 */
function componentFingerprint() {
  return `node${COMPONENT_VERSIONS.node}-pg${COMPONENT_VERSIONS.postgres}-redis${COMPONENT_VERSIONS.redis}`;
}

module.exports = {
  COMPONENT_VERSIONS,
  PNPM_VERSION,
  WINDOWS_REDIS_VERSION,
  componentFingerprint,
};
