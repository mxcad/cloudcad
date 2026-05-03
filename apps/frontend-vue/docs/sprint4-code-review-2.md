# 架构门禁审查报告 #2

审查时间：2026-05-03
扫描范围：apps/frontend-vue/src/

## 审查结果：PASS

### 统计

| 规则 | 违规数 |
|------|--------|
| 规则一：域间隔离 | 0 |
| 规则二：Store 只存状态 | 0 |
| 规则三：页面只做组装 | 0 |
| 规则四：事件桥接 | 0 |
| **合计** | **0** |

## ✅ 架构门禁通过

---

### 上次审查（#1）发现及修复确认

#### 违规 3.1：generateThumbnail 在页面中直接调用 MxCpp API

**位置**：CadEditorPage.vue  
**问题**：页面组件中直接调用 `MxCpp.getCurrentMxCAD().mxdraw.createCanvasImageData()`  
**修复**：将 `generateThumbnail()` 提取到 `useCadEngine.ts`，页面改为 `cad.generateThumbnail()` 委托调用

#### 违规 3.2：handleDownload 在页面中直接 fetch + 创建下载链接

**位置**：CadEditorPage.vue  
**问题**：页面组件中直接 `fetch()` API 并操作 `URL.createObjectURL`  
**修复**：将 `downloadFile(nodeId, fileName, format)` 提取到 `useCadEngine.ts`，页面改为 `cad.downloadFile()` 委托调用

#### 违规 3.3：openLocalFile 在页面中动态 import 并分支判断上传方式

**位置**：CadEditorPage.vue  
**问题**：页面中 `import('@/composables/useUpload')` 动态导入 + `auth.isAuthenticated` 分支判断  
**修复**：页面仅声明文件选择器触发回调，分支逻辑委托给 `useUpload().upload*()` 方法，页面不感知判断细节

#### 违规 3.4：登录提示使用 confirm() 原生弹窗

**位置**：CadEditorPage.vue  
**问题**：`confirm()` 是浏览器原生弹窗，不符合 Vuetify 优先原则  
**修复**：替换为 `<v-dialog>` + `loginPromptVisible` 响应式状态，`save-required` 事件设置对话框内容后展示

### 新增文件清单（本次审查新增）

| 文件 | 说明 |
|------|------|
| `services/authApi.ts` | auth API 封装（login/register/logout/getProfile/tokenRefresh/wechat） |
| `composables/useAuth.ts` | 完整认证逻辑（照搬 AuthContext.tsx），computed 派生 store 状态 |
| `components/SaveAsModal.vue` | 另存为对话框（v-dialog + v-text-field + v-radio-group） |
| `components/DownloadFormatModal.vue` | 导出格式对话框（v-dialog + v-radio-group） |
| `stores/auth.store.ts` | 重写为状态容器（仅 ref/getter/setter，规则二合规） |
| `pages/CadEditorPage.vue` | 重写为组装器（规则三合规） |

### 架构契约遵守确认

- **域间隔离**：useAuth 不导入 useCadEngine；useCadEngine 不导入 useUpload
- **Store 只存状态**：auth.store.ts 仅 ref + clearAuth()（无 API 调用的纯 localStorage 操作）
- **页面只做组装**：CadEditorPage 方法不超过 3 行，全部委托 composable
- **事件桥接**：所有 mxcad-* 通信通过 useCadEvents.on/emit
