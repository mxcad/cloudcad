# 模块入口（Façade/barrel）规则

对应 ADR-0029。**有内部结构就有入口**：目录含多个实现文件或子目录时，必须有 `index.ts` 统一重导出，作为模块唯一入口。

## 模块与入口

| 模块形态 | 示例 | 需要入口？ |
|---|---|---|
| 多文件 + 子目录 | `services/mxcadManager/`（12 子模块 + cmd/） | ✅ 必须 `index.ts` |
| 多文件平铺 | `hooks/file-system/`（9 个 hook） | ✅ 必须 `index.ts` |
| 单文件 | `stores/useCADEditorStore.ts` | ❌ 不需要 |

## 导入规则

- 外部消费者只能从目录入口导入：`import { mxcadManager } from '@/services/mxcadManager'`
- ❌ 禁止深路径导入：`import { mxcadManager } from '@/services/mxcadManager/mxcadManagerCore'`
- 模块内部（同目录子树）可直连子文件。

## hook 归属

| 位置 | 归属 | 消费范围 |
|---|---|---|
| `hooks/` 根 | 全局共享（L2 业务层） | 任意页面/组件 |
| `pages/X/hooks/` | 页面私有 | 仅 X 页面及其子组件 |
| `components/X/hooks/` | 组件私有 | 仅 X 组件及其子树 |

- 被 ≥2 个独立页面/组件消费 → 提升 `hooks/` 根
- 单点消费 → 留本地
- ❌ 禁止跨目录导入私有 hook（`pages/A/hooks/x` ← `pages/B` 不允许）

## 同名 hook

- **同名同义**（近重复）→ 合并为一个共享 hook，差异参数化。参考：两个 `useVersionHistory` → 合并提升 `hooks/useVersionHistory.ts`，权限检查做可选参数。
- **同名不同义** → 改名，用职责/动词语义区分。参考：sidebar 版 `useFileSystemNavigation`（打开图纸/库图）→ `useDrawingOpener`。

## 反模式

| ❌ | ✅ |
|----|-----|
| 深路径导入已有入口的模块子文件 | 从目录入口导入 |
| 页面/组件目录里重复实现共享逻辑 | 提升 `hooks/` 根 |
| 建了 barrel 但无人经其导入（孤儿 barrel，如 `pages/Profile/index.ts`） | 删除 barrel 或接入消费者 |
| 两个同名 hook 语义不同仍同名 | 改名区分 |
