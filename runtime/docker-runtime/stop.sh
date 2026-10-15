#!/usr/bin/env bash
# MxCloudCAD Docker 一键部署包 —— 停止入口（薄壳）
# 主逻辑：runtime/docker-runtime/index.js stop
# 顺序：compose down（不带 -v，数据保留）→ 宿主进程（运维中心/转换/协同）→ 本包自装的 dockerd
set -euo pipefail
cd "$(dirname "$0")"

# 与 start 共用同一把锁：部署进行中不允许 stop 插队
if command -v flock >/dev/null 2>&1; then
  mkdir -p data
  exec 9>data/.start.lock
  if ! flock -n 9; then
    echo "[MxCloudCAD] 已有部署正在进行（data/.start.lock 被占用），请稍后再试" >&2
    exit 1
  fi
fi

NODE_BIN="runtime/linux/node/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  echo "[MxCloudCAD][错误] 未找到包内运行时 node（runtime/linux/node/bin/node），部署包不完整" >&2
  exit 1
fi

exec "$NODE_BIN" runtime/docker-runtime/index.js stop
