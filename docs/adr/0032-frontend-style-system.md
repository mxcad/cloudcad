# 0032 — 前端样式统一规范（单一主范式 + 变量统一 + z-index 门禁）
**Status**: accepted

前端样式现状是四范式并存（Tailwind class / CSS 变量 token / 内联 style 924 处 / JS 模板字符串 CSS 6+ 个文件）加两套变量命名（`--color-*` 与 `--primary-*`）混用，且 Tailwind 色板类因未注册进 `@theme` 而静默失效。本 ADR 裁定「单一主范式」，统一变量体系，并把裸 z-index 收编为可执行的门禁。与后端 ADR-0005（pilot-then-migrate）一致，存量治理走试点 + 尾部队列，不在本 ADR 生效日执行。

**Decision**

**一、主范式：CSS 变量 token 为唯一事实源，Tailwind 只做布局 utility**

```
主范式栈（按职责）：
  主题语义 token（theme.css 的 --bg-* / --text-* / --primary-* 等）→ 颜色/主题
  CSS Modules（*.module.css / 组件内 <style>）→ 组件复杂样式
  Tailwind utility（布局/间距/flex/grid 等无主题类）→ 布局
  内联 style → 仅限动态值（isSelected 分支、尺寸计算、transform 等），禁止主题色硬编码
  JS 模板字符串 CSS → 禁止（存量全部消灭，见四）
```

- **颜色只用变量 token**：禁止内联硬编码色值（`#xxx` / `rgb()`）与 `bg-primary-500` 类；用 `var(--primary-500)`、`bg-[var(--primary-500)]` 任意值语法或语义类。
- **Tailwind 定位为布局 utility**：间距/尺寸/flex/grid/定位类照用；不把主题色注册为 Tailwind 色板（见二，`--color-*` 已废弃）。
- 理由：现状重仓变量 token（`var(--语义token)` 3623 处 vs `var(--color-*)` 58 处）；语义 token 双主题（亮/暗）天然正确，Tailwind 色板只有亮色一份，以它为主范式会破坏深色模式；内联色值大迁移（900+ 处）违背「避免破坏性变更」。

**二、变量统一：消灭 `--color-*` 命名空间，并入 theme.css 语义 token**

- `app.css` `@layer base :root` 中的 `--color-primary-*`/`--color-accent-*`/`--color-slate-*`/`--color-success-*` 等定义**全部删除**。
- 58 处 `var(--color-*)` 引用机械替换为语义名：`--color-primary-*` → `--primary-*`，`--color-slate-*` → 按语义映射（背景 `--bg-*`、文字 `--text-*`、边框 `--border-*`），`--color-success/error/warning-*` → `--success/--error/--warning` 系。
- ~30 处失效的 `primary`/`accent` 工具类（`text-primary-600` 等，因未注册 `@theme` 而静默无效果）改 `bg-[var(--primary-500)]` 任意值语法。
- `slate` 系工具类（`bg-slate-50` 等）保留：Tailwind 内置色板自带，与 `--color-slate-*` 定义同值，删除定义不影响。
- **附带收益**：dark 模式下这些引用自动跟随主题（同一套变量），修复「深色模式部分 UI 不变色」隐患。
- 否决的备选：注册 `--color-*` 进 `@theme` 让工具类生效（与主范式冲突 + 需补暗色双份色板）；别名兼容 `--color-primary-500: var(--primary-500)`（多一层间接，dark 下 `:root` 定义不变，无法跟随主题）。

**三、z-index 门禁：全局浮层必须 `Z_LAYERS`，局部小值豁免**

- **ESLint `no-restricted-syntax` 兜底**（零新增依赖）：禁 JSX 内联 style 对象中的 `zIndex: <数字字面量>`，强制 `Z_LAYERS.*`（`style={{ zIndex: 100 }}` → 报错，`zIndex: Z_LAYERS.MODAL` → 通过）。
- 模板字符串 CSS 内的裸 z-index **不单独设门禁**：模板 CSS 全部消灭后随源消失；CSS Modules 内的裸值靠规范条款 + code review 约束（本 effort 不引入 stylelint，避免新增依赖栈）。
- **语义分级豁免**：局部层叠上下文内的 `z-index: 1/2`（非 fixed/absolute 全局浮层，如 `.input-icon`、sticky header）允许保留，但须注释说明「局部层叠上下文」；全局浮层（fixed 定位、`z-index >= 100`）一律 `Z_LAYERS.*`。禁止为 `z-index: 1` 造 `Z_LAYERS.LOCAL_1` 式条目。

**四、存量治理路径：本 ADR 只定契约，执行排尾部队列**

- 本 ADR 生效日**不改代码**（符合「避免破坏性变更」，破坏性改动集中在尾部执行队列）。
- **试点样板锁定**：`pages/Login/LoginStyles.ts`（698 行，登录系）为模板 CSS 迁移样板——auth 系 6 个页面 `<style>` 同构，迁一个即成模板；登录页无 CAD 引擎/文件系统并行开发冲突风险；其 8 处裸 z-index 顺带演示门禁语义分级。
- 其余 112 个含内联 style 的文件 + 3 个模板 CSS（`RoleManagementStyles.ts` 550 行 / `UserManagementStyles.ts` 924 行 / `RuntimeConfigPage/styles.ts` 621 行）登记入尾部执行队列，与并行开发协调。
- 存量治理清单（文件级明细）记录于本 ticket 的 resolution 与「前端样式统一规范」ticket，不入 ADR。

**五、文档分工**

- 本 ADR 为本决策的唯一留痕。
- `frontend-coding-standards` skill 的 `docs/theme-system.md`、`docs/z-index-rules.md`、`docs/anti-patterns.md` 同步改写在「地基文档与 ADR 落地」ticket 统一执行（避免双头写同一批文档）。

**Guidance**

- 新增样式一律走主范式：颜色用变量 token，组件样式用 CSS Modules，布局用 Tailwind utility，动态值才用内联 style。
- 禁止新增 `--color-*` 变量与 JS 模板字符串 CSS 文件。
- Code Review 必拦：内联硬编码色值、裸全局浮层 z-index（`zIndex: 100` 数字）、新 `--color-*` 定义、新模板字符串 CSS。
- 新组件样式先确认 `src/components/ui/` 已有组件是否满足（沿用既有 Input/Modal 等风格）。

**Status**: accepted

**Cross-references**

- ADR-0029 前端模块入口 Façade（样式文件的归属：模块私有样式文件随模块入口走）
- ADR-0031 前端可替换规则（「配置差异化不抽象」的同类意图：样式差异用变量 token 表达，不造抽象）
- ADR-0005 后端 Command pilot-then-migrate（试点 + 尾部队列模式的意图来源）
- 前端样式统一规范 ticket（map「前端 AI 开发地基建设」子票 182）
