#!/usr/bin/env bash
# 梦想网页CAD实时协同平台 监控栈裸机安装脚本（ADR-0055 §3）
# 在裸机/多机（无 docker）节点上安装监控栈：读取配置 → 生成 systemd unit + 配置文件 → 启用并启动。
# 与 docker-compose 变体功能等价，复用同一份 promtail 模板 / alert-rules / 配置源（docker/monitoring/）。
#
# 前置：
#   1. 先运行 download-binaries.sh 获取二进制（runtime/vendor/monitoring/<arch>/）
#   2. 以 root 或具 systemd 权限用户运行
#
# 使用方式：
#   ./runtime/scripts/monitoring/install-monitoring.sh \
#       --role stack \                      # stack=监控栈节点；agent=业务机(Promtail)
#       --data-dir /app/data/monitoring \
#       --scrape-token <SCRAPE_TOKEN> \
#       --scrape-target 127.0.0.1:3001 \    # 后端 /api/metrics 的 host:port
#       --loki-url http://<monitor-host>:3100/loki/api/v1/push \
#       --smtp-host smtp.example.com --alert-email-to ops@example.com
#   也可用环境变量 CLOUDCAD_MONITORING_* 或配置文件（--config /etc/cloudcad/monitoring.conf）传入。
#
# 子命令：install / uninstall / status / restart

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ==================== 默认配置 ====================
# 可通过环境变量 CLOUDCAD_MONITORING_<KEY> 或 --<key> 覆盖
: "${CM_USER:=cloudcad}"
: "${CM_DATA_DIR:=/app/data/monitoring}"
: "${CM_CONFIG_DIR:=/etc/cloudcad/monitoring}"
: "${CM_VENDOR:=$REPO_ROOT/runtime/vendor/monitoring}"
: "${CM_ARCH:=linux-amd64}"
: "${CM_ROLE:=stack}"              # stack | agent
: "${CM_SCRAPE_TOKEN:=}"
: "${CM_SCRAPE_TARGET:=127.0.0.1:3001}"
: "${CM_LOKI_URL:=http://127.0.0.1:3100/loki/api/v1/push}"
: "${CM_NODE_NAME:=$(hostname)}"
: "${CM_ENV:=prod}"
: "${CM_LOG_ROOT:=/app/data/logs}"
: "${CM_SMTP_HOST:=}"
: "${CM_SMTP_PORT:=587}"
: "${CM_SMTP_FROM:=梦想网页CAD实时协同平台 Alert <noreply@cloudcad.com>}"
: "${CM_SMTP_AUTH_USERNAME:=}"
: "${CM_SMTP_AUTH_PASSWORD:=}"
: "${CM_ALERT_EMAIL_TO:=}"
: "${CM_GRAFANA_ADMIN_USER:=admin}"
: "${CM_GRAFANA_ADMIN_PASSWORD:=}"
: "${CM_ALERTMANAGER_ADDR:=127.0.0.1:9093}"   # Prometheus 发现 Alertmanager 的地址

log() { echo "[install-monitoring] $*"; }
die() { echo "[install-monitoring] ERROR: $*" >&2; exit 1; }

