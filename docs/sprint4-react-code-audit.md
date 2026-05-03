
# React 版本上传和文件打开功能代码审计报告

## 1. 未登录用户在编辑器中的上传功能

### 1.1 是否支持上传
**是**，未登录用户可以在编辑器中上传文件。

**相关代码位置：**
- `apps/frontend/src/services/mxcadManager.ts:1446-1556` - `handlePublicUpload` 函数
- `apps/frontend/src/services/mxcadManager.ts:1688-1697` - 登录状态判断

### 1.2 上传文件存储位置
未登录用户上传的文件存储在公共文件服务中，通过文件哈希值（hash）访问。

**相关代码位置：**
- `apps/frontend/src/services/publicFileApi.ts` - 公共文件 API（未显示完整代码，但通过引用可知）
- `apps/frontend/src/services/mxcadManager.ts:1503` - `publicFileApi.getFileAccessUrl(hash)`

**访问 URL 模式：**
```
/api/public-file/access/{hash}/{filename}
```

### 1.3 文件是否打开
**是**，上传完成后会自动打开。

**流程：**
1. 如果是真正上传（非秒传），先隐藏加载动画，发送 `public-file-uploaded` 事件
2. 如果是秒传，直接打开文件

**相关代码位置：**
- `apps/frontend/src/services/mxcadManager.ts:1489-1551` - 上传完成后的处理

---

## 2. 上传弹窗的触发条件

### 2.1 点击按钮触发
有两种方式：
1. 通过 `openFile` 命令触发文件选择器
2. 通过上传组件的按钮点击

**相关代码位置：**
- `apps/frontend/src/components/MxCadUploader.tsx:100-110` - 检查登录状态后打开文件选择器
- `apps/frontend/src/components/MxCadUppyUploader.tsx:100-110` - 同样的逻辑
- `apps/frontend/src/services/mxcadManager.ts:1657-1718` - `openFile` 命令注册和文件选择器调用

### 2.2 拖拽上传
**没有明确看到拖拽上传的实现**，在阅读的代码中主要是点击按钮选择文件。

### 2.3 命令触发
通过 MxCAD 命令系统触发：
- `openFile` 命令
- `openFile_noCache` 命令（无缓存模式）

**相关代码位置：**
- `apps/frontend/src/services/mxcadManager.ts:1724-1726` - 命令注册

---

## 3. 上传完成后的转换、打开流程

### 3.1 mxcadManager.ts 中处理流程的关键函数

#### 已登录用户流程
1. **`handleFileSelection`** (`apps/frontend/src/services/mxcadManager.ts:1564-1654`) - 主入口
2. **`uploadAndProcessFile`** (`apps/frontend/src/services/mxcadManager.ts:1049-1068`) - 上传处理
3. **`waitForFileReady`** (`apps/frontend/src/services/mxcadManager.ts:1077-1106`) - 等待文件转换完成
4. **`openUploadedFile`** (`apps/frontend/src/services/mxcadManager.ts:1113-1150`) - 打开已上传文件

#### 未登录用户流程
1. **`handlePublicUpload`** (`apps/frontend/src/services/mxcadManager.ts:1445-1556`) - 公共上传处理
2. **`publicFileApi.checkFile`** - 检查是否秒传
3. **`publicFileApi.uploadFile`** - 上传文件
4. **`publicFileApi.getFileAccessUrl`** - 获取文件访问 URL
5. **`mxcadManager.openFile`** - 打开文件

### 3.2 详细流程步骤

#### 已登录用户完整流程：
```
用户选择文件
    ↓
计算文件哈希 (calculateFileHash)
    ↓
检查目录中是否存在重复文件 (mxcadApi.checkDuplicateFile)
    ↓
(如果重复) 显示确认对话框
    ↓
上传文件 (uploadMxCadFile)
    ↓
调用 openUploadedFile
    ↓
等待文件转换完成 (waitForFileReady - 轮询)
    ↓
设置当前文件信息 (setCurrentFileInfo)
    ↓
构建 mxweb 文件 URL
    ↓
调用 mxcadManager.openFile 打开文件
    ↓
派发文件打开事件 (mxcad-file-opened)
    ↓
检查外部参照并上传 (externalReferenceUpload.checkMissingReferences)
```

