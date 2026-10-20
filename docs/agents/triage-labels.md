# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (Gitea `qjx/cloudcad`).

**Label table verified against the live API on 2026-10-20; three of the five canonical labels now exist** (`needs-triage`, `needs-info`→`question`, `ready-for-agent`, `wontfix`). The last row is a nearest-equivalent fallback — use it and say so rather than silently claiming the triage state.

| Label in mattpocock/skills | Label in our tracker | Status | Meaning                                  |
| -------------------------- | -------------------- | ------ | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | ✅ 真实存在（id 81，2026-10-20 新建） | Maintainer needs to evaluate this issue  |
| `needs-info`               | `question`           | ⚠️ 近似替代（同名标签不存在） | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | ✅ 真实存在 | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `enhancement`        | ⚠️ 近似替代（同名标签不存在） | Requires human implementation            |
| `wontfix`                  | `wontfix`            | ✅ 真实存在 | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## 仓库实际标签表（2026-10-20 实测，共 18 个）

`bug`, `documentation`, `duplicate`, `enhancement`, `help wanted`, `invalid`,
`line-a`, `line-b`, `needs-triage`, `question`, `ready-for-agent`, `wontfix`,
`wayfinder:grilling`, `wayfinder:map`, `wayfinder:prototype`, `wayfinder:research`,
`wayfinder:task`, `弹性转换架构`

本仓的实际分工不是「五角色 triage」，而是**按 skill 家族 + 工作线**打标：open issue 的分布是
`ready-for-agent` 32、`wayfinder:grilling` 28、`wayfinder:task` 26、`line-a` 19、`enhancement` 15、
`wayfinder:map` 6、`line-b` 5、`bug` 3。`bug` 只给**行为错误**，覆盖缺口/待补能力用 `enhancement`。
（`wayfinder:research` 在历史关票里大量使用，也在此表内。）

## API 操作注意（2026-10-20 实测，wdx 账号 `push/pull`）

**能做的：**
- 建标签 `POST /repos/{owner}/{repo}/labels` ✅ 即使 `/repos/{owner}/{repo}` 的 `permissions` 显示 `admin:false`——别被这个字段劝退
- 建票时指定标签 `POST /issues` 传 `labels:[id]` ✅
- 改 `title` / `body` / `state`（关闭、重开）✅ 返回 201 且生效
- 加评论 `POST /issues/{n}/comments` ✅

**做不到的：**
- **已有票的标签改不动。** `PATCH {labels:[...]}` 返回 201 但**静默忽略**，GET 后仍是原标签。
  试过 5 种写法全部无效：`labels:[id]`、`labels:"id"`、`labels_name:[id]`、`labels_name:"id"`，以及单标签端点
  `POST /issues/{n}/labels/{id}`（405）。**`title`/`body` 在同一请求里能改成功、`labels` 被单独忽略**，
  所以不能靠响应体或状态码判断——**改了必须再 GET 核实**。
- **删票 403**：`DELETE /issues/{n}` 对任意票（包括自己建的）都 403。要清票只能在网页上删，或关票 + 改标题标注作废。
- `POST`/`PUT` `/issues/{n}`（非 PATCH）→ 405。

**由此推出的两条实务规则：**
1. 标签要在**建票那一刻**就定对，事后改不了。发现标签错了，只能关票留指针评论指向新票。
2. 「关闭后重开」**不会**触发默认标签——`state: closed` 再 `open` 后标签原样保留，别指望这个来补标签。
