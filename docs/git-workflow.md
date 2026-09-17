# CloudCAD Git 工作流与发布规范

> 本文档是 CloudCAD 仓库的 **Git 治理章程** 与 **发布 SOP**，所有开发者与维护者必须遵守。
> 目标：让 Git 仓库干净、可审计、可回溯，让发版全流程在 GitHub 线上自动完成（本地零打包）。

---

## 1. 现状问题与治理目标

### 1.1 历史问题

| 问题 | 后果 |
|------|------|
| `data/`（12 万文件：7.6 万 jpg、3.8 万 dwg）入库 | 用户数据泄露到公开仓库，仓库膨胀 |
| `release/`（1.1 万文件）、`runtime/windows|linux`（2.4 万文件）入库 | 构建产物入库，仓库巨大 |
| `file-sync/`（38 个 dwg 图纸）入库 | 内部服务器同步程序 + 图纸被同步到 GitHub |
| 60+ `worktree-agent-*` 临时分支残留 | 分支失控 |
| 30+ `dependabot/*` 远程分支堆积 | 分支噪音 |
| 无提交规范 | 无法自动化生成 changelog、无法按语义发版 |

### 1.2 治理目标

1. **清空历史**：重建为单根提交，杜绝图纸/产物/数据入库。
2. **红线隔离**：`.gitignore` + CI 门禁双保险，任何大文件/敏感文件无法入库。
3. **规范提交**：Conventional Commits，PR 门禁校验。
4. **线上打包**：打 tag 触发 GitHub Actions 自动构建各平台离线包，本地零打包。
5. **mxcad 去重**：产品二进制按内容哈希标识，相同内容复用，不重复上传。

---

## 2. 仓库结构红线

### 2.1 能入库（白名单）

```
packages/            # 业务源码（impl-mx 除外，私有）
scripts/             # 打包/工具脚本源码
runtime/scripts/     # 运行时脚本源码
docs/                # 文档
.github/             # CI 配置
*.prisma, *.sql      # 数据库 schema 与 migration
*.yml, *.json, *.ts, *.tsx, *.js   # 配置与源码
pnpm-lock.yaml
package.json
```

### 2.2 禁止入库（黑名单）

| 类型 | 路径/模式 | 原因 |
|------|----------|------|
| 用户数据 | `data/` | 用户上传的图纸/文件 |
| 构建产物 | `release/`、`dist/`、`build/` | 产物应来自 CI |
| 运行时产物 | `runtime/windows/`、`runtime/linux/`、`runtime/cache/`、`runtime/docker/` | 运行时二进制由 CI 构建/下载 |
| 内部同步 | `file-sync/` | 内部服务器同步程序 |
| 图纸/CAD | `*.dwg`、`*.dxf`、`*.mxweb`、`*.bin` | 保密图纸与 CAD 二进制 |
| 私有包 | `packages/impl-mx/` | 不开源 |
| 临时 mxcad | `mxcad-dist/` | 本地暂存，仅上传用，不入库 |
| 环境/密钥 | `.env*`、`*.log` | 安全 |
| 压缩包 | `*.tar.gz`、`*.7z`、`*.zip` | 产物 |

---

## 3. 提交规范（Conventional Commits）

### 3.1 格式

```
<type>(<scope>): <描述>

示例：
  feat(auth): 增加邮箱验证码登录
  fix(share): 修复公开链接过期未刷新
  chore(deps): 升级 prisma 到 7
  refactor(storage): 拆分 provider
  docs: 补充离线部署步骤
  test(perm): 增加越权场景
  ci: 增加 release 自动打包
```

### 3.2 Type 表

| 类型 | 用途 | 是否影响版本 |
|------|------|-------------|
| `feat` | 新功能 | minor |
| `fix` | 修 bug | patch |
| `chore` | 构建/依赖/杂务 | — |
| `refactor` | 重构（不新增功能/不修 bug） | — |
| `docs` | 文档 | — |
| `test` | 测试 | — |
| `ci` | CI 配置 | — |
| `perf` | 性能优化 | — |
| `style` | 格式 | — |

### 3.3 Scope 建议

`auth` / `share` / `storage` / `frontend` / `backend` / `mobile` / `db` / `config` / `deps` / `docs`

### 3.4 PR 标题

PR 标题同样遵循 Conventional Commits（由 CI `amannn/action-semantic-pull-request` 校验）。

