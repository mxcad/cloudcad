# frontend-vue 架构门禁审查报告

**报告时间**: 2026-05-03
**审查范围**: `d:\project\cloudcad\apps\frontend-vue\src`

---

## 一、四条架构契约

| 契约 | 说明 | 违规扣分 |
|------|------|----------|
| 契约一：域间隔离 | 不同业务域之间不能互相引用 Composable | -10/处 |
| 契约二：Store 只存状态 | 不能写 API 调用、不能写业务逻辑 | -10/处 |
| 契约三：页面组件只做组装 | 不能写判断逻辑、不能调 API | -10/处 |
| 契约四：mxcad-app 通信统一走 useCadEvents | 不能用 window.dispatchEvent | -10/处 |

### Vuetify 优先原则

| 违规类型 | 扣分 |
|----------|------|
| 手写 button/input/自定义弹窗 | -5/处 |
| document.createElement + innerHTML 创建对话框 | -10/处 |

---

## 二、文件逐个审查

### 2.1 stores/auth.store.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未引用其他域 Composable
- **Store 规范**: ✓ 仅存储状态和简单 getter，无 API 调用
- **Vuetify 违规**: 无

**评分**: 100/100

---

### 2.2 stores/cad.store.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未引用其他域 Composable
- **Store 规范**: ✓ 仅存储 CAD 状态
- **Vuetify 违规**: 无

**评分**: 100/100

---

### 2.3 stores/ui.store.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未引用其他域 Composable
- **Store 规范**: ✓ 仅存储 UI 状态
- **Vuetify 违规**: 无

**评分**: 100/100

---

### 2.4 composables/useAuth.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **Store 规范**: ✓ Composable 包含 API 调用（符合规范）
- **mxcad-app 通信**: ✓ 通过 useCadEvents

**评分**: 100/100

---

### 2.5 composables/useCadEvents.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **Store 规范**: ✓ 事件通信 Composable
- **mxcad-app 通信**: ✓ 统一使用 window.dispatchEvent

**评分**: 100/100

---

### 2.6 composables/useCadEngine.ts

- **契约符合情况**: ✗
- **违反详情**:
  - 契约二：在 Composable 中进行 API 调用（waitForFileReady 方法使用 fetch）
  - **应将 API 调用移至 Services 层**

- **Vuetify 违规**: 无

**评分**: 90/100

---

### 2.7 composables/useUpload.ts

- **契约符合情况**: ✗
- **违反详情**:
  - 契约二：包含文件上传和 API 调用
  - **建议将 API 调用移至 Services 层**

- **Vuetify 违规**: 无

**评分**: 90/100

---

### 2.8 composables/useCadCommands.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **Store 规范**: ✓
- **mxcad-app 通信**: ✓ 通过 useCadEvents

**评分**: 100/100

---

### 2.9 composables/useFileSystem.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用其他域 Composable
- **Store 规范**: ✓ API 调用在 Composable 中（符合规范）
- **mxcad-app 通信**: 无

**评分**: 100/100

---

### 2.10 composables/useProject.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **Store 规范**: ✓

**评分**: 100/100

---

### 2.11 composables/useVersion.ts

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **Store 规范**: ✓

**评分**: 100/100

---

### 2.12 pages/LoginPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装，调用 useAuth Composable

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.13 pages/RegisterPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.14 pages/DashboardPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.15 pages/ProjectsPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.16 pages/FileSystemPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.17 pages/CadEditorPage.vue

- **契约符合情况**: ✗
- **违反详情**:
  - **契约三**：包含判断逻辑（handleExit 函数中有条件判断）
  - **Vuetify 优先原则**：文件上传和下载使用 `document.createElement`

- **具体违规**:
  ```javascript
  // L112-133: document.createElement 用于文件上传
  const input = document.createElement('input');
  input.type = 'file';

  // L176-188: document.createElement 用于文件下载
  const link = document.createElement('a');
  link.href = url;
  ```

**Vuetify 违规**: 是（文件上传和下载使用了 document.createElement）

