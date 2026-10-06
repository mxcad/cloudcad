#!/bin/bash
# 部署包可执行位自愈（需补执行位的目录清单唯一源，勿在其他脚本复制这份枚举）
#
# 根因：Windows 侧缓存与打包链路没有 Unix 执行位概念（NTFS 无法存储 +x，
# bsdtar 打包全部写 0666，见 scripts/pack-lib/manifest.js 升级包注释），产出的包
# 解压后 node/PostgreSQL/Redis/SVN 等二进制均不可执行，./start.sh 报"权限不够"。
#
# 消费方（幂等，失败不阻塞调用方）：
#   1. start.sh / stop.sh / cloudcad.sh / cloudcad-shell.sh —— 启动前自愈
#   2. scripts/pack-offline.js —— Linux 包打 tar 前对暂存目录自愈，
#      保证包内自带执行位（断网验证 CMD 直接 exec node，不经 start.sh）
#
# 用法：bash runtime/scripts/ensure-exec.sh [部署根目录]
#       缺省根目录 = 本脚本上两级（即部署包根目录）

ROOT="${1:-}"
if [ -z "$ROOT" ]; then
    ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fi
cd "$ROOT" 2>/dev/null || exit 0

# 各运行时组件目录下的可执行程序（lib/ 下的 .so 只需读权限，不递归）
for dir in \
    runtime/linux/node/bin \
    runtime/linux/postgres/bin \
    runtime/linux/redis \
    runtime/linux/subversion \
    runtime/linux/mxcad
do
    [ -d "$dir" ] && chmod +x "$dir"/* 2>/dev/null
done

# pm2 随 node 组件分发，不在 bin/ 下
[ -f runtime/linux/node/node_modules/pm2/bin/pm2 ] && \
    chmod +x runtime/linux/node/node_modules/pm2/bin/pm2 2>/dev/null

# 入口与运维脚本（start/stop 在根目录，运维入口在 runtime/）
chmod +x ./*.sh ./runtime/*.sh 2>/dev/null
find ./runtime/scripts -maxdepth 1 -type f -name '*.sh' -exec chmod +x {} + 2>/dev/null

exit 0
