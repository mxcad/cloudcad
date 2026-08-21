# 页面结构与组件尺寸（ADR-0033）

## 单文件行数上限（ADR-0033）

源码文件（.ts/.tsx）**≤ 400 行（硬门禁），软目标 300 行**。超过 400 行必须拆分。

### 豁免（不计入行数门禁）

- CSS 样式文件（按区块拆分准则，见下）
- 生成物：`*.gen.ts`、i18n 语言字典、MSW handlers
- 纯声明：常量/类型文件（types.ts / constants.ts）
- 测试文件（豁免计数，不豁免结构规范）
- 纯 re-export barrel（只做 re-export）
- 全局主题 token / base（`theme.css`、`app.css`）

## 拆分模式契约（三类）

### 1. 页面/巨型组件 → 目录化拆分

`index.tsx` 只做组装（状态接线 + 渲染子组件）；视觉区域按职责切成子组件；局部类型提到 `types.ts`；私有 hooks 放 `hooks/`；样式文件与组件一一对应。

```
src/pages/<PageName>/
  index.tsx          ← 入口，组装，export default PageName
  PageNameContent.tsx ← 子组件（按视觉区域切）
  hooks/             ← 页面专用 hooks
  components/        ← 页面专用子组件
  types.ts           ← 页面专用类型
```

样板参考：`FileSystemManager/` 既有形态（index 组装 + `FileSystemContent`/`FileSystemHeader`/`FileSystemStates` + `hooks/`）。

### 2. 巨型 hook → 组合式再拆

按职责拆成 2+ 个独立子 hook（如导入 hook 拆解析/上传/校验/进度），外层 hook 只做组装与状态接线；跨 hook 共享的运行时依赖（mxcadManager 单例、上传服务等）由外层传入或走既有单例，**不引入新抽象**（ADR-0031）。

### 3. 入口文件

- 纯 re-export barrel 豁免
- 组装入口（index.tsx 类）**不豁免**——组装逻辑过多说明抽得不够

### 不设拆分产物下限

以单一职责为准，不追求进一步细分。

## 页面文件结构

一个页面是单文件还是目录，取决于是否包含独立 hooks/子组件。

### 单文件页面

组件代码 < 300 行，且没有独立 hooks 或子组件时使用单文件：

```
src/pages/Dashboard.tsx
```

### 目录页面

组件代码 ≥ 300 行，或者有独立 hooks/子组件/样式文件时，拆为目录（见上）。

转换条件：**当页面文件超过 300 行或需要提取第一个 hook 时，拆成目录。**

### 反模式

| ❌ | ✅ |
|----|-----|
| `AuditLogPage.tsx` 在目录外，目录里只有 `hooks/` | 主组件放在目录内 `index.tsx` |
| 目录页面没有 `index.tsx`，导入路径为 `pages/Foo/Foo.tsx` | 导入路径应为 `pages/Foo` |
| 新增 400+ 行源码文件 | 先按目录骨架（index + 子组件 + hooks/）搭建 |

## CSS 归属（ADR-0033/0032）

- **新增一律禁止普通 `.css`**（页面级样式用 `.module.css`）
- 巨型 CSS Modules（`sidebar.module.css` 1641 行等）行数豁免，但按「组件区块对应」拆分——与组件文件一一对应，按子区块拆 2+ 个 `.module.css`
- 存量页面级普通 CSS（`Profile.css` 等）随对应页面拆分一并转 `.module.css`（不单独排队）
- `theme.css` / `app.css`：全局 token/base 唯一事实源，豁免不拆

## 巨型文件清单（存量，尾部执行队列）

`FileSystemManager/index.tsx` 1549、`Register.tsx` 1128、`FontLibrary.tsx` 1100、`LibraryManager.tsx` 1056、`Profile.tsx` 1197、`FileItem.tsx` 1020、`ProjectDrawingsPanelMain.tsx` 1061、`SystemMonitorPage.tsx` 894、`ResourceList.tsx` 861、`MembersModal.tsx` 836、`ForgotPassword.tsx` 813、`Layout.tsx` 796 等——试点样板（FileIcons.tsx / useDirectoryImport.ts）拆分完成后逐个治理（ticket 194 试点）。

## 组件尺寸上限

单个组件文件不超过 **300 行**（软目标）。超过时提取子组件或业务逻辑到独立文件：

```text
SearchFilters.tsx (637行)
  →
  SearchFilters/
    index.tsx              ← 主组件，~200 行（只做编排）
    SearchFilterPanel.tsx  ← 面板 UI，~200 行
    SearchFilterChips.tsx  ← chip 标签，~100 行
    hooks/
      useSearchFilters.ts  ← 筛选状态逻辑，~150 行
```

## ADR 参考

- ADR-0033 前端巨型文件拆分契约：`docs/adr/0033-frontend-file-splitting-contract.md`
- ADR-0032 前端样式统一规范（CSS 归属、模板字符串 CSS 判死）
- ADR-0029 模块入口（模块私有文件随模块入口走）