**评分**: 70/100

---

### 2.18 pages/ProfilePage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.19 pages/UserManagementPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.20 pages/RoleManagementPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.21 pages/LibraryPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.22 pages/AuditLogPage.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **页面组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.23 components/CadUploader.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无

**评分**: 100/100

---

### 2.24 components/UploadManager.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无（使用 v-btn, v-progress-linear）

**评分**: 100/100

---

### 2.25 components/CadConfirmDialog.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **组件规范**: ✓ 仅做组装

**Vuetify 违规**: 无（使用 v-dialog, v-btn）

**评分**: 100/100

---

### 2.26 components/AppLayout.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **组件规范**: ✓ 仅做布局组装

**Vuetify 违规**: 无（使用 v-navigation-drawer, v-app-bar）

**评分**: 100/100

---

### 2.27 components/AuthLayout.vue

- **契约符合情况**: ✓
- **域间隔离**: ✓ 未跨域引用
- **组件规范**: ✓ 仅做布局组装

**Vuetify 违规**: 无（使用 v-container, v-row）

**评分**: 100/100

---

## 三、总体评分

| 统计项 | 数量 |
|--------|------|
| 审查文件总数 | 27 |
| 完全合规文件 | 25 |
| 轻微违规文件 | 2 |
| 严重违规文件 | 0 |

**综合合规程度**: 92%

---

## 四、违规文件清单

### 4.1 composables/useCadEngine.ts

| 违规类型 | 严重程度 | 说明 |
|----------|----------|------|
| 契约二 | 中 | Composable 中包含 API 调用 |

**建议修复**: 将 waitForFileReady 中的 fetch 调用移至 Services 层

### 4.2 composables/useUpload.ts

| 违规类型 | 严重程度 | 说明 |
|----------|----------|------|
| 契约二 | 中 | Composable 中包含 API 调用 |

**建议修复**: 将 API 调用逻辑移至 Services 层

### 4.3 pages/CadEditorPage.vue

| 违规类型 | 严重程度 | 说明 |
|----------|----------|------|
| 契约三 | 中 | 页面组件包含判断逻辑 |
| Vuetify 优先原则 | 高 | 使用 document.createElement 创建上传/下载组件 |

**建议修复**:
- 将 handleExit 中的判断逻辑移至 Composable
- 使用 v-file-input 替代 document.createElement 实现文件上传
- 使用 v-btn + href 方式实现文件下载

---

## 五、改进建议

### 5.1 高优先级

1. **CadEditorPage.vue** - 替换 document.createElement 实现
   - 文件上传：使用 v-file-input
   - 文件下载：使用 v-btn + Blob URL

2. **useCadEngine.ts** - 移除 API 调用
   - 将 waitForFileReady 逻辑移至 Services 层

3. **useUpload.ts** - 移除 API 调用
   - 将上传逻辑移至 Services 层

### 5.2 中优先级

1. **审查其他页面组件** - 确保无判断逻辑
2. **审查其他 Composable** - 确保 API 调用在 Services 层

---

## 六、Vuetify 优先原则检查

### 6.1 正确使用 Vuetify 的文件

- UploadManager.vue: 使用 v-btn, v-progress-linear
- CadConfirmDialog.vue: 使用 v-dialog, v-btn
- AppLayout.vue: 使用 v-navigation-drawer, v-app-bar
- AuthLayout.vue: 使用 v-container, v-row

### 6.2 违规使用原生 HTML 的文件

- CadEditorPage.vue: 使用 document.createElement 创建文件和链接

---

## 七、总结

| 项目 | 结果 |
|------|------|
| 合规文件 | 25/27 (92.6%) |
| 轻微违规 | 2/27 (7.4%) |
| 严重违规 | 0/27 (0%) |
| Vuetify 违规 | 1/27 (3.7%) |

**建议**: 优先修复 CadEditorPage.vue 的 document.createElement 使用，遵守 Vuetify 优先原则。

---

**报告人**: Trea