---

## 4. 分支模型（Github Flow 精简版）

```
main              受保护分支：只接受 PR 合并，禁止直接 push
├── feat/xxx      功能分支：短生命周期，PR 合入即删
├── fix/xxx       修复分支：短生命周期，PR 合入即删
├── chore/xxx     杂务分支
└── ci/xxx        CI 分支
```

**规则**：
- `main` 永不直接 push，必须通过 PR。
- 临时分支合入后立即删除。
- 禁止长期悬挂分支、禁止 worktree 残留分支长期保留。
- 未完成任务的分支，合入前必须 rebase 到最新 main。

---

## 5. 版本与发布流程（核心）

### 5.1 版本号（SemVer）

```
主版本.次版本.修订版本   例如 v2.3.1

feat → 次版本 +1
fix  → 修订版本 +1
破坏性变更 → 主版本 +1（需维护者评估）
```

### 5.2 发布流程（维护者操作）

```
发布流程（维护者）：
1. bump package.json 版本号 → 提交（如 chore(release): v2.3.1）
2. 若有产品二进制更新：将产物放入 ./mxcad-dist/<platform>-<arch>/（文件名即组件）
   → 新增平台/架构/组件直接加目录/文件，无需改代码
3. 本地运行：node scripts/upload-mxcad.js
   → 自动发现 mxcad-dist/ 目录，计算哈希，相同内容去重，上传到 Release
   → 生成并提交 mxcad-dist/manifest.json
4. git tag v2.3.1 && git push origin v2.3.1
   → 触发 GitHub Actions release.yml
5. CI 自动：
   → detect-arch 从 manifest 发现 Linux 架构
   → 构建各平台标准组件
   → 按 manifest 下载对应哈希的产品二进制
   → pack-offline.js 打包离线部署包
   → 上传到 Releases（草稿）
6. 在 GitHub 确认 Release 后点击"发布"
```

### 5.3 产品二进制（mxcad / mxversion）去重机制

mxcad 图纸转换器与 mxversion 版本工具是公司核心产品，**内部已打包好的二进制**。

**目录即配置（自动发现，不硬编码）**：脚本遍历 `./mxcad-dist/<platform>-<arch>/<component>.<ext>` 自动发现平台/架构/组件，**新增平台、架构、组件无需改任何代码，放目录即生效**：

```
mxcad-dist/                     # 目录名 = <platform>-<arch>
├── linux-x86_64/mxcad.tar.gz   # 文件名 = <component>.<ext>
├── linux-aarch64/mxcad.tar.gz
├── linux-armv7l/mxcad.tar.gz
└── windows-x64/
    ├── mxcad.zip
    └── mxversion.zip           # 可选，加目录/文件即自动支持
```

**去重原理**：
1. `upload-mxcad.js` 遍历目录，为每个文件计算 **SHA256 哈希**。
2. 查询 GitHub Release：该哈希对应的附件是否已存在？
   - 存在 → **跳过上传**（复用线上那份）
   - 不存在 → 上传，附件名携带哈希后缀。
3. 生成 `mxcad-dist/manifest.json`（组件×平台×架构 → 哈希），提交入库。

```
Release 附件（mxcad 独立 Release，与业务解耦）：
  mxcad-linux-x86_64-a3f9e2c4.tar.gz   ← 哈希后缀唯一标识内容
  mxcad-linux-aarch64-7c2e8b1a.tar.gz
  mxcad-linux-armv7l-d4b6f0aa.tar.gz
  mxcad-windows-x64-5f1d9a07.zip
  mxversion-windows-x64-8c4d2f01.zip
```

**CI 引用（全部自动发现）**：
- `release.yml` 的 `detect-arch` job 读取 `manifest.json` 动态生成 Linux 架构 matrix（新增架构自动纳入）。
- Linux/Windows job 按当前平台×架构从 manifest 读取组件附件名下载。
- `ensure-runtime.js` 读 manifest 匹配当前平台×架构的组件。
- 相同哈希的内容只下载一次（可叠加 GitHub Actions 缓存进一步去重）。

**架构识别**：脚本通过 `process.arch` 映射附件后缀（Windows → `x64`，Linux → `x86_64`/`aarch64`/`armv7l`）。新架构加入 `mxcad-dist/` 目录即自动适配。

