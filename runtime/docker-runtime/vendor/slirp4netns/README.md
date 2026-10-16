# 内置静态 slirp4netns（版本控制，免下载）

rootless 模式（无 root/sudo）的完整用户态网络依赖 slirp4netns。本目录内置**静态**编译的
slirp4netns v1.2.x 二进制（无 glibc 依赖，任意 Linux 可跑），**提交进 Git 作为单一事实源**：
打包时 `scripts/pack-linux-docker.js` 的 `ensureSlirp4netns` **首选本目录**、直接复用，不再联网下载。

## 为什么必须静态（这是「任何环境可运行」的兜底）

- 目标机 glibc 可能很低：Ubuntu 20.04 = glibc 2.31、CentOS 7 = glibc 2.17。
- 发行版**动态**版（slirp4netns 1.0.1 + `libslirp.so.0`）需 **GLIBC_2.33+**：在低 glibc 机器上
  exec 即报 `version 'GLIBC_2.33' not found (required by libslirp.so.0)` → rootless dockerd 网络
  初始化失败 → 90s 超时、部署失败（2026-10-15 实例：mx@ubuntu 20.04 无 root，包内动态版跑不起来）。
- **静态**版无 glibc 依赖，任何 Linux（含 CentOS 7 / glibc 2.17）都能跑，且 v1.2.x 支持
  `hostfwd -e port:port`（把服务端口暴露给真实宿主，浏览器可访问）。这是唯一「任何环境可运行」的兜底。

## 文件

| 文件 | 说明 |
|---|---|
| `slirp4netns-x86_64` | x86_64 静态二进制 |
| `slirp4netns-aarch64` | aarch64 静态二进制 |

> 文件名与官方 Release 资产**同名**（`slirp4netns-x86_64` / `slirp4netns-aarch64`），下载后直接落盘、免改名。

## 来源（v1.2.x 官方 Release，静态构建）

官方 Release 资产是**裸静态二进制**（非 `.tar.gz` 压缩包）：
- x86_64: `https://github.com/rootless-containers/slirp4netns/releases/download/<TAG>/slirp4netns-x86_64`
- aarch64: `https://github.com/rootless-containers/slirp4netns/releases/download/<TAG>/slirp4netns-aarch64`

（`<TAG>` 取 `scripts/pack-linux-docker.js` 的 `SLIRP4NETNS_VERSION`，当前 `v1.2.21`。）

GitHub 直链国内常不可达，镜像（前缀型：`<镜像>/<GitHub 直链>`；重写型见 fetch 脚本）：
`ghproxy.com` / `mirror.ghproxy.com` / `gh-proxy.com` / `ghps.cc` / `kkgithub.com` / `gitclone.com`
（这些代理可用性随时间波动，哪个能用用哪个；都失败就手动从能上 GitHub 的机器下载后拷入本目录）。

## 更新 / 补齐

在**能访问 GitHub（或任一可用镜像）**的机器上运行（自动多源下载 + 校验静态 + 运行测试）：

```sh
sh fetch-static-slirp.sh          # 补 x86_64
sh fetch-static-slirp.sh aarch64  # 补 aarch64
```

或手动：从官方 Release 下载对应**裸二进制**（`slirp4netns-x86_64` / `slirp4netns-aarch64`）
直接放到本目录（文件名与资产同名）→ `chmod 0755`。

校验（两者都过才算合格）：
- `file slirp4netns-<arch>` 应显示 `statically linked`（**不能**是 `dynamically linked`）；
- `./slirp4netns-<arch> --version` 应正常输出版本号（不能报 `GLIBC_x not found`）。

更新后把本目录提交到 Git（`git add runtime/docker-runtime/vendor/slirp4netns/ && git commit`）。
