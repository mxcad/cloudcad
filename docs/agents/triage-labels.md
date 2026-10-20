# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (Gitea `qjx/cloudcad`).

The right-hand column was **verified against the live label table on 2026-10-20** and is *not* an aspiration: only `ready-for-agent` and `wontfix` of the five exist. The other three rows below are **nearest-equivalent fallbacks** — use them when the real label does not exist, and say so rather than silently claiming the triage state.

| Label in mattpocock/skills | Label in our tracker | Status | Meaning                                  |
| -------------------------- | -------------------- | ------ | ---------------------------------------- |
| `needs-triage`             | `help wanted`        | ⚠️ fallback（真标签不存在） | Maintainer needs to evaluate this issue  |
| `needs-info`               | `question`           | ⚠️ fallback（真标签不存在） | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | ✅ 真实存在 | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `enhancement`        | ⚠️ fallback（真标签不存在） | Requires human implementation            |
| `wontfix`                  | `wontfix`            | ✅ 真实存在 | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## 仓库实际标签表（2026-10-20 实测，共 17 个）

`bug`, `documentation`, `duplicate`, `enhancement`, `help wanted`, `invalid`,
`line-a`, `line-b`, `question`, `ready-for-agent`, `wontfix`,
`wayfinder:grilling`, `wayfinder:map`, `wayfinder:prototype`, `wayfinder:research`,
`wayfinder:task`, `弹性转换架构`

本仓的实际分工不是「五角色 triage」，而是**按 skill 家族 + 工作线**打标：open issue 的分布是
`ready-for-agent` 32、`wayfinder:grilling` 28、`wayfinder:task` 26、`line-a` 19、`enhancement` 15、
`wayfinder:map` 6、`line-b` 5、`bug` 3。`bug` 只给**行为错误**，覆盖缺口/待补能力用 `enhancement`。
（`wayfinder:research` 在 428 张迁移票的关票里有大量历史使用，但当前不在活动标签表里。）

## API 操作注意（2026-10-20 实测，踩过的坑）

- **标签只能在建票时设定，PATCH 改不动。** 本仓 `wdx` 账号权限是 `push/pull`（无 `write`、非 admin）：
  `POST /issues` 传 `labels:[id]` 生效，但对**任意 issue**（包括自己创建的）`PATCH {labels:[...]}`
  一律静默忽略——**响应仍是 201、响应体也显示原标签，只有再 GET 才暴露没变**。所以想给已有票换标签，
  要么让有 `write` 权限的人改，要么在 Gitea 网页上改。**补完标签务必再 GET 一次核实**。
- 能改的字段：`state`（关闭/重开）、`body`、`title`，评论走 `POST /issues/{n}/comments`，均 201 且生效。
- `labels` 传的是 **ID（int）**，传名称字符串 422。
- 带 `duplicate` 标签的票被关闭时，Gitea 会**摘掉该标签**（实测 #486），只在评论里留重复理由即可，不用重开重标。
