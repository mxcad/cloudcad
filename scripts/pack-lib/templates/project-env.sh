#!/usr/bin/env bash
# 梦想网页CAD实时协同平台 project environment
# Git Bash shell functions for offline runtime auto-detection
#
# 参考样例，不进部署包（manifest.js 不引用本文件，勿当成模板直接复制）。
# 真实内容由 runtime/scripts/setup-offline.js 的 createProjectEnvFile() 在部署/本地
# 安装时生成到 <部署根目录>/runtime/project-env.sh（路径按实际安装位置动态拼）。
# 本文件内的绝对路径是开发者本机快照，无占位符，不可用于生产。
# Usage: Add the following line to ~/.bashrc or ~/.zshrc:
#   source "<部署根目录>/runtime/project-env.sh"
#
# Then in any project subdirectory, type pnpm/node/npm/npx directly.
# Outside the project, the global command is used automatically.

_PROJECT_ROOT="D:/web/MxCADOnline/cloudcad"
_NODE_EXE="${_PROJECT_ROOT}/runtime/windows/node/node.exe"
_NODE_DIR="${_PROJECT_ROOT}/runtime/windows/node"
_NPM_BIN="${_PROJECT_ROOT}/runtime/windows/node"
_PNPM_CLI="${_PROJECT_ROOT}/runtime/windows/node/node_modules/pnpm/bin/pnpm.cjs"

# 仅当当前目录位于项目目录内时，才使用离线运行时。
# _PROJECT_ROOT 是 Node 生成的 Windows 形态绝对路径（D:/foo），而 Git Bash 里的
# $PWD 是 Unix 形态（/d/foo），直接比较恒不相等，故先把 $PWD 归一化成 Windows 形态。
# Linux 上两边都是 Unix 形态：非单字符盘符的路径原样透传，不参与归一化。
_in_project() {
  local cwd stripped drive winroot
  cwd="$PWD"
  case "$cwd" in
    /*/*)
      stripped="${cwd#/}"
      drive="${stripped%%/*}"
      case "$drive" in
        [a-z]|[A-Z])
          winroot="$(printf '%s' "$drive" | tr '[:lower:]' '[:upper:]'):/${stripped#*/}"
          ;;
        *) winroot="$cwd" ;;
      esac
      ;;
    *) winroot="$cwd" ;;
  esac
  [[ "$winroot" == "${_PROJECT_ROOT}" || "$winroot" == "${_PROJECT_ROOT}"/* ]]
}

# node 直接指向离线 node
node() {
  if _in_project; then
    "${_NODE_EXE}" "$@"
  else
    command node "$@"
  fi
}

# npm / npx：将离线 node 的 bin 目录置入 PATH，经其中 shim 解析（会自动用离线 node）
npm() {
  if _in_project; then
    export PATH="${_NPM_BIN}:$PATH"
    command npm "$@"
  else
    command npm "$@"
  fi
}

npx() {
  if _in_project; then
    export PATH="${_NPM_BIN}:$PATH"
    command npx "$@"
  else
    command npx "$@"
  fi
}

# pnpm 通过离线 node 执行 pnpm.cjs（禁用 Corepack 避免联网）
pnpm() {
  if _in_project; then
    export PATH="${_NODE_DIR}:$PATH"
    export COREPACK_ENABLE=0
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    "${_NODE_EXE}" "${_PNPM_CLI}" "$@"
  else
    command pnpm "$@"
  fi
}

# 注：切勿在此 unset 上面的守卫函数 —— bash 的 unset 会连函数定义一起删除，
# 导致 node/npm/npx/pnpm 四个 wrapper 判定 _in_project 时报 command not found，
# 恒走全局分支，离线运行时永不生效（下划线前缀即为此处保留的私有函数）。
