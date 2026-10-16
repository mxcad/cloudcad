#!/bin/sh
# 下载静态 slirp4netns v1.2.x 到本目录（版本控制，免后续下载）。
# 在能访问 GitHub（或任一可用镜像）的机器上运行：
#   sh fetch-static-slirp.sh          # 补 x86_64
#   sh fetch-static-slirp.sh aarch64  # 补 aarch64
# 完成后把本目录提交到 Git。
#
# 官方 Release 资产是**裸静态二进制** slirp4netns-<arch>（非 .tar.gz），直接下载落盘。
set -e
cd "$(dirname "$0")"
VER=1.2.21
ARCH="${1:-x86_64}"
ASSET="rootless-containers/slirp4netns/releases/download/v${VER}/slirp4netns-${ARCH}"
GH="https://github.com/${ASSET}"

# 多源回退：GitHub 直链 → 前缀型代理 → 重写型代理（哪个能用用哪个）
SOURCES="
${GH}
https://ghproxy.com/${GH}
https://mirror.ghproxy.com/${GH}
https://gh-proxy.com/${GH}
https://ghps.cc/${GH}
https://kkgithub.com/${ASSET}
https://gitclone.com/github.com/${ASSET}
"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
BIN="$TMP/slirp4netns-${ARCH}"

echo "下载 slirp4netns v${VER}（${ARCH}，静态裸二进制）..."
GOT=0
for url in $SOURCES; do
  echo "  尝试: $url"
  if curl -fsSL --retry 1 --connect-timeout 15 --max-time 120 -o "$BIN" "$url" 2>/dev/null; then
    sz=$(stat -c%s "$BIN" 2>/dev/null || wc -c < "$BIN")
    # 裸二进制应 >500KB（x86_64 约 2.2MB）；过小说明是 HTML 错误页
    if [ "$sz" -gt 500000 ]; then
      echo "  ✓ 下载成功（${sz}B）"
      GOT=1
      break
    fi
  fi
done
[ "$GOT" = 1 ] || { echo "错误：所有下载源都不可达。请手动从能上 GitHub 的机器下载裸二进制 slirp4netns-${ARCH} 后拷入本目录。"; exit 1; }

# 直接落盘（文件名与资产同名），无需解压
cp "$BIN" "slirp4netns-${ARCH}"
chmod 0755 "slirp4netns-${ARCH}"

echo "--- 校验（必须 statically linked，不能 dynamically linked）---"
file "slirp4netns-${ARCH}" 2>/dev/null || true
echo "--- 运行测试（应输出版本号，不能报 GLIBC_x not found）---"
"./slirp4netns-${ARCH}" --version
echo "完成：slirp4netns-${ARCH}（静态 v${VER}）已就位。请提交本目录到 Git。"
