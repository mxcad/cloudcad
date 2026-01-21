# 文件上传与转换 API 文档

## 概述

本文档详细描述了基于 Express + Multer 的文件上传、分片上传、文件转换等 API 接口的入参、出参及使用说明。

---

## 目录

1. [检查分片是否存在](#1-检查分片是否存在)
2. [检查文件是否存在](#2-检查文件是否存在)
3. [检查图纸状态](#3-检查图纸状态)
4. [上传文件（支持分片）](#4-上传文件支持分片)
5. [测试上传文件](#5-测试上传文件)
6. [转换服务器文件](#6-转换服务器文件)
7. [上传并转换文件](#7-上传并转换文件)
8. [上传外部参照 DWG](#8-上传外部参照-dwg)
9. [上传外部参照图片](#9-上传外部参照图片)
10. [保存 MXWEB 到服务器](#10-保存-mxweb-到服务器)
11. [保存 DWG 到服务器](#11-保存-dwg-到服务器)
12. [保存 PDF 到服务器](#12-保存-pdf-到服务器)
13. [打印为 PDF](#13-打印为-pdf)
14. [裁剪 DWG](#14-裁剪-dwg)
15. [裁剪 MXWEB](#15-裁剪-mxweb)
16. [上传图片](#16-上传图片)

---

## 返回状态码枚举

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

## API 接口详情

### 1. 检查分片是否存在

**接口路径**: `POST /mxcad/files/chunkisExist`

**功能说明**: 检查指定分片是否已经上传到服务器，用于断点续传。

#### 请求参数

| 参数名   | 类型   | 必填 | 说明                  |
| -------- | ------ | ---- | --------------------- |
| chunk    | number | 是   | 分片索引（从 0 开始） |
| fileHash | string | 是   | 文件 MD5 哈希值       |
| size     | number | 是   | 当前分片大小（字节）  |
| chunks   | number | 是   | 总分片数量            |
| fileName | string | 是   | 原始文件名            |

**请求示例**:

```json
{
  "chunk": 0,
  "fileHash": "d41d8cd98f00b204e9800998ecf8427e",
  "size": 1048576,
  "chunks": 10,
  "fileName": "example.dwg"
}
```

#### 返回参数

| 参数名 | 类型   | 说明                 |
| ------ | ------ | -------------------- |
| ret    | string | 返回状态码（见枚举） |

**返回示例**:

```json
{
  "ret": "chunkAlreadyExist"
}
```

或

```json
{
  "ret": "chunkNoExist"
}
```

---

### 2. 检查文件是否存在

**接口路径**: `POST /mxcad/files/fileisExist`

**功能说明**: 检查指定哈希值的文件是否已经转换并存在于服务器。

#### 请求参数

| 参数名   | 类型   | 必填 | 说明                   |
| -------- | ------ | ---- | ---------------------- |
| filename | string | 是   | 原始文件名（含扩展名） |
| fileHash | string | 是   | 文件 MD5 哈希值        |

**请求示例**:

```json
{
  "filename": "example.dwg",
  "fileHash": "d41d8cd98f00b204e9800998ecf8427e"
}
```

#### 返回参数

| 参数名 | 类型   | 说明                 |
| ------ | ------ | -------------------- |
| ret    | string | 返回状态码（见枚举） |

**返回示例**:

```json
{
  "ret": "fileAlreadyExist"
}
```

或

```json
{
  "ret": "fileNoExist"
}
```

---

### 3. 检查图纸状态

**接口路径**: `POST /mxcad/files/tz`

**功能说明**: 检查图纸的特殊处理状态（tz 状态）。

#### 请求参数

| 参数名   | 类型   | 必填 | 说明            |
| -------- | ------ | ---- | --------------- |
| fileHash | string | 是   | 文件 MD5 哈希值 |

**请求示例**:

```json
{
  "fileHash": "d41d8cd98f00b204e9800998ecf8427e"
}
```

#### 返回参数

| 参数名 | 类型   | 说明                       |
| ------ | ------ | -------------------------- |
| code   | number | 状态码（0: 成功, 1: 失败） |

**返回示例**:

```json
{
  "code": 0
}
```

---

### 4. 上传文件（支持分片）

**接口路径**: `POST /mxcad/files/uploadFiles`

**功能说明**: 上传文件，支持分片上传和完整文件上传。上传完成后自动进行格式转换。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名 | 类型   | 必填 | 说明                         |
| ------ | ------ | ---- | ---------------------------- |
| file   | File   | 是   | 上传的文件或分片             |
| hash   | string | 是   | 文件 MD5 哈希值              |
| name   | string | 是   | 原始文件名                   |
| size   | number | 是   | 文件总大小（字节）           |
| chunk  | number | 否   | 分片索引（分片上传时必填）   |
| chunks | number | 否   | 总分片数量（分片上传时必填） |

**请求示例（分片上传）**:

```javascript
const formData = new FormData();
formData.append('file', chunkBlob);
formData.append('hash', 'd41d8cd98f00b204e9800998ecf8427e');
formData.append('name', 'example.dwg');
formData.append('size', 10485760);
formData.append('chunk', 0);
formData.append('chunks', 10);
```

**请求示例（完整文件上传）**:

```javascript
const formData = new FormData();
formData.append('file', fileBlob);
formData.append('hash', 'd41d8cd98f00b204e9800998ecf8427e');
formData.append('name', 'example.dwg');
formData.append('size', 10485760);
```

#### 返回参数

| 参数名 | 类型    | 说明                   |
| ------ | ------- | ---------------------- |
| ret    | string  | 返回状态码（见枚举）   |
| tz     | boolean | 可选，是否包含 tz 处理 |

**返回示例（成功）**:

```json
{
  "ret": "ok",
  "tz": true
}
```

**返回示例（转换失败）**:

```json
{
  "ret": "convertFileError"
}
```

**返回示例（参数错误）**:

```json
{
  "ret": "errorparam"
}
```

---

### 5. 测试上传文件

**接口路径**: `POST /mxcad/files/testupfile`

**功能说明**: 测试文件上传功能，不进行转换处理。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名 | 类型 | 必填 | 说明       |
| ------ | ---- | ---- | ---------- |
| file   | File | 是   | 上传的文件 |

#### 返回参数

返回字符串 `"ok"`

---

### 6. 转换服务器文件

**接口路径**: `POST /mxcad/convert`

**功能说明**: 转换服务器上已存在的文件，支持同步和异步转换。

#### 请求参数

| 参数名              | 类型          | 必填 | 说明                       |
| ------------------- | ------------- | ---- | -------------------------- |
| param               | object/string | 是   | 转换参数对象或 JSON 字符串 |
| param.srcpath       | string        | 是   | 源文件路径                 |
| param.outjpg        | string        | 否   | 输出 JPG 参数              |
| param.async         | string        | 否   | 是否异步（"true"/"false"） |
| param.resultposturl | string        | 否   | 异步结果回调 URL           |
| param.traceid       | string        | 否   | 追踪 ID                    |

**请求示例（同步转换）**:

```json
{
  "param": {
    "srcpath": "/path/to/file.dwg"
  }
}
```

**请求示例（异步转换）**:

```json
{
  "param": {
    "srcpath": "/path/to/file.dwg",
    "async": "true",
    "resultposturl": "https://example.com/callback",
    "traceid": "unique-trace-id"
  }
}
```

#### 返回参数

**同步返回**:
| 参数名 | 类型 | 说明 |
|--------|------|------|
| code | number | 状态码（0: 成功, 其他: 失败） |
| message | string | 返回消息 |
| ... | any | 其他转换结果数据 |

**异步返回**:

```json
{
  "code": 0,
  "message": "aysnc calling"
}
```

**错误返回**:

```json
{
  "code": 12,
  "message": "param error"
}
```

---

### 7. 上传并转换文件

**接口路径**: `POST /mxcad/upfile`

**功能说明**: 上传文件并立即进行转换，不支持断点续传。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名 | 类型 | 必填 | 说明       |
| ------ | ---- | ---- | ---------- |
| file   | File | 是   | 上传的文件 |

#### 返回参数

| 参数名   | 类型   | 说明                        |
| -------- | ------ | --------------------------- |
| code     | number | 状态码（0: 成功, -1: 失败） |
| message  | string | 返回消息                    |
| filename | string | 生成的文件名（UUID）        |
| ...      | any    | 其他转换结果数据            |

**返回示例（成功）**:

```json
{
  "code": 0,
  "message": "ok",
  "filename": "550e8400-e29b-41d4-a716-446655440000.dwg"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "message": "catch error"
}
```

---

### 8. 上传外部参照 DWG

**接口路径**: `POST /mxcad/up_ext_reference_dwg`

**功能说明**: 上传 DWG 文件的外部参照文件。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名           | 类型   | 必填 | 说明                     |
| ---------------- | ------ | ---- | ------------------------ |
| file             | File   | 是   | 外部参照 DWG 文件        |
| src_dwgfile_hash | string | 是   | 源 DWG 文件的 MD5 哈希值 |
| ext_ref_file     | string | 是   | 外部参照文件名           |

**请求示例**:

```javascript
const formData = new FormData();
formData.append('file', refDwgFile);
formData.append('src_dwgfile_hash', 'd41d8cd98f00b204e9800998ecf8427e');
formData.append('ext_ref_file', 'reference.dwg');
```

#### 返回参数

| 参数名  | 类型   | 说明                        |
| ------- | ------ | --------------------------- |
| code    | number | 状态码（0: 成功, -1: 失败） |
| message | string | 返回消息                    |

**返回示例（成功）**:

```json
{
  "code": 0,
  "message": "ok"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "message": "catch error"
}
```

---

### 9. 上传外部参照图片

**接口路径**: `POST /mxcad/up_ext_reference_image`

**功能说明**: 上传 DWG 文件的外部参照图片。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名           | 类型   | 必填 | 说明                     |
| ---------------- | ------ | ---- | ------------------------ |
| file             | File   | 是   | 外部参照图片文件         |
| src_dwgfile_hash | string | 是   | 源 DWG 文件的 MD5 哈希值 |
| ext_ref_file     | string | 是   | 外部参照文件名           |

**请求示例**:

```javascript
const formData = new FormData();
formData.append('file', imageFile);
formData.append('src_dwgfile_hash', 'd41d8cd98f00b204e9800998ecf8427e');
formData.append('ext_ref_file', 'image.png');
```

#### 返回参数

| 参数名  | 类型   | 说明                        |
| ------- | ------ | --------------------------- |
| code    | number | 状态码（0: 成功, -1: 失败） |
| message | string | 返回消息                    |

**返回示例（成功）**:

```json
{
  "code": 0,
  "message": "ok"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "message": "catch error"
}
```

---

### 10. 保存 MXWEB 到服务器

**接口路径**: `POST /mxcad/savemxweb`

**功能说明**: 上传并保存 MXWEB 格式文件到服务器。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名 | 类型 | 必填 | 说明       |
| ------ | ---- | ---- | ---------- |
| file   | File | 是   | MXWEB 文件 |

#### 返回参数

| 参数名 | 类型   | 说明                 |
| ------ | ------ | -------------------- |
| code   | number | 状态码（0: 成功）    |
| file   | string | 保存的文件名（UUID） |
| ret    | string | 返回状态 "ok"        |

**返回示例**:

```json
{
  "code": 0,
  "file": "550e8400-e29b-41d4-a716-446655440000.mxweb",
  "ret": "ok"
}
```

---

### 11. 保存 DWG 到服务器

**接口路径**: `POST /mxcad/savedwg`

**功能说明**: 上传文件并转换保存为 DWG 格式。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名 | 类型 | 必填 | 说明   |
| ------ | ---- | ---- | ------ |
| file   | File | 是   | 源文件 |

#### 返回参数

| 参数名  | 类型   | 说明                          |
| ------- | ------ | ----------------------------- |
| code    | number | 状态码（0: 成功, 其他: 失败） |
| file    | string | 输出的 DWG 文件名             |
| ret     | string | 返回状态 "ok" 或 "failed"     |
| message | string | 可选，错误消息                |

**返回示例（成功）**:

```json
{
  "code": 0,
  "file": "550e8400-e29b-41d4-a716-446655440000.dwg",
  "ret": "ok"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "ret": "failed",
  "message": "catch error"
}
```

---

### 12. 保存 PDF 到服务器

**接口路径**: `POST /mxcad/savepdf`

**功能说明**: 上传文件并转换保存为 PDF 格式。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名            | 类型          | 必填 | 说明                    |
| ----------------- | ------------- | ---- | ----------------------- |
| file              | File          | 是   | 源文件                  |
| param             | object/string | 否   | 转换参数                |
| param.width       | string        | 否   | PDF 宽度（默认 "2000"） |
| param.height      | string        | 否   | PDF 高度（默认 "2000"） |
| param.colorPolicy | string        | 否   | 颜色策略（默认 "mono"） |

**请求示例**:

```javascript
const formData = new FormData();
formData.append('file', sourceFile);
formData.append(
  'param',
  JSON.stringify({
    width: '3000',
    height: '3000',
    colorPolicy: 'mono',
  })
);
```

#### 返回参数

| 参数名  | 类型   | 说明                          |
| ------- | ------ | ----------------------------- |
| code    | number | 状态码（0: 成功, 其他: 失败） |
| file    | string | 输出的 PDF 文件名             |
| ret     | string | 返回状态 "ok" 或 "failed"     |
| message | string | 可选，错误消息                |

**返回示例（成功）**:

```json
{
  "code": 0,
  "file": "550e8400-e29b-41d4-a716-446655440000.pdf",
  "ret": "ok"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "ret": "failed",
  "message": "catch error"
}
```

---

### 13. 打印为 PDF

**接口路径**: `POST /mxcad/print_to_pdf`

**功能说明**: 上传文件并使用打印方式转换为 PDF。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名            | 类型          | 必填 | 说明                    |
| ----------------- | ------------- | ---- | ----------------------- |
| file              | File          | 是   | 源文件                  |
| param             | object/string | 是   | 打印参数                |
| param.colorPolicy | string        | 否   | 颜色策略（默认 "mono"） |
| param.\*          | any           | 否   | 其他打印参数            |

**请求示例**:

```javascript
const formData = new FormData();
formData.append('file', sourceFile);
formData.append(
  'param',
  JSON.stringify({
    colorPolicy: 'color',
    paperSize: 'A4',
  })
);
```

#### 返回参数

| 参数名  | 类型   | 说明                        |
| ------- | ------ | --------------------------- |
| code    | number | 状态码（0: 成功, -1: 失败） |
| file    | string | 输出的 PDF 文件名           |
| ret     | string | 返回状态 "ok" 或 "failed"   |
| message | string | 可选，错误消息              |

**返回示例（成功）**:

```json
{
  "code": 0,
  "file": "550e8400-e29b-41d4-a716-446655440000.pdf",
  "ret": "ok"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "ret": "failed",
  "message": "param error"
}
```

---

### 14. 裁剪 DWG

**接口路径**: `POST /mxcad/cut_dwg`

**功能说明**: 上传文件并裁剪为 DWG 格式。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名   | 类型          | 必填 | 说明           |
| -------- | ------------- | ---- | -------------- |
| file     | File          | 是   | 源文件         |
| param    | object/string | 是   | 裁剪参数       |
| param.\* | any           | 是   | 裁剪区域等参数 |

**请求示例**:

```javascript
const formData = new FormData();
formData.append('file', sourceFile);
formData.append(
  'param',
  JSON.stringify({
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  })
);
```

#### 返回参数

| 参数名  | 类型   | 说明                        |
| ------- | ------ | --------------------------- |
| code    | number | 状态码（0: 成功, -1: 失败） |
| file    | string | 输出的 DWG 文件名           |
| ret     | string | 返回状态 "ok" 或 "failed"   |
| message | string | 可选，错误消息              |

**返回示例（成功）**:

```json
{
  "code": 0,
  "file": "550e8400-e29b-41d4-a716-446655440000.dwg",
  "ret": "ok"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "ret": "failed",
  "message": "param error"
}
```

---

### 15. 裁剪 MXWEB

**接口路径**: `POST /mxcad/cut_mxweb`

**功能说明**: 上传文件并裁剪为 MXWEB 格式。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名   | 类型          | 必填 | 说明           |
| -------- | ------------- | ---- | -------------- |
| file     | File          | 是   | 源文件         |
| param    | object/string | 是   | 裁剪参数       |
| param.\* | any           | 是   | 裁剪区域等参数 |

**请求示例**:

```javascript
const formData = new FormData();
formData.append('file', sourceFile);
formData.append(
  'param',
  JSON.stringify({
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  })
);
```

#### 返回参数

| 参数名  | 类型   | 说明                        |
| ------- | ------ | --------------------------- |
| code    | number | 状态码（0: 成功, -1: 失败） |
| file    | string | 输出的 MXWEB 文件名         |
| ret     | string | 返回状态 "ok" 或 "failed"   |
| message | string | 可选，错误消息              |

**返回示例（成功）**:

```json
{
  "code": 0,
  "file": "550e8400-e29b-41d4-a716-446655440000.mxweb",
  "ret": "ok"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "ret": "failed",
  "message": "param error"
}
```

---

### 16. 上传图片

**接口路径**: `POST /mxcad/up_image`

**功能说明**: 上传图片文件到服务器，用于插入图纸。

#### 请求参数

**Content-Type**: `multipart/form-data`

| 参数名 | 类型 | 必填 | 说明     |
| ------ | ---- | ---- | -------- |
| file   | File | 是   | 图片文件 |

#### 返回参数

| 参数名  | 类型   | 说明                        |
| ------- | ------ | --------------------------- |
| code    | number | 状态码（0: 成功, -1: 失败） |
| message | string | 返回消息                    |
| file    | string | 保存的文件名（UUID）        |

**返回示例（成功）**:

```json
{
  "code": 0,
  "message": "ok",
  "file": "550e8400-e29b-41d4-a716-446655440000.png"
}
```

**返回示例（失败）**:

```json
{
  "code": -1,
  "message": "catch error"
}
```

---

## 分片上传流程说明

### 1. 客户端流程

```javascript
// 1. 计算文件 MD5 哈希
const fileHash = await calculateMD5(file);

// 2. 检查文件是否已存在
const existResponse = await fetch('/mxcad/files/fileisExist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    filename: file.name,
    fileHash: fileHash,
  }),
});

if (existResponse.ret === 'fileAlreadyExist') {
  // 文件已存在，秒传成功
  return;
}

// 3. 分片上传
const chunkSize = 1024 * 1024; // 1MB
const chunks = Math.ceil(file.size / chunkSize);

for (let i = 0; i < chunks; i++) {
  const start = i * chunkSize;
  const end = Math.min(start + chunkSize, file.size);
  const chunk = file.slice(start, end);

  // 检查分片是否已存在
  const chunkExistResponse = await fetch('/mxcad/files/chunkisExist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chunk: i,
      fileHash: fileHash,
      size: chunk.size,
      chunks: chunks,
      fileName: file.name,
    }),
  });

  if (chunkExistResponse.ret === 'chunkAlreadyExist') {
    continue; // 跳过已存在的分片
  }

  // 上传分片
  const formData = new FormData();
  formData.append('file', chunk);
  formData.append('hash', fileHash);
  formData.append('name', file.name);
  formData.append('size', file.size);
  formData.append('chunk', i);
  formData.append('chunks', chunks);

  await fetch('/mxcad/files/uploadFiles', {
    method: 'POST',
    body: formData,
  });
}
```

### 2. 服务端处理流程

1. **接收分片**: 使用 Multer 中间件接收文件分片
2. **存储分片**: 分片存储在 `chunk_{fileHash}` 临时目录
3. **检查完整性**: 当所有分片上传完成后，自动触发合并
4. **合并文件**: 使用 Stream 方式按顺序合并分片
5. **格式转换**: 调用 MxCAD 转换工具进行格式转换
6. **清理临时文件**: 转换成功后删除临时分片目录
7. **返回结果**: 返回转换结果给客户端

---

## 错误码说明

| 错误码            | 说明         | 解决方案                           |
| ----------------- | ------------ | ---------------------------------- |
| ok                | 操作成功     | -                                  |
| errorparam        | 参数错误     | 检查请求参数是否完整               |
| chunkAlreadyExist | 分片已存在   | 跳过该分片，继续下一个             |
| chunkNoExist      | 分片不存在   | 重新上传该分片                     |
| fileAlreadyExist  | 文件已存在   | 秒传成功，无需再次上传             |
| fileNoExist       | 文件不存在   | 需要上传文件                       |
| convertFileError  | 文件转换错误 | 检查文件格式是否支持，或联系管理员 |

---

## 注意事项

1. **文件哈希计算**: 必须使用 MD5 算法计算文件哈希，确保唯一性
2. **分片大小**: 建议分片大小为 1MB-5MB，过大或过小都会影响性能
3. **并发上传**: 建议控制并发上传数量，避免服务器压力过大
4. **超时设置**: 大文件上传时需要适当增加超时时间
5. **断点续传**: 利用分片检查接口实现断点续传功能
6. **文件格式**: 主要支持 DWG、DXF 等 CAD 格式文件
7. **安全性**: 生产环境需要添加认证和权限验证
8. **存储清理**: 定期清理失败的临时分片文件

---

## 完整上传示例

```javascript
class FileUploader {
  constructor(file, options = {}) {
    this.file = file;
    this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB
    this.concurrency = options.concurrency || 3; // 并发数
    this.baseUrl = options.baseUrl || '/mxcad';
  }

  async calculateMD5() {
    // 使用 SparkMD5 或其他库计算 MD5
    return await md5(this.file);
  }

  async checkFileExist(fileHash) {
    const response = await fetch(`${this.baseUrl}/files/fileisExist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: this.file.name,
        fileHash: fileHash,
      }),
    });
    const data = await response.json();
    return data.ret === 'fileAlreadyExist';
  }

  async checkChunkExist(chunk, fileHash, chunks) {
    const response = await fetch(`${this.baseUrl}/files/chunkisExist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chunk: chunk,
        fileHash: fileHash,
        size: this.chunkSize,
        chunks: chunks,
        fileName: this.file.name,
      }),
    });
    const data = await response.json();
    return data.ret === 'chunkAlreadyExist';
  }

  async uploadChunk(chunk, index, fileHash, totalChunks) {
    const formData = new FormData();
    formData.append('file', chunk);
    formData.append('hash', fileHash);
    formData.append('name', this.file.name);
    formData.append('size', this.file.size);
    formData.append('chunk', index);
    formData.append('chunks', totalChunks);

    const response = await fetch(`${this.baseUrl}/files/uploadFiles`, {
      method: 'POST',
      body: formData,
    });
    return await response.json();
  }

  async upload(onProgress) {
    // 1. 计算文件哈希
    const fileHash = await this.calculateMD5();

    // 2. 检查文件是否已存在
    if (await this.checkFileExist(fileHash)) {
      onProgress && onProgress(100);
      return { success: true, message: '文件已存在，秒传成功' };
    }

    // 3. 分片上传
    const chunks = Math.ceil(this.file.size / this.chunkSize);
    const tasks = [];

    for (let i = 0; i < chunks; i++) {
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, this.file.size);
      const chunk = this.file.slice(start, end);

      tasks.push(async () => {
        // 检查分片是否已存在
        if (await this.checkChunkExist(i, fileHash, chunks)) {
          onProgress && onProgress(((i + 1) / chunks) * 100);
          return;
        }

        // 上传分片
        const result = await this.uploadChunk(chunk, i, fileHash, chunks);
        onProgress && onProgress(((i + 1) / chunks) * 100);
        return result;
      });
    }

    // 并发执行上传任务
    const results = await this.runConcurrent(tasks, this.concurrency);

    // 检查最后一个结果
    const lastResult = results[results.length - 1];
    if (lastResult && lastResult.ret === 'ok') {
      return { success: true, message: '上传成功', tz: lastResult.tz };
    } else {
      return { success: false, message: '上传失败' };
    }
  }

  async runConcurrent(tasks, concurrency) {
    const results = [];
    const executing = [];

    for (const task of tasks) {
      const promise = task().then((result) => {
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });

      results.push(promise);
      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }
}

// 使用示例
const uploader = new FileUploader(file, {
  chunkSize: 2 * 1024 * 1024, // 2MB
  concurrency: 5,
  baseUrl: '/mxcad',
});

await uploader.upload((progress) => {
  console.log(`上传进度: ${progress.toFixed(2)}%`);
});
```

---

## 版本历史

- **v1.0.0** (2025-12-18): 初始版本，完整 API 文档

---

## 联系方式

如有问题或建议，请联系开发团队。
