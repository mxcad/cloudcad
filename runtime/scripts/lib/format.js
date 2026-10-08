/**
 * @fileoverview 字节尺寸格式化——runtime 侧单一事实源
 *
 * 部署包只含 runtime/scripts（见 scripts/pack-lib/manifest.js），不含打包侧
 * scripts/pack-lib/format.js，故 runtime 脚本（db-backup / log-center）无法引用
 * 打包侧 canonical，需在此独立一份。与打包侧同构：B/KB/MB/GB 阶梯，小数位可配
 * （默认 2），并对非有限/负值兜底 '-'（log-center 历史行为）。
 */
function formatSize(bytes, decimals = 2) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(decimals)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(decimals)} GB`;
}

module.exports = { formatSize };
