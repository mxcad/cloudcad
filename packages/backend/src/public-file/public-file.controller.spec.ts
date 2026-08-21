import { BadRequestException } from '@nestjs/common';
import { VipFeatureRequiredException } from '../vip/errors/vip-feature-required.error';
import { PublicFileController } from './public-file.controller';
import type { MxCadRequest } from '../mxcad/types/request.types';

/**
 * convertAndDownload 业务异常语义测试：
 * - VipFeatureRequiredException（导出下载会员门控）必须保持 403 原样透传（前端弹购买引导），
 *   不得折叠为 400（否则前端拿不到 VIP_FEATURE_REQUIRED 业务码）
 * - 其他转换失败折叠为 400 BadRequestException
 */
describe('PublicFileController.convertAndDownload', () => {
  const createController = (convertMock: jest.Mock) => {
    const service = {
      convertMxwebByHash: convertMock,
    } as unknown as PublicFileController['publicFileService'];
    const runtimeConfigService = {} as unknown as PublicFileController['runtimeConfigService'];
    const requestContextBuilder = {
      buildContextFromRequest: jest.fn().mockResolvedValue({ ip: '1.2.3.4' }),
    } as unknown as PublicFileController['requestContextBuilder'];
    return new PublicFileController(
      service,
      runtimeConfigService,
      requestContextBuilder
    );
  };

  const mockRes = {
    setHeader: jest.fn(),
    send: jest.fn(),
  } as unknown as import('express').Response;

  const mockReq = {} as unknown as MxCadRequest;

  it('透传 VipFeatureRequiredException（保持 403 + 业务码）', async () => {
    const controller = createController(
      jest
        .fn()
        .mockRejectedValue(
          new VipFeatureRequiredException(
            '导出下载为会员专属功能，开通 VIP 后即可使用',
            'export_download'
          )
        )
    );
    await expect(
      controller.convertAndDownload(
        { fileHash: 'abc', format: 'pdf' },
        mockRes,
        mockReq
      )
    ).rejects.toBeInstanceOf(VipFeatureRequiredException);
    expect(mockRes.send).not.toHaveBeenCalled();
  });

  it('透传 QuotaExceededException（保持 403 语义）', async () => {
    const controller = createController(
      jest.fn().mockRejectedValue(new Error('图纸转换过于频繁，请稍后再试'))
    );
    // QuotaExceededException 路径已在既有行为中保持，此处验证非门控异常折叠为 400
    await expect(
      controller.convertAndDownload(
        { fileHash: 'abc', format: 'pdf' },
        mockRes,
        mockReq
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('其他转换失败折叠为 400（message 保留）', async () => {
    const controller = createController(
      jest.fn().mockRejectedValue(new Error('文件转换失败'))
    );
    const err = await controller
      .convertAndDownload({ fileHash: 'abc', format: 'pdf' }, mockRes, mockReq)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toContain('文件转换失败');
  });
});
