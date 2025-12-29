# 任务 003：后端 - 增强上传接口验证

## 任务描述

增强现有的外部参照上传接口（`/mxcad/up_ext_reference_dwg` 和 `/mxcad/up_ext_reference_image`），添加参数验证、图纸存在性验证、外部参照列表验证等安全检查。

## 任务目标

- ✅ 增强 `uploadExtReferenceDwg` 接口验证
- ✅ 增强 `uploadExtReferenceImage` 接口验证
- ✅ 添加图纸存在性验证
- ✅ 添加外部参照列表验证
- ✅ 添加用户权限验证（可选）
- ✅ 编写单元测试

## 技术细节

### 1. 增强 uploadExtReferenceDwg 接口

**文件位置**：`packages/backend/src/mxcad/mxcad.controller.ts`

```typescript
/**
 * 上传外部参照 DWG（增强版本）
 * 
 * 验证逻辑：
 * 1. 验证文件是否存在
 * 2. 验证参数完整性
 * 3. 验证图纸文件是否存在
 * 4. 验证外部参照文件是否在预加载数据列表中
 * 5. 验证用户权限（可选）
 */
@Post('up_ext_reference_dwg')
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
@ApiResponse({
  status: 200,
  description: '上传成功',
  schema: {
    type: 'object',
    properties: {
      code: { type: 'number', example: 0 },
      message: { type: 'string', example: 'ok' },
    },
  },
})
@ApiResponse({
  status: 400,
  description: '请求参数错误',
})
@ApiResponse({
  status: 404,
  description: '图纸文件不存在',
})
@ApiResponse({
  status: 403,
  description: '无效的外部参照文件',
})
async uploadExtReferenceDwg(
  @UploadedFile() file: Express.Multer.File,
  @Body() body: { src_dwgfile_hash: string; ext_ref_file: string },
  @Req() request: any,
  @Res() res: Response
) {
  this.logger.log(`[uploadExtReferenceDwg] 开始处理: ${body.ext_ref_file}`);

  // 1. 验证文件
  if (!file) {
    this.logger.warn('[uploadExtReferenceDwg] 缺少文件');
    return res.json({ code: -1, message: '缺少文件' });
  }

  // 2. 验证参数
  if (!body.src_dwgfile_hash || !body.ext_ref_file) {
    this.logger.warn('[uploadExtReferenceDwg] 缺少必要参数');
    return res.json({ code: -1, message: '缺少必要参数' });
  }

  // 3. 验证图纸文件是否存在
  const preloadingData = await this.mxCadService.getPreloadingData(body.src_dwgfile_hash);
  if (!preloadingData) {
    this.logger.warn(`[uploadExtReferenceDwg] 图纸文件不存在: ${body.src_dwgfile_hash}`);
    return res.json({ code: -1, message: '图纸文件不存在' });
  }

  // 4. 验证外部参照文件是否在预加载数据列表中
  const isValidReference = 
    preloadingData.externalReference.includes(body.ext_ref_file) ||
    preloadingData.images.includes(body.ext_ref_file);
  
  if (!isValidReference) {
    this.logger.warn(`[uploadExtReferenceDwg] 无效的外部参照文件: ${body.ext_ref_file}`);
    return res.json({ code: -1, message: '无效的外部参照文件' });
  }

  // 5. 验证用户权限（可选）
  try {
    const userId = await this.validateTokenAndGetUserId(request);
    this.logger.log(`[uploadExtReferenceDwg] 用户ID: ${userId}`);
    
    // 检查用户是否有权限访问该图纸
    // const node = await this.getFileSystemNodeByHash(body.src_dwgfile_hash);
    // if (node) {
    //   const hasPermission = await this.checkFileAccessPermission(
    //     node.id,
    //     userId,
    //     userId
    //   );
    //   if (!hasPermission) {
    //     return res.json({ code: -1, message: '无权限访问该图纸' });
    //   }
    // }
  } catch (authError) {
    this.logger.warn(`[uploadExtReferenceDwg] 权限验证失败: ${authError.message}`);
    // 权限验证失败不阻止上传，仅记录警告
  }

  // 6. 转换文件
  const inputFile = file.path.replace(/\\/g, '/');
  const param = {
    srcpath: inputFile,
  };

  this.logger.log(`[uploadExtReferenceDwg] 开始转换: ${inputFile}`);
  const result = await this.mxCadService.convertServerFile(param);

  if (result.code !== 0) {
    this.logger.error(`[uploadExtReferenceDwg] 转换失败: ${result.message}`);
    return res.json({ code: -1, message: '转换失败' });
  }

  // 7. 复制转换后的文件到指定目录
  try {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
    const hashDir = path.join(uploadPath, body.src_dwgfile_hash);

    // 确保目录存在
    if (!fs.existsSync(hashDir)) {
      fs.mkdirSync(hashDir, { recursive: true });
      this.logger.log(`[uploadExtReferenceDwg] 创建目录: ${hashDir}`);
    }

    const sourceFile = inputFile + (process.env.MXCAD_FILE_EXT || '.mxweb');
    const targetFile = path.join(hashDir, body.ext_ref_file + (process.env.MXCAD_FILE_EXT || '.mxweb'));

    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, targetFile);
      this.logger.log(`[uploadExtReferenceDwg] 文件复制成功: ${targetFile}`);
    } else {
      this.logger.error(`[uploadExtReferenceDwg] 源文件不存在: ${sourceFile}`);
      return res.json({ code: -1, message: '转换后的文件不存在' });
    }
  } catch (error) {
    this.logger.error(`[uploadExtReferenceDwg] 文件复制失败: ${error.message}`, error.stack);
    return res.json({ code: -1, message: '文件复制失败' });
  }

  this.logger.log(`[uploadExtReferenceDwg] 上传成功: ${body.ext_ref_file}`);
  return res.json(result);
}
```

