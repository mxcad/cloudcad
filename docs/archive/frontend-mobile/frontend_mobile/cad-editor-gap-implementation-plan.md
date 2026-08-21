# CAD 编辑器 Gap 实现计划

> 基于 `cad-editor-feature-gap.md` 确定的 desktop 有 / mobile 无的功能，按优先级实现。

---

## 状态总览

| 优先级 | 功能 | 状态 | 工作量 |
|--------|------|------|--------|
| P0 | 保存格式选择 (另存为时选 DWG/DXF/PDF) | ✅ UI 已存在，Service 层硬编码 `mxweb` | 1h |
| P0 | DWG/DXF 版本选择 (导出时) | ✅ DwgOptionsPopup 已实现并接入 | 0h |
| **P1** | **外部参照上传进度追踪 + 状态显示** | **◐ 基础上传存在，缺进度条** | **2h** |
| **P1** | **重复文件检测 (秒传)** | **❌ 未实现** | **2h** |
| **P2** | **错误分类处理 (401/404/network)** | **❌ 未实现** | **2h** |
| **P2** | **图库/块库浏览** | ❌ 未实现 | 8h |
| **P3** | **IndexedDB 缓存 mxweb** | **❌ 未实现** | **3h** |
| **P3** | **乐观锁 (expectedTimestamp)** | **❌ 未实现** | **1h** |
| P3 | CAD 引擎空闲预加载 | ❌ 未实现 | 1h |
| — | 文件拖放打开 | 触屏设备不适用 | 0h |
| — | 主题亮/暗模式 | 纯前端，低优先 | — |

---

## Phase 1 — 错误分类与 API 拦截 (P2)

### 目标
实现结构化错误分类，区分 401/403/404/Network 错误，添加 401 自动刷新 token 机制。

### 文件

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/utils/errorHandler.ts` | **CREATE** | 错误分类工具函数 |
| `src/utils/apiConfig.ts` | **MODIFY** | 添加 401 拦截刷新 |

### `errorHandler.ts` 设计

```typescript
export function isNetworkError(error: unknown): boolean
export function isAuthError(error: unknown): boolean      // 401
export function isPermissionError(error: unknown): boolean // 403
export function isNotFoundError(error: unknown): boolean   // 404
export function isServerError(error: unknown): boolean     // 5xx
export function isAbortError(error: unknown): boolean
export function classifyApiError(error: unknown): { type: string; message: string; status?: number }
```

### `apiConfig.ts` 修改
- Error interceptor 增强：401 时自动刷新 token，403 时标记 `isPermissionError`

---

## Phase 2 — 外部参照上传进度追踪 (P1)

### 目标
在现有 `ExternalRefUploadPopup.vue` 中添加 per-file 进度条和总体进度。

### 文件

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/plugins/vant/components/popup/ExternalRefUploadPopup.vue` | **MODIFY** | 添加进度条 UI + 逐文件进度更新 |
| `src/plugins/vant/components/popup/types.ts` | ✅ 已有 `progress` 字段 | 无需修改 |

### 修改要点
- 每个文件上传时周期性更新 `info.progress` (0-100)
- 使用 `requestAnimationFrame` 驱动的 `van-progress` 显示进度
- 底部显示总体进度: `已完成 X/N`
- 上传失败的文件保留状态，支持重新上传

---

## Phase 3 — 重复文件检测/秒传 (P1)

### 目标
上传文件前检查服务端是否已存在，秒传并直接打开。

### 文件

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/services/checkService.ts` | **CREATE** | 秒传检测服务 |
| `src/pages/home/index.vue` | **MODIFY** | 集成秒传检测到 `handleOpenFile` |

### `checkService.ts` 设计
```typescript
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingNodeId: string | null;
}

export async function checkDuplicateFile(
  fileHash: string,
  filename: string,
  nodeId?: string
): Promise<DuplicateCheckResult>
```

### 集成到 `handleOpenFile`
1. 上传前调用 `checkDuplicateFile(hash, filename)`
2. 如果 `isDuplicate`，弹窗提示 3 个选择:
   - "打开已有文件" → 直接加载
   - "重新上传" → 强制上传覆盖
   - "取消"
3. 新增 `showDuplicateFileDialog()` 函数

---

## Phase 4 — 乐观锁 (P3)

### 目标
保存时携带 `expectedTimestamp` 防止并发覆盖。

### 文件

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/composables/useEditorState.ts` | **MODIFY** | 添加 `updatedAt` / `expectedTimestamp` |
| `src/composables/useFileLoader.ts` | **MODIFY** | 打开文件后存储 `updatedAt` |
| `src/services/saveService.ts` | **MODIFY** | 保存时携带 `expectedTimestamp` |
| `src/composables/useSave.ts` | **MODIFY** | 保存成功后更新 `expectedTimestamp` |

### 数据流
```
File open → store fileInfo.updatedAt as expectedTimestamp
    ↓
Save → append expectedTimestamp to FormData
    ↓
Save success → update expectedTimestamp from response.updatedAt
```

---

## Phase 5 — IndexedDB mxweb 缓存 (P3)

### 目标
打开 mxweb 文件时缓存到 IndexedDB，下次打开同一文件时优先使用缓存。

### 文件

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/services/mxwebCacheService.ts` | **CREATE** | IndexedDB 缓存管理 |
| `src/composables/useFileLoader.ts` | **MODIFY** | 集成缓存：检查 → 打开 → 回退到服务器 |

### 设计
```typescript
export async function getCachedMxwebUrl(cacheKey: string): Promise<string | null>
export async function setMxwebCache(cacheKey: string, data: ArrayBuffer): Promise<void>
export async function clearMxwebCache(cacheKey: string): Promise<void>
```

---

## 测试计划

| Phase | 验证方法 |
|-------|----------|
| 1 | 模拟 401/403/404/Network 错误，验证分类正确性 |
| 2 | 上传外部参照图片，验证进度条逐文件更新 |
| 3 | 上传已存在文件，验证秒传弹窗 + 直接打开 |
| 4 | 保存时抓包验证 `expectedTimestamp` 参数 |
| 5 | 打开文件后验证 IndexedDB 中有缓存数据 |
