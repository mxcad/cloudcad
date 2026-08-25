# 前端 — packages/frontend

React 19 SPA（端口 3000），提供 CAD 编辑器 UI、项目管理、用户认证等功能。

## 地基 ADR 索引（新 session 必读）

前端开发地基由以下 ADR 沉淀，**任何代码变更前先对照对应 ADR**：

| ADR      | 主题            | 一句话规则                                                                                                             |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ADR-0028 | 依赖分层与门禁  | 三层模型 L1 基础设施 → L2 核心业务 → L3 业务编排，方向不可逆；`pnpm depcruise` 自检                                    |
| ADR-0029 | 模块入口 Façade | 有内部结构就有入口（index.ts）；外部消费者禁止深路径导入；hook 按归属边界归位                                          |
| ADR-0030 | 状态管理归属    | server 状态 → react-query；组件私有 → useState；子树共享 → Context；全局高频/外部访问/persist → Zustand                |
| ADR-0031 | 可替换与扩展点  | 默认不抽象、配置优先；第二个真实实现需求出现才走模块入口逃生门                                                         |
| ADR-0032 | 样式统一规范    | 变量 token 唯一事实源 + CSS Modules 组件样式 + Tailwind 仅布局 + 内联 style 仅动态值；禁模板字符串 CSS；禁 `--color-*` |
| ADR-0033 | 巨型文件拆分    | 源码 ≤400 行硬门禁 / 300 行软目标；页面目录化 + hook 组合式                                                            |
| ADR-0034 | 直连 fetch 治理 | 一切后端 API 调用走 `@cloudcad/api-sdk`；禁裸 fetch（豁免清单见 api-contracts skill）                                  |

详细内容见 `docs/adr/00{28..34}-*.md` 与 `frontend-coding-standards` skill（含 docs/ 子文档）。

## 结构

```
packages/frontend/
├── src/
│   ├── api-sdk/        # @cloudcad/api-sdk 桥接导出（index.ts）
│   ├── components/     # 可复用 UI 组件（ui/、common/、领域组件）
│   ├── config/         # 运行时配置
│   ├── constants/      # 常量（Z_LAYERS 等）
│   ├── contexts/       # React Context（Auth/Theme/Notification 等）
│   ├── hooks/          # 全局共享 hooks
│   ├── languages/      # VoerkaI18n（i18n）
│   ├── lib/            # 共享库（queryKeys.ts 等）
│   ├── pages/          # 页面（单文件或 <Name>/index.tsx 目录）
│   ├── services/       # 领域服务（mxcadManager 等）
│   ├── stores/         # Zustand store
│   ├── styles/         # 全局样式（app.css / theme.css）
│   ├── test/           # 测试辅助
│   ├── types/          # 前端类型定义
│   ├── utils/          # 工具函数
│   ├── App.tsx         # Provider + 路由聚合
│   └── index.tsx       # 入口
```

- **入口是 `index.tsx`**（不是 main.tsx）
- 无 `assets/`、`api/`、`routes/` 目录；API 走 `@/api-sdk`（桥接 `@cloudcad/api-sdk`），路由在 App.tsx 聚合
- 分层归属（ADR-0028）：L1 基础设施 = `constants/` `types/` `utils/` `lib/` `languages/` `config/` `api-sdk/` `styles/`；L2 核心业务 = `services/` `stores/` `contexts/` 根 `hooks/`；L3 业务编排 = `pages/` `components/`

## 关键命令

```bash
pnpm dev            # vite dev server
pnpm build          # vite build
pnpm test           # vitest run
pnpm type-check     # tsc --noEmit
pnpm lint           # eslint
pnpm format:check   # prettier --check
pnpm depcruise      # 依赖分层门禁自检（ADR-0028）
pnpm i18n:extract   # 提取翻译文本
pnpm i18n:compile   # 编译语言包
```

## 关键说明

- **状态管理（ADR-0030）**: server 状态用 react-query（queryKey 走 `lib/queryKeys.ts` 工厂），**禁止模块级可变变量**；Zustand 只放全局高频写/外部访问/persist 的 client 状态
- **API 调用（ADR-0034）**: 通过 `@cloudcad/api-sdk` 包（`src/api-sdk/index.ts` 桥接导出）生成的函数。**禁止裸 fetch 调用后端 API**（豁免清单见 `frontend-coding-standards/docs/api-contracts.md`）。勿手动编辑 `.gen.ts`，修后端 DTO 后执行根目录 `pnpm generate:api-types`
- **Z-index**: 全局浮层使用 `Z_LAYERS` 常量，无裸数字（局部层叠上下文小值豁免，须注释）
- **样式（ADR-0032）**: 颜色用变量 token（`--bg-*` `--text-*` `--primary-*` 等），组件复杂样式用 CSS Modules，Tailwind 仅布局，内联 style 仅动态值；禁止 JS 模板字符串 CSS、禁止新增 `--color-*` 变量
- **文件规模（ADR-0033）**: 源码文件 ≤400 行（硬门禁）/ 300 行（软目标）；页面目录化 `<Name>/index.tsx` + `hooks/` + `components/`
- **CAD 引擎**: `mxcadManager` 单例，`CADEditorDirect.tsx` 通过 visibility+z-index 保持 WebGL 上下文（详见 `cad-engine-integration` skill）
- **UI 组件复用**: **在使用或实现任何组件前（含原生 HTML 控件），必须先确认 `src/components/ui/` 是否已有全局组件**——直接写 `<input type="date">`、`<select>`、自绘下拉等等同于自己实现组件，必须优先复用 `DatePicker`、`Select` 等；不满足需求时扩展其 props 而非另写一套。新输入/展示需求先确认已有组件是否满足，样式风格必须与 `Input` 组件保持一致（padding/font-size/border-radius/背景色/焦点态）。**成熟组件（日历/选择器/弹层等）从 shadcn/ui 拉取再改造，禁止手写轮子**：`pnpm dlx shadcn@latest add <name>`（拒绝覆盖已有文件；Windows 下 CLI 崩溃时先手动 `pnpm add` 依赖）；拉取后必须逐项适配：z-index 换 `Z_LAYERS.*`、shadcn token 换项目 CSS 变量、全局样式依赖（如 react-day-picker 的 `style.css`）走 `src/styles/calendar.css` 的 rdp 变量覆盖、移除 tailwindcss-animate 类。完整清单见 `frontend-coding-standards` skill 第 3 节

