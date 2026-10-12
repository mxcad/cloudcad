#!/usr/bin/env bash
# CloudCAD Docker 一键部署包 —— 启动入口（薄壳）
# 主逻辑：runtime/docker-runtime/index.js start（12 步编排，见 ADR-0074）
# 本脚本只做：定位包根 → 并发守卫 → 用包内 node 启动主控。
set -euo pipefail
cd "$(dirname "$0")"

# 并发守卫：同一部署目录只允许一个 start 在跑（系统无 flock 时自动跳过）
if command -v flock >/dev/null 2>&1; then
  mkdir -p data
  exec 9>data/.start.lock
  if ! flock -n 9; then
    echo "[CloudCAD] 已有部署正在进行（data/.start.lock 被占用），请稍后再试" >&2
    exit 1
  fi
fi

NODE_BIN="runtime/linux/node/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "[CloudCAD][错误] 未找到包内运行时 node（runtime/linux/node/bin/node），部署包不完整，请重新下载并完整解压" >&2
  exit 1
fi

exec "$NODE_BIN" runtime/docker-runtime/index.js start
