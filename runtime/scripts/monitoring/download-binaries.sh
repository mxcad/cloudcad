#!/usr/bin/env bash
# 梦想网页CAD实时协同平台 监控栈二进制预下载脚本（ADR-0055 §3）
# 离线部署场景需提前下载二进制随安装包分发（toC/toB 无外网环境）。
# 版本与 docker/monitoring compose 变体锁定一致（见 docker/docker-compose.monitoring.yml）。
#
# 使用方式（在有外网的打包机执行）：
#   ./runtime/scripts/monitoring/download-binaries.sh            # 默认 linux-amd64
#   ./runtime/scripts/monitoring/download-binaries.sh arm64      # 指定架构
#   ARCH="linux-arm64" ./runtime/scripts/monitoring/download-binaries.sh
#   VENDOR_DIR=/path/to/runtime/vendor/monitoring ./runtime/scripts/monitoring/download-binaries.sh
#
# 产物：runtime/vendor/monitoring/<平台>/<组件>/（解压后的可执行文件）

set -euo pipefail

# ==================== 版本锁定（与 compose 变体一致）====================
PROM_VERSION=${PROM_VERSION:-2.53.0}
LOKI_VERSION=${LOKI_VERSION:-3.1.0}
GRAFANA_VERSION=${GRAFANA_VERSION:-11.1.0}
ALERTMANAGER_VERSION=${ALERTMANAGER_VERSION:-0.27.0}
# Promtail 与 Loki 同版本
PROMTAIL_VERSION=${PROMTAIL_VERSION:-${LOKI_VERSION}}

# 默认 linux-amd64；可传入 arm64 或 ARCH=linux-arm64
ARCH=${1:-${ARCH:-linux-amd64}}
if [[ "$ARCH" != "linux-amd64" && "$ARCH" != "linux-arm64" ]]; then
  echo "不支持架构: $ARCH（支持 linux-amd64 / linux-arm64）" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 默认下载到 runtime/vendor/monitoring/
VENDOR_DIR=${VENDOR_DIR:-"$SCRIPT_DIR/../../vendor/monitoring"}
DEST="$VENDOR_DIR/$ARCH"

mkdir -p "$DEST"

# GitHub 发行版下载基地址
GH_BASE="https://github.com"

log() { echo "[download-monitoring] $*"; }

# download_and_extract <组件名> <完整下载URL> <解压后二进制在包内路径>
download_and_extract() {
  local name="$1" url="$2" inner="$3"
  local pkg="$DEST/$name.tar.gz"
  log "下载 $name ($url)"
  if ! curl -fsSL "$url" -o "$pkg"; then
    echo "  ✗ 下载失败: $name（请检查网络与版本号）" >&2
    return 1
  fi
  log "  解压 $name"
  mkdir -p "$DEST/$name"
  tar -xzf "$pkg" -C "$DEST/$name"
  # 找到并复制二进制到组件根目录（默认取第一层目录内的同名文件）
  find "$DEST/$name" -type f -name "$(basename "$inner")" -exec cp {} "$DEST/$name/$(basename "$inner")" \; 2>/dev/null || true
  chmod +x "$DEST/$name/$(basename "$inner")" 2>/dev/null || true
  rm -f "$pkg"
  log "  ✓ $name -> $DEST/$name/"
}

echo "=== 梦想网页CAD实时协同平台 监控栈二进制预下载 ==="
echo "架构: $ARCH  目标: $DEST"
echo ""

# 1. Prometheus
download_and_extract prometheus \
  "$GH_BASE/prometheus/prometheus/releases/download/v${PROM_VERSION}/prometheus-${PROM_VERSION}.${ARCH}.tar.gz" \
  "prometheus"

# 2. Loki（含 promtail；单二进制）
download_and_extract loki \
  "$GH_BASE/grafana/loki/releases/download/v${LOKI_VERSION}/loki-${LOKI_VERSION}.${ARCH}.zip" \
  "loki" 2>/dev/null || \
download_and_extract loki \
  "$GH_BASE/grafana/loki/releases/download/v${LOKI_VERSION}/loki-linux-${ARCH#linux-}.zip" \
  "loki"

# 3. Promtail（业务机日志采集）
download_and_extract promtail \
  "$GH_BASE/grafana/loki/releases/download/v${PROMTAIL_VERSION}/promtail-${PROMTAIL_VERSION}.${ARCH}.zip" \
  "promtail" 2>/dev/null || \
download_and_extract promtail \
  "$GH_BASE/grafana/loki/releases/download/v${PROMTAIL_VERSION}/promtail-linux-${ARCH#linux-}.zip" \
  "promtail"

# 4. Alertmanager
download_and_extract alertmanager \
  "$GH_BASE/prometheus/alertmanager/releases/download/v${ALERTMANAGER_VERSION}/alertmanager-${ALERTMANAGER_VERSION}.${ARCH}.tar.gz" \
  "alertmanager"

# 5. Grafana（tar.gz 含 grafana-server）
download_and_extract grafana \
  "https://dl.grafana.com/oss/release/grafana-${GRAFANA_VERSION}.${ARCH}.tar.gz" \
  "grafana"

echo ""
echo "=== 完成 ==="
echo "离线分发：将 $VENDOR_DIR 整个目录随安装包携带（docs/ops/monitoring-baremetal.md 有说明）"
