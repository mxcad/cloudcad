# 任务 002：后端 - 检查外部参照文件是否存在接口

## 任务描述

实现后端接口，用于检查指定的外部参照文件是否已存在于图纸目录中。

## 任务目标

- ✅ 新增 Service 方法：`checkExternalReferenceExists(fileHash: string, fileName: string)`
- ✅ 新增 Controller 接口：`POST /mxcad/file/:hash/check-reference`
- ✅ 编写单元测试

## 技术细节

### 1. 新增 Service 方法

**文件位置**：`packages/backend/src/mxcad/mxcad.service.ts`

```typescript
/**
 * 检查外部参照文件是否存在
 * 
 * @param fileHash 源图纸文件的哈希值
 * @param fileName 外部参照文件名
 * @returns 文件是否存在
 */
async checkExternalReferenceExists(
  fileHash: string,
  fileName: string
): Promise<boolean> {
  try {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
    const hashDir = path.join(uploadPath, fileHash);
    
    // 检查哈希目录是否存在
    if (!fs.existsSync(hashDir)) {
      this.logger.log(`[checkExternalReferenceExists] 目录不存在: ${hashDir}`);
      return false;
    }
    
    // 读取目录中的所有文件
    const files = await fs.promises.readdir(hashDir);
    
    // 提取文件名的基本部分（不含扩展名）
    const baseName = path.basename(fileName, path.extname(fileName));
    
    // 检查是否存在匹配的文件
    // DWG 文件会被转换为 .mxweb，所以需要检查 .mxweb 文件
    // 图片文件保持原扩展名
    const exists = files.some(file => {
      const fileBaseName = path.basename(file, path.extname(file));
      return fileBaseName === baseName;
    });
    
    this.logger.log(`[checkExternalReferenceExists] fileHash=${fileHash}, fileName=${fileName}, exists=${exists}`);
    
    return exists;
  } catch (error) {
    this.logger.error(`[checkExternalReferenceExists] 检查失败: ${error.message}`, error.stack);
    return false;
  }
}
```

### 2. 新增 Controller 接口

**文件位置**：`packages/backend/src/mxcad/mxcad.controller.ts`

```typescript
/**
 * 检查外部参照文件是否存在
 * 
 * @param fileHash 源图纸文件的哈希值
 * @param body 请求体，包含 fileName 字段
 * @returns 文件是否存在
 */
@Post('file/:hash/check-reference')
@ApiResponse({
  status: 200,
  description: '成功检查文件存在性',
  schema: {
    type: 'object',
    properties: {
      exists: { type: 'boolean', description: '文件是否存在' },
    },
  },
})
@ApiResponse({
  status: 400,
  description: '请求参数错误',
  schema: {
    type: 'object',
    properties: {
      code: { type: 'number', example: -1 },
      message: { type: 'string', example: '缺少必要参数' },
    },
  },
})
async checkExternalReference(
  @Param('hash') fileHash: string,
  @Body() body: { fileName: string },
  @Res() res: Response
) {
  this.logger.log(`[checkExternalReference] 请求参数: fileHash=${fileHash}, fileName=${body.fileName}`);
  
  // 验证参数
  if (!body.fileName) {
    return res.status(400).json({ code: -1, message: '缺少必要参数: fileName' });
  }
  
  const exists = await this.mxCadService.checkExternalReferenceExists(
    fileHash,
    body.fileName
  );
  
  this.logger.log(`[checkExternalReference] 检查结果: ${exists}`);
  
  return res.json({ exists });
}
```

### 3. 单元测试

**文件位置**：`packages/backend/src/mxcad/mxcad.service.spec.ts`

