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
import { BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { SystemRole } from '../common/enums/permissions.enum';
import { FontsController } from './fonts.controller';
import { FontsService } from './fonts.service';
import { FontUploadTarget } from './dto/font.dto';

describe('FontsController', () => {
  let controller: FontsController;
  let service: FontsService;

  // 模拟请求对象
  const mockRequest = (role: string = SystemRole.ADMIN) => {
    return {
      user: {
        id: 'test-user-id',
        role: role,
        email: 'admin@test.com',
      },
      file: {
        fieldname: 'file',
        originalname: 'test-font.ttf',
        encoding: '7bit',
        mimetype: 'font/ttf',
        size: 1024,
        buffer: Buffer.from('test font content'),
      } as Express.Multer.File,
    } as unknown as Request;
  };

  // 模拟响应对象
  const mockResponse = () => {
    const res = {
      download: jest.fn((path, filename, callback) => {
        callback(null);
      }),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false,
    } as unknown as Response;
    return res;
  };

  beforeEach(async () => {
    const mockFontsService = {
      getFonts: jest.fn(),
      uploadFont: jest.fn(),
      deleteFont: jest.fn(),
      downloadFont: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FontsController],
      providers: [
        {
          provide: FontsService,
          useValue: mockFontsService,
        },
      ],
    }).compile();

    controller = module.get<FontsController>(FontsController);
    service = module.get<FontsService>(FontsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getFonts', () => {
    it('应该成功获取字体列表', async () => {
      const mockFonts = [
        {
          name: 'test-font.ttf',
          size: 1024,
          extension: '.ttf',
          existsInBackend: true,
          existsInFrontend: true,
          createdAt: new Date(),
        },
      ];

      jest.spyOn(service, 'getFonts').mockResolvedValue({
        fonts: mockFonts,
        total: 1,
      });

      const result = await controller.getFonts();

      expect(result.code).toBe('SUCCESS');
      expect(result.message).toContain('成功');
      expect(result.data.fonts).toHaveLength(1);
      expect(result.data.total).toBe(1);
      expect(service.getFonts).toHaveBeenCalled();
    });

    it('应该处理服务错误', async () => {
      jest.spyOn(service, 'getFonts').mockRejectedValue(new Error('服务错误'));

      await expect(controller.getFonts()).rejects.toThrow('服务错误');
    });
  });

  describe('uploadFont', () => {
    it('应该成功上传字体（管理员）', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const uploadFontDto = { target: FontUploadTarget.BOTH };

      const mockResult = {
        message: '字体文件 test-font.ttf 上传成功',
        font: {
          name: 'test-font.ttf',
          size: 1024,
          extension: '.ttf',
          existsInBackend: true,
          existsInFrontend: true,
          createdAt: new Date(),
        },
      };

      jest.spyOn(service, 'uploadFont').mockResolvedValue(mockResult);

      const result = await controller.uploadFont(req, uploadFontDto);

      expect(result.code).toBe('SUCCESS');
      expect(result.message).toContain('上传成功');
      expect(result.data.name).toBe('test-font.ttf');
      expect(service.uploadFont).toHaveBeenCalledWith(
        req.file,
        FontUploadTarget.BOTH
      );
    });

    it('应该拒绝非管理员上传字体', async () => {
      const req = mockRequest(SystemRole.USER);
      const uploadFontDto = { target: FontUploadTarget.BOTH };

      await expect(controller.uploadFont(req, uploadFontDto)).rejects.toThrow(
        BadRequestException
      );
      await expect(controller.uploadFont(req, uploadFontDto)).rejects.toThrow(
        '仅管理员可访问此功能'
      );
    });

    it('应该处理上传到后端目录', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const uploadFontDto = { target: FontUploadTarget.BACKEND };

      const mockResult = {
        message: '字体文件 test-font.ttf 上传成功',
        font: {
          name: 'test-font.ttf',
          size: 1024,
          extension: '.ttf',
          existsInBackend: true,
          existsInFrontend: false,
          createdAt: new Date(),
        },
      };

      jest.spyOn(service, 'uploadFont').mockResolvedValue(mockResult);

      const result = await controller.uploadFont(req, uploadFontDto);

      expect(result.code).toBe('SUCCESS');
      expect(result.data.existsInBackend).toBe(true);
      expect(result.data.existsInFrontend).toBe(false);
      expect(service.uploadFont).toHaveBeenCalledWith(
        req.file,
        FontUploadTarget.BACKEND
      );
    });

    it('应该处理上传到前端目录', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const uploadFontDto = { target: FontUploadTarget.FRONTEND };

      const mockResult = {
        message: '字体文件 test-font.ttf 上传成功',
        font: {
          name: 'test-font.ttf',
          size: 1024,
          extension: '.ttf',
          existsInBackend: false,
          existsInFrontend: true,
          createdAt: new Date(),
        },
      };

      jest.spyOn(service, 'uploadFont').mockResolvedValue(mockResult);

      const result = await controller.uploadFont(req, uploadFontDto);

      expect(result.code).toBe('SUCCESS');
      expect(result.data.existsInBackend).toBe(false);
      expect(result.data.existsInFrontend).toBe(true);
      expect(service.uploadFont).toHaveBeenCalledWith(
        req.file,
        FontUploadTarget.FRONTEND
      );
    });

    it('应该默认上传到两个目录', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const uploadFontDto = {};

      const mockResult = {
        message: '字体文件 test-font.ttf 上传成功',
        font: {
          name: 'test-font.ttf',
          size: 1024,
          extension: '.ttf',
          existsInBackend: true,
          existsInFrontend: true,
          createdAt: new Date(),
        },
      };

      jest.spyOn(service, 'uploadFont').mockResolvedValue(mockResult);

      const result = await controller.uploadFont(req, uploadFontDto);

      expect(result.code).toBe('SUCCESS');
      expect(result.data.existsInBackend).toBe(true);
      expect(result.data.existsInFrontend).toBe(true);
      expect(service.uploadFont).toHaveBeenCalledWith(
        req.file,
        FontUploadTarget.BOTH
      );
    });
  });

  describe('deleteFont', () => {
    it('应该成功删除字体（管理员）', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const deleteFontDto = { target: FontUploadTarget.BOTH };

      const mockResult = {
        message: '字体文件 test-font.ttf 删除成功',
      };

      jest.spyOn(service, 'deleteFont').mockResolvedValue(mockResult);

      const result = await controller.deleteFont(
        req,
        'test-font.ttf',
        deleteFontDto
      );

      expect(result.code).toBe('SUCCESS');
      expect(result.message).toContain('删除成功');
      expect(service.deleteFont).toHaveBeenCalledWith(
        'test-font.ttf',
        FontUploadTarget.BOTH
      );
    });

    it('应该拒绝非管理员删除字体', async () => {
      const req = mockRequest(SystemRole.USER);
      const deleteFontDto = { target: FontUploadTarget.BOTH };

      await expect(
        controller.deleteFont(req, 'test-font.ttf', deleteFontDto)
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.deleteFont(req, 'test-font.ttf', deleteFontDto)
      ).rejects.toThrow('仅管理员可访问此功能');
    });

    it('应该处理从后端目录删除', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const deleteFontDto = { target: FontUploadTarget.BACKEND };

      const mockResult = {
        message: '字体文件 test-font.ttf 删除成功',
      };

      jest.spyOn(service, 'deleteFont').mockResolvedValue(mockResult);

      const result = await controller.deleteFont(
        req,
        'test-font.ttf',
        deleteFontDto
      );

      expect(result.code).toBe('SUCCESS');
      expect(service.deleteFont).toHaveBeenCalledWith(
        'test-font.ttf',
        FontUploadTarget.BACKEND
      );
    });

    it('应该处理从前端目录删除', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const deleteFontDto = { target: FontUploadTarget.FRONTEND };

      const mockResult = {
        message: '字体文件 test-font.ttf 删除成功',
      };

      jest.spyOn(service, 'deleteFont').mockResolvedValue(mockResult);

      const result = await controller.deleteFont(
        req,
        'test-font.ttf',
        deleteFontDto
      );

      expect(result.code).toBe('SUCCESS');
      expect(service.deleteFont).toHaveBeenCalledWith(
        'test-font.ttf',
        FontUploadTarget.FRONTEND
      );
    });

    it('应该默认从两个目录删除', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const deleteFontDto = {};

      const mockResult = {
        message: '字体文件 test-font.ttf 删除成功',
      };

      jest.spyOn(service, 'deleteFont').mockResolvedValue(mockResult);

      const result = await controller.deleteFont(
        req,
        'test-font.ttf',
        deleteFontDto
      );

      expect(result.code).toBe('SUCCESS');
      expect(service.deleteFont).toHaveBeenCalledWith(
        'test-font.ttf',
        FontUploadTarget.BOTH
      );
    });
  });

  describe('downloadFont', () => {
    it('应该成功从后端目录下载字体（管理员）', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const res = mockResponse();

      const mockResult = {
        path: '/path/to/test-fonts-backend/test-font.ttf',
        fileName: 'test-font.ttf',
      };

      jest.spyOn(service, 'downloadFont').mockResolvedValue(mockResult);

      await controller.downloadFont(req, res, 'test-font.ttf', 'backend');

      expect(service.downloadFont).toHaveBeenCalledWith(
        'test-font.ttf',
        'backend'
      );
      expect(res.download).toHaveBeenCalledWith(
        mockResult.path,
        mockResult.fileName,
        expect.any(Function)
      );
    });

    it('应该成功从前端目录下载字体（管理员）', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const res = mockResponse();

      const mockResult = {
        path: '/path/to/test-fonts-frontend/test-font.woff',
        fileName: 'test-font.woff',
      };

      jest.spyOn(service, 'downloadFont').mockResolvedValue(mockResult);

      await controller.downloadFont(req, res, 'test-font.woff', 'frontend');

      expect(service.downloadFont).toHaveBeenCalledWith(
        'test-font.woff',
        'frontend'
      );
      expect(res.download).toHaveBeenCalledWith(
        mockResult.path,
        mockResult.fileName,
        expect.any(Function)
      );
    });

    it('应该拒绝非管理员下载字体', async () => {
      const req = mockRequest(SystemRole.USER);
      const res = mockResponse();

      await expect(
        controller.downloadFont(req, res, 'test-font.ttf', 'backend')
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.downloadFont(req, res, 'test-font.ttf', 'backend')
      ).rejects.toThrow('仅管理员可访问此功能');
    });

    it('应该处理下载错误', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const res = mockResponse();

      const mockResult = {
        path: '/path/to/test-fonts-backend/test-font.ttf',
        fileName: 'test-font.ttf',
      };

      jest.spyOn(service, 'downloadFont').mockResolvedValue(mockResult);

      // 模拟下载错误
      res.download = jest
        .fn()
        .mockImplementation((path, filename, callback) => {
          if (typeof callback === 'function') {
            callback(new Error('下载失败'));
          }
        }) as any;

      await controller.downloadFont(req, res, 'test-font.ttf', 'backend');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'ERROR',
          message: '下载字体失败',
        })
      );
    });

    it('应该处理服务错误', async () => {
      const req = mockRequest(SystemRole.ADMIN);
      const res = mockResponse();

      jest
        .spyOn(service, 'downloadFont')
        .mockRejectedValue(new Error('服务错误'));

      await expect(
        controller.downloadFont(req, res, 'test-font.ttf', 'backend')
      ).rejects.toThrow('服务错误');
    });
  });
});
