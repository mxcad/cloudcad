#!/bin/bash
# 梦想网页CAD实时协同平台 停止脚本

cd "$(dirname "$0")"

# 使用内嵌的 Node.js
NODE_EXE="./runtime/linux/node/bin/node"

if [ ! -f "$NODE_EXE" ]; then
    echo "[错误] 找不到 Node.js 运行时: $NODE_EXE"
    echo "请确保 runtime/linux/node 目录包含 Node.js"
    exit 1
fi

echo "Stopping 梦想网页CAD实时协同平台 services..."
exec "$NODE_EXE" runtime/scripts/cli.js stop