**收益**：产品二进制内容不变则永不重复上传/下载；内容变化时哈希自动识别；新增平台/架构/组件零代码改动。

### 5.4 各平台构建方式

| 平台 | 标准组件 | 构建方式 |
|------|---------|---------|
| Linux x86_64 | node/pg/redis/svn | GitHub Actions + QEMU + Docker（`pack-linux-deploy.js`） |
| Linux aarch64 | node/pg/redis/svn | GitHub Actions + QEMU 模拟 arm（复用 Docker 多架构） |
| Linux armv7l | node/pg/redis/svn | GitHub Actions + QEMU 模拟 arm |
| Windows x64 | node/redis | `build-windows-runtime.js` 官方源下载（redis 源为 tporadowski/redis） |
| Windows x64 | postgresql | **产品二进制通道**（EDB 直链已 403）：本地 PG binaries zip（顶层含 `pgsql/` 目录）放入 `mxcad-dist/windows-x64/postgresql.zip` → `upload-mxcad.js` 上传 → release.yml 解压到 `runtime/windows/postgresql` |

> QEMU 依赖：GitHub Actions 的 `docker/build-push-action` 原生支持多架构容器构建，
> 与现有 `pack-linux-deploy.js` 的 Docker 打包机制一致。

### 5.5 打包排除红线

`scripts/pack-lib/packignore.json` 保持以下排除，确保保密内容不进部署包：

```json
{
  "exclude": {
    "dirs": ["runtime/windows/mxcad/tool", "runtime/linux/mxcad/tool"]
  },
  "keepEmpty": {
    "dirs": ["runtime/windows/mxcad/files", "runtime/linux/mxcad/files"]
  }
}
```

- `mxcad/tool`：完全排除（不打包）。
- `mxcad/files`：保留空目录，内含的保密图纸 `.mxweb` 不打包。

---

## 5.6 开发环境运行时自检（preinstall 钩子）

**离线部署包内嵌完整 runtime，不联网；开发环境则需要下载缺失的 runtime。**

通过 `package.json` 的 `preinstall` 钩子实现（开发者 `pnpm install` 时自动触发）：

```json
{
  "scripts": {
    "preinstall": "node -e \"try{require('./scripts/preinstall-runtime.js')}catch(e){...}\""
  }
}
```

`scripts/ensure-runtime.js` 行为（ADR-0059）：
1. 检查本平台【产品二进制】是否就绪：Linux `runtime/linux/mxcad/`、Windows `runtime/windows/mxcad/` + `runtime/windows/mxversion/`。
2. 检查【标准组件】是否就绪：node / postgresql / redis / svn（Linux `runtime/linux/`，Windows `runtime/windows/`；Windows 的 svn 由 mxversion 提供，无独立 subversion）。
3. **已就绪 → 直接跳过**（幂等，零开销，不阻塞日常 install）。
4. 缺失 → 自动从 GitHub Release 下载对应平台×架构的 **runtime 依赖包**（`cloudcad-runtime-deps-<os>-<arch>-<fingerprint>.tar.gz`，内容寻址，见 5.7）并解压到 `runtime/<platform>/`。

> **目标体验**：clone → `pnpm i`（preinstall 自动拉产品二进制 + 缺失的标准组件）→ `pnpm dev`（predev 跑 `prisma generate` + tsc）→ 直接启动。完全不懂开发的人 clone 后开箱即用。
>
> **prisma engine 无需单独处理**：Prisma 7 的 engine 是 npm 包 `@prisma/engines`（node_modules 下含全 6 平台 binary），随 `pnpm install` 落盘，`prisma generate` 直接用 node_modules 里的 engine（不联网）。runtime 依赖包只装 node/pg/redis/svn 标准组件，**不含 engine**。
>
> 纯 Node 标准库实现，无第三方依赖，可在 `pnpm install` 早期安全执行。

### 5.6.1 技术用户 opt-out 路径（互不冲突）

1. **按需检测天然跳过**：本地已有组件（或已手动放到 `runtime/<platform>/<component>/`）→ preinstall 检测到即跳过。
2. **显式 opt-out**：环境变量 `CLOUDCAD_SKIP_STD_RUNTIME=1` 整体跳过标准组件自动拉取（产品二进制仍拉）。
3. **手动放置**：手动把组件放到 `runtime/` 对应目录（preinstall 检测到即跳过）。

