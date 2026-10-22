///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from '@nestjs/common';
import { CustomValidationPipe } from './validation.pipe';
import { SaveLibraryNodeDto } from '../../library/dto/save-library-node.dto';
import { SubmitConversionTaskDto } from '../../mxcad/conversion/dto/conversion-task.dto';

// 回归：请求 DTO 必须能穿过仓库唯一的全局校验管道。
//
// 根因是 whitelist + forbidNonWhitelisted 下「零 class-validator 约束」= 每个字段
// 都被判「未白名单属性」→ 400，连空 body 也 400。@ApiProperty 一条约束都不注册。
//
// 历史上两次漏检（cache-architecture 6 个 DTO、library/conversion 2 个 DTO）都因为
// spec 没挂这个管道。所以这里直接用真实的 CustomValidationPipe 断言，不复用 mock。
const pipe = new CustomValidationPipe();

const asBody = async (metatype: any, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype } as any);

describe('请求 DTO 必须能通过全局校验管道', () => {
  describe('SaveLibraryNodeDto（multipart 图纸库/图块库覆盖保存）', () => {
    it('multer diskStorage 真实形态通过', async () => {
      await expect(
        asBody(SaveLibraryNodeDto, {
          file: {
            fieldname: 'file',
            originalname: 'drawing.mxweb',
            encoding: '7bit',
            mimetype: 'application/octet-stream',
            destination: '/tmp/uploads',
            filename: '01a2b3c4d5.mxweb',
            path: '/tmp/uploads/01a2b3c4d5.mxweb',
            size: 4096,
          },
        })
      ).resolves.toBeDefined();
    });

    it('未带 file（可选）也通过', async () => {
      await expect(asBody(SaveLibraryNodeDto, {})).resolves.toBeDefined();
    });
  });

  describe('SubmitConversionTaskDto（统一提交转换任务）', () => {
    it('打开类型（PC 转换面板真实载荷）通过', async () => {
      await expect(
        asBody(SubmitConversionTaskDto, {
          type: 'open',
          target: { nodeId: 'node-1' },
          priority: 1,
        })
      ).resolves.toBeDefined();
    });

    it('下载类型（历史版本 + 格式，无 priority）通过', async () => {
      await expect(
        asBody(SubmitConversionTaskDto, {
          type: 'download',
          target: { version: 'v3', format: 'pdf' },
        })
      ).resolves.toBeDefined();
    });

    it('非法 type 被拒绝', async () => {
      await expect(
        asBody(SubmitConversionTaskDto, { type: 'recompress', target: {} })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('越界 priority 被拒绝', async () => {
      await expect(
        asBody(SubmitConversionTaskDto, {
          type: 'open',
          target: { nodeId: 'node-1' },
          priority: 9,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
