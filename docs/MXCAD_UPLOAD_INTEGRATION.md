# MxCAD 文件上传服务集成方案

## 1. 背景说明

### 1.1 现有系统

**MxCAD-App 前端应用**：

- 完整的前端 CAD 编辑器实现
- 已有成熟的文件上传接口
- **接口不可变动**（前端应用已完成，无法修改）

**参考后端实现**（`代码参考/upload.ts`）：

- 基于 Express + Multer
- 完整的分片上传、断点续传、文件去重
- 集成 MxCAD 图纸转换工具
- 所有路由基于 `/mxcad` 前缀

### 1.2 集成目标

将 MxCAD 文件上传服务集成到 CloudCAD 项目的文件系统中，保持接口兼容性。

---

## 2. MxCAD 转换服务

### 2.1 转换工具

**程序位置**：`mxcadassembly/windows/release/mxcadassembly.exe`

**执行方式**：通过 `child_process.exec` 调用命令行

### 2.2 转换命令

#### DWG/DXF → MXWEB（压缩）

```bash
mxcadassembly.exe {"srcpath":"D:\\test2.dwg","outpath":"D:\\","outname":"test"}
```

**参数说明**：

| 参数          | 说明                     | 必填 |
| ------------- | ------------------------ | ---- |
| `srcpath`     | 要转换的文件路径         | 是   |
| `outpath`     | 输出文件路径             | 是   |
| `outname`     | 输出文件名（不含扩展名） | 是   |
| `compression` | 0=不压缩，不写=压缩      | 否   |

#### DWG/DXF → MXWEB（不压缩）

```bash
mxcadassembly.exe {"srcpath":"D:\\test2.dwg","outpath":"D:\\","outname":"test","compression":0}
```

#### MXWEB → DWG

```bash
mxcadassembly.exe {"srcpath":"D:\\test.mxweb","outpath":"D:\\","outname":"test.dwg"}
```

**注意**：`outname` 必须包含 `.dwg` 后缀

### 2.3 环境配置

**新增环境变量**（`.env`）：

```env
# MxCAD 转换服务配置
MXCAD_ASSEMBLY_PATH=D:\web\MxCADOnline\cloudcad\mxcadassembly\windows\release\mxcadassembly.exe
MXCAD_UPLOAD_PATH=D:\web\MxCADOnline\cloudcad\uploads
MXCAD_TEMP_PATH=D:\web\MxCADOnline\cloudcad\temp
MXCAD_FILE_EXT=.mxweb
MXCAD_COMPRESSION=true
```

**配置说明**：

| 变量                  | 说明               | 默认值      |
| --------------------- | ------------------ | ----------- |
| `MXCAD_ASSEMBLY_PATH` | MxCAD 转换程序路径 | 必填        |
| `MXCAD_UPLOAD_PATH`   | 文件上传存储目录   | `./uploads` |
| `MXCAD_TEMP_PATH`     | 分片临时目录       | `./temp`    |
| `MXCAD_FILE_EXT`      | 转换后文件扩展名   | `.mxweb`    |
| `MXCAD_COMPRESSION`   | 是否压缩           | `true`      |

---

## 3. 文件上传 API

### 3.1 路由前缀

**所有接口基于**：`/mxcad`

```typescript
app.use('/mxcad', mxcadRouter);
```

### 3.2 核心接口

详细接口文档见 [`API_UPLOAD_DOCUMENTATION.md`](./API_UPLOAD_DOCUMENTATION.md)

#### 分片上传流程

```
1. 检查文件是否存在（秒传）
   POST /mxcad/files/fileisExist

2. 检查分片是否存在（断点续传）
   POST /mxcad/files/chunkisExist

3. 上传分片
   POST /mxcad/files/uploadFiles

4. 自动合并 + 转换
   （后端自动触发）
```

#### 关键接口

| 接口                        | 方法 | 说明                         |
| --------------------------- | ---- | ---------------------------- |
| `/mxcad/files/fileisExist`  | POST | 检查文件是否已转换（秒传）   |
| `/mxcad/files/chunkisExist` | POST | 检查分片是否存在（断点续传） |
| `/mxcad/files/uploadFiles`  | POST | 上传文件/分片                |
| `/mxcad/files/tz`           | POST | 检查图纸特殊处理状态         |
| `/mxcad/convert`            | POST | 转换服务器文件               |
| `/mxcad/upfile`             | POST | 上传并转换（不支持断点续传） |

### 3.3 返回状态码

```typescript
enum MxUploadReturn {
  kOk = 'ok', // 成功
  kErrorParam = 'errorparam', // 参数错误
  kChunkAlreadyExist = 'chunkAlreadyExist', // 分片已存在
  kChunkNoExist = 'chunkNoExist', // 分片不存在
  kFileAlreadyExist = 'fileAlreadyExist', // 文件已存在
  kFileNoExist = 'fileNoExist', // 文件不存在
  kConvertFileError = 'convertFileError', // 文件转换错误
}
```