#### 未登录用户完整流程：
```
用户选择文件
    ↓
计算文件哈希 (calculateFileHash)
    ↓
检查是否秒传 (publicFileApi.checkFile)
    ↓
(非秒传) 上传文件 (publicFileApi.uploadFile)
    ↓
(真正上传) 隐藏加载动画，发送 public-file-uploaded 事件
    ↓
(用户完成外部参照操作) 打开文件
    ↓
或 (秒传) 直接打开文件
    ↓
设置当前文件信息 (setCurrentFileInfo)
    ↓
调用 mxcadManager.openFile 打开文件
    ↓
显示成功提示
```

---

## 4. 进度条在各阶段的消息

### 4.1 默认消息定义
**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:64-69`

```javascript
const DEFAULT_MESSAGES = {
  LOADING: '正在加载...',
  CALCULATING_HASH: '正在计算文件哈希...',
  UPLOADING: '正在上传',
  OPENING_FILE: '正在打开文件...',
};
```

### 4.2 各阶段消息

#### 1. 计算哈希阶段
- **消息：** `正在计算文件哈希...`
- **设置位置：** `apps/frontend/src/services/mxcadManager.ts:1052`
- **调用：** `setLoadingMessage(DEFAULT_MESSAGES.CALCULATING_HASH)`

#### 2. 上传阶段
- **消息：** `正在上传 {percentage}%`
- **设置位置：** `apps/frontend/src/services/mxcadManager.ts:1056-1064`
- **调用：** 上传进度回调中更新消息

#### 3. 文件转换阶段
- **消息：** `文件转换中，请稍候... ({attempt}/{maxAttempts})`
- **设置位置：** `apps/frontend/src/services/mxcadManager.ts:1101-1102`
- **轮询：** 每 2 秒检查一次文件转换状态，最多 30 次

#### 4. 打开文件阶段
- **消息：** `正在打开文件...`
- **设置位置：** `apps/frontend/src/services/mxcadManager.ts:1118`

#### 5. 公开上传阶段
- **计算哈希：** `正在计算文件哈希...` (`apps/frontend/src/services/mxcadManager.ts:1447`)
- **上传中：** `正在上传文件... {percentage}%` (`apps/frontend/src/services/mxcadManager.ts:1459,1479`)
- **打开文件：** `正在打开文件...` (`apps/frontend/src/services/mxcadManager.ts:1502,1532`)

---

## 5. 保存/另存为/导出按钮在登录和未登录状态下的行为

### 5.1 保存功能 (Mx_Save)

#### 登录状态
1. 如果没有打开的文件，弹出保存弹窗
2. 如果是个人空间文件，直接保存 (`saveToCurrentFile`)
3. 如果是公共资源库文件，检查权限后保存 (`saveLibraryFile`)
4. 如果是项目文件，检查保存权限后保存或弹出另存为

**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:1857-1980`

#### 未登录状态
- **触发登录提示：** 派发 `mxcad-save-required` 事件
- **显示登录提示弹框：** 提示用户需要登录

**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:1861-1869`

### 5.2 另存为功能

#### 登录状态
- 先保存为 mxweb 格式到本地
- 触发 `mxcad-save-as` 事件
- 显示另存为弹窗 (`SaveAsModal`)
- 用户选择位置后保存

**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:2307-2366`

#### 未登录状态
- **显示登录提示：** 触发 `mxcad-save-required` 事件