# ==================== 参数解析 ====================
ACTION=install
while [[ $# -gt 0 ]]; do
  case "$1" in
    install|uninstall|status|restart) ACTION="$1"; shift ;;
    --role) CM_ROLE="$2"; shift 2 ;;
    --data-dir) CM_DATA_DIR="$2"; shift 2 ;;
    --config-dir) CM_CONFIG_DIR="$2"; shift 2 ;;
    --vendor) CM_VENDOR="$2"; shift 2 ;;
    --arch) CM_ARCH="$2"; shift 2 ;;
    --scrape-token) CM_SCRAPE_TOKEN="$2"; shift 2 ;;
    --scrape-target) CM_SCRAPE_TARGET="$2"; shift 2 ;;
    --loki-url) CM_LOKI_URL="$2"; shift 2 ;;
    --node-name) CM_NODE_NAME="$2"; shift 2 ;;
    --env) CM_ENV="$2"; shift 2 ;;
    --log-root) CM_LOG_ROOT="$2"; shift 2 ;;
    --smtp-host) CM_SMTP_HOST="$2"; shift 2 ;;
    --smtp-port) CM_SMTP_PORT="$2"; shift 2 ;;
    --smtp-from) CM_SMTP_FROM="$2"; shift 2 ;;
    --smtp-auth-username) CM_SMTP_AUTH_USERNAME="$2"; shift 2 ;;
    --smtp-auth-password) CM_SMTP_AUTH_PASSWORD="$2"; shift 2 ;;
    --alert-email-to) CM_ALERT_EMAIL_TO="$2"; shift 2 ;;
    --grafana-admin-user) CM_GRAFANA_ADMIN_USER="$2"; shift 2 ;;
    --grafana-admin-password) CM_GRAFANA_ADMIN_PASSWORD="$2"; shift 2 ;;
    --alertmanager-addr) CM_ALERTMANAGER_ADDR="$2"; shift 2 ;;
    *) die "未知参数: $1" ;;
  esac
done

# ==================== 校验 ====================
[[ -n "$CM_SCRAPE_TOKEN" ]] || die "缺少 SCRAPE_TOKEN（--scrape-token）"
VENDOR_BIN="$CM_VENDOR/$CM_ARCH"
command -v systemctl >/dev/null 2>&1 || die "未检测到 systemd（systemctl 不可用），本脚本仅支持 systemd 部署"
id "$CM_USER" >/dev/null 2>&1 || die "用户 $CM_USER 不存在，请先创建（useradd -r -s /sbin/nologin $CM_USER）"

# ==================== 目录准备 ====================
prepare_dirs() {
  mkdir -p "$CM_CONFIG_DIR" "$CM_DATA_DIR"
  # 数据目录 0750 / 权限收归 CM_USER（等保 8.4.3.3）
  chown "$CM_USER:$CM_USER" "$CM_DATA_DIR" 2>/dev/null || true
  chmod 0750 "$CM_DATA_DIR"
}

# ==================== 渲染 systemd unit ====================
render_unit() {
  local src="$1" dst="$2" vendordir="$3" datadir="$4" posdir="$5"
  sed -e "s|__USER__|$CM_USER|g" \
      -e "s|__VENDOR__|$vendordir|g" \
      -e "s|__CONFIG_DIR__|$CM_CONFIG_DIR|g" \
      -e "s|__DATA_DIR__|$datadir|g" \
      -e "s|__POSITION_DIR__|$posdir|g" \
      "$src" > "$dst"
  chmod 0644 "$dst"
  log "生成 unit: $dst"
}

# ==================== 渲染配置文件 ====================
# Prometheus：compose 变体配置（docker/monitoring/prometheus/prometheus.yml）含
# ${SCRAPE_TOKEN} / ${SCRAPE_TARGET_HOST} env 占位 + alertmanager:9093 容器主机名，
# 裸机场景由本脚本渲染成实际值。
render_prometheus() {
  local src="$REPO_ROOT/docker/monitoring/prometheus/prometheus.yml"
  local dst="$CM_CONFIG_DIR/prometheus/prometheus.yml"
  mkdir -p "$(dirname "$dst")"
  sed -e "s|\${SCRAPE_TOKEN}|$CM_SCRAPE_TOKEN|g" \
      -e "s|\${SCRAPE_TARGET_HOST:-cloudcad-app:80}|$CM_SCRAPE_TARGET|g" \
      -e "s|alertmanager:9093|$CM_ALERTMANAGER_ADDR|g" \
      -e "s|/etc/prometheus/alert-rules.yml|$CM_CONFIG_DIR/prometheus/alert-rules.yml|g" \
      "$src" > "$dst"
  cp "$REPO_ROOT/docker/monitoring/prometheus/alert-rules.yml" "$CM_CONFIG_DIR/prometheus/alert-rules.yml"
  log "生成 Prometheus 配置: $dst"
}

render_loki() {
  local src="$REPO_ROOT/docker/monitoring/loki/local-config.yaml"
  local dst="$CM_CONFIG_DIR/loki/local-config.yaml"
  mkdir -p "$(dirname "$dst")"
  # 裸机场景：容器内数据路径 /loki → 实际数据目录 $CM_DATA_DIR/loki
  sed -e "s|/loki|$CM_DATA_DIR/loki|g" "$src" > "$dst"
  log "生成 Loki 配置: $dst"
}

render_alertmanager() {
  local src="$REPO_ROOT/docker/monitoring/alertmanager/alertmanager.yml"
  local dst="$CM_CONFIG_DIR/alertmanager/alertmanager.yml"
  mkdir -p "$(dirname "$dst")"
  [[ -n "$CM_SMTP_HOST" ]] || die "告警邮件需要 --smtp-host"
  [[ -n "$CM_ALERT_EMAIL_TO" ]] || die "告警邮件需要 --alert-email-to"
  sed -e "s|\${ALERT_EMAIL_TO}|$CM_ALERT_EMAIL_TO|g" \
      -e "s|\${SMTP_FROM}|$CM_SMTP_FROM|g" \
      -e "s|\${SMTP_SMARTHOST}|$CM_SMTP_HOST:$CM_SMTP_PORT|g" \
      -e "s|\${SMTP_AUTH_USERNAME}|$CM_SMTP_AUTH_USERNAME|g" \
      -e "s|\${SMTP_AUTH_PASSWORD}|$CM_SMTP_AUTH_PASSWORD|g" \
      "$src" > "$dst"
  log "生成 Alertmanager 配置: $dst"
}

render_grafana() {
  local dst="$CM_CONFIG_DIR/grafana"
  mkdir -p "$dst/provisioning/datasources" "$dst/provisioning/dashboards"
  cp "$REPO_ROOT/docker/monitoring/grafana/provisioning/datasources/datasources.yml" "$dst/provisioning/datasources/datasources.yml"
  cp "$REPO_ROOT/docker/monitoring/grafana/provisioning/dashboards/dashboards.yml" "$dst/provisioning/dashboards/dashboards.yml"
  # 生成 grafana.ini（单管理员登录认证）
  [[ -n "$CM_GRAFANA_ADMIN_PASSWORD" ]] || die "需要 --grafana-admin-password"
  cat > "$dst/grafana.ini" <<EOF
[server]
http_port = 3005
root_url = http://127.0.0.1:3005/

[security]
admin_user = $CM_GRAFANA_ADMIN_USER
admin_password = $CM_GRAFANA_ADMIN_PASSWORD
disable_gravatar = true

[users]
allow_sign_up = false

[auth.anonymous]
enabled = false

[analytics]
reporting_enabled = false
EOF
  chmod 0640 "$dst/grafana.ini"
  log "生成 Grafana 配置: $dst"
}

render_promtail() {
  local src="$REPO_ROOT/runtime/scripts/monitoring/promtail/promtail.yml"
  local dst="$CM_CONFIG_DIR/promtail/promtail.yml"
  mkdir -p "$(dirname "$dst")"
  sed -e "s|{{ LOKI_URL }}|$CM_LOKI_URL|g" \
      -e "s|{{ NODE_NAME }}|$CM_NODE_NAME|g" \
      -e "s|{{ ENV }}|$CM_ENV|g" \
      -e "s|{{ LOG_ROOT }}|$CM_LOG_ROOT|g" \
      "$src" > "$dst"
  log "生成 Promtail 配置: $dst"
}

# ==================== 安装 ====================
install_stack() {
  prepare_dirs
  local sysdir="$CM_CONFIG_DIR/systemd"
  mkdir -p "$sysdir"
  # 渲染 4 个监控栈服务 unit
  render_unit "$SCRIPT_DIR/systemd/cloudcad-prometheus.service"   "$sysdir/cloudcad-prometheus.service"   "$VENDOR_BIN/prometheus"   "$CM_DATA_DIR" ""
  render_unit "$SCRIPT_DIR/systemd/cloudcad-loki.service"         "$sysdir/cloudcad-loki.service"         "$VENDOR_BIN/loki"         "$CM_DATA_DIR" ""
  render_unit "$SCRIPT_DIR/systemd/cloudcad-grafana.service"      "$sysdir/cloudcad-grafana.service"      "$VENDOR_BIN/grafana"      "$CM_DATA_DIR" ""
  render_unit "$SCRIPT_DIR/systemd/cloudcad-alertmanager.service" "$sysdir/cloudcad-alertmanager.service" "$VENDOR_BIN/alertmanager" "$CM_DATA_DIR" ""
  render_prometheus
  render_loki
  render_alertmanager
  render_grafana
  # 安装 unit 到 systemd 并启用
  for svc in cloudcad-prometheus cloudcad-loki cloudcad-grafana cloudcad-alertmanager; do
    cp "$sysdir/$svc.service" /etc/systemd/system/$svc.service
  done
  systemctl daemon-reload
  for svc in cloudcad-prometheus cloudcad-loki cloudcad-grafana cloudcad-alertmanager; do
    systemctl enable --now "$svc"
  done
  log "监控栈安装完成（Prometheus 9090 / Loki 3100 / Grafana 3005 / Alertmanager 9093）"
}

install_agent() {
  prepare_dirs
  local sysdir="$CM_CONFIG_DIR/systemd"
  mkdir -p "$sysdir"
  [[ -n "$CM_LOKI_URL" ]] || die "Promtail 需要 --loki-url"
  # Promtail 续传位置目录
  local posdir="/var/lib/cloudcad-promtail"
  mkdir -p "$posdir"
  chown "$CM_USER:$CM_USER" "$posdir" 2>/dev/null || true
  render_unit "$SCRIPT_DIR/systemd/cloudcad-promtail.service" "$sysdir/cloudcad-promtail.service" "$VENDOR_BIN/promtail" "" "$posdir"
  render_promtail
  cp "$sysdir/cloudcad-promtail.service" /etc/systemd/system/cloudcad-promtail.service
  systemctl daemon-reload
  systemctl enable --now cloudcad-promtail
  log "Promtail 安装完成（业务机日志 → $CM_LOKI_URL）"
}

uninstall() {
  if [[ "$CM_ROLE" == "stack" ]]; then
    for svc in cloudcad-prometheus cloudcad-loki cloudcad-grafana cloudcad-alertmanager; do
      systemctl disable --now "$svc" 2>/dev/null || true
      rm -f /etc/systemd/system/$svc.service
    done
  else
    systemctl disable --now cloudcad-promtail 2>/dev/null || true
    rm -f /etc/systemd/system/cloudcad-promtail.service
  fi
  systemctl daemon-reload
  log "已卸载相关 systemd 服务（配置保留在 $CM_CONFIG_DIR）"
}

show_status() {
  if [[ "$CM_ROLE" == "stack" ]]; then
    systemctl status cloudcad-prometheus cloudcad-loki cloudcad-grafana cloudcad-alertmanager --no-pager || true
  else
    systemctl status cloudcad-promtail --no-pager || true
  fi
}

restart() {
  if [[ "$CM_ROLE" == "stack" ]]; then
    for svc in cloudcad-prometheus cloudcad-loki cloudcad-grafana cloudcad-alertmanager; do
      systemctl restart "$svc"
    done
  else
    systemctl restart cloudcad-promtail
  fi
  log "已重启"
}

# ==================== 执行 ====================
# 仅在直接执行（非 source）时运行；source 场景（如单测）只暴露函数定义
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
case "$ACTION" in
  install)
    [[ -d "$VENDOR_BIN" ]] || die "未找到二进制目录 $VENDOR_BIN，请先运行 download-binaries.sh"
    if [[ "$CM_ROLE" == "stack" ]]; then
      install_stack
    else
      install_agent
    fi
    ;;
  uninstall) uninstall ;;
  status) show_status ;;
  restart) restart ;;
esac
fi
