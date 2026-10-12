# Issue tracker: Gitea

本仓库的 issues 与 PRD 全部存放在自建 Gitea 实例（仓库 `qjx/cloudcad`）。**所有记录只保留在 Gitea**——不再向 GitHub 新建 issue；GitHub 侧（`mxcad/cloudcad`）为 2026-10-12 迁移前的只读归档。

- **实例**：`http://10.66.66.1:5656`
- **仓库**：`qjx/cloudcad` → `http://10.66.66.1:5656/qjx/cloudcad`
- **API**：`http://10.66.66.1:5656/api/v1`（Gitea v28.1.0）

## 认证

API 走 Basic auth（用户名+密码）。凭据存于 Git Credential Manager，用下面命令取：

```bash
printf 'protocol=http\nhost=10.66.66.1:5656\npath=/qjx/cloudcad.git\n\n' | git credential-manager-core get
```

脚本化操作建议用 Node `fetch` + `Authorization: Basic <base64(user:pass)>`。注意：Git Bash 下 `curl -d` 传中文 body 会破坏 UTF-8（服务端报 `invalid UTF-8`），发中文内容一律走 Node fetch 或先写 UTF-8 文件再 `--data @file`。

## API 注意（本 Gitea 版本与上游行为不同）

| 操作 | 端点 / 方法 |
|---|---|
| 创建 issue | `POST /repos/qjx/cloudcad/issues`——**`labels` 必须传标签 ID（int 数组），传名称字符串会 422**；`assignee_id` 传用户 ID |
| 关闭 / 更新 issue | **`PATCH`** `/repos/qjx/cloudcad/issues/{number}`，body `{"state":"closed"}`（POST/PUT 均 405） |
| 加评论 | `POST /repos/qjx/cloudcad/issues/{number}/comments`，body `{"body":"..."}` |
| 列 issue | `GET /repos/qjx/cloudcad/issues?state=open\|closed\|all&limit=50&page=N`，`labels=名称1,名称2` 按名称过滤 |
| 标签列表 | `GET /repos/qjx/cloudcad/labels`（返回 name+id；建 issue 前先取 ID 表） |
| 建标签 | `POST /repos/qjx/cloudcad/labels`，body `{"name":"...","color":"rrggbb"}` |
| 当前用户 | `GET /user`（本版本**没有** `/api/v1/users` 列表端点） |

## Conventions

- **创建 issue**：先 `GET /labels` 拿名称→ID 映射，再 `POST /issues`（title/body/labels/assignee_id）。
- **读 issue**：`GET /issues?state=all` 分页定位，或直接看 Web 页；评论走 `GET /issues/{number}/comments`。
- **列 issue**：`GET /issues?state=open&labels=...` 分页遍历。
- **评论**：`POST /issues/{number}/comments`。
- **应用 / 移除标签**：`PATCH /issues/{number}`，`{"labels":[ID,...]}` 是**整体替换**语义（先取现有标签再增删）。
- **关闭**：`PATCH /issues/{number}`，`{"state":"closed"}`。

## When a skill says "publish to the issue tracker"

在 Gitea 上创建 issue（**不要**在 GitHub 上创建）。

## When a skill says "fetch the relevant ticket"

从 Gitea 拉取（API 或 Web）。若票号来自旧记录且是 **GitHub 编号**，先经 `docs/agents/issue-mapping.md` 换算成 Gitea 编号再操作。

## 编号映射（GitHub → Gitea）

2026-10-12 已将 GitHub `mxcad/cloudcad` 全部 428 个 issue（86 open / 342 closed，含 401 条评论）迁移到 Gitea，同日整理：关闭 35 张已完成/测试票（含 1 张乱码测试票）、修复 2 处乱码标题；GitHub 侧 86 张 open 票已全部关闭（无删除权限，无法物理删除），open 列表已清空，GitHub 仓库 issue 区从此只读归档。每个迁移 issue 的 body 头部带 `> **从 GitHub 迁移**：原 GitHub issue #N · 作者 … · 创建于 …` 标记。代码注释、ADR、issue 正文里引用的旧 GitHub 编号（如 #228、#234、#498）一律经 `docs/agents/issue-mapping.md` 换算。

## Wayfinding operations

本仓库 Gitea 无原生子 issue / issue-link 端点，父子关系与阻塞一律走 **body 约定**：

- **Parent/child**：wayfinder map 打标签 `wayfinder:map`；子票 body 尾部带：`*Wayfinder 票 · 子票：[<map title>](<map url>)*`。
- **Blocking**：被阻塞票的 body 里有 `## Blocked by` 小节，列出名链接指向其阻塞者。所列票据**全部关闭**即视为解除阻塞。
- **Labels**：`wayfinder:map`、`wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling`、`wayfinder:task`。
- **Frontier**（open + 未阻塞 + 未指派）：`GET /issues?state=open&labels=wayfinder:research,wayfinder:prototype,wayfinder:grilling,wayfinder:task` 分页拉取，再逐个读 `## Blocked by` 小节过滤。
