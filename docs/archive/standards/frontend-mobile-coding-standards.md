---
name: frontend-mobile-coding-standards
description: 移动端编码规范 — Vue 3 + Vite 4 + vant + VoerkaI18n 移动 H5 版本的编码规范。触发条件：编写 Vue 组件、样式、API 调用、或任何 packages/frontend_mobile 下的代码变更。自动引用 project-coding-standards 的公共规范。
---

<what-to-do>

处理移动端代码时，必须遵守以下移动端特有规范。同时自动遵守 `project-coding-standards` 的全部公共规则。

**核心原则**：对照 PC 端（frontend）的功能实现，保持功能对齐但适配移动端交互。移动端仅实现 CAD 编辑器功能，不包含计费/支付/会员/订单/退款等业务功能。

</what-to-do>

<supporting-info>

## 触发场景与按需加载

| 场景 | 必须检查的文档 |
|------|-------------|
| Vue 组件 / 页面编写 | `docs/vue-patterns.md` |
| 协同功能开发 | `docs/collaboration.md` |
| CAD 引擎交互 | `docs/mxcad-integration.md` |
| i18n 国际化 | `docs/i18n.md` |
| 移动端适配 | `docs/mobile-adaptation.md` |
| 弹窗开发 | `docs/popup-patterns.md` |
| 提交前检查 | `docs/verify.md` |

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 | 3.x | UI 框架 |
| Vite | 4.x | 构建工具 |
| TypeScript | 4.9 | 类型系统 |
| vant | 4.x | 移动端组件库 |
| VoerkaI18n | — | 国际化 |
| postcss-pxtorem | — | px → rem 适配 |
| lib-flexible | — | 移动端适配 |

## 目录约定

| 内容 | 位置 |
|------|------|
| 页面 | `src/pages/<name>/index.vue` |
| 页面组件 | `src/pages/<name>/components/` |
| 全局组件 | `src/components/` |
| Composables | `src/composables/` |
| Services | `src/services/` |
| Stores | `src/stores/` |
| Utils | `src/utils/` |
| Types | `src/types/` |
| 配置 | `src/config/` |
| 样式 | `src/styles/` |
| i18n | `src/languages/` |
| CAD 命令 | `src/command/` |

## 核心文件速查

| 文件 | 作用 |
|------|------|
| `src/composables/useCooperate.ts` | 协同 SDK 封装（V3 work data、CRUD、participants） |
| `src/composables/useEditorState.ts` | 协同状态管理 |
| `src/composables/useSave.ts` | 保存功能 |
| `src/composables/useFileLoader.ts` | 文件加载 |
| `src/composables/useCollabAutoJoin.ts` | 协同自动加入 |
| `src/pages/home/index.vue` | CAD 编辑器主页 |
| `src/pages/home/components/CooperatePopup.vue` | 协同弹窗 |
| `src/components/CollabShareModal.vue` | 协同分享弹窗 |
| `src/utils/apiConfig.ts` | API 客户端配置 |
| `src/config/serverConfig.ts` | CAD 引擎配置 |

## 与 PC 端的关键差异

| 维度 | PC (frontend) | 移动端 (frontend_mobile) |
|------|--------------|------------------------|
| UI 框架 | React 19 + Radix UI | Vue 3 + vant |
| 状态管理 | Zustand | Vue reactive + module-level ref |
| 构建工具 | Vite 5 | Vite 4 |
| TypeScript | 5.x | 4.9 |
| i18n | VoerkaI18n | VoerkaI18n（同） |
| 计费功能 | ✅ 有 | ❌ 无 |
| 适配方式 | 响应式 | px→rem + lib-flexible |

## 状态管理（与 PC 不同）

PC 使用 Zustand store，移动端使用 Vue reactive：

```typescript
// ✅ 正确 — module-level ref（跨组件实例共享）
import { ref } from 'vue';

const works = ref<Work[]>([]);
const currentWorkId = ref<number>(0);

export function useCooperate() {
  return {
    works,
    currentWorkId,
    // ...
  };
}
```

```typescript
// ❌ 错误 — 使用 Zustand（这是 PC 的做法）
import { create } from 'zustand';
```

## 弹窗模式

所有弹窗继承 `FloatingPopup` 组件：

```vue
<template>
  <FloatingPopup v-model:show="innerShow" title="标题">
    <!-- 内容 -->
    <template #footer>
      <van-button block round size="large" type="primary">
        主要操作
      </van-button>
    </template>
  </FloatingPopup>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [val: boolean] }>();
const innerShow = ref(props.show);

watch(() => props.show, (val) => { innerShow.value = val; });
watch(innerShow, (val) => { emit('update:show', val); });

function handleClose() {
  innerShow.value = false;
}
</script>
```

**规则**：
- 底部主操作按钮必须放在 `<template #footer>` slot 中
- 使用 `block round size="large"` 样式
- `handleClose()` 设置 `innerShow.value = false`
- 必须 emit `update:show` 以更新 parent ref

## CSS 变量约定

```css
/* ✅ 正确 — 使用全局 CSS 变量 */
color: var(--text-primary);
background: var(--bg-elevated);
border: 1px solid var(--border-color);
font-size: var(--font-size-body);
padding: var(--space-md) var(--space-lg);

/* ❌ 错误 — 硬编码色值 */
color: #333;
background: white;
```

## i18n 工作流

```bash
# 1. 提取新的中文文本
pnpm i18n:extract

# 2. 翻译（自动或手动）
pnpm i18nAutoTranslate

# 3. 编译
pnpm i18n:compile
```

**规则**：
- 所有中文 UI 文本必须用 `t()` 函数包裹
- 提取后编译，编译后才能生效

## 移动端适配

```css
/* 使用 rem 单位（postcss-pxtorem 自动转换） */
width: 375px;    /* 自动转为 rem */
height: 44px;
font-size: 16px;

/* 但 CSS 变量中的 px 不会被转换 */
padding: var(--space-md);  /* 变量值已在 CSS 中定义为 rem */
```

## 移动端协同 SDK 行为

```
createWrok() → 创建 session → 自动加入（无需调 joinWork）
joinWork()   → 连接已有 session → SDK 自动加载文件
exitWrok()   → 断开连接 → 回退本地编辑
getWorks()   → 获取活跃 work 列表
init()       → 只需调用一次（模块级守卫）
```

**并发控制**：
- `joiningLockRef`：阻止并发 joinWork
- `exitGuardRef`：退出后 3s 冷却期，防止 auto-join 干扰

## 移动端 API 认证

```typescript
// src/utils/apiConfig.ts
// setupApiClient() 配置 auth interceptor
// 从 localStorage.getItem('accessToken') 读取 token
// 注入 Authorization: Bearer header
```

## 反模式清单

| ❌ 反模式 | ✅ 正确做法 |
|----------|------------|
| 使用 Zustand 管理状态 | 使用 Vue reactive + module-level ref |
| 弹窗不用 FloatingPopup | 继承 FloatingPopup 组件 |
| 底部按钮不用 footer slot | 放在 `<template #footer>` 中 |
| 硬编码色值 | 使用 CSS 变量 |
| 不处理 i18n | 所有中文用 `t()` 包裹 |
| 直接调用 SDK `joinWork` | 使用 `useCooperate` 封装 |
| 模块变量存储业务状态 | 使用 Vue reactive ref |
| 忽略移动端适配 | 使用 rem 单位 + CSS 变量 |

## 测试与验证

```bash
cd packages/frontend_mobile
pnpm type-check    # vue-tsc --noEmit
pnpm build         # vite build
```

## 文档引用

- 公共编码规范：`project-coding-standards`
- PC 前端规范：`frontend-coding-standards`
- 领域术语：`CONTEXT.md`
- 移动端协同详细实现：`AGENTS.md` → 移动端协同章节
- PC 协同实现对照：`AGENTS.md` → 协同 SDK 章节

</supporting-info>