**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:2309-2312` (在 `showSaveAsDialog` 调用前检查)

### 5.3 导出功能

#### 相关代码
- **触发保存为：** `exportFile` 命令实际上调用 `triggerSaveAs`
- **命令注册：** `apps/frontend/src/services/mxcadManager.ts:1810-1812`
- **事件监听：** `apps/frontend/src/pages/CADEditorDirect.tsx:917-937`

#### 行为
- 检查是否有导出权限
- 显示下载格式选择弹窗 (`DownloadFormatModal`)
- 用户选择格式后下载

**相关代码位置：** `apps/frontend/src/pages/CADEditorDirect.tsx:917-937`

### 5.4 登录提示事件监听

在 `CADEditorDirect` 组件中监听保存/另存为事件：

```javascript
// apps/frontend/src/pages/CADEditorDirect.tsx:855-888
window.addEventListener('mxcad-save-required', handleSaveRequired);
window.addEventListener('mxcad-saveas-required', handleSaveRequired);
```

当事件触发时，显示 `LoginPrompt` 组件。

---

## 6. 外部参照处理机制

### 6.1 上传后的外部参照检查

**相关代码位置：** `apps/frontend/src/components/MxCadUploader.tsx:130-135`

```javascript
await externalReferenceUpload.checkMissingReferences(param.nodeId!, true, false);
```

### 6.2 未登录用户的外部参照

通过事件机制处理：

**相关代码位置：** `apps/frontend/src/pages/CADEditorDirect.tsx:746-789`

1. 监听 `public-file-uploaded` 事件
2. 检查缺失的外部参照
3. 用户完成操作后调用回调打开文件

---

## 7. 文件打开的关键实现

### 7.1 mxcadManager.openFile 函数

**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:2774-2856`

功能：
1. 检查文件是否已打开（避免重复打开）
2. 设置超时（60 秒）
3. 监听 `openFileComplete` 事件
4. 调用 `mxcad.openWebFile` 打开文件
5. 支持重试机制（最多 3 次，间隔 1 秒）

### 7.2 文件信息跟踪

**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:96-107`

当前打开的文件信息存储在 `currentFileInfo` 变量中，包括：
- `fileId` - 文件 ID
- `parentId` - 父目录 ID
- `projectId` - 项目 ID
- `name` - 文件名
- `personalSpaceId` - 私人空间 ID
- `libraryKey` - 资源库标识
- `fromPlatform` - 是否从平台跳转
- `updatedAt` - 更新时间戳

---

## 8. 缩略图生成机制

**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:2496-2573`

功能：
1. 文件打开完成后自动触发
2. 检查用户是否登录（未登录则跳过）
3. 检查缩略图是否已存在
4. 如不存在，生成并上传缩略图
5. 生成范围：根据图纸边界框计算

---

## 9. 缓存管理

### 9.1 本地缓存

- **IndexedDB 缓存：** 存储 mxweb 文件内容
- **Cache API 缓存：** 存储历史版本文件

### 9.2 缓存清理

- **旧版本清理：** 保存新文件后清理旧版本缓存
- **时间戳机制：** 使用 `updatedAt` 时间戳区分版本

**相关代码位置：** `apps/frontend/src/services/mxcadManager.ts:3182-3204`

---

## 10. 总结流程图

### 已登录用户上传流程：
```
用户选择文件 
    → 计算哈希 
    → 检查重复 
    → 上传文件 
    → 等待转换 
    → 打开文件 
    → 检查外部参照 
    → 生成缩略图
```

### 未登录用户上传流程：
```
用户选择文件 
    → 计算哈希 
    → 检查秒传 
    → 上传文件 
    → 检查外部参照 
    → 打开文件
```

### 保存流程：
```
用户点击保存
    → 检查登录状态
    → (未登录) 显示登录提示
    → (已登录) 检查权限
    → 保存文件
    → 更新缓存
    → 处理待上传图片
```

---

## 附录：关键文件索引

| 功能模块 | 文件路径 | 主要内容 |
|---------|---------|---------|
| 核心管理器 | `apps/frontend/src/services/mxcadManager.ts` | 上传、转换、打开、保存 |
| CAD 编辑器 | `apps/frontend/src/pages/CADEditorDirect.tsx` | 编辑器页面组件 |
| 上传组件1 | `apps/frontend/src/components/MxCadUploader.tsx` | 传统上传组件（已弃用） |
| 上传组件2 | `apps/frontend/src/components/MxCadUppyUploader.tsx` | Uppy 上传组件 |
| 上传 Hook1 | `apps/frontend/src/hooks/useUppyUpload.ts` | Uppy 上传 Hook |
| 公共文件 API | `apps/frontend/src/services/publicFileApi.ts` | 未登录用户文件 API |
| MxCAD API | `apps/frontend/src/services/mxcadApi.ts` | 已登录用户 MxCAD API |

