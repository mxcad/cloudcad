# 仓库遗留/临时/误导性文件审计（2026-08-03）

> 非破坏性审计：仅列出候选，**未删除任何文件**。
> 结论基于 git 跟踪状态 + .gitignore 规则 + 磁盘占用 + 最后修改时间。
> 删除任何条目前请逐项确认；被 git 跟踪的文件需 `git rm` 而非磁盘删除。

---

## 一、已提交进 git 但明显是运行时/临时产物的文件（高置信度）

这些文件被 track 进了 git，但被 `.gitignore` 明确排除或属于工具运行时产物——**建议从 git 移除跟踪**（`git rm --cached`），磁盘文件可保留。

| 路径 | 数量 | 说明 | gitignore 依据 |
|---|---|---|---|
| `.playwright-mcp/page-*.yml` / `.png` | 38 | Playwright MCP 截图/快照产物 | `.playwright-mcp/` (第 102 行) |
| `file-sync/received-files/*.dwg` | 38 | 文件同步接收的图纸，纯数据 | `file-sync/` (第 137 行) |
| `.agents/backup/2026-05-04T*/` | 7 | skill 迁移前的备份快照 | 无规则，属一次性备份 |
| `.deepseek/trusted` | 1 | AI 工具本地信任标记 | 工具运行时产物 |
| `.mimocode/plans/*.md` | 3 | AI 工具生成的一次性计划 | 工具运行时产物 |
| `.trae/documents/mxweb-direct-upload-plan.md` | 1 | 另一个 AI 工具的计划 | 工具运行时产物 |
| `forgot-password.yml` / `login-page.yml` / `cad-editor-initial.yml` | 3 | Playwright 无障碍树快照（0-6KB） | `test-sidebar.html` 同类测试产物 |

## 二、根目录散落的"一次完成"文档/分析文件（中置信度）

这些是某次任务后留下的总结/扫描产物，与正式文档（docs/、AGENTS.md）混放，容易误导。**建议归档到 `docs/archive/` 或删除。**

| 文件 | 大小 | 内容 |
|---|---|---|
| `修改历史总结.md` | 21 KB | 2026-04-10 起的对话修改记录，已过时 |
| `all_chinese.txt` | 540 KB | 中文注释扫描结果，一次性分析产物 |
| `all_deps.json` | 0.2 KB | 依赖清单导出，一次性产物 |
| `DAY_SUMMARY_2026-05-07.md` | 3.8 KB | 某天工作日报 |
| `部署说明.txt` | 4.2 KB | 部署说明，与 DEPLOYMENT.md 重复 |
| `微信登录失败问题分析.md` | 存在 | 一次性问题分析 |
| `已注销用户数据处理说明.md` | 存在 | 一次性说明 |

## 三、被 gitignore 但磁盘占用巨大的目录（默认安全，勿删）

这些已被 `.gitignore` 排除，不会污染 git，但占磁盘。属于**正常运行时数据**，只作提醒，不建议主动清理除非确认无用。

| 目录 | 占用 | 说明 |
|---|---|---|
| `data/` | ~23 GB | 用户数据/图纸/上传，生产数据！ |
| `release/` | ~5.8 GB | 发布包产物 |
| `node_modules/` | ~5.6 GB | 依赖，pnpm 可重建 |
| `.pnpm-store/` | ~3.6 GB | pnpm 全局 store，可 `pnpm store prune` |
| `runtime/`（windows/linux 子目录） | ~1 GB | 运行时二进制（scripts 保留） |
| `.pnpm-store-deploy/` | ~556 MB | 部署用 store |

## 四、顶层目录重复/疑似冗余（低置信度，需人工确认）

| 目录 | 状况 | 建议 |
|---|---|---|
| `.agents/` 与 `.opencode/` | 两套 skills，内容高度重复（同一批 skill 双份） | 确认哪个是权威源，另一套移除 |
| `prototypes/` | 8 个 A-H 原型 HTML | 若已定型可归档 |
| `lessons/` + `learning-records/` | 教学/学习记录，6+6 个文件 | 若不再维护可归档 |
| `research/` | 3 份 findings | 已产出 ADR 的话可归档 |
| `.scratch/` | 已跟踪的临时工作区 | 用后应清理 |

## 五、建议保留（勿动）

- `runtime/scripts/`、`runtime/docker/`、`runtime/*.js` — 有意的运维脚本，gitignore 只排除了 binaries
- `file-sync/sync-*.js` / `README.md` — 同步工具代码本体
- 根目录 `start/stop/cloudcad/pm2/pnpm` 等启动脚本 — 部署入口
- `docs/adr/0032-0034` 等未提交新文件 — 正常 WIP

---

## 处置顺序建议（全部需你确认）

1. **安全清理**（一行搞定，不删磁盘文件）：
   ```bash
   git rm -r --cached .playwright-mcp file-sync/received-files .deepseek/trusted .mimocode/plans .trae .agents/backup forgot-password.yml login-page.yml cad-editor-initial.yml
   git commit -m "chore: untrack runtime/test artifacts"
   ```
2. **归档根目录散落文档** → 移到 `docs/archive/`，或删除。
3. **确认 `.agents` vs `.opencode` 去重**。
4. **磁盘瘦身**（可选）：`pnpm store prune`、清理旧 `release/` 包。