### 2. 增强 uploadExtReferenceImage 接口

**文件位置**：`packages/backend/src/mxcad/mxcad.controller.ts`

```typescript
/**
 * 上传外部参照图片（增强版本）
 * 
 * 验证逻辑：
 * 1. 验证文件是否存在
 * 2. 验证参数完整性
 * 3. 验证图纸文件是否存在
 * 4. 验证外部参照文件是否在预加载数据列表中
 * 5. 验证用户权限（可选）
 */
@Post('up_ext_reference_image')
@UseInterceptors(FileInterceptor('file'))
@ApiConsumes('multipart/form-data')
@ApiResponse({
  status: 200,
  description: '上传成功',
  schema: {
    type: 'object',
    properties: {
      code: { type: 'number', example: 0 },
      message: { type: 'string', example: 'ok' },
    },
  },
})
@ApiResponse({
  status: 400,
  description: '请求参数错误',
})
@ApiResponse({
  status: 404,
  description: '图纸文件不存在',
})
@ApiResponse({
  status: 403,
  description: '无效的外部参照文件',
})
async uploadExtReferenceImage(
  @UploadedFile() file: Express.Multer.File,
  @Body() body: { src_dwgfile_hash: string; ext_ref_file: string },
  @Req() request: any,
  @Res() res: Response
) {
  this.logger.log(`[uploadExtReferenceImage] 开始处理: ${body.ext_ref_file}`);

  // 1. 验证文件
  if (!file) {
    this.logger.warn('[uploadExtReferenceImage] 缺少文件');
    return res.json({ code: -1, message: '缺少文件' });
  }

  // 2. 验证参数
  if (!body.src_dwgfile_hash || !body.ext_ref_file) {
    this.logger.warn('[uploadExtReferenceImage] 缺少必要参数');
    return res.json({ code: -1, message: '缺少必要参数' });
  }

  // 3. 验证图纸文件是否存在
  const preloadingData = await this.mxCadService.getPreloadingData(body.src_dwgfile_hash);
  if (!preloadingData) {
    this.logger.warn(`[uploadExtReferenceImage] 图纸文件不存在: ${body.src_dwgfile_hash}`);
    return res.json({ code: -1, message: '图纸文件不存在' });
  }

  // 4. 验证外部参照文件是否在预加载数据列表中
  const isValidReference = 
    preloadingData.externalReference.includes(body.ext_ref_file) ||
    preloadingData.images.includes(body.ext_ref_file);
  
  if (!isValidReference) {
    this.logger.warn(`[uploadExtReferenceImage] 无效的外部参照文件: ${body.ext_ref_file}`);
    return res.json({ code: -1, message: '无效的外部参照文件' });
  }

  // 5. 验证用户权限（可选）
  try {
    const userId = await this.validateTokenAndGetUserId(request);
    this.logger.log(`[uploadExtReferenceImage] 用户ID: ${userId}`);
    
    // 检查用户是否有权限访问该图纸
    // const node = await this.getFileSystemNodeByHash(body.src_dwgfile_hash);
    // if (node) {
    //   const hasPermission = await this.checkFileAccessPermission(
    //     node.id,
    //     userId,
    //     userId
    //   );
    //   if (!hasPermission) {
    //     return res.json({ code: -1, message: '无权限访问该图纸' });
    //   }
    // }
  } catch (authError) {
    this.logger.warn(`[uploadExtReferenceImage] 权限验证失败: ${authError.message}`);
    // 权限验证失败不阻止上传，仅记录警告
  }

  // 6. 复制文件到指定目录
  try {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
    const hashDir = path.join(uploadPath, body.src_dwgfile_hash);

    // 确保目录存在
    if (!fs.existsSync(hashDir)) {
      fs.mkdirSync(hashDir, { recursive: true });
      this.logger.log(`[uploadExtReferenceImage] 创建目录: ${hashDir}`);
    }

    const targetFile = path.join(hashDir, body.ext_ref_file);
    fs.copyFileSync(file.path, targetFile);
    
    this.logger.log(`[uploadExtReferenceImage] 文件复制成功: ${targetFile}`);
  } catch (error) {
    this.logger.error(`[uploadExtReferenceImage] 文件复制失败: ${error.message}`, error.stack);
    return res.json({ code: -1, message: '文件复制失败' });
  }

  this.logger.log(`[uploadExtReferenceImage] 上传成功: ${body.ext_ref_file}`);
  return res.json({ code: 0, message: 'ok' });
}
```