### 5.6.2 下载源多源有序回退（加速下载，ADR-0059 决策 9）

国内访问 GitHub 不稳定，下载源设计为**多源有序回退**（单一事实源 `scripts/lib/download-sources.js`）：

- **回退顺序**：默认 `[GitHub 主源, ...内置公开加速镜像]`（内置 3 个左右 ghproxy 类公开服务，集中定义、易腐可配）。
- **可配置覆盖**：`RUNTIME_DOWNLOAD_URLS`（有序列表，逗号/空格分隔）优先级最高——**未来自己服务器就绪 = 往列表前插一项即优先**。保留 `RUNTIME_DOWNLOAD_URL`（单地址，向后兼容，等价列表长度 1）。
- **双形态**：① 基地址替换 `<base>/<asset>`（自己服务器/rsync 镜像用）；② 前缀代理 `<mirror>/https://github.com/...`（ghproxy 类公开加速用）。
- **回退判定 = 超时 + 状态码双判**：每源设连接超时（~10s）+ 读取超时（`RUNTIME_DOWNLOAD_TIMEOUT_MS`，默认 60s），超时或 HTTP 非 2xx 即切下一源；全部失败才报错（提示手动放置 / 设镜像）。**必须判超时**——国内 GitHub 典型症状是「TCP 能连但传输极慢/卡死」。
- **覆盖范围 = 全链路统一**：dev preinstall（产品二进制 + 标准组件）+ CI（runtime 依赖包 + mxcad 二进制）+ 终端用户部署包下载文档，全部走同一下载助手。
- **其他环境变量**：`RUNTIME_RELEASE_TAG`（产品二进制 tag，默认 `mxcad-stable`）、`RUNTIME_DEPS_TAG`（runtime 依赖包 tag，默认 `runtime-deps`）、`CLOUDCAD_RUNTIME_TIER`（Linux glibc 档位覆盖，默认按 `/etc/os-release` 探测）。

**终端用户自建镜像**：把 Release 资产 rsync 到自己服务器，再设 `RUNTIME_DOWNLOAD_URLS=https://your-server/`（基地址替换形态）即可优先走自己服务器。

### 5.7 runtime 依赖包（Release 复用 + 断网验证硬门禁，ADR-0059）

**问题**：`release.yml` 的 `build-linux` 矩阵每个发行版都起 Docker 容器重新 `apt/dnf install` + 提取 node/pg/redis/svn，而 `runtime/cache/`（按发行版隔离的提取缓存）被 `.gitignore` 排除、GitHub runner 恒空 → 每次 release 全部重提。

**方案**（三件事）：

1. **runtime 依赖包 = 内容寻址 Release 资产**：node/pg/redis/svn 按 `os × arch` 提取一次，打成 `cloudcad-runtime-deps-<os>-<arch>-<fingerprint>.tar.gz`（fingerprint=组件版本指纹，如 `node20.19.5-pg15-redis5`），上传 Release。CI（`release.yml`）与 dev 机（preinstall）**都只下载该资产**，不再各自提取。版本不变 → 资产名不变 → 永久复用、零重提。
   - 打包脚本 `scripts/pack-runtime-deps.js`（`--os <os>` Linux Docker 提取 / `--win` Windows）+ `mxcad-dist/manifest.json` 登记「组件×平台×架构 + hash」。
   - 独立提取 workflow `.github/workflows/runtime-deps.yml`（`workflow_dispatch` 手动播种 + 可选 `schedule` 周期刷新防版本漂移），与 release 解耦。
2. **发行版收敛 6→3 glibc 档**：`centos7`(glibc2.17) / `ubuntu22`(2.35) / `rocky9`(2.34+)，砍 `ubuntu24`/`rocky8`/`debian`（glibc 重叠或可被代表）。`release.yml` 矩阵 + `pack-linux-deploy.js`/`verify-linux-deploy.js` 的 `OS_BASE_IMAGES` 同步收敛。
3. **断网启动验证 = release 硬门禁**：每个 build job 产出部署包后，**先跑断网验证、通过才上传** draft Release；任一包验证失败 → 整个 release 失败。
   - Linux：`scripts/verify-linux-deploy.js --os <os>`（`docker run --rm --network none` 断网容器 + 解压包 + 装依赖 + 启 PostgreSQL/Redis/后端/前端 + 全服务健康检查）。
   - Windows：`scripts/verify-windows-deploy.js` + `runtime/docker/Dockerfile.windows-deploy-verify`（`docker run --network none mcr.microsoft.com/windows/servercore:ltsc2022` + 解压 .7z + 跑 Windows 版 verify）。
   - **判定标准 = 全服务健康检查通过**：postgresql（`pg_isready`）、redis（`redis-cli ping`）、backend（API 健康端点 200）、frontend（HTTP 200）、cooperate + config-service（进程存活 + 端口监听）全部通过。

