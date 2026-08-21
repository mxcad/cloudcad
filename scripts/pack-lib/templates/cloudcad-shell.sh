#!/usr/bin/env bash
# 梦想网页CAD实时协同平台 命令行入口 —— 打开一个已加载离线 Node.js 环境的 shell
# 模板文件（scripts/pack-lib/templates/），随部署包/升级包复制到项目根目录。
# 用法：在项目根目录执行  ./cloudcad-shell.sh  或  source cloudcad-shell.sh
# 也可双击执行（Linux 桌面），效果等价于 source 后进入子 shell。
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# 优先 Linux 离线运行时，回退到 Windows（Git Bash on Windows 场景）
if [ -f "$PROJECT_ROOT/runtime/linux/node/bin/node" ]; then
  NODE_DIR="$PROJECT_ROOT/runtime/linux/node/bin"
elif [ -f "$PROJECT_ROOT/runtime/windows/node/node.exe" ]; then
  NODE_DIR="$PROJECT_ROOT/runtime/windows/node"
else
  echo "[错误] 找不到离线 Node.js"
  echo "请确保 runtime/linux/node/bin 或 runtime/windows/node 目录包含 Node.js"
  exit 1
fi

export PATH="$NODE_DIR:$PATH"
export PM2_HOME="$PROJECT_ROOT/data/pm2"
export COREPACK_ENABLE_STRICT=0

echo ""
echo "============================================================"
echo " 梦想网页CAD实时协同平台 命令行已就绪（离线 Node.js）"
echo " Node:  $NODE_DIR/node"
echo " PATH:  已加入离线 node 目录"
echo " PM2:   $PM2_HOME"
echo ""
echo " 在本窗口可执行:  node / npm / npx / pnpm / pm2 / cloudcad"
echo " 退出: 输入 exit"
echo "============================================================"
echo ""

# 若被 source，则在当前 shell 生效后返回；若直接执行，则进入交互子 shell
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  exec "$SHELL" -i
fi
