#!/bin/bash
# CloudCAD 启动脚本
# 自动检测部署模式或交互式模式

cd "$(dirname "$0")"

# 禁用 Corepack 严格检查，支持离线部署
export COREPACK_ENABLE_STRICT=0

# 使用内嵌的 Node.js
NODE_EXE="./runtime/linux/node/node"

if [ ! -f "$NODE_EXE" ]; then
    echo "[错误] 找不到 Node.js 运行时: $NODE_EXE"
    echo "请确保 runtime/linux/node 目录包含 Node.js"
    exit 1
fi

# 检测部署包标记文件
if [ -f ".deploy" ]; then
    echo "Starting CloudCAD (deploy mode)..."
    exec "$NODE_EXE" runtime/scripts/cli.js deploy --skip-build
else
    exec "$NODE_EXE" runtime/scripts/cli.js
fi
