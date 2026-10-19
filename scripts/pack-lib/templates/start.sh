#!/bin/bash
# 梦想网页CAD实时协同平台 启动脚本
# 自动检测部署模式或交互式模式
# 裸机 / Docker 两种交付形态共用本模板（ADR-0075 C4 同构瘦壳）：
# 形态差异全部在 cli.js 前置分派（detectDeployForm → 裸机编排 / docker-runtime 12 步）

cd "$(dirname "$0")"

# 并发守卫：同一部署目录只允许一个 start 在跑（与 stop.sh 共用同一把锁，
# 系统无 flock 时自动跳过）
if command -v flock >/dev/null 2>&1; then
    mkdir -p data
    exec 9>data/.start.lock
    if ! flock -n 9; then
        echo "[错误] 已有部署正在进行（data/.start.lock 被占用），请稍后再试"
        exit 1
    fi
fi

# 禁用 Corepack 严格检查，支持离线部署
export COREPACK_ENABLE_STRICT=0

# 补齐包内可执行位（Windows 打包链路产物执行位丢失，目录清单唯一源见 ensure-exec.sh）
bash runtime/scripts/ensure-exec.sh 2>/dev/null || true

# 使用内嵌的 Node.js
NODE_EXE="./runtime/linux/node/bin/node"

if [ ! -f "$NODE_EXE" ]; then
    echo "[错误] 找不到 Node.js 运行时: $NODE_EXE"
    echo "请确保 runtime/linux/node 目录包含 Node.js"
    exit 1
fi

# 检测部署包标记文件
if [ -f ".deploy" ]; then
    echo "Starting 梦想网页CAD实时协同平台 (deploy mode)..."
    exec "$NODE_EXE" runtime/scripts/cli.js deploy --skip-build
else
    exec "$NODE_EXE" runtime/scripts/cli.js start
fi