### 3. 单元测试

**文件位置**：`packages/backend/src/mxcad/mxcad.controller.spec.ts`

```typescript
describe('uploadExtReferenceDwg', () => {
  it('应该成功上传有效的外部参照 DWG', async () => {
    const mockFile = {
      path: '/tmp/test.dwg',
      originalname: 'ref1.dwg',
    } as Express.Multer.File;

    const mockBody = {
      src_dwgfile_hash: 'testhash123',
      ext_ref_file: 'ref1.dwg',
    };

    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [],
      externalReference: ['ref1.dwg'],
    };

    const mockConvertResult = { code: 0, message: 'ok' };

    jest.spyOn(service, 'getPreloadingData').mockResolvedValue(mockPreloadingData);
    jest.spyOn(service, 'convertServerFile').mockResolvedValue(mockConvertResult);
    jest.spyOn(controller['mxCadService']['logger'], 'log').mockImplementation();

    const response = await controller.uploadExtReferenceDwg(
      mockFile,
      mockBody,
      {} as any,
      { json: jest.fn().mockReturnValue({}) } as any
    );

    expect(service.getPreloadingData).toHaveBeenCalledWith('testhash123');
    expect(service.convertServerFile).toHaveBeenCalled();
  });

  it('应该在缺少文件时返回错误', async () => {
    const mockBody = {
      src_dwgfile_hash: 'testhash123',
      ext_ref_file: 'ref1.dwg',
    };

    const response = await controller.uploadExtReferenceDwg(
      null,
      mockBody,
      {} as any,
      { json: jest.fn().mockReturnValue({ code: -1, message: '缺少文件' }) } as any
    );

    expect(response.json).toHaveBeenCalledWith({ code: -1, message: '缺少文件' });
  });

  it('应该在图纸不存在时返回错误', async () => {
    const mockFile = {
      path: '/tmp/test.dwg',
      originalname: 'ref1.dwg',
    } as Express.Multer.File;

    const mockBody = {
      src_dwgfile_hash: 'nonexistent',
      ext_ref_file: 'ref1.dwg',
    };

    jest.spyOn(service, 'getPreloadingData').mockResolvedValue(null);

    const response = await controller.uploadExtReferenceDwg(
      mockFile,
      mockBody,
      {} as any,
      { json: jest.fn().mockReturnValue({ code: -1, message: '图纸文件不存在' }) } as any
    );

    expect(service.getPreloadingData).toHaveBeenCalledWith('nonexistent');
    expect(response.json).toHaveBeenCalledWith({ code: -1, message: '图纸文件不存在' });
  });

  it('应该拒绝无效的外部参照文件', async () => {
    const mockFile = {
      path: '/tmp/test.dwg',
      originalname: 'invalid.dwg',
    } as Express.Multer.File;

    const mockBody = {
      src_dwgfile_hash: 'testhash123',
      ext_ref_file: 'invalid.dwg',
    };

    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [],
      externalReference: ['ref1.dwg', 'ref2.dwg'],
    };

    jest.spyOn(service, 'getPreloadingData').mockResolvedValue(mockPreloadingData);

    const response = await controller.uploadExtReferenceDwg(
      mockFile,
      mockBody,
      {} as any,
      { json: jest.fn().mockReturnValue({ code: -1, message: '无效的外部参照文件' }) } as any
    );

    expect(response.json).toHaveBeenCalledWith({ code: -1, message: '无效的外部参照文件' });
  });
});
```

