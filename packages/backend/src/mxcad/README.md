# MxCAD 文件上传与转换服务

## 概述

MxCAD 模块提供了完整的 CAD 文件上传、分片上传、断点续传和格式转换功能。该模块兼容原有的 MxCAD-App 前端应用的接口规范。

## 功能特性

- ✅ 分片上传与断点续传
- ✅ 文件去重（基于 MD5 哈希）
- ✅ 自动格式转换（DWG/DXF → MXWEB）
- ✅ 多种输出格式支持（PDF、JPG 等）
- ✅ 外部参照文件处理
- ✅ 图片上传功能

## 接口列表

所有接口基于 `/mxcad` 前缀：

### 文件上传相关

- `POST /mxcad/files/chunkisExist` - 检查分片是否存在
- `POST /mxcad/files/fileisExist` - 检查文件是否存在
- `POST /mxcad/files/tz` - 检查图纸状态
- `POST /mxcad/files/uploadFiles` - 上传文件（支持分片）
- `POST /mxcad/files/testupfile` - 测试上传文件

### 文件转换相关

- `POST /mxcad/convert` - 转换服务器文件
- `POST /mxcad/upfile` - 上传并转换文件
- `POST /mxcad/savemxweb` - 保存 MXWEB 到服务器
- `POST /mxcad/savedwg` - 保存 DWG 到服务器
- `POST /mxcad/savepdf` - 保存 PDF 到服务器
- `POST /mxcad/print_to_pdf` - 打印为 PDF
- `POST /mxcad/cut_dwg` - 裁剪 DWG
- `POST /mxcad/cut_mxweb` - 裁剪 MXWEB

### 外部参照相关

- `POST /mxcad/up_ext_reference_dwg` - 上传外部参照 DWG
- `POST /mxcad/up_ext_reference_image` - 上传外部参照图片

### 其他功能

- `POST /mxcad/up_image` - 上传图片

## 环境配置

在 `.env` 文件中添加以下配置：

```env
# MxCAD 转换服务配置（Windows 平台）
MXCAD_ASSEMBLY_PATH=D:\web\MxCADOnline\cloudcad\mxcadassembly\windows\release\mxcadassembly.exe
MXCAD_UPLOAD_PATH=D:\web\MxCADOnline\cloudcad\uploads
MXCAD_TEMP_PATH=D:\web\MxCADOnline\cloudcad\temp
MXCAD_FILE_EXT=.mxweb
MXCAD_COMPRESSION=true
```

## 使用示例

### 分片上传流程

```javascript
// 1. 计算文件 MD5
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
  // 检查分片是否已存在
  const chunkExistResponse = await fetch('/mxcad/files/chunkisExist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chunk: i,
      fileHash: fileHash,
      size: chunkSize,
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

### 转换服务器文件

```javascript
const response = await fetch('/mxcad/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    param: {
      srcpath: '/path/to/file.dwg',
      async: 'true',
      resultposturl: 'https://example.com/callback',
    },
  }),
});
```

## 返回状态码

| 状态码            | 说明         |
| ----------------- | ------------ |
| ok                | 操作成功     |
| errorparam        | 参数错误     |
| chunkAlreadyExist | 分片已存在   |
| chunkNoExist      | 分片不存在   |
| fileAlreadyExist  | 文件已存在   |
| fileNoExist       | 文件不存在   |
| convertFileError  | 文件转换错误 |

## 注意事项

1. **Windows 平台**：MxCAD 转换工具仅支持 Windows 平台
2. **文件格式**：主要支持 DWG、DXF 等 CAD 格式文件
3. **分片大小**：建议分片大小为 1MB-5MB
4. **并发上传**：建议控制并发上传数量，避免服务器压力过大
5. **目录权限**：确保上传和临时目录有足够的读写权限

## 故障排查

### 转换失败

- 检查 `MXCAD_ASSEMBLY_PATH` 是否正确
- 确认 mxcadassembly.exe 文件存在且可执行
- 查看服务器日志获取详细错误信息

### 上传失败

- 检查 `MXCAD_UPLOAD_PATH` 和 `MXCAD_TEMP_PATH` 目录权限
- 确认磁盘空间充足
- 检查文件大小是否超限

### 性能优化

- 调整分片大小以平衡上传速度和服务器压力
- 使用 CDN 加速文件上传
- 定期清理临时文件和失效的分片