---

## 4. 技术实现

### 4.1 分片上传

**分片大小**：1MB（可配置）

**存储位置**：`{MXCAD_TEMP_PATH}/chunk_{fileHash}/`

**分片命名**：`{index}_{fileHash}`

**合并策略**：

- 使用 Stream 方式逐个合并
- 按分片索引排序
- 合并完成后调用转换服务

### 4.2 文件去重

**哈希算法**：MD5（前端计算）

**去重逻辑**：

1. 前端计算文件 MD5
2. 调用 `/files/fileisExist` 检查
3. 如果已存在，返回 `fileAlreadyExist`（秒传）
4. 如果不存在，开始分片上传

### 4.3 断点续传

**实现方式**：

1. 上传每个分片前调用 `/files/chunkisExist`
2. 如果返回 `chunkAlreadyExist`，跳过该分片
3. 如果返回 `chunkNoExist`，上传该分片

### 4.4 自动转换

**触发时机**：所有分片上传完成后

**转换流程**：

```typescript
1. 合并分片 → 完整文件
2. 调用 mxcadassembly.exe 转换
3. 生成 .mxweb 文件
4. 删除临时分片目录
5. 返回转换结果
```

---

## 5. 集成到 CloudCAD

### 5.1 架构设计

```
CloudCAD 文件系统
    ↓
  调用 MxCAD 上传服务
    ↓
  分片上传 + 断点续传
    ↓
  自动转换（mxcadassembly.exe）
    ↓
  存储到本地文件系统
    ↓
  更新 FileSystemNode 记录
```

### 5.2 模块职责

**MxCAD 上传模块**（新增）：

- 处理 `/mxcad/*` 路由
- 分片上传、合并、转换
- 调用 mxcadassembly.exe

**FileSystem 模块**（现有）：

- 调用 MxCAD 上传服务
- 管理文件元数据（FileSystemNode）
- 权限控制

**Storage 模块**（现有）：

- 本地文件存储
- 文件访问

### 5.3 数据流

```
前端（MxCAD-App）
    ↓ HTTP
后端（/mxcad/* 路由）
    ↓ 本地文件系统
临时存储（分片合并）
    ↓ child_process.exec
MxCAD 转换（.dwg → .mxweb）
    ↓ 文件系统
本地文件存储
    ↓ Prisma
数据库（FileSystemNode）
```

---

## 6. 开发计划

### 6.1 Phase 1：MxCAD 上传服务（独立模块）

**目标**：实现完整的 MxCAD 上传服务，保持接口兼容

**任务**：

- [ ] 创建 `mxcad` 模块
- [ ] 实现分片上传接口
- [ ] 实现文件合并逻辑
- [ ] 集成 mxcadassembly.exe 转换
- [ ] 添加环境配置
- [ ] 编写单元测试

### 6.2 Phase 2：与 FileSystem 集成

**目标**：将 MxCAD 上传服务集成到文件系统

**任务**：

- [ ] FileSystem 调用 MxCAD 上传服务
- [ ] 转换完成后存储到本地文件系统
- [ ] 更新 FileSystemNode 记录
- [ ] 权限验证
- [ ] 集成测试

### 6.3 Phase 3：前端集成

**目标**：前端使用 MxCAD 上传接口

**任务**：

- [ ] 前端计算文件 MD5
- [ ] 实现分片上传逻辑
- [ ] 实现断点续传
- [ ] 进度显示
- [ ] 错误处理

---

## 7. 注意事项

### 7.1 接口兼容性

**严格要求**：

- `/mxcad/*` 接口不可变动
- 请求/响应格式必须与 `API_UPLOAD_DOCUMENTATION.md` 一致
- 状态码枚举必须保持不变

### 7.2 Windows 平台

**MxCAD 转换工具仅支持 Windows**：

- 开发环境：Windows
- 生产环境：Windows Server
- 路径使用反斜杠（`\\`）

### 7.3 性能优化

**建议**：

- 分片大小：1-5MB
- 并发上传：3-5 个分片
- 转换超时：根据文件大小动态调整
- 定期清理临时文件

### 7.4 安全性

**必须实现**：

- 文件类型白名单验证
- 文件大小限制
- 用户权限验证
- 防止路径遍历攻击

---

## 8. 参考资料

- **API 文档**：[`API_UPLOAD_DOCUMENTATION.md`](./API_UPLOAD_DOCUMENTATION.md)
- **参考实现**：`代码参考/upload.ts`
- **项目规范**：[`IFLOW.md`](../IFLOW.md)

---

## 9. 更新记录

| 日期       | 版本   | 说明                                  |
| ---------- | ------ | ------------------------------------- |
| 2025-12-19 | v1.0.0 | 初始版本，记录 MxCAD 上传服务集成方案 |

---

_CloudCAD 团队 | 2025-12-19_
