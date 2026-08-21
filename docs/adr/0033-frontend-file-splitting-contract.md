# 0033 — 前端巨型文件拆分契约（400 行上限 + 组合式拆分）
**Status**: accepted

现状：`packages/frontend/src` 426 个源文件中 >400 行 60 个、>1000 行 13 个（最大 `FileSystemManager/index.tsx` 1549 行），另有巨型 hook（`useDirectoryImport.ts` 1067 行）与巨型 CSS（`sidebar.module.css` 1641 行）。本 ADR 定下拆分契约与试点路径（pilot-then-migrate，意图对齐后端 ADR-0005），存量治理走试点 + 尾部执行队列，不在本 ADR 生效日执行。

**Decision**

**一、单文件行数上限：400 行（硬门禁），软目标 300 行**

- 源码文件（.ts/.tsx）超过 400 行必须拆分。
- 不套用后端 ADR-0005 的 100–300 行（该教训针对「每命令独立文件」的细粒度单元；页面文件是聚合体，300 硬上限会让 60 个文件全部超标，与「避免破坏性变更」约束冲突）。
- **例外（豁免计数，不放行结构失控）**：
  - CSS 样式文件（按区块拆分准则，见三）
  - 生成物：`*.gen.ts`、i18n 语言字典、MSW handlers
  - 纯声明/常量/类型文件（types.ts / constants.ts）
  - 测试文件（豁免计数，不豁免结构规范）
  - 纯 re-export barrel（只做 re-export）
  - 全局主题 token / base（`theme.css`、`app.css`）

**二、拆分模式契约（按对象三类）**

1. **页面/巨型组件 → 目录化拆分**：`index.tsx` 只做组装（状态接线 + 渲染子组件）；视觉区域按职责切成子组件；局部类型提取 `types.ts`；私有 hooks 进 `hooks/`；样式文件与组件一一对应。样板参照 `FileSystemManager/` 既有形态（`index` 组装 + `FileSystemContent`/`FileSystemHeader`/`FileSystemStates` + `hooks/`）。
2. **巨型 hook → 组合式再拆**：按职责拆成 2–4 个独立 hook（如导入 hook → 解析/上传/校验/进度子 hook），外层 hook 只做组装与状态接线；跨 hook 共享的运行时依赖（mxcadManager 单例、上传服务等）由外层传入或走既有单例，不引入新抽象（对齐 ADR-0031「前端默认不抽象」）。
3. **入口文件**：纯 re-export barrel 豁免；组装入口（index.tsx 类）不豁免——组装逻辑过多说明抽得不够。
4. **不设拆分产物下限**：以单一职责为准，不追求进一步细分。

**三、CSS 归属**

- JS 模板字符串 CSS：已由 ADR-0032 判死，存量消灭归样式迁移执行（#193），本 ADR 不复述。
- 巨型 CSS Modules（`sidebar.module.css` 1641、`ResourceList.module.css` 958）：行数门禁豁免，按「组件区块对应」拆分——与组件文件一一对应，按子区块拆 2–3 个 module.css。
- 非 module 的页面级普通 CSS（`Profile.css` 862、`Register.css` 519、`UploadPanel.css` 322 等）：**存量许可 + 随页面拆分一并转 .module.css**（拆对应页面时顺带迁移，不单独排队）；新增一律禁止普通 .css。
- `theme.css` / `app.css`：全局 token/base 唯一事实源，豁免不拆。

**四、试点与迁移路径（pilot-then-migrate）**

- **试点锁定（双样板，覆盖二类拆分规则）**：
  - `components/FileIcons.tsx`（1154 行，纯 SVG 图标集合）→ 组件拆分样板：按图标分组拆多文件 + index 组装。
  - `hooks/useDirectoryImport.ts`（1067 行，混合分片上传/冲突策略/目录树/外部参照）→ hook 组合式再拆样板。
- 试点执行受「避免破坏性变更」约束，与并行开发协调，排尾部执行队列。
- 其余巨型文件（`Register.tsx` 1128、`FontLibrary.tsx` 1100、`LibraryManager.tsx` 1056、`FileSystemManager/index.tsx` 1549、`Profile.tsx` 1197、`FileItem.tsx` 1020、`ProjectDrawingsPanelMain.tsx` 1061、`SystemMonitorPage.tsx` 894、`ResourceList.tsx` 861、`MembersModal.tsx` 836、`ForgotPassword.tsx` 813、`Layout.tsx` 796 等）登记尾部执行队列。
- 本 ADR 生效日不改代码。

**Guidance**

- 新增 .ts/.tsx 文件目标 ≤300 行，超 400 行必须拆分。
- 拆分遵循：页面目录化（index 组装 + 子组件 + hooks/ + types.ts）、hook 组合式、样式与组件一一对应。
- Code Review 必拦：新增超 400 行源码文件、新增普通 .css、组装入口内部堆积业务逻辑。
- 新组件/页面创建时先按目录结构搭骨架（index + 子组件 + hooks/），避免事后一次性大拆。

**Status**: accepted

**Cross-references**

- ADR-0005 后端 Command pilot-then-migrate（试点 + 尾部队列模式的意图来源）
- ADR-0028 前端依赖分层（拆分产物落入既有分层，不破坏依赖方向）
- ADR-0029 前端模块入口 Façade（模块私有文件随模块入口走）
- ADR-0030 前端状态归属（hook 拆分时的状态归属边界）
- ADR-0031 前端可替换规则（「配置差异化不抽象」的同类意图：hook 拆分不造新抽象）
- ADR-0032 前端样式统一规范（CSS 归属与模板字符串 CSS 判死）