## i18n (VoerkaI18n)

### 架构

- **独立模式** (`library: false`)：前端 i18nScope 完全独立
- **手动双向同步**：通过 `mxcadApp.i18nScope` API 与 mxcad-app 同步
  - mxcad-app → 前端：`CADEditorDirect.tsx` 监听 `mxcadApp.i18nScope.on("change", ...)` 调用 `i18nScope.change(language)`
  - 前端 → mxcad-app：`LanguageSwitcher.tsx` 调用 `mxcadApp.i18nScope.change(lang)`
- 非 CAD 页面（登录、注册等）无 mxcad-app 依赖

### 使用方式

```tsx
import { t } from '@/languages';
<Button>{t('登录')}</Button>;

// 大段文本用 Translate 组件
import { Translate } from '@/languages';
<Translate message="请输入用户名" />;

// 语言切换
import { useVoerkaI18n } from '@voerkai18n/react';
const { activeLanguage, languages, changeLanguage } = useVoerkaI18n(i18nScope);
```

### 变量插值（铁律）

```tsx
// ✅ 正确
t('剩余 {days} 天', { days: String(membership.daysRemaining) });

// ❌ 禁止 — 变量不会被翻译系统提取，多语言时 break
t('剩余 {days} 天').replace('{days}', String(membership.daysRemaining));
```

所有带变量的翻译文本必须通过 `t(msg, vars)` 的第二参数传入变量。禁止使用 `.replace()` 手动替换。

### 关键约束

- `@voerkai18n/vite` 插件必须在 `react()` 之前注册（vite.config.ts）
- `import "./languages"` 必须在 `VoerkaI18nProvider` 之前
- `library` 必须为 `false`（独立模式），**每次 `pnpm i18n:compile` 后需确认未被覆盖**
- **非源码提取的自定义翻译文本**（环境变量、数据库配置等）必须写入 `translates/messages/db-strings.json`，勿写入 `default.json`
  - `default.json` = `i18n:extract` 自动生成，手动编辑会被覆盖
  - `db-strings.json` = 手动维护，永不被覆盖

### 工作流

1. 源码中使用 `t("中文文本")` 包装需翻译的内容
2. `pnpm i18n:extract` — 扫描源码，自动将新文本加入 `translates/messages/default.json`（自动分配 `$id`，其他语言先占位为中文原文）
3. `pnpm i18nAutoTranslate`（百度）或 `pnpm i18nAutoTranslateAi`（qwen）— 自动翻译占位文本（需 API key；无 key 时可在 `default.json` 手填翻译，`extract` sync 模式会保留已翻译字段不覆盖）
4. `pnpm i18n:compile` — 编译为 TS 语言包

> **铁律**：`default.json` 由 `i18n:extract` 维护，新增文案**禁止手写进 default.json**——先写 `t('中文')` 源码再跑 extract；否则 extract 重跑时格式被规范化、`$id` 被重排、死键被清除。非源码提取文本（环境变量/DB 配置等）走 `db-strings.json`（手动维护，永不被覆盖）。
>
> **陷阱**：① `db-strings.json` 也占用 `$id` 空间，新增键注意避免跨文件重复 id（extract 遇重复 `$id` 会崩 `ReferenceError: logsets is not defined`，实为 @voerkai18n/cli 3.0.12 bug，重复本身才是根因）；② 变更后 `library` 必须仍为 `false`。

### 文件结构

```
src/languages/
├── index.ts          # VoerkaI18nScope + t 导出（compile 自动生成）
├── settings.json     # 语言列表（zh-CN/en-US/zh-TW/ko-KR）
├── component.tsx     # Translate 组件
├── messages/         # 编译生成的语言包（compile 自动生成）
│   ├── zh-CN.ts / en-US.ts / zh-TW.ts / ko-KR.ts
│   └── idMap.json
├── paragraphs/       # 段落翻译（compile 自动生成）
├── prompts/          # 提示词资源
├── formatters.json   # 格式化器配置
└── translates/       # 翻译源文件
    └── messages/
        ├── default.json   # 提取的翻译（i18n:extract 生成，勿手动编辑）
        └── db-strings.json # 自定义翻译（手动维护，永不被覆盖）
```

### 僵尸条目清理

- 删除组件或页面时，同步检查 `translates/messages/default.json` 中是否包含该组件的已提取文本（搜索文件名或组件名）
- 对不确定是否仍被引用的条目，执行 `pnpm i18n:extract` 后对比 Git diff，确认条目是否从 `default.json` 中消失
- `default.json` 条目包含 `$files` 字段标注来源文件，可直接定位引用。清理时保留 `$files` 字段为空的不确定条目，不做推测性删除
- **只清理已确认无引用的条目**，不做全量扫描清理