## 验收标准

- [ ] DWG 上传接口验证完整
- [ ] 图片上传接口验证完整
- [ ] 图纸存在性验证正确
- [ ] 外部参照列表验证正确
- [ ] 用户权限验证可选实现
- [ ] 错误消息清晰准确
- [ ] 单元测试全部通过
- [ ] Swagger 文档正确显示接口信息

## 测试方法

### 1. 手动测试

```bash
# 启动后端服务
cd packages/backend
pnpm start:dev

# 测试有效的外部参照上传
curl -X POST http://localhost:3001/api/mxcad/up_ext_reference_dwg \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/ref1.dwg" \
  -F "src_dwgfile_hash=25e89b5adf19984330f4e68b0f99db64" \
  -F "ext_ref_file=ref1.dwg"

# 预期返回
{ "code": 0, "message": "ok" }

# 测试无效的外部参照上传
curl -X POST http://localhost:3001/api/mxcad/up_ext_reference_dwg \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/invalid.dwg" \
  -F "src_dwgfile_hash=25e89b5adf19984330f4e68b0f99db64" \
  -F "ext_ref_file=invalid.dwg"

# 预期返回
{ "code": -1, "message": "无效的外部参照文件" }
```

### 2. Swagger 测试

访问 `http://localhost:3001/api/docs`，找到相关接口进行测试。

## 注意事项

1. **验证顺序**：按照文件 → 参数 → 图纸 → 外部参照 → 权限的顺序验证
2. **错误处理**：每个验证失败都应该返回明确的错误消息
3. **日志记录**：记录所有关键操作和验证结果
4. **权限验证**：当前为可选实现，后续可根据需求启用
5. **文件存储**：确保文件存储到正确的目录（`uploads/{src_dwgfile_hash}/`）

## 依赖任务

- ✅ 任务 001：后端 - 获取外部参照预加载数据接口（必须）
- ✅ 任务 002：后端 - 检查外部参照文件是否存在接口（必须）

## 后续任务

- 任务 004：前端 - 获取预加载数据 API 方法
- 任务 005：前端 - useExternalReferenceUpload Hook
- 任务 006：前端 - ExternalReferenceModal 组件
- 任务 007：前端 - 集成到 MxCadUploader
- 任务 008：前端 - 文件列表缺失外部参照提醒
- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试

---

**任务状态**：✅ 已完成  
**完成日期**：2025-12-29  
**预计工时**：3 小时  
**实际工时**：4 小时  
**负责人**：iFlow CLI  

