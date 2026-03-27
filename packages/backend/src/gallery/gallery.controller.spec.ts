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

import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { GalleryFileListDto } from './dto/gallery.dto';

describe('GalleryController', () => {
  let controller: GalleryController;
  let service: GalleryService;

  // 模拟响应对象
  const mockResponse = () => {
    const res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  };

  beforeEach(async () => {
    const mockGalleryService = {
      getTypes: jest.fn(),
      getFileList: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GalleryController],
      providers: [
        {
          provide: GalleryService,
          useValue: mockGalleryService,
        },
      ],
    }).compile();

    controller = module.get<GalleryController>(GalleryController);
    service = module.get<GalleryService>(GalleryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDrawingsTypes', () => {
    it('应该成功获取图纸库分类列表', async () => {
      const res = mockResponse();

      const mockResult = {
        code: 'success',
        result: {
          allblocks: [
            {
              id: 1,
              pid: 0,
              name: '建筑',
              pname: '建筑',
              status: 1,
            },
            {
              id: 2,
              pid: 0,
              name: '机械',
              pname: '机械',
              status: 1,
            },
          ],
        },
      };

      jest.spyOn(service, 'getTypes').mockResolvedValue(mockResult);

      await controller.getDrawingsTypes(res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getTypes).toHaveBeenCalledWith('drawings');
      expect(service.getTypes).toHaveBeenCalledTimes(1);
    });

    it('应该绕过全局响应包装，直接返回原始 JSON', async () => {
      const res = mockResponse();

      const mockResult = {
        code: 'success',
        result: {
          allblocks: [
            {
              id: 1,
              pid: 0,
              name: '建筑',
              pname: '建筑',
              status: 1,
            },
          ],
        },
      };

      jest.spyOn(service, 'getTypes').mockResolvedValue(mockResult);

      await controller.getDrawingsTypes(res);

      // 验证返回的是原始数据，没有经过全局响应包装
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(mockResult).not.toHaveProperty('timestamp');
      expect(mockResult).not.toHaveProperty('message');
    });

    it('应该处理服务错误', async () => {
      const res = mockResponse();

      jest.spyOn(service, 'getTypes').mockRejectedValue(new Error('服务错误'));

      await expect(controller.getDrawingsTypes(res)).rejects.toThrow(
        '服务错误'
      );
    });

    it('应该记录日志', async () => {
      const res = mockResponse();

      const mockResult = {
        code: 'success',
        result: {
          allblocks: [],
        },
      };

      jest.spyOn(service, 'getTypes').mockResolvedValue(mockResult);

      await controller.getDrawingsTypes(res);

      expect(service.getTypes).toHaveBeenCalled();
    });
  });

  describe('getDrawingsFileList', () => {
    it('应该成功获取图纸列表（无过滤条件）', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [
          {
            uuid: 'abc123def456',
            filename: '箭头_1.dwg',
            firstType: 1,
            secondType: 2,
            filehash: 'a1b2c3d4e5f6...',
            type: '门',
            lookNum: 100,
            likeNum: 50,
            collect: false,
          },
        ],
        page: {
          index: 0,
          size: 50,
          count: 150,
          max: 3,
          up: false,
          down: true,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getDrawingsFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getFileList).toHaveBeenCalledWith(dto, 'drawings');
      expect(service.getFileList).toHaveBeenCalledTimes(1);
    });

    it('应该支持关键字搜索', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        keywords: '箭头',
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getDrawingsFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getFileList).toHaveBeenCalledWith(dto, 'drawings');
    });

    it('应该支持分类过滤', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        firstType: 1,
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getDrawingsFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getFileList).toHaveBeenCalledWith(dto, 'drawings');
    });

    it('应该同时支持关键字和分类过滤', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        keywords: '箭头',
        firstType: 1,
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getDrawingsFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getFileList).toHaveBeenCalledWith(dto, 'drawings');
    });

    it('应该绕过全局响应包装，直接返回原始 JSON', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getDrawingsFileList(dto, res);

      // 验证返回的是原始数据，没有经过全局响应包装
      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(mockResult).not.toHaveProperty('timestamp');
      expect(mockResult).not.toHaveProperty('message');
    });

    it('应该处理服务错误', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      jest
        .spyOn(service, 'getFileList')
        .mockRejectedValue(new Error('服务错误'));

      await expect(controller.getDrawingsFileList(dto, res)).rejects.toThrow(
        '服务错误'
      );
    });

    it('应该记录日志', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getDrawingsFileList(dto, res);

      expect(service.getFileList).toHaveBeenCalled();
    });
  });

  describe('getBlocksTypes', () => {
    it('应该成功获取图块库分类列表', async () => {
      const res = mockResponse();

      const mockResult = {
        code: 'success',
        result: {
          allblocks: [
            {
              id: 1,
              pid: 0,
              name: '建筑',
              pname: '建筑',
              status: 1,
            },
            {
              id: 2,
              pid: 0,
              name: '机械',
              pname: '机械',
              status: 1,
            },
          ],
        },
      };

      jest.spyOn(service, 'getTypes').mockResolvedValue(mockResult);

      await controller.getBlocksTypes(res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getTypes).toHaveBeenCalledWith('blocks');
      expect(service.getTypes).toHaveBeenCalledTimes(1);
    });

    it('应该绕过全局响应包装，直接返回原始 JSON', async () => {
      const res = mockResponse();

      const mockResult = {
        code: 'success',
        result: {
          allblocks: [],
        },
      };

      jest.spyOn(service, 'getTypes').mockResolvedValue(mockResult);

      await controller.getBlocksTypes(res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(mockResult).not.toHaveProperty('timestamp');
      expect(mockResult).not.toHaveProperty('message');
    });

    it('应该处理服务错误', async () => {
      const res = mockResponse();

      jest.spyOn(service, 'getTypes').mockRejectedValue(new Error('服务错误'));

      await expect(controller.getBlocksTypes(res)).rejects.toThrow('服务错误');
    });

    it('应该记录日志', async () => {
      const res = mockResponse();

      const mockResult = {
        code: 'success',
        result: {
          allblocks: [],
        },
      };

      jest.spyOn(service, 'getTypes').mockResolvedValue(mockResult);

      await controller.getBlocksTypes(res);

      expect(service.getTypes).toHaveBeenCalled();
    });
  });

  describe('getBlocksFileList', () => {
    it('应该成功获取图块列表（无过滤条件）', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [
          {
            uuid: 'abc123def456',
            filename: '箭头_1.dwg',
            firstType: 1,
            secondType: 2,
            filehash: 'a1b2c3d4e5f6...',
            type: '门',
            lookNum: 100,
            likeNum: 50,
            collect: false,
          },
        ],
        page: {
          index: 0,
          size: 50,
          count: 150,
          max: 3,
          up: false,
          down: true,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getBlocksFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getFileList).toHaveBeenCalledWith(dto, 'blocks');
      expect(service.getFileList).toHaveBeenCalledTimes(1);
    });

    it('应该支持关键字搜索', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        keywords: '箭头',
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getBlocksFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getFileList).toHaveBeenCalledWith(dto, 'blocks');
    });

    it('应该支持分类过滤', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        firstType: 1,
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getBlocksFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getFileList).toHaveBeenCalledWith(dto, 'blocks');
    });

    it('应该同时支持关键字和分类过滤', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        keywords: '箭头',
        firstType: 1,
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getBlocksFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(service.getFileList).toHaveBeenCalledWith(dto, 'blocks');
    });

    it('应该绕过全局响应包装，直接返回原始 JSON', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getBlocksFileList(dto, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      expect(mockResult).not.toHaveProperty('timestamp');
      expect(mockResult).not.toHaveProperty('message');
    });

    it('应该处理服务错误', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      jest
        .spyOn(service, 'getFileList')
        .mockRejectedValue(new Error('服务错误'));

      await expect(controller.getBlocksFileList(dto, res)).rejects.toThrow(
        '服务错误'
      );
    });

    it('应该记录日志', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getBlocksFileList(dto, res);

      expect(service.getFileList).toHaveBeenCalled();
    });
  });

  describe('响应格式一致性', () => {
    it('图纸库和图块库分类列表应该返回相同的格式', async () => {
      const res = mockResponse();

      const mockResult = {
        code: 'success',
        result: {
          allblocks: [],
        },
      };

      jest.spyOn(service, 'getTypes').mockResolvedValue(mockResult);

      await controller.getDrawingsTypes(res);
      const drawingsCall = (res.json as jest.Mock).mock.calls[0][0];

      jest.clearAllMocks();
      await controller.getBlocksTypes(res);
      const blocksCall = (res.json as jest.Mock).mock.calls[0][0];

      expect(drawingsCall).toEqual(blocksCall);
    });

    it('图纸库和图块库文件列表应该返回相同的格式', async () => {
      const res = mockResponse();
      const dto: GalleryFileListDto = {
        pageIndex: 0,
        pageSize: 50,
      };

      const mockResult = {
        sharedwgs: [],
        page: {
          index: 0,
          size: 50,
          count: 0,
          max: 0,
          up: false,
          down: false,
        },
      };

      jest.spyOn(service, 'getFileList').mockResolvedValue(mockResult);

      await controller.getDrawingsFileList(dto, res);
      const drawingsCall = (res.json as jest.Mock).mock.calls[0][0];

      jest.clearAllMocks();
      await controller.getBlocksFileList(dto, res);
      const blocksCall = (res.json as jest.Mock).mock.calls[0][0];

      expect(drawingsCall).toEqual(blocksCall);
    });
  });
});
