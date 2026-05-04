# Claude Code 编辑器功能审查清单

## 概述

本文档用于 Claude Code 交付后对照验收 React 版本的编辑器剩余功能，包括：
1. 保存拦截 (Save Intercept)
2. 另存为 (Save As)
3. 导出 (Export)
4. 外部参照检查 (External Reference Check)
5. 缩略图生成 (Thumbnail Generation)

---

## 一、保存拦截功能 (Save Intercept)

### 1.1 功能说明
拦截用户 Ctrl+S 保存操作，根据登录状态和文件类型执行不同逻辑。

### 1.2 逻辑分支

#### 分支 1：未登录状态
- [ ] 触发 `mxcad-save-required` 事件，action 为 "保存文件"
- [ ] CADEditorDirect 监听事件显示 LoginPrompt 弹窗
- [ ] 用户点击登录后跳转登录页
- [ ] 登录成功后恢复保存操作

#### 分支 2：已登录状态 - 无打开文件（空白画布新建）
- [ ] 弹出另存为对话框 (SaveAsModal)
- [ ] 默认文件名为 "untitled"
- [ ] 用户确认后保存到个人空间

#### 分支 3：已登录状态 - 个人空间图纸
- [ ] 判断条件：`personalSpaceId && currentFileInfo.parentId === personalSpaceId`
- [ ] 直接调用 `saveToCurrentFile(personalSpaceId)`
- [ ] 显示保存确认弹窗 (SaveConfirmModal)
- [ ] 用户输入提交信息后保存
- [ ] 上传到服务器 (mxcadApi.saveMxwebFile)
- [ ] 更新 IndexedDB 缓存

#### 分支 4：已登录状态 - 公共资源库图纸
- [ ] 判断条件：`currentFileInfo.libraryKey` 存在
- [ ] 检查用户是否有 LIBRARY_DRAWING_MANAGE 或 LIBRARY_BLOCK_MANAGE 权限
- [ ] **有权限**：调用 `saveLibraryFile()` 直接保存
- [ ] **无权限**：弹出另存为对话框
- [ ] **无法获取权限信息**：弹出另存为对话框（保守处理）

#### 分支 5：已登录状态 - 项目图纸
- [ ] 判断条件：`currentFileInfo.projectId` 存在
- [ ] 调用 `projectsApi.checkPermission(projectId, 'CAD_SAVE')` 检查权限
- [ ] **有权限**：调用 `saveToCurrentFile(personalSpaceId)`
- [ ] **无权限**：弹出另存为对话框
- [ ] **权限检查失败**：弹出另存为对话框（保守处理）

### 1.3 保存确认弹窗逻辑
- [ ] 显示保存确认对话框
- [ ] 用户输入提交信息 (commitMessage)
- [ ] 用户取消时返回 null，不执行保存
- [ ] 用户确认后将 blob 上传到服务器

### 1.4 缓存更新逻辑
- [ ] 保存成功后更新 optimistic lock 时间戳 (`updatedAt`)
- [ ] 清理旧版本缓存 (`clearFileCacheFromIndexedDB`)
- [ ] 写入新缓存到 IndexedDB
- [ ] 处理待上传图片 (`processPendingImages`)

### 1.5 权限检查清单
- [ ] CAD_SAVE 权限检查（项目图纸）
- [ ] LIBRARY_DRAWING_MANAGE 权限检查（图纸库）
- [ ] LIBRARY_BLOCK_MANAGE 权限检查（图块库）

---

## 二、另存为功能 (Save As)

### 2.1 功能说明
将当前 CAD 文件保存为副本到指定位置。

### 2.2 逻辑分支

#### 分支 1：未登录状态
- [ ] 触发 `mxcad-save-required` 事件，action 为 "另存为"
- [ ] 显示 LoginPrompt 弹窗

#### 分支 2：已登录状态
- [ ] 触发 `mxcad-save-as` 事件
- [ ] 显示 SaveAsModal 弹窗
- [ ] 初始化默认文件名（去除扩展名）
- [ ] 初始化目标类型为 "个人图纸"

### 2.3 目标类型选择
- [ ] **我的图纸 (personal)**：保存到个人空间
  - [ ] 初始化 selectedParentId 为 personalSpaceId
- [ ] **项目文件夹 (project)**：保存到项目
  - [ ] 加载项目列表
  - [ ] 用户选择目标项目
  - [ ] 初始化 selectedParentId 为 selectedProjectId
- [ ] **公开资源库 (library)**：保存到公共资源库（需权限）
  - [ ] 检查 hasLibraryPermission
  - [ ] 选择图纸库或图块库
  - [ ] 需选择保存位置

### 2.4 保存位置选择
- [ ] 显示文件夹选择按钮
- [ ] 点击后显示 SelectFolderModal
- [ ] 用户选择文件夹后更新 selectedParentId
- [ ] 显示已选文件夹名称

### 2.5 格式选择
- [ ] 支持 DWG 格式
- [ ] 支持 DXF 格式
- [ ] 默认选择 DWG
- [ ] 文件名自动添加对应扩展名

### 2.6 保存验证
- [ ] 文件名不能为空
- [ ] 文件名不能包含非法字符：`\ / : * ? " < > |`
- [ ] 必须选择保存位置（selectedParentId）
- [ ] 公开资源库模式必须选择具体位置

### 2.7 保存执行
- [ ] 调用 `mxcadApi.saveMxwebAs()` 保存到我的图纸/项目
- [ ] 调用 `libraryApi.saveDrawingAs()` 或 `libraryApi.saveBlockAs()` 保存到公开资源库
- [ ] 显示上传进度
- [ ] 保存成功后调用 onSuccess 回调
- [ ] 回调参数包含：nodeId, fileName, path, projectId, parentId
- [ ] 保存成功后重新打开文件
- [ ] 保存失败显示错误信息

### 2.8 状态重置
- [ ] 弹窗关闭时重置 targetType 为 'personal'
- [ ] 重置 selectedProjectId 为空
- [ ] 重置 format 为 'dwg'
- [ ] 重置 error 为 null

---

## 三、导出功能 (Export)

### 3.1 功能说明
将 CAD 文件导出为不同格式（DWG/DXF/MXWEB/PDF）供下载。

### 3.2 逻辑分支

#### 分支 1：无导出权限
- [ ] 触发 `mxcad-export-file` 事件前检查 canExport
- [ ] 无权限时显示 Toast 提示："您没有导出图纸的权限"
- [ ] 不显示下载格式弹窗

#### 分支 2：有导出权限
- [ ] 监听 `mxcad-export-file` 事件
- [ ] 获取事件中的 fileId 和 fileName
- [ ] 显示 DownloadFormatModal

### 3.3 格式选择
- [ ] **DWG 格式**：AutoCAD 原生格式
- [ ] **DXF 格式**：Drawing Exchange Format
- [ ] **MXWEB 格式**：CloudCAD 专用格式，可直接在线编辑
- [ ] **PDF 格式**：便携式文档格式

### 3.4 PDF 导出参数（仅 PDF 格式显示）
- [ ] 宽度输入框（默认 2000 像素）
- [ ] 高度输入框（默认 2000 像素）
- [ ] 颜色策略下拉框：
  - [ ] 黑白（单色）- 默认
  - [ ] 彩色

### 3.5 下载执行
- [ ] 调用 `filesApi.downloadWithFormat(nodeId, format, pdfOptions)`
- [ ] 显示下载进度（loading 状态）
- [ ] 创建 Blob URL
- [ ] 自动触发浏览器下载
- [ ] 下载完成后清理 Blob URL
- [ ] 下载失败显示错误 Toast

### 3.6 文件名处理
- [ ] 自动去除原始扩展名
- [ ] 添加选择的格式对应扩展名
- [ ] 例如：example.dwg → 选择 PDF → example.pdf

---

## 四、外部参照检查 (External Reference Check)

### 4.1 功能说明
检查 CAD 文件中的外部参照依赖，确保所有依赖文件已上传。

### 4.2 触发时机
- [ ] **已登录用户上传文件后**：调用 `checkMissingReferences(nodeId, true, false)`
- [ ] **未登录用户上传文件后**：监听 `public-file-uploaded` 事件后检查
- [ ] **文件打开完成后**：调用 `checkMissingReferences(nodeId/fileHash, false, false)`
- [ ] **参数说明**：
  - 第一个参数：nodeId (已登录) 或 fileHash (未登录)
  - 第二个参数：shouldRetry（是否重试，等待 preloading.json 生成）
  - 第三个参数：forceOpen（是否强制打开，即使有缺失参照）

