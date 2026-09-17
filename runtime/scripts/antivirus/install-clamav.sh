#!/usr/bin/env bash
# 梦想网页CAD实时协同平台 ClamAV 部署脚本（#421 等保 8.1.3.4/8.1.4.5 恶意代码防范）
#
# 职责：安装 clamav/clamscan/freshclam → 建隔离目录 → 落夜间批扫定时任务（cron 03:30，nice/ionice 降优先级）。
# 作为部署可选步骤（推荐，在线版专属；离线 TOB 部署包不含此组件）。
#
# 前置：
#   - 以 root 或具 cron/systemd 权限用户运行
#   - 已按 docs/ops/malware-prevention.md 理解隔离/误报恢复流程
#
# 使用方式：
#   ./runtime/scripts/antivirus/install-clamav.sh install     # 安装 + 隔离目录 + cron 定时
#   ./runtime/scripts/antivirus/install-clamav.sh uninstall   # 移除 cron 定时（包不卸载，隔离区保留）
#   ./runtime/scripts/antivirus/install-clamav.sh status      # 查看 clamav 版本 + cron 条目
#   ./runtime/scripts/antivirus/install-clamav.sh verify      # 验证 clamscan 可用 + EICAR 自检
#
# 参数（环境变量覆盖）：
#   CLAMAV_CRON_SCHEDULE  cron 表达式（默认 "30 3 * * *"，即每日 03:30）
#   CLAMAV_QUARANTINE    隔离目录（默认 <root>/data/quarantine）
#   CLAMAV_SCAN_DIRS     扫描目录（默认 <root>/data/files <root>/data/archives）
#   CLAMAV_SKIP_DIRS     跳过目录（默认空）
#
# 说明：
#   - 定时任务用 cron（跨发行版通用，离线/在线均可用），非 systemd timer（避免发行版差异）。
#   - cron 行带 nice 10 / ionice 降优先级，避免夜间批扫抢占业务 IO/CPU。
#   - 扫描逻辑全部在 scan-malware.sh（含 freshclam 更新、隔离、审计、P1 告警）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SCAN_SCRIPT="$SCRIPT_DIR/scan-malware.sh"

: "${CLAMAV_CRON_SCHEDULE:=30 3 * * *}"
: "${CLAMAV_QUARANTINE:=$PROJECT_ROOT/data/quarantine}"
: "${CLAMAV_SCAN_DIRS:=$PROJECT_ROOT/data/files $PROJECT_ROOT/data/archives}"
: "${CLAMAV_SKIP_DIRS:=}"

CRON_TAG="# cloudcad-clamav-nightly"   # cron 行标记，uninstall 时据此精准移除
CRON_LINE="$CLAMAV_CRON_SCHEDULE nice -n 10 ionice -c2 -n7 env CLAMAV_QUARANTINE=$CLAMAV_QUARANTINE CLAMAV_SCAN_DIRS=\"$CLAMAV_SCAN_DIRS\" CLAMAV_SKIP_DIRS=\"$CLAMAV_SKIP_DIRS\" $SCAN_SCRIPT >> $PROJECT_ROOT/data/logs/antivirus/cron.log 2>&1 $CRON_TAG"

log() { echo "[install-clamav] $*"; }
die() { echo "[install-clamav] ERROR: $*" >&2; exit 1; }

# ==================== 发行版探测 ====================
detect_distro() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

is_rhel_family() {
  case "$1" in
    rhel|rocky|centos|fedora|almalinux|opensuse*) return 0 ;;
    *) return 1 ;;
  esac
}