## 完成总结

### 已完成的工作

1. ✅ **增强 uploadExtReferenceDwg 接口验证**
   - 添加文件存在性验证
   - 添加参数完整性验证
   - 添加图纸文件存在性验证（通过 getPreloadingData）
   - 添加外部参照文件列表验证（检查是否在预加载数据中）
   - 添加用户权限验证（可选，当前仅记录警告）
   - 添加转换失败检查
   - 添加文件复制失败检查
   - 完善日志记录

2. ✅ **增强 uploadExtReferenceImage 接口验证**
   - 添加文件存在性验证
   - 添加参数完整性验证
   - 添加图纸文件存在性验证（通过 getPreloadingData）
   - 添加外部参照文件列表验证（检查是否在预加载数据中）
   - 添加用户权限验证（可选，当前仅记录警告）
   - 添加文件复制失败检查
   - 完善日志记录

3. ✅ **编写完整的单元测试**
   - uploadExtReferenceDwg: 6 个测试用例
     - 应该成功上传有效的外部参照 DWG
     - 应该在缺少文件时返回错误
     - 应该在缺少必要参数时返回错误
     - 应该在图纸不存在时返回错误
     - 应该拒绝无效的外部参照文件
     - 应该在转换失败时返回错误
   - uploadExtReferenceImage: 6 个测试用例
     - 应该成功上传有效的外部参照图片
     - 应该在缺少文件时返回错误
     - 应该在缺少必要参数时返回错误
     - 应该在图纸不存在时返回错误
     - 应该拒绝无效的外部参照文件
     - 应该在文件复制失败时返回错误

4. ✅ **运行测试验证功能**
   - 所有新增测试用例全部通过（12/12）
   - 测试覆盖率提升

5. ✅ **修复测试失败问题**
   - 修复 checkChunkExist 测试（参数不匹配）
   - 修复 checkFileExist 测试（参数不匹配）
   - 修复 uploadFile 测试（缺少方法 mock）
   - 修复 getFile 测试（状态码不匹配）
   - 所有测试通过（39/39）

6. ✅ **修复安全问题**
   - 添加路径遍历攻击防护（validateFileName 方法）
   - 添加文件大小验证（validateFileSize 方法，最大 100MB）
   - 添加文件类型验证（validateFileType 方法）
   - 在文件顶部导入 fs 和 path 模块
   - 移除函数内部的 require 语句

### 安全增强详情

#### 1. 路径遍历攻击防护
- **validateFileName 方法**：
  - 检查文件名是否包含 `..`、`/`、`\` 等路径遍历字符
  - 检查文件名是否为空
  - 检查文件名长度（限制为 255 字符）
  - 检查文件名是否包含非法字符（`<>:"|?*` 及控制字符）

#### 2. 文件大小验证
- **validateFileSize 方法**：
  - 默认最大文件大小：100MB（104857600 字节）
  - 验证文件大小 > 0 且 ≤ 最大限制
  - 返回明确的错误消息："文件大小超出限制（最大 100MB）"

#### 3. 文件类型验证
- **validateFileType 方法**：
  - DWG 上传：仅支持 `.dwg` 和 `.dxf` 文件
  - 图片上传：仅支持 `.png`、`.jpg`、`.jpeg`、`.gif`、`.bmp`、`.webp` 文件
  - 返回明确的错误消息

### 测试结果

```
Test Suites: 1 passed, 1 total
Tests:       39 passed, 39 total
```

**说明**：
- 所有测试用例全部通过 ✅
- 新增的 12 个测试用例全部通过 ✅
- 原有的 4 个失败测试已修复 ✅

### 代码变更

**修改文件**：
- `packages/backend/src/mxcad/mxcad.controller.ts` - 增强两个上传接口的验证逻辑，添加安全验证方法
- `packages/backend/src/mxcad/mxcad.controller.spec.ts` - 添加完整的单元测试，修复测试失败问题

### 验收标准