### 4.3 逻辑分支

#### 分支 1：无外部参照
- [ ] `files.length === 0`
- [ ] 显示提示信息："该文件没有外部参照"
- [ ] 直接完成，不弹窗或弹窗显示后立即可关闭

#### 分支 2：有外部参照 - 全部已存在
- [ ] `files` 列表中所有文件 `exists === true`
- [ ] 显示提示信息："所有外部参照文件已存在"
- [ ] 文件列表显示绿色对勾状态

#### 分支 3：有外部参照 - 部分或全部缺失
- [ ] `missingCount > 0`
- [ ] 显示警告信息："检测到 X 个缺失的外部参照文件"
- [ ] 显示 ExternalReferenceModal

### 4.4 外部参照弹窗逻辑

#### 文件列表显示
- [ ] 显示状态列（图标）
- [ ] 显示文件名列
- [ ] 显示文件类型列（DWG / 图片）
- [ ] 显示进度列

#### 文件状态图标
- [ ] 上传成功：绿色对勾 (CheckCircle)
- [ ] 上传失败：红色叉号 (XCircle)
- [ ] 上传中：蓝色加载动画 (Loader2)
- [ ] 已存在（未选择）：绿色对勾
- [ ] 缺失（待上传）：空

#### 上传操作
- [ ] "选择并上传" 按钮
- [ ] 点击后触发文件选择器
- [ ] 支持多文件选择
- [ ] 显示上传进度条
- [ ] 上传成功后更新状态图标

#### 完成操作
- [ ] 所有文件上传成功后，按钮文字变为 "完成"
- [ ] "完成" 按钮关闭弹窗并重新加载文件

#### 跳过操作
- [ ] 提供跳过选项
- [ ] 跳过时不上传缺失文件
- [ ] 直接关闭弹窗

### 4.5 未登录用户外部参照特殊处理
- [ ] 使用 fileHash 而非 nodeId
- [ ] 通过 `public-file-access/{hash}/{filename}` 构建外部参照 URL
- [ ] 上传后的外部参照保存到公共文件服务

---

## 五、缩略图生成 (Thumbnail Generation)

### 5.1 功能说明
文件打开后自动生成并上传缩略图，用于文件列表显示。

### 5.2 触发时机
- [ ] 在 `openFileComplete` 事件触发后执行
- [ ] 在 `setupFileOpenListener` 中调用

### 5.3 逻辑分支

#### 分支 1：用户未登录
- [ ] 检查 token 和 user 是否存在
- [ ] 未登录时跳过缩略图生成
- [ ] 输出日志：`[缩略图] 用户未登录，跳过缩略图生成和上传`

#### 分支 2：fileId 为空
- [ ] 检查 currentFileInfo.fileId
- [ ] 为空时跳过缩略图处理
- [ ] 输出日志：`[缩略图] fileId 为空，跳过缩略图处理`

#### 分支 3：缩略图已存在
- [ ] 调用 `mxcadApi.checkThumbnail(nodeId)` 检查
- [ ] 如果缩略图已存在 (exists === true)
- [ ] 跳过生成和上传步骤

#### 分支 4：缩略图不存在，需要生成
- [ ] 调用 `generateThumbnail()` 生成缩略图
- [ ] 生成成功后调用 `uploadThumbnail(nodeId, imageData)` 上传

### 5.4 缩略图生成算法
- [ ] 获取图纸边界框 (`getBoundingBox`)
- [ ] 计算图纸尺寸：宽 w、高 h
- [ ] 判断尺寸是否小于最小阈值 (`THUMBNAIL_CONFIG.MIN_DRAWING_SIZE`)
- [ ] 如果太小返回 undefined，不生成缩略图
- [ ] 计算缩放比例：取 w 和 h 缩放比例的最小值
- [ ] 以图纸中心为中心点计算新边界
- [ ] 调用 `mxcad.createCanvasImageData()` 生成图片
- [ ] 隐藏坐标轴 (`ShowCoordinate: false`)

### 5.5 缩略图上传
- [ ] 将 DataURL 转换为 Blob
- [ ] 使用 `mxcadApi.uploadThumbnail(nodeId, formData)` 上传
- [ ] 上传失败不阻塞主流程，仅输出错误日志

### 5.6 缓存清理
- [ ] 缩略图生成后清理旧版本 mxweb 缓存
- [ ] 提取 URL 中的文件路径
- [ ] 支持项目文件和图纸库文件路径格式
- [ ] 调用 `clearOldMxwebCache(filePath, currentCacheTimestamp)`

---

## 六、通用检查项

### 6.1 事件通信
- [ ] 所有功能使用 CustomEvent 与 React 组件通信
- [ ] 事件名称符合规范：mxcad-save-required、mxcad-save-as、mxcad-export-file 等
- [ ] 事件 detail 包含必要参数

### 6.2 权限检查
- [ ] CAD_SAVE：保存权限
- [ ] FILE_DOWNLOAD：导出权限
- [ ] CAD_EXTERNAL_REFERENCE：外部参照管理权限
- [ ] LIBRARY_DRAWING_MANAGE / LIBRARY_BLOCK_MANAGE：资源库管理权限

### 6.3 错误处理
- [ ] API 调用失败显示错误 Toast
- [ ] 网络错误有重试机制
- [ ] 保存失败时保持弹窗不关闭
- [ ] 外部参照上传失败显示具体错误信息

### 6.4 加载状态
- [ ] 保存中显示 loading 状态
- [ ] 导出中显示 loading 状态
- [ ] 上传中显示进度百分比
- [ ] 按钮禁用状态正确

### 6.5 UI 状态重置
- [ ] 弹窗关闭时重置所有输入状态
- [ ] 取消操作不触发保存
- [ ] 长时间操作支持取消

---

## 七、相关代码位置索引

| 功能 | 文件路径 | 关键函数/组件 |
|------|---------|--------------|
| 保存拦截 | mxcadManager.ts:1857-1980 | Mx_Save 命令 |
| 保存执行 | mxcadManager.ts:1986-2150 | saveToCurrentFile |
| 资源库保存 | mxcadManager.ts:2116-2250 | saveLibraryFile |
| 另存为 | mxcadManager.ts:1793-1806 | triggerSaveAs |
| 另存为弹窗 | SaveAsModal.tsx | React 组件 |
| 导出 | CADEditorDirect.tsx:917-937 | mxcad-export-file 监听 |
| 导出弹窗 | DownloadFormatModal.tsx | React 组件 |
| 外部参照检查 | useExternalReferenceUpload.ts | checkMissingReferences |
| 外部参照弹窗 | ExternalReferenceModal.tsx | React 组件 |
| 缩略图生成 | mxcadManager.ts:2496-2550 | generateThumbnail |
| 缩略图上传 | mxcadManager.ts:2555-2574 | uploadThumbnail |
| 缩略图触发 | mxcadManager.ts:2626-2655 | setupFileOpenListener |

---

## 八、测试用例建议

### 8.1 保存功能测试用例
1. [ ] 未登录时按 Ctrl+S 显示登录提示
2. [ ] 已登录新建文件时弹出另存为
3. [ ] 个人空间图纸直接保存成功
4. [ ] 项目图纸有权限时直接保存
5. [ ] 项目图纸无权限时弹出另存为
6. [ ] 资源库图纸有权限时直接保存
7. [ ] 资源库图纸无权限时弹出另存为

### 8.2 另存为功能测试用例
1. [ ] 保存到我的图纸成功
2. [ ] 保存到项目文件夹成功
3. [ ] 保存到公开资源库成功（需权限）
4. [ ] 文件名非法字符验证
5. [ ] 未选择保存位置时提示

### 8.3 导出功能测试用例
1. [ ] 无导出权限时提示拒绝
2. [ ] 导出 DWG 格式成功
3. [ ] 导出 PDF 格式成功（带参数）
4. [ ] 导出文件名正确

### 8.4 外部参照功能测试用例
1. [ ] 无外部参照文件时提示
2. [ ] 有缺失外部参照时弹窗
3. [ ] 上传缺失外部参照成功
4. [ ] 跳过外部参照上传
5. [ ] 未登录用户外部参照上传

### 8.5 缩略图功能测试用例
1. [ ] 未登录时不生成缩略图
2. [ ] 缩略图已存在时不重复生成
3. [ ] 新文件生成并上传缩略图
4. [ ] 图纸太小时不生成缩略图
