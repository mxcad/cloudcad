/**
 * @fileoverview 字节尺寸格式化单一事实源（打包侧）
 *
 * pack-offline / pack-linux-deploy / extract-linux-runtime /
 * verify-linux-deploy 等脚本曾各持一份逐字节相同的 formatSize 副本，
 * reinstall-node-tools 另有一份 1 位小数变体。收敛为单一实现：
 * B/KB/MB/GB 阶梯，小数位可配（默认 2，与五脚本历史行为一致）。
 */
function formatSize(bytes, decimals = 2) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(decimals)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(decimals)} GB`;
}

module.exports = { formatSize };