**红线**：runtime 依赖包**只作为打包机/CI 的复用层**，不改变部署包内嵌 runtime 的事实——部署包仍自包含、目标机仍纯离线（store-based 250-350MB 结构不变）。

---

## 6. 仓库/脚本清单

| 文件 | 职责 |
|------|------|
| `.github/workflows/release.yml` | 打 tag 触发，全平台打包并上传 Release |
| `.github/workflows/ci.yml` | PR/推送门禁：提交规范 + 敏感文件拦截 + 测试 |
| `scripts/upload-mxcad.js` | 本地 mxcad 哈希去重上传 |
| `scripts/build-windows-runtime.js` | Windows 标准组件官方源下载构建 |
| `scripts/pack-offline.js` | 离线部署包/升级包打包（现有，复用） |
| `scripts/pack-linux-deploy.js` | Linux Docker 多架构打包（现有，复用） |
| `scripts/ensure-runtime.js` | 开发环境运行时自检（`preinstall` 钩子调用，缺失时从 Release 下载） |
| `runtime/scripts/setup-offline.js` | 离线部署环境设置（离线纯净，**不联网下载**，内嵌 runtime 完整） |
| `scripts/pack-lib/manifest.js` | 打包清单单一事实源（现有） |
| `scripts/pack-lib/packignore.json` | 打包排除规则（现有） |

---

## 7. 敏感信息红线

- 任何 `.env`、`.env.*`、`*.log`、`test-credentials*` 禁止入库。
- CI 已启用 gitleaks 扫描，泄漏即 fail。
- 私钥、token 一律放 GitHub Secrets，不入代码、不进文档。

---

## 8. 回滚与事故处理

- **禁用手动 force push 到 main**（除首次清空历史的约定操作外）。
- 发版异常：先在 Releases 撤销/标记为 broken，再从对应 tag 拉修复分支。
- 需要回滚某版本时：`git revert <commit>` 产生新提交，不改历史。

---

## 9. 首次清空历史操作（一次性，需维护者手动执行）

> 以下操作会改写远程历史，**必须**在团队确认无未推送工作后进行。
> 本地会先打 `backup/pre-purge` tag 作为安全网，可随时找回原历史。

```bash
# 1. 本地安全网
git tag backup/pre-purge

# 2. 创建孤儿分支（保留工作区文件，丢弃全部 git 历史）
git checkout --orphan new-root
git add -A
git commit -m "chore: 重建仓库根提交（清空历史，禁用图纸/产物入库）"

# 3. 用新根提交接管 main
git branch -D main
git branch -m main

# 4. 强制覆盖远程 main（一次性操作，之后 main 受保护不可 force）
git push origin main --force

# 5. 清理远程分支（删除历史遗留分支，只保留 main）
git ls-remote --heads origin | grep -E 'refs/heads/(dependabot|legacy|research|backup|worktree-agent|feat|fix|refactor)' \
  | sed 's#.*refs/heads/##' | xargs -I{} git push origin --delete {}

# 6. 清理旧 tags（v0-pre-refactor、v1.0.0-frontend-refactor 等）
git tag -l | xargs -I{} git tag -d {}
git ls-remote --tags origin | sed 's#.*refs/tags/##' | xargs -I{} git push origin --delete tag {}

# 7. 远程分支保护（GitHub 网页操作）
#    Settings → Branches → Add rule → 保护 main：禁止直接 push、要求 PR 审核
```

> 若本地还有其他分支（feat/fix/refactor 等有未合并工作），先合并进 main 或单独推送，再删除。

---

## 10. 结语

治理原则一句话：**源码与配置进 Git，产物与二进制走 CI/Release，用户数据永不入库。**
这套流程让发版从"本地手工打包 + 手动上传"升级为"打一个 tag，GitHub 自动完成一切"。
