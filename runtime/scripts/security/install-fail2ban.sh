#!/usr/bin/env bash
# 梦想网页CAD实时协同平台 fail2ban 部署脚本（#418 边界防护 / #407 决策执行）
#
# 职责：安装 fail2ban → 渲染 sshd jail 配置 → 启用并启动 → 验证封禁生效。
# 作为部署可选步骤（推荐）：端口收口后 SSH 是唯一公网入口，fail2ban 是 SSH 暴力破解的最后防线。
#
# 前置：
#   - 以 root 或具 systemd 权限用户运行
#   - 已按 docs/ops/ssh-hardening.md 完成 SSH 仅密钥登录加固
#
# 使用方式：
#   ./runtime/scripts/security/install-fail2ban.sh install     # 安装 + 配置 + 启动
#   ./runtime/scripts/security/install-fail2ban.sh uninstall   # 停止并移除
#   ./runtime/scripts/security/install-fail2ban.sh status      # 查看 jail 状态
#   ./runtime/scripts/security/install-fail2ban.sh verify      # 验证 sshd jail 已启用
#
# 参数（环境变量覆盖）：
#   F2B_MAXRETRY   失败次数阈值（默认 5）
#   F2B_FINDTIME   失败计数窗口秒（默认 600）
#   F2B_BANTIME    封禁时长秒（默认 3600）
#   F2B_LOGPATH    sshd 失败日志（默认按发行版探测：RHEL 系 /var/log/secure，Debian 系 /var/log/auth.log）
#   F2B_BANACTION  封禁动作（默认按可用性探测：nftables → iptables-multiport）
#
# 443 公网 TLS 落地后：扩展 web jail（nginx-http-auth），见脚本尾部「未来扩展」注释。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="$SCRIPT_DIR/fail2ban-sshd.local.conf"
JAIL_LOCAL="/etc/fail2ban/jail.d/sshd.local"

: "${F2B_MAXRETRY:=5}"
: "${F2B_FINDTIME:=600}"
: "${F2B_BANTIME:=3600}"
: "${F2B_LOGPATH:=}"
: "${F2B_BANACTION:=}"

log() { echo "[install-fail2ban] $*"; }
die() { echo "[install-fail2ban] ERROR: $*" >&2; exit 1; }

# 数字参数校验：防止非数字值落进 fail2ban 配置（fail2ban 会解析失败或行为异常）
require_int() {
  local name="$1" val="$2"
  case "$val" in
    ''|*[!0-9]*) die "$name 必须为非负整数，当前值: '$val'" ;;
  esac
}

# ==================== 发行版探测 ====================
detect_distro() {
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

detect_logpath() {
  [[ -n "$F2B_LOGPATH" ]] && { echo "$F2B_LOGPATH"; return; }
  local distro; distro="$(detect_distro)"
  case "$distro" in
    rhel|rocky|centos|fedora|almalinux|opensuse*)
      echo "/var/log/secure" ;;
    debian|ubuntu|*)
      echo "/var/log/auth.log" ;;
  esac
}

detect_banaction() {
  [[ -n "$F2B_BANACTION" ]] && { echo "$F2B_BANACTION"; return; }
  if command -v nft >/dev/null 2>&1 && [[ -d /etc/nftables ]]; then
    echo "nftables"
  elif command -v iptables >/dev/null 2>&1; then
    echo "iptables-multiport"
  else
    die "未找到 nftables 或 iptables，无法选择封禁动作"
  fi
}

# ==================== 子命令 ====================
# 发行版家族判定（日志路径 / 包管理器共用，避免级联重复）
is_rhel_family() {
  case "$1" in
    rhel|rocky|centos|fedora|almalinux|opensuse*) return 0 ;;
    *) return 1 ;;
  esac
}

install() {
  [[ -f "$TEMPLATE" ]] || die "配置模板不存在: $TEMPLATE"
  # 数值参数先校验，防止非数字落进 fail2ban 配置
  require_int "F2B_MAXRETRY" "$F2B_MAXRETRY"
  require_int "F2B_FINDTIME" "$F2B_FINDTIME"
  require_int "F2B_BANTIME" "$F2B_BANTIME"

  local distro logpath banaction
  distro="$(detect_distro)"
  logpath="$(detect_logpath)"
  banaction="$(detect_banaction)"
  log "发行版=$distro 日志=$logpath 封禁动作=$banaction maxretry=$F2B_MAXRETRY findtime=${F2B_FINDTIME}s bantime=${F2B_BANTIME}s"

  # 安装 fail2ban（按发行版包管理器）
  if ! command -v fail2ban-server >/dev/null 2>&1; then
    log "安装 fail2ban..."
    if is_rhel_family "$distro"; then
      dnf install -y fail2ban || yum install -y fail2ban
    else
      apt-get update -y && apt-get install -y fail2ban
    fi
  else
    log "fail2ban 已安装，跳过"
  fi

  # 渲染 jail 配置：用 bash 字符串替换（非 sed），规避 sed 替换串对 | & \ 的转义语义，
  # 用户可控值（F2B_LOGPATH）不会被解释为 sed 元字符。数值已校验为整数。
  local rendered
  rendered="$(cat "$TEMPLATE")"
  rendered="${rendered//%LOGPATH%/$logpath}"
  rendered="${rendered//%MAXRETRY%/$F2B_MAXRETRY}"
  rendered="${rendered//%FINDTIME%/$F2B_FINDTIME}"
  rendered="${rendered//%BANTIME%/$F2B_BANTIME}"
  rendered="${rendered//%BANACTION%/$banaction}"
  mkdir -p "$(dirname "$JAIL_LOCAL")"
  printf '%s\n' "$rendered" > "$JAIL_LOCAL"
  log "已渲染 jail 配置: $JAIL_LOCAL"

  # 启用并（重）加载
  systemctl enable fail2ban
  systemctl restart fail2ban
  sleep 2
  systemctl --no-pager status fail2ban || true

  verify
  log "fail2ban 部署完成。验证封禁：连续 $F2B_MAXRETRY 次错误 SSH 登录后该 IP 应被 $banaction 封禁 $F2B_BANTIME 秒。"
}

uninstall() {
  systemctl stop fail2ban 2>/dev/null || true
  systemctl disable fail2ban 2>/dev/null || true
  rm -f "$JAIL_LOCAL"
  log "fail2ban 已停止并移除 jail 配置（包未卸载，如需彻底卸载请手动 apt/dnf remove fail2ban）"
}

status() {
  fail2ban-client status || die "fail2ban 未运行"
  fail2ban-client status sshd 2>/dev/null || log "sshd jail 未启用"
}

verify() {
  if fail2ban-client status sshd >/dev/null 2>&1; then
    log "✓ sshd jail 已启用"
  else
    die "sshd jail 未启用，请检查 $JAIL_LOCAL 与 fail2ban 日志"
  fi
}

case "${1:-install}" in
  install)   install ;;
  uninstall) uninstall ;;
  status)    status ;;
  verify)    verify ;;
  *) die "未知子命令: $1（支持 install/uninstall/status/verify）" ;;
esac

# ==================== 未来扩展（443 公网 TLS 落地后）====================
# 扩展 web jail：在 $JAIL_LOCAL 追加 nginx-http-auth / nginx-botsearch jail，
# 指向 Nginx 443 访问日志，拦截登录接口暴力枚举与爬虫。
# 参考：
#   [nginx-http-auth]
#   enabled = true
#   port = https
#   logpath = /var/log/nginx/443-access.log
#   maxretry = 10
#   bantime = 3600