```typescript
describe('checkExternalReferenceExists', () => {
  it('应该在文件存在时返回 true', async () => {
    const mockFiles = [
      '25e89b5adf19984330f4e68b0f99db64.dwg.mxweb',
      '25e89b5adf19984330f4e68b0f99db64.dwg.mxweb_preloading.json',
      'ref1.dwg.mxweb',
      'image1.png',
    ];

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue(mockFiles);

    // 检查 DWG 文件（已转换为 mxweb）
    const dwgExists = await service.checkExternalReferenceExists(
      '25e89b5adf19984330f4e68b0f99db64',
      'ref1.dwg'
    );
    expect(dwgExists).toBe(true);

    // 检查图片文件
    const imgExists = await service.checkExternalReferenceExists(
      '25e89b5adf19984330f4e68b0f99db64',
      'image1.png'
    );
    expect(imgExists).toBe(true);
  });

  it('应该在文件不存在时返回 false', async () => {
    const mockFiles = [
      '25e89b5adf19984330f4e68b0f99db64.dwg.mxweb',
    ];

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue(mockFiles);

    const exists = await service.checkExternalReferenceExists(
      '25e89b5adf19984330f4e68b0f99db64',
      'nonexistent.dwg'
    );

    expect(exists).toBe(false);
  });

  it('应该在目录不存在时返回 false', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const exists = await service.checkExternalReferenceExists(
      'nonexistent',
      'ref1.dwg'
    );

    expect(exists).toBe(false);
  });

  it('应该在读取失败时返回 false', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs.promises, 'readdir').mockRejectedValue(new Error('Read error'));

    const exists = await service.checkExternalReferenceExists(
      '25e89b5adf19984330f4e68b0f99db64',
      'ref1.dwg'
    );

    expect(exists).toBe(false);
  });
});
```

## 验收标准

- [ ] Service 方法能正确检查文件是否存在
- [ ] 支持 DWG 文件（检查 .mxweb 格式）
- [ ] 支持图片文件（检查原扩展名）
- [ ] Controller 接口返回正确的数据格式
- [ ] 参数验证完整
- [ ] 单元测试全部通过
- [ ] Swagger 文档正确显示接口信息

## 测试方法

### 1. 手动测试

```bash
# 启动后端服务
cd packages/backend
pnpm start:dev

# 测试存在的文件
curl -X POST http://localhost:3001/api/mxcad/file/25e89b5adf19984330f4e68b0f99db64/check-reference \
  -H "Content-Type: application/json" \
  -d '{"fileName": "ref1.dwg"}'

# 预期返回
{ "exists": true }

# 测试不存在的文件
curl -X POST http://localhost:3001/api/mxcad/file/25e89b5adf19984330f4e68b0f99db64/check-reference \
  -H "Content-Type: application/json" \
  -d '{"fileName": "nonexistent.dwg"}'

# 预期返回
{ "exists": false }
```

### 2. Swagger 测试

访问 `http://localhost:3001/api/docs`，找到 `POST /mxcad/file/{hash}/check-reference` 接口进行测试。

## 注意事项

1. **文件匹配逻辑**：
   - DWG 文件：检查 `{baseName}.mxweb` 是否存在
   - 图片文件：检查 `{fileName}` 是否存在（原扩展名）
2. **目录结构**：外部参照文件存储在 `uploads/{fileHash}/` 目录下
3. **错误处理**：目录不存在或读取失败时返回 false，不抛出异常
4. **日志记录**：记录检查结果，便于调试

## 依赖任务

- ✅ 任务 001：后端 - 获取外部参照预加载数据接口（必须）

## 后续任务

- 任务 003：后端 - 增强上传接口验证
- 任务 004：前端 - 获取预加载数据 API 方法
- 任务 005：前端 - useExternalReferenceUpload Hook
- 任务 006：前端 - ExternalReferenceModal 组件
- 任务 007：前端 - 集成到 MxCadUploader
- 任务 008：前端 - 文件列表缺失外部参照提醒
- 任务 009：前端 - 随时上传外部参照功能
- 任务 010：集成测试

---

**任务状态**：⬜ 待开始  
**预计工时**：2 小时  
**负责人**：待分配  
**创建日期**：2025-12-29