# 任务 001：后端 - 获取外部参照预加载数据接口

## 任务描述

实现后端接口，用于获取图纸的外部参照预加载数据（`*_preloading.json` 文件内容）。

## 任务目标

- ✅ 新增 DTO：`PreloadingDataDto`
- ✅ 新增 Service 方法：`getPreloadingData(fileHash: string)`
- ✅ 新增 Controller 接口：`GET /mxcad/file/:hash/preloading`
- ✅ 编写单元测试

## 技术细节

### 1. 新增 DTO

**文件位置**：`packages/backend/src/mxcad/dto/preloading-data.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsArray } from 'class-validator';

export class PreloadingDataDto {
  @ApiProperty({ description: '是否为图纸' })
  @IsBoolean()
  tz: boolean;

  @ApiProperty({ description: '源文件哈希值' })
  @IsString()
  src_file_md5: string;

  @ApiProperty({ description: '图片列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiProperty({ description: '外部参照列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  externalReference: string[];
}
```

### 2. 新增 Service 方法

**文件位置**：`packages/backend/src/mxcad/mxcad.service.ts`

```typescript
/**
 * 获取外部参照预加载数据
 * @param fileHash 文件哈希值
 * @returns 预加载数据，如果文件不存在则返回 null
 */
async getPreloadingData(fileHash: string): Promise<PreloadingDataDto | null> {
  try {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = this.configService.get('MXCAD_UPLOAD_PATH') || path.join(process.cwd(), 'uploads');
    
    // 查找所有以 fileHash 开头的文件
    const files = await fs.promises.readdir(uploadPath);
    const preloadingFile = files.find(file => 
      file.startsWith(fileHash) && file.endsWith('_preloading.json')
    );
    
    if (!preloadingFile) {
      this.logger.log(`预加载数据文件不存在: ${fileHash}`);
      return null;
    }
    
    const filePath = path.join(uploadPath, preloadingFile);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    this.logger.log(`成功获取预加载数据: ${fileHash}, 外部参照数: ${data.externalReference?.length || 0}, 图片数: ${data.images?.length || 0}`);
    
    return data;
  } catch (error) {
    this.logger.error(`获取预加载数据失败: ${error.message}`, error.stack);
    return null;
  }
}
```

### 3. 新增 Controller 接口

**文件位置**：`packages/backend/src/mxcad/mxcad.controller.ts`

```typescript
import { PreloadingDataDto } from './dto/preloading-data.dto';

/**
 * 获取外部参照预加载数据
 * 
 * @param fileHash 文件哈希值
 * @returns 预加载数据或错误信息
 */
@Get('file/:hash/preloading')
@ApiResponse({
  status: 200,
  description: '成功获取预加载数据',
  type: PreloadingDataDto,
})
@ApiResponse({
  status: 404,
  description: '预加载数据不存在',
  schema: {
    type: 'object',
    properties: {
      code: { type: 'number', example: -1 },
      message: { type: 'string', example: '预加载数据不存在' },
    },
  },
})
async getPreloadingData(@Param('hash') fileHash: string, @Res() res: Response) {
  this.logger.log(`[getPreloadingData] 请求参数: fileHash=${fileHash}`);
  
  const data = await this.mxCadService.getPreloadingData(fileHash);
  
  if (!data) {
    this.logger.warn(`[getPreloadingData] 预加载数据不存在: ${fileHash}`);
    return res.status(404).json({ code: -1, message: '预加载数据不存在' });
  }
  
  this.logger.log(`[getPreloadingData] 成功返回预加载数据: ${fileHash}`);
  return res.json(data);
}
```

### 4. 单元测试

**文件位置**：`packages/backend/src/mxcad/mxcad.service.spec.ts`

```typescript
describe('getPreloadingData', () => {
  it('应该成功获取预加载数据', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png', 'image2.jpg'],
      externalReference: ['ref1.dwg', 'ref2.dwg'],
    };

    // Mock 文件系统操作
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([
      'testhash123.dwg.mxweb',
      'testhash123.dwg.mxweb_preloading.json',
    ]);
    jest.spyOn(fs.promises, 'readFile').mockResolvedValue(
      JSON.stringify(mockPreloadingData)
    );

    const result = await service.getPreloadingData('testhash123');

    expect(result).toEqual(mockPreloadingData);
  });

  it('应该在文件不存在时返回 null', async () => {
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue([]);

    const result = await service.getPreloadingData('nonexistent');

    expect(result).toBeNull();
  });

  it('应该在读取失败时返回 null', async () => {
    jest.spyOn(fs.promises, 'readdir').mockRejectedValue(new Error('Read error'));

    const result = await service.getPreloadingData('errorhash');

    expect(result).toBeNull();
  });
});
```

## 验收标准

- [ ] DTO 定义完整，包含所有必要字段
- [ ] Service 方法能正确读取 `*_preloading.json` 文件
- [ ] Controller 接口返回正确的数据格式
- [ ] 文件不存在时返回 404 状态码
- [ ] 单元测试全部通过
- [ ] Swagger 文档正确显示接口信息

## 测试方法

### 1. 手动测试

```bash
# 启动后端服务
cd packages/backend
pnpm start:dev

# 使用 curl 测试
curl http://localhost:3001/api/mxcad/file/25e89b5adf19984330f4e68b0f99db64/preloading

# 预期返回
{
  "tz": false,
  "src_file_md5": "25e89b5adf19984330f4e68b0f99db64",
  "images": [],
  "externalReference": []
}
```

### 2. Swagger 测试

访问 `http://localhost:3001/api/docs`，找到 `GET /mxcad/file/{hash}/preloading` 接口进行测试。

## 注意事项

1. **文件路径**：确保 `MXCAD_UPLOAD_PATH` 环境变量正确配置
2. **文件命名**：预加载数据文件格式为 `{hash}.{extension}.mxweb_preloading.json`
3. **错误处理**：文件不存在或读取失败时返回 null，不抛出异常
4. **日志记录**：记录关键操作和错误信息，便于调试

## 依赖任务

无前置依赖，可独立完成。

## 后续任务

- 任务 002：后端 - 检查外部参照文件是否存在接口
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