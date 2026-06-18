#!/bin/bash
# CloudCAD 本地 Linux 部署包打包脚本（无需 Docker）
#
# 用法：
#   bash scripts/pack-linux-local.sh                    # 完整打包
#   bash scripts/pack-linux-local.sh --skip-extract     # 跳过提取运行时，仅构建打包
#   bash scripts/pack-linux-local.sh --skip-build       # 跳过构建，仅提取运行时
#   bash scripts/pack-linux-local.sh --help             # 显示帮助

set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)
SCRIPT_DIR="$PROJECT_ROOT/scripts"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[Pack-Linux-Local]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

cleanup() {
  if [ $? -ne 0 ]; then
    echo ""
    err "打包失败，请检查上方错误信息"
  fi
}
trap cleanup EXIT

detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
      ubuntu)
        case "$VERSION_ID" in
          22.*) echo "ubuntu22" ;;
          24.*) echo "ubuntu24" ;;
          *) echo "ubuntu${VERSION_ID}" ;;
        esac
        ;;
      centos)
        case "$VERSION_ID" in
          7*) echo "centos7" ;;
          *) echo "centos${VERSION_ID}" ;;
        esac
        ;;
      rockylinux|rocky)
        case "$VERSION_ID" in
          8*) echo "rocky8" ;;
          9*) echo "rocky9" ;;
          *) echo "rocky${VERSION_ID}" ;;
        esac
        ;;
      debian) echo "debian" ;;
      *) echo "linux" ;;
    esac
  else
    echo "linux"
  fi
}

show_help() {
  cat <<EOF
CloudCAD 本地 Linux 部署包打包脚本（无需 Docker）

用法：
  bash scripts/pack-linux-local.sh                   完整打包
  bash scripts/pack-linux-local.sh --skip-extract    跳过提取运行时，仅构建打包
  bash scripts/pack-linux-local.sh --skip-build      跳过构建，仅提取运行时
  bash scripts/pack-linux-local.sh --help            显示帮助

流程：
  1. node scripts/extract-linux-runtime.js  提取运行时到 runtime/linux/
  2. TARGET_OS=\$(detect_os) node scripts/pack-offline.js --deploy --linux  构建并打包
  3. 输出: release/cloudcad-deploy-{VERSION}-{DATE}-{OS}-{ARCH}.tar.gz
     例: cloudcad-deploy-1.0.0-20260618-ubuntu22-x86_64.tar.gz

前提条件（脚本会自动检查）：
  - Linux 环境
  - Node.js >= 18（用于运行打包脚本本身）
  - pnpm
  提取运行时需要 root（安装 PostgreSQL、Redis、Subversion 等）
EOF
}

check_prerequisites() {
  if [ "$(uname)" != "Linux" ]; then
    err "此脚本仅支持 Linux 环境"
    exit 1
  fi

  if ! command -v node &>/dev/null; then
    err "未找到 Node.js，请先安装 Node.js >= 18"
    exit 1
  fi

  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    err "Node.js 版本过低: $(node -v)，需要 >= 18"
    exit 1
  fi

  if ! command -v pnpm &>/dev/null; then
    # 尝试用 npm 安装 pnpm
    warn "未找到 pnpm，尝试安装..."
    npm install -g pnpm
    if ! command -v pnpm &>/dev/null; then
      err "pnpm 安装失败"
      exit 1
    fi
  fi

  ok "环境检查通过 (Node $(node -v), pnpm $(pnpm -v))"
}

step_extract() {
  log ""
  log "============================================"
  log " 步骤 1/2: 提取 Linux 运行时"
  log "============================================"

  if [ "$(id -u)" -ne 0 ] && [ "$EUID" -ne 0 ]; then
    warn "提取运行时需要 root 权限来安装 PostgreSQL、Redis、Subversion"
    warn "如果没有 root 权限，请先手动安装依赖后使用 --skip-extract"
    warn ""
  fi

  node "$SCRIPT_DIR/extract-linux-runtime.js"
  ok "运行时提取完成"
}

step_pack() {
  local target_os
  target_os=$(detect_os)
  log ""
  log "============================================"
  log " 步骤 2/2: 构建并打包部署包"
  log "============================================"
  log "检测到本机系统: ${target_os} ($(uname -m))"

  TARGET_OS="$target_os" node "$SCRIPT_DIR/pack-offline.js" --deploy --linux
  ok "部署包打包完成"
}

show_result() {
  local pkg
  pkg=$(ls -t release/cloudcad-deploy-*.tar.gz 2>/dev/null | head -1)
  if [ -n "$pkg" ]; then
    local size
    size=$(du -h "$pkg" | cut -f1)
    echo ""
    log "============================================"
    ok "部署包: $pkg"
    ok "大小: $size"
    log "============================================"
    echo ""
    log "在目标服务器上使用:"
    echo "  tar -xzf $pkg"
    echo "  cd cloudcad"
    echo "  ./start.sh"
  fi
}

main() {
  local skip_extract=false
  local skip_build=false

  for arg in "$@"; do
    case "$arg" in
      --help|-h) show_help; exit 0 ;;
      --skip-extract) skip_extract=true ;;
      --skip-build) skip_build=true ;;
    esac
  done

  echo ""
  log "============================================"
  log " CloudCAD 本地 Linux 部署包打包"
  log "============================================"
  echo ""

  check_prerequisites

  if ! $skip_extract; then
    step_extract
  else
    log "跳过运行时提取（--skip-extract）"
  fi

  if ! $skip_build; then
    step_pack
  else
    log "跳过构建打包（--skip-build）"
  fi

  show_result
}

main "$@"
