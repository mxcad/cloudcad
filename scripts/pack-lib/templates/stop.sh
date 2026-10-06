#!/bin/bash
# 梦想网页CAD实时协同平台 停止脚本

cd "$(dirname "$0")"

# 补齐包内可执行位（Windows 打包链路产物执行位丢失，目录清单唯一源见 ensure-exec.sh）
bash runtime/scripts/ensure-exec.sh 2>/dev/null || true

# 使用内嵌的 Node.js
NODE_EXE="./runtime/linux/node/bin/node"

if [ ! -f "$NODE_EXE" ]; then
    echo "[错误] 找不到 Node.js 运行时: $NODE_EXE"
    echo "请确保 runtime/linux/node 目录包含 Node.js"
    exit 1
fi

echo "Stopping 梦想网页CAD实时协同平台 services..."
exec "$NODE_EXE" runtime/scripts/cli.js stop
