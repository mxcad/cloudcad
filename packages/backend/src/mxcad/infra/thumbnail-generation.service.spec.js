///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { ThumbnailGenerationService } from './thumbnail-generation.service';
import { ConfigService } from '@nestjs/config';
import { I_CONVERSION_SERVICE } from '@cloudcad/conversion-engine';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
describe('ThumbnailGenerationService', () => {
    let service;
    const mockConfigService = {
        get: jest.fn(),
    };
    const mockConversionService = {
        generateThumbnail: jest.fn(),
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        jest.spyOn(fs.promises, 'copyFile').mockResolvedValue(undefined);
        jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 });
        mockConfigService.get.mockReturnValue({
            autoGenerateEnabled: true,
            width: 200,
            height: 200,
        });
        const module = await Test.createTestingModule({
            providers: [
                ThumbnailGenerationService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: I_CONVERSION_SERVICE, useValue: mockConversionService },
            ],
        }).compile();
        service = module.get(ThumbnailGenerationService);
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
    describe('isEnabled', () => {
        it('should return true when enabled', () => {
            expect(service.isEnabled()).toBe(true);
        });
    });
    describe('generateThumbnail', () => {
        it('should generate thumbnail successfully', async () => {
            mockConversionService.generateThumbnail.mockResolvedValue({
                success: true,
                outputPaths: [path.join(os.tmpdir(), 'thumbnail.webp')],
            });
            const result = await service.generateThumbnail(path.join(os.tmpdir(), 'test.dwg'), os.tmpdir(), 'node1');
            expect(result.success).toBe(true);
            expect(result.thumbnailPath).toBe(path.join(os.tmpdir(), 'thumbnail.webp'));
        });
        it('should return error when thumbnail generation is disabled', async () => {
            mockConfigService.get.mockReturnValue({
                autoGenerateEnabled: false,
                width: 200,
                height: 200,
            });
            const newModule = await Test.createTestingModule({
                providers: [
                    ThumbnailGenerationService,
                    { provide: ConfigService, useValue: mockConfigService },
                    { provide: I_CONVERSION_SERVICE, useValue: mockConversionService },
                ],
            }).compile();
            const newService = newModule.get(ThumbnailGenerationService);
            const result = await newService.generateThumbnail(path.join(os.tmpdir(), 'test.dwg'), os.tmpdir(), 'node1');
            expect(result.success).toBe(false);
            expect(result.error).toBe('缩略图生成功能已禁用');
        });
        it('should return error when conversion fails', async () => {
            mockConversionService.generateThumbnail.mockResolvedValue({
                success: false,
                outputPaths: [],
                error: 'conversion failed',
            });
            const result = await service.generateThumbnail(path.join(os.tmpdir(), 'test.dwg'), os.tmpdir(), 'node1');
            expect(result.success).toBe(false);
            expect(result.error).toBe('conversion failed');
        });
    });
    describe('getThumbnailSize', () => {
        it('should return configured thumbnail size', () => {
            const size = service.getThumbnailSize();
            expect(size.width).toBe(200);
            expect(size.height).toBe(200);
        });
    });
});
//# sourceMappingURL=thumbnail-generation.service.spec.js.map