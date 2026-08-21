# 0029 — 前端模块入口（Façade/barrel）规则
**Status**: accepted

前端除 `services/mxcadManager`（12 子模块，`index.ts` 重导出）与少量目录（`hooks/file-system`、`components/ui`、`components/common` 等 18 个 `index.ts`）外，`stores/`、`contexts/`、根 `hooks/` 全部平铺、按文件路径直接导入；同名 hook 双版本（`useFileSystemNavigation` ×2、`useVersionHistory` ×2）无归位规则；`pages/Profile/index.ts` 是无消费者的孤儿 barrel。本 ADR 对应后端 ADR-0002「选择性 Façade」与 ADR-0023「模块内 Façade token」，为前端定下「模块入口 / 门面」规则，与 ADR-0028 分层（L1/L2/L3）正交——分层定「往哪个方向依赖」，本 ADR 定「从哪个入口进来」。

**Decision**

**核心规则：有内部结构就有入口。**

1. **模块 = 目录边界。** 目录含多个实现文件或子目录时，必须有 `index.ts` 统一重导出公共 API，作为该模块的唯一入口。
2. **扁平单文件模块不需要 barrel。** `stores/`、`contexts/`、根 `hooks/` 单文件现状保持平铺，不建 `index.ts`。
3. **外部消费者只能从模块入口导入。** 禁止 `dir/sub/file` 深路径导入已有入口的模块；模块内部（同目录子树）可直连子文件。前端无 DI token，「内外」由目录边界界定。
4. **hook 归属边界**（`hooks/` 根 | `pages/*/hooks` | `components/*/hooks`）：
   - `hooks/` 根 = 全局共享（L2 业务层），任意页面/组件可消费；
   - `pages/X/hooks` = 页面私有，仅 X 页面及其子组件；
   - `components/X/hooks` = 组件私有，仅 X 组件及其子树；
   - 被 ≥2 个独立页面/组件消费 → 提升 `hooks/` 根；单点消费 → 留本地；**禁止跨目录导入私有 hook**（私有 hook 无入口即不可外部访问）。
5. **同名收敛**：同名同义（近重复）→ 合并为一个共享 hook、差异参数化；同名不同义 → 改名（职责语义化，如 sidebar 版 `useFileSystemNavigation` → `useDrawingOpener`）。
6. **barrel 必须有消费者经其导入**；孤儿 barrel（如 `pages/Profile/index.ts`）属死代码，入尾部执行队列删除。
7. **门禁**：`.dependency-cruiser.cjs` 新增 warn 级「禁止深路径导入已有入口模块」规则，暂不接入 `pnpm check`/CI；code review 必查入口归位。存量违反清零后与 ADR-0028 一起接入 CI。

**Guidance**

- 新建目录若含多个实现文件 → 立即建 `index.ts`；新增共享 hook → 先按归属边界判断层级，避免与全局 hook 同名。
- 跨页面复用的逻辑一律提升 `hooks/` 根，杜绝在组件目录重复实现（参考：两个 `useVersionHistory` 合并）。
- 执行类改动（move/rename/删除）属破坏性变更，走尾部执行队列与并行开发协调，不在本 ADR 内动手。

**Status**: accepted

**Cross-references**

- ADR-0002 选择性 Façade（后端参照：外部消费者走 Façade、内部直连子服务）
- ADR-0023 模块内 Façade token（后端参照：模块不导出内部服务）
- ADR-0028 前端依赖分层与门禁（正交的分层约束）
- 前端 Façade/模块入口规则 ticket（map「前端 AI 开发地基建设」子票 186）
- 技能文档 `frontend-coding-standards/docs/module-entry.md`