# ==================== 子命令 ====================
install() {
  local distro
  distro="$(detect_distro)"
  log "发行版=$distro"

  # 安装 clamav（clamscan + freshclam 随 clamav 包）
  if ! command -v clamscan >/dev/null 2>&1; then
    log "安装 clamav..."
    if is_rhel_family "$distro"; then
      # RHEL 系 clamav 在 EPEL
      (dnf install -y epel-release || yum install -y epel-release) 2>/dev/null || true
      dnf install -y clamav clamav-freshclam || yum install -y clamav clamav-freshclam
    else
      apt-get update && apt-get install -y clamav clamav-freshclam
    fi
  else
    log "clamscan 已安装，跳过"
  fi

  # 建隔离目录（0750：属主可读写、属组可读，其他无权限）
  mkdir -p "$CLAMAV_QUARANTINE"
  chmod 0750 "$CLAMAV_QUARANTINE"
  log "隔离目录就绪: $CLAMAV_QUARANTINE (0750)"

  # 预建 cron 日志目录（cron 行 >> cron.log 重定向在脚本执行前由 shell 建立，目录须已存在）
  mkdir -p "$PROJECT_ROOT/data/logs/antivirus"

  # 落 cron 定时任务（幂等：已存在标记则先移除再追加）
  install_cron
  log "cron 定时已配置: $CLAMAV_CRON_SCHEDULE（nice 10 / ionice 降优先级）"

  verify
  log "ClamAV 部署完成。夜间 $CLAMAV_CRON_SCHEDULE 自动批扫；检出隔离至 $CLAMAV_QUARANTINE 并触发 P1 告警。"
}

install_cron() {
  # 幂等：先移除既有标记行，再追加新行
  ( crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true ) > /tmp/.cloudcad-clamav-cron.$$
  echo "$CRON_LINE" >> /tmp/.cloudcad-clamav-cron.$$
  crontab /tmp/.cloudcad-clamav-cron.$$
  rm -f /tmp/.cloudcad-clamav-cron.$$
}

uninstall() {
  # 仅移除 cron 定时；包不卸载、隔离区保留（误报恢复/取证需要）
  if crontab -l 2>/dev/null | grep -qF "$CRON_TAG"; then
    ( crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true ) > /tmp/.cloudcad-clamav-cron.$$
    crontab /tmp/.cloudcad-clamav-cron.$$
    rm -f /tmp/.cloudcad-clamav-cron.$$
    log "cron 定时已移除"
  else
    log "未找到 cron 定时（可能未安装）"
  fi
  log "包未卸载、隔离区 $CLAMAV_QUARANTINE 保留。如需彻底卸载：apt/dnf remove clamav clamav-freshclam"
}

status() {
  echo "=== clamav 版本 ==="
  clamscan --version 2>/dev/null || echo "clamscan 未安装"
  echo "=== cron 定时 ==="
  crontab -l 2>/dev/null | grep -F "$CRON_TAG" || echo "（无 cron 定时）"
  echo "=== 隔离目录 ==="
  if [[ -d "$CLAMAV_QUARANTINE" ]]; then
    echo "$CLAMAV_QUARANTINE（存在）"
    find "$CLAMAV_QUARANTINE" -type f 2>/dev/null | head -20
  else
    echo "（隔离目录不存在: $CLAMAV_QUARANTINE）"
  fi
}

verify() {
  command -v clamscan >/dev/null 2>&1 || die "clamscan 不可用"
  # EICAR 自检：标准测试串（非真实病毒），clamscan 应报 EICAR-Test-File
  # 注意：clamscan 检出时退出码为 1，`clamscan | grep` 在 pipefail 下管道退出码取最右非零
  # （检出→clamscan=1）会误判为失败。故先捕获输出再 grep，断开管道退出码传播。
  local eicar="/tmp/.cloudcad-eicar-test.$$"
  # EICAR 串含 % / \ 等 printf 格式元字符，须作参数（%s）而非格式串，避免被解释
  printf '%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > "$eicar"
  local out
  out="$(clamscan --quiet "$eicar" 2>&1 || true)"
  if echo "$out" | grep -q "EICAR-SIGNATURE\|EICAR-Test-File"; then
    log "✓ EICAR 自检通过（签名库正常）"
  else
    die "EICAR 自检失败：签名库可能未更新，运行 freshclam 后重试（输出: $out）"
  fi
  rm -f "$eicar"
}

case "${1:-install}" in
  install)   install ;;
  uninstall) uninstall ;;
  status)    status ;;
  verify)    verify ;;
  *) die "未知子命令: $1（支持 install/uninstall/status/verify）" ;;
esac
