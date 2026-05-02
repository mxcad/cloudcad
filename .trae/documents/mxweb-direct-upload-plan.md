# MXWeb 文件直接上传功能实现方案

## 需求分析

用户需要实现 MXWeb 文件（已转换的 CAD 文件）的直接上传功能：
- **DWG/DXF 文件**：上传后需要调用转换程序转为 MXWeb 格式
- **MXWeb 文件**：上传后直接复制到 nodeid 目录，跳过转换步骤
- 其他所有流程保持不变

## 核心修改点

### 1. 文件类型检测器 (`file-type-detector.ts`)
- 添加 `.mxweb` 扩展名识别
- 添加 `isMxwebFile()` 方法用于检测 MXWeb 文件
- **不修改 `needsConversion()` 方法**（避免影响其他场景）

### 2. 文件上传转换服务 (`file-conversion-upload.service.ts`)
- 在 `uploadAndConvertFileWithPermission()` 方法中添加 MXWeb 文件的特殊处理逻辑
- MXWeb 文件直接复制到 nodeid 目录，跳过转换步骤

### 3. 上传编排器 (`upload.orchestrator.ts`)
- 更新 `performMerge()` 方法，MXWeb 文件不需要调用转换服务

## 修改文件清单

| 文件路径 | 修改内容 |
| --- | --- |
| `src/mxcad/utils/file-type-detector.ts` | 添加 MXWeb 扩展名识别和 `isMxwebFile()` 方法 |
| `src/mxcad/services/file-conversion-upload.service.ts` | 添加 MXWeb 文件直接上传逻辑 |
| `src/mxcad/orchestrators/upload.orchestrator.ts` | 更新合并流程，跳过 MXWeb 转换 |

## 实现步骤

### 步骤 1：修改文件类型检测器
- 添加 `MXWEB_EXTENSION = '.mxweb'`
- 添加 `isMxwebFile()` 方法
- 保持 `needsConversion()` 方法不变

### 步骤 2：修改文件转换上传服务
- 在 `uploadAndConvertFileWithPermission()` 中检测 MXWeb 文件
- MXWeb 文件直接处理，不调用 `fileConversionService.convertFile()`

### 步骤 3：修改上传编排器
- 在 `performMerge()` 中检测 MXWeb 文件
- MXWeb 文件跳过转换步骤

### 步骤 4：测试验证
- 测试 DWG 文件上传：应正常转换
- 测试 MXWeb 文件上传：应直接复制，不调用转换程序

## 风险评估

| 风险点 | 风险等级 | 应对措施 |
| --- | --- | --- |
| 文件类型判断错误 | 低 | 严格匹配扩展名 `.mxweb` |
| 存储路径处理错误 | 中 | 复用现有 `handleFileNodeCreation()` 逻辑 |
| 并发上传冲突 | 低 | 现有锁机制已处理 |

## 预期效果

- MXWeb 文件上传时跳过转换步骤，提升上传速度
- DWG/DXF 文件保持原有转换流程
- 其他所有功能不受影响