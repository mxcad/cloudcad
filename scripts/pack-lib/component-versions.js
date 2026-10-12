/**
 * 组件版本单一事实源（架构审查 ⑪ C5）
 *
 * 此前 node/postgres/redis 版本字面量散在 5 处（extract-linux-runtime /
 * build-windows-runtime / pack-linux-deploy / ensure-runtime / release.yml），
 * 升 node 忘改某处 → 各端装出不同版本 → 目标机 start.sh 报"找不到 Node.js 运行时"。
 * 收敛到此：版本常量只定义一次，所有消费方 require（升组件版本只改这里）。
 *
 * 三类版本须区分（勿混）：
 *   - COMPONENT_VERSIONS：提取三组件（node/postgres/redis），各端安装时必须同版本。
 *   - PNPM_VERSION：extract-linux-runtime 锁定 pnpm 版本。
 *   - WINDOWS_REDIS_VERSION：Windows redis 发行版号（build-windows 下载源用，
 *     与 Linux redis='5' 不同）。
 */

// 提取三组件（extract-linux-runtime / build-windows-runtime / pack-linux-deploy 共用）
const COMPONENT_VERSIONS = {
  node: '20.19.5',
  postgres: '15',
  redis: '5',
};

// extract-linux-runtime 锁定的 pnpm 版本（npm install -g pnpm@<v>，不参与指纹）
const PNPM_VERSION = '9.15.9';

// Windows redis 发行版号（tporadowski/redis 的 v5.0.14.1，与 Linux redis='5' 不同，不参与指纹）
const WINDOWS_REDIS_VERSION = '5.0.14.1';

module.exports = {
  COMPONENT_VERSIONS,
  PNPM_VERSION,
  WINDOWS_REDIS_VERSION,
};
