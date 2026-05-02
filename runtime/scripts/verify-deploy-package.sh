#!/bin/bash
# CloudCAD 部署包验证脚本
# 在干净、断网环境中验证部署包可用性
#
# 使用方式：
#   ./verify-deploy-package.sh
#
# 验证流程：
#   1. 启动 start.sh
#   2. 等待服务启动
#   3. 检查后端和前端是否可访问
#   4. 检查 start.sh 是否有报错

set -e

echo "=== 部署包验证 (断网环境) ==="
echo ""

APP_DIR="/app"
BACKEND_PORT=3000
FRONTEND_PORT=3001
MAX_WAIT=120  # 最大等待时间（秒）

cd ${APP_DIR}

# 检查 start.sh 是否存在
if [ ! -f "${APP_DIR}/start.sh" ]; then
    echo "✗ 缺少启动脚本: start.sh"
    exit 1
fi

echo "[1/3] 启动服务..."
chmod +x start.sh

# 后台启动 start.sh，捕获输出
./start.sh > /tmp/start.log 2>&1 &
START_PID=$!

echo "  start.sh PID: $START_PID"
echo "  等待服务启动..."

# 等待服务启动
WAIT_COUNT=0
BACKEND_READY=false
FRONTEND_READY=false

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    # 检查后端
    if [ "$BACKEND_READY" = false ]; then
        if curl -sf http://localhost:${BACKEND_PORT}/health > /dev/null 2>&1; then
            BACKEND_READY=true
            echo "  ✓ 后端服务已就绪 (端口 ${BACKEND_PORT})"
        fi
    fi

    # 检查前端
    if [ "$FRONTEND_READY" = false ]; then
        if curl -sf http://localhost:${FRONTEND_PORT}/ > /dev/null 2>&1; then
            FRONTEND_READY=true
            echo "  ✓ 前端服务已就绪 (端口 ${FRONTEND_PORT})"
        fi
    fi

    # 两个服务都就绪
    if [ "$BACKEND_READY" = true ] && [ "$FRONTEND_READY" = true ]; then
        break
    fi

    # 检查 start.sh 是否已退出（异常情况）
    if ! kill -0 $START_PID 2>/dev/null; then
        echo ""
        echo "✗ start.sh 已退出，服务启动失败"
        echo ""
        echo "=== start.sh 日志 ==="
        cat /tmp/start.log
        exit 1
    fi

    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
    echo -n "."
done

echo ""

# [2/3] 检查服务状态
echo ""
echo "[2/3] 检查服务状态..."

if [ "$BACKEND_READY" = false ]; then
    echo "✗ 后端服务未就绪 (超时 ${MAX_WAIT}s)"
    echo ""
    echo "=== start.sh 日志 ==="
    cat /tmp/start.log
    exit 1
fi

if [ "$FRONTEND_READY" = false ]; then
    echo "✗ 前端服务未就绪 (超时 ${MAX_WAIT}s)"
    echo ""
    echo "=== start.sh 日志 ==="
    cat /tmp/start.log
    exit 1
fi

# [3/3] 检查日志是否有报错
echo ""
echo "[3/3] 检查日志..."

# 检查常见错误关键词
ERROR_KEYWORDS="Error:|error|ERROR|Exception|failed|Failed|FAILED|ECONNREFUSED|ETIMEDOUT"
ERROR_COUNT=$(grep -cE "$ERROR_KEYWORDS" /tmp/start.log 2>/dev/null || echo "0")

if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "⚠ 发现日志中包含错误关键词:"
    grep -E "$ERROR_KEYWORDS" /tmp/start.log | head -20
    echo ""
    echo "完整日志:"
    cat /tmp/start.log
    exit 1
fi

echo "✓ 日志正常，无错误"

# 验证通过
echo ""
echo "============================================"
echo "=== 验证通过! ==="
echo "============================================"
echo ""
echo "部署包验证成功，可以在生产环境中使用。"
echo ""
echo "服务状态:"
echo "  - 后端: http://localhost:${BACKEND_PORT}"
echo "  - 前端: http://localhost:${FRONTEND_PORT}"
echo ""

# 停止服务
echo "停止服务..."
./stop.sh 2>/dev/null || true

echo "✓ 验证完成"