#!/bin/sh
# pg-fake-id — 伪装 `id -u` / `id --real` 恒返回 999，与 pg-uid-shim 的 getuid() 伪装保持一致。
#
# 背景：postgres 官方入口脚本 docker-entrypoint.sh 在 _main() 里用
#   if [ "$(id -u)" = '0' ]; then exec gosu postgres ...; fi
# 判断是否 root，是则 gosu 降权到 uid 999（postgres 用户）。
# 但 `id` 命令走原始 syscall(SYS_getuid)，绕过 LD_PRELOAD shim 的 getuid() 拦截，
# 返回真实 uid 0 → 入口脚本误判为 root → 执行 gosu → 真实 uid 被降到 999。
# 在 rootless（无 root）机器上，user namespace 只能单段映射 uid 0，
# gosu 到 uid 999 必然 setuid 失败；root 模式下 uid 999=宿主 nobody 也写不了
# root 属主的数据目录。
#
# 本镜像让容器恒以 uid 0 运行（pg-uid-shim 使 postgres 以为自己是 999），
# 故此处让 `id -u`/`id -g`/`id --real` 返回 999，骗过入口脚本的 root 判断、跳过 gosu，
# 其余参数透传给真实 id。安装到 /usr/local/bin/id（PATH 优先于 /bin/id）。
#
# 注意：入口脚本会调用 `id -u`（行 37/70/341）与 `id -g`（行 79），两者都必须返回 999，
# 否则 -g 会透传到真实 id（alpine 上 /bin/id 是 busybox applet，路径未必存在）而失败。
for a in "$@"; do
  case "$a" in
    -u|-g|--real) printf '999\n'; exit 0 ;;
  esac
done
# 其余参数（如 `id` 无参、`id -un` 等）透传给真实 id；alpine 上 id 是 busybox applet，
# 优先用 busybox 直调，回退到 PATH 上的 id。
if command -v busybox >/dev/null 2>&1; then
  exec busybox id "$@"
fi
exec id "$@"