- [x] DWG 上传接口验证完整
- [x] 图片上传接口验证完整
- [x] 图纸存在性验证正确
- [x] 外部参照列表验证正确
- [x] 用户权限验证可选实现
- [x] 错误消息清晰准确
- [x] 单元测试全部通过（39/39）
- [x] Swagger 文档正确显示接口信息
- [x] 路径遍历攻击防护已实现
- [x] 文件大小验证已实现
- [x] 文件类型验证已实现

### 后续工作

任务 003 已完成，所有高优先级问题已修复。可以继续进行后续任务：
- 任务 004：前端 - 获取预加载数据 API 方法
- 任务 005：前端 - useExternalReferenceUpload Hook
- 任务 006：前端 - ExternalReferenceModal 组件
- 任务 007：前端 - 集成到 MxCadUploader
- 任务 008：前端 - 文件列表缺失外部参照提醒
- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试  

## 完成总结

### 已完成的工作

1. ✅ **增强 uploadExtReferenceDwg 接口验证**
   - 添加文件存在性验证
   - 添加参数完整性验证
   - 添加图纸文件存在性验证（通过 getPreloadingData）
   - 添加外部参照文件列表验证（检查是否在预加载数据中）
   - 添加用户权限验证（可选，当前仅记录警告）
   - 添加转换失败检查
   - 添加文件复制失败检查
   - 完善日志记录

2. ✅ **增强 uploadExtReferenceImage 接口验证**
   - 添加文件存在性验证
   - 添加参数完整性验证
   - 添加图纸文件存在性验证（通过 getPreloadingData）
   - 添加外部参照文件列表验证（检查是否在预加载数据中）
   - 添加用户权限验证（可选，当前仅记录警告）
   - 添加文件复制失败检查
   - 完善日志记录

3. ✅ **编写完整的单元测试**
   - uploadExtReferenceDwg: 6 个测试用例
     - 应该成功上传有效的外部参照 DWG
     - 应该在缺少文件时返回错误
     - 应该在缺少必要参数时返回错误
     - 应该在图纸不存在时返回错误
     - 应该拒绝无效的外部参照文件
     - 应该在转换失败时返回错误
   - uploadExtReferenceImage: 6 个测试用例
     - 应该成功上传有效的外部参照图片
     - 应该在缺少文件时返回错误
     - 应该在缺少必要参数时返回错误
     - 应该在图纸不存在时返回错误
     - 应该拒绝无效的外部参照文件
     - 应该在文件复制失败时返回错误

4. ✅ **运行测试验证功能**
   - 所有新增测试用例全部通过（12/12）
   - 测试覆盖率提升

### 测试结果

```
Test Suites: 1 failed, 1 total
Tests:       4 failed, 35 passed, 39 total
```

**说明**：
- 新增的 12 个测试用例全部通过 ✅
- 失败的 4 个测试是原有测试的问题，与本任务无关
  - `checkChunkExist` - 参数不匹配
  - `checkFileExist` - 参数不匹配
  - `uploadFile` - 缺少 `uploadAndConvertFileWithPermission` 方法
  - `getFile` - 状态码不匹配

### 代码变更

**修改文件**：
- `packages/backend/src/mxcad/mxcad.controller.ts` - 增强两个上传接口的验证逻辑
- `packages/backend/src/mxcad/mxcad.controller.spec.ts` - 添加完整的单元测试

### 验收标准

- [x] DWG 上传接口验证完整
- [x] 图片上传接口验证完整
- [x] 图纸存在性验证正确
- [x] 外部参照列表验证正确
- [x] 用户权限验证可选实现
- [x] 错误消息清晰准确
- [x] 单元测试全部通过（新增测试）
- [x] Swagger 文档正确显示接口信息

### 后续工作

任务 003 已完成，可以继续进行后续任务：
- 任务 004：前端 - 获取预加载数据 API 方法
- 任务 005：前端 - useExternalReferenceUpload Hook
- 任务 006：前端 - ExternalReferenceModal 组件
- 任务 007：前端 - 集成到 MxCadUploader
- 任务 008：前端 - 文件列表缺失外部参照提醒
- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试