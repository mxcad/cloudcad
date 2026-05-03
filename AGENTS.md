# CloudCAD 冲刺四 AI 执行上下文

**当前冲刺：冲刺四（React → Vue 3 迁移）**
**分支：refactor/circular-deps**
**项目定位：在线 CAD 协同平台，后端 NestJS，前端从 React 迁到 Vue 3 + Vuetify 3**

---

## 你现在要做什么

你正在参与冲刺四：**把 CloudCAD 前端从 React 迁移到 Vue 3 + Vuetify 3 + voerka-i18n**。你的任务可能是编写新的 Composable、迁移页面组件、实现认证流程、或者审查其他 AI 提交的代码质量。

**三条铁律：**
1. **业务逻辑完全照搬 React 版** —— React 版是经过反复调优、逻辑完全正确的版本。你不可以添加新的业务逻辑，不可以修改判断分支，不可以省略任何错误处理。
2. **代码组织必须重构** —— 把React 里散落在组件、Hooks、Context 各处的逻辑，收敛到 Composable、Pinia Store、独立组件中。逻辑照搬，封装重构。
3. **严格遵守统一规范** —— 这份文档里写的每一条规定，你都必须遵守。违反任何一条，交付物直接打回。

---

## 技术栈（Vue 3 前端）

| 技术 | 用途 |
|------|------|
| Vue 3.5+ | 前端框架 |
| Vuetify 3.x | UI 组件库（Vuetify 优先原则） |
| Pinia 2.x | 状态管理 |
| Vue Router 4.x | 路由 |
| voerka-i18n | 国际化（CloudCAD 是分库，mxcad-app 内部是主库）|
| vee-validate + zod | 表单验证 |
| Axios | HTTP 客户端 |
| @uppy/core + @uppy/tus | 文件上传 |
| SparkMD5 | 文件哈希 |
| mxcad-app | CAD 核心库 |

**重要：mxcad-app 已通过 Vite 插件暴露 `vue`, `vuetify`, `pinia`, `axios`, `vuetify/components`。在代码里正常 import 即可，插件会自动替换为 mxcad-app 内部版本。**

---

## 架构规则

### 规则一：域间隔离

不同业务域之间不能互相引用 Composable。跨域通信只能在页面组件层完成，或者通过 `useCadEvents` 事件桥。

不能做的事情：`useCadEngine.ts` 里引用 `useFileTree`、上传模块里引用版本管理模块、编辑器里引用项目管理 Store。

### 规则二：Store 只存状态

Store 只能有字段初始化和简单 getter，不能写 API 调用、不能写业务逻辑、不能引用其他 Store 做跨域操作。

### 规则三：页面组件只做组装

页面组件只负责：引入 Composable 拿方法 → 把数据传给子组件 → 渲染。页面里不能写判断逻辑、不能调 API、不能做权限判断。

### 规则四：mxcad-app 通信统一走 useCadEvents

不能在组件或 Composable 里直接用 `window.dispatchEvent` 或 `window.addEventListener`。所有跟 mxcad-app 的通信都通过 `useCadEvents` 这个统一接口。

---

## Vuetify 优先原则

- 禁止手写 `<button>`、`<input>`、自定义弹窗的 div+CSS
- 禁止用 `document.createElement` + `innerHTML` 创建对话框
- 必须用 `<v-btn>`、`<v-text-field>`、`<v-dialog>`、`<v-progress-linear>`、`<v-snackbar>`、`<v-navigation-drawer>` 等 Vuetify 内置组件
- 一个原则：如果 Vuetify 已有这个组件，就不要自己写

---

## 编码流程

### 第一步：找 React 源代码

打开 `apps/frontend/src/` 目录，找到和你要实现的功能对应的 React 文件。比如你要做登录页，就打开 `apps/frontend/src/pages/Login.tsx`；要做认证逻辑，就打开 `apps/frontend/src/contexts/AuthContext.tsx`。

### 第二步：逐段对照着写

对着 React 源码写 Vue 3 代码。每写一段，确认一个源头。在代码注释里标注这段逻辑来自 React 版的哪个文件、哪一行。

### 第三步：自检

写完一个文件后，对着 React 源文件逐行检查：
- 表单字段名、初始值、校验规则是否一致？
- 每个 if/else 分支是否都搬过来了？
- API 调用顺序和参数是否一致？
- 错误处理分支是否都搬过来了？

### 第四步：跑架构门禁审查

自检完成后，自己对自己说一句"执行架构门禁审查"，逐条核对：
- 有没有跨域引用？
- Store 里有没有写业务逻辑？
- 页面组件里有没有写判断逻辑？
- 有没有绕过 useCadEvents 直接调 CustomEvent？

---

## 禁止事项

- 不要自己发明业务逻辑——React 版没有的，你不能加
- 不要省略任何逻辑——React 版有的 if 分支，你必须搬到 Vue 里
- 不要留下占位符或 TODO——每个功能必须完整实现
- 不要在 Store 里写 API 调用或业务逻辑
- 不要在页面组件里写业务逻辑
- 不要绕过 useCadEvents 直接调 window.dispatchEvent

---

## 关键参考文件

| 文件 | 用途 |
|------|------|
| `apps/frontend/src/pages/Login.tsx` | 登录业务逻辑参考 |
| `apps/frontend/src/pages/Register.tsx` | 注册业务逻辑参考 |
| `apps/frontend/src/pages/CADEditorDirect.tsx` | CAD 编辑器逻辑参考 |
| `apps/frontend/src/contexts/AuthContext.tsx` | 认证逻辑参考 |
| `apps/frontend/src/contexts/ThemeContext.tsx` | 主题逻辑参考 |
| `apps/frontend/src/services/mxcadManager.ts` | 文件打开/保存/上传逻辑参考 |
| `apps/frontend/src/stores/uiStore.ts` | 进度条/弹窗/Toast 状态参考 |
| `apps/frontend-vue/src/` | 你的编码目标目录 |

---

## 文件结构

```
apps/frontend-vue/src/
├── main.ts          # 应用入口
├── App.vue          # 根组件
├── router/          # 路由配置
├── stores/          # Pinia Store（auth, cad, ui, theme）
├── composables/     # Composable（useAuth, useCadEngine, useUpload, 等）
├── layouts/         # AppLayout, AuthLayout
├── pages/           # 16 个页面组件
├── components/      # UploadManager, ErrorFallback
├── services/        # API 服务层（从 React 版直接复用）
├── utils/           # 工具函数（从 React 版直接复用）
├── constants/       # 常量（从 React 版直接复用）
└── types/           # 类型（从 React 版直接复用）
```

---

## Git 版本控制规则

每个独立任务完成后，必须将本次任务的所有修改作为一个独立的 git commit 提交，提交信息清晰描述任务内容。架构师在派发任务时，会确保并发任务不修改同一个文件。如果发现同一个文件被多个任务需要修改，任务会排队执行而不是并发。禁止一个任务跨多个不相关的修改混在一个提交里。

## 汇报要求

完成任务后统一汇报：
- 修改了哪些文件
- 每条逻辑来自 React 版的哪个文件
- 编译是否通过
- 最后一行写上：`汇报人：[你的 AI 名称]`

---

*这是给你看的执行文档，不是项目历史记录。遵守上面写的每一条，交付物就不会被打回。完成你的任务后，等待架构师验收。*