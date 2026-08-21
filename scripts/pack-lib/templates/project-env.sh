#!/usr/bin/env bash
# 梦想网页CAD实时协同平台 project environment
# Git Bash shell functions for offline runtime auto-detection
#
# 模板文件（scripts/pack-lib/templates/）。部署/本地安装时由
# runtime/scripts/setup-offline.js 自动生成到项目根目录（内容按实际安装路径生成）。
# Usage: Add the following line to ~/.bashrc or ~/.zshrc:
#   source "<项目根目录>/project-env.sh"
#
# Then in any project subdirectory, type pnpm/node/npm/npx directly.
# Outside the project, the global command is used automatically.

_PROJECT_ROOT="D:/web/MxCADOnline/cloudcad"
_NODE_EXE="${_PROJECT_ROOT}/runtime/windows/node/node.exe"
_NODE_DIR="${_PROJECT_ROOT}/runtime/windows/node"
_NPM_BIN="${_PROJECT_ROOT}/runtime/windows/node"
_PNPM_CLI="${_PROJECT_ROOT}/runtime/windows/node/node_modules/pnpm/bin/pnpm.cjs"

# 仅当当前目录位于项目目录内时，才使用离线运行时
_in_project() {
  local dir="$PWD"
  while [[ "$dir" != "/" ]]; do
    if [[ "$dir" == "${_PROJECT_ROOT}" ]]; then
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
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

unset _in_project
