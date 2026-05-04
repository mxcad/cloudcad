///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件代码及其文档和相关资料归成都梦想凯德科技有限公司所有
// This code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd.
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { QuotaEnforcementService } from '../../src/file-system/storage-quota/quota-enforcement.service';
import { StorageQuotaService } from '../../src/file-system/storage-quota/storage-quota.service';
import { StorageInfoService } from '../../src/file-system/storage-quota/storage-info.service';
import { DatabaseService } from '../../src/database/database.service';
import { RuntimeConfigService } from '../../src/runtime-config/runtime-config.service';
import { ConfigService } from '@nestjs/config';
describe('T37 - 存储配额满→上传拒绝集成测试', () => {
    let quotaEnforcementService;
    let storageQuotaService;
    let storageInfoService;
    let mockDatabaseService;
    let mockRuntimeConfigService;
    let mockConfigService;
    const mockUserId = 'test-user-123';
    const mockNodeId = 'test-node-456';
    beforeEach(async () => {
        mockDatabaseService = {
            fileSystemNode: {
                findUnique: jest.fn(),
                aggregate: jest.fn(),
            },
        };
        mockRuntimeConfigService = {
            getValue: jest.fn(),
        };
        mockConfigService = {
            get: jest.fn(),
        };
        const module = await Test.createTestingModule({
            providers: [
                QuotaEnforcementService,
                StorageQuotaService,
                StorageInfoService,
                { provide: DatabaseService, useValue: mockDatabaseService },
                { provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();
        quotaEnforcementService = module.get(QuotaEnforcementService);
        storageQuotaService = module.get(StorageQuotaService);
        storageInfoService = module.get(StorageInfoService);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('T37 - 存储配额检查', () => {
        it('T37-S1 - 配额充足时，允许上传', async () => {
            // 模拟节点信息（个人空间）
            const mockNode = {
                id: mockNodeId,
                isRoot: false,
                libraryKey: null,
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockNode);
            // 模拟数据库聚合查询：已使用 5GB
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 5 * 1024 * 1024 * 1024 }, // 5GB
            });
            // 模拟配置：默认个人配额 10GB
            mockRuntimeConfigService.getValue.mockResolvedValue(10);
            const fileSize = 1 * 1024 * 1024 * 1024; // 1GB
            const result = await quotaEnforcementService.checkUploadQuota(mockUserId, mockNodeId, fileSize);
            expect(result.allowed).toBe(true);
            expect(result.quotaInfo.remaining).toBeGreaterThanOrEqual(fileSize);
        });
        it('T37-S2 - 配额不足时，拒绝上传并返回配额信息', async () => {
            const mockNode = {
                id: mockNodeId,
                isRoot: false,
                libraryKey: null,
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockNode);
            // 已使用 9.5GB
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 9.5 * 1024 * 1024 * 1024 },
            });
            mockRuntimeConfigService.getValue.mockResolvedValue(10); // 总配额 10GB
            const fileSize = 1 * 1024 * 1024 * 1024; // 1GB（剩余空间只有 0.5GB）
            await expect(quotaEnforcementService.checkUploadQuota(mockUserId, mockNodeId, fileSize)).rejects.toThrow(BadRequestException);
        });
        it('T37-S3 - 精确计算：剩余空间刚好足够上传', async () => {
            const mockNode = {
                id: mockNodeId,
                isRoot: false,
                libraryKey: null,
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockNode);
            // 已使用 9GB
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 9 * 1024 * 1024 * 1024 },
            });
            mockRuntimeConfigService.getValue.mockResolvedValue(10); // 总配额 10GB
            const fileSize = 1 * 1024 * 1024 * 1024; // 1GB（刚好够）
            const result = await quotaEnforcementService.checkUploadQuota(mockUserId, mockNodeId, fileSize);
            expect(result.allowed).toBe(true);
            expect(result.quotaInfo.remaining).toEqual(fileSize);
        });
        it('T37-S4 - 项目空间配额检查', async () => {
            const mockProjectNode = {
                id: mockNodeId,
                isRoot: true,
                libraryKey: null,
                storageQuota: 20, // 项目配额 20GB
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProjectNode);
            // 项目已使用 15GB
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 15 * 1024 * 1024 * 1024 },
            });
            const fileSize = 3 * 1024 * 1024 * 1024; // 3GB
            const result = await quotaEnforcementService.checkUploadQuota(mockUserId, mockNodeId, fileSize);
            expect(result.allowed).toBe(true);
            expect(result.quotaInfo.type).toEqual('PROJECT');
        });
        it('T37-S5 - 公共资源库配额检查', async () => {
            const mockLibraryNode = {
                id: mockNodeId,
                isRoot: true,
                libraryKey: 'test-library',
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockLibraryNode);
            // 资源库已使用 50GB
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 50 * 1024 * 1024 * 1024 },
            });
            mockRuntimeConfigService.getValue.mockResolvedValue(100); // 默认资源库配额 100GB
            const fileSize = 20 * 1024 * 1024 * 1024; // 20GB
            const result = await quotaEnforcementService.checkUploadQuota(mockUserId, mockNodeId, fileSize);
            expect(result.allowed).toBe(true);
            expect(result.quotaInfo.type).toEqual('LIBRARY');
        });
        it('T37-S6 - 资源库配额不足时的错误信息', async () => {
            const mockLibraryNode = {
                id: mockNodeId,
                isRoot: true,
                libraryKey: 'test-library',
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockLibraryNode);
            // 资源库已使用 95GB
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 95 * 1024 * 1024 * 1024 },
            });
            mockRuntimeConfigService.getValue.mockResolvedValue(100);
            const fileSize = 10 * 1024 * 1024 * 1024; // 10GB（超过配额）
            await expect(quotaEnforcementService.checkUploadQuota(mockUserId, mockNodeId, fileSize)).rejects.toThrow(BadRequestException);
        });
        it('T37-S7 - 检查用户是否已超额使用配额', async () => {
            const mockNode = {
                id: mockNodeId,
                isRoot: false,
                libraryKey: null,
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockNode);
            // 已使用 11GB（超过 10GB 配额）
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 11 * 1024 * 1024 * 1024 },
            });
            mockRuntimeConfigService.getValue.mockResolvedValue(10);
            const isExceeded = await quotaEnforcementService.isQuotaExceeded(mockUserId, mockNodeId);
            expect(isExceeded).toBe(true);
        });
        it('T37-S8 - 获取配额超额详情和建议', async () => {
            const mockNode = {
                id: mockNodeId,
                isRoot: false,
                libraryKey: null,
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockNode);
            // 已使用 12GB
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 12 * 1024 * 1024 * 1024 },
            });
            mockRuntimeConfigService.getValue.mockResolvedValue(10);
            const details = await quotaEnforcementService.getQuotaExceededDetails(mockUserId, mockNodeId);
            expect(details.isExceeded).toBe(true);
            expect(details.exceededBy).toBeGreaterThan(0);
            expect(details.suggestions.length).toBeGreaterThan(0);
        });
        it('T37-S9 - 配额检查使用缓存提高性能', async () => {
            const mockNode = {
                id: mockNodeId,
                isRoot: false,
                libraryKey: null,
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockNode);
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 5 * 1024 * 1024 * 1024 },
            });
            mockRuntimeConfigService.getValue.mockResolvedValue(10);
            // 第一次调用（缓存未命中）
            await storageInfoService.getStorageQuota(mockUserId, mockNodeId);
            expect(mockDatabaseService.fileSystemNode.aggregate).toHaveBeenCalledTimes(1);
            // 第二次调用（缓存命中）
            await storageInfoService.getStorageQuota(mockUserId, mockNodeId);
            expect(mockDatabaseService.fileSystemNode.aggregate).toHaveBeenCalledTimes(1); // 仍只调用一次
        });
        it('T37-S10 - 清除配额缓存后重新计算', async () => {
            const mockNode = {
                id: mockNodeId,
                isRoot: false,
                libraryKey: null,
                storageQuota: 0,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockNode);
            mockDatabaseService.fileSystemNode.aggregate.mockResolvedValue({
                _sum: { size: 5 * 1024 * 1024 * 1024 },
            });
            mockRuntimeConfigService.getValue.mockResolvedValue(10);
            // 第一次调用
            await storageInfoService.getStorageQuota(mockUserId, mockNodeId);
            expect(mockDatabaseService.fileSystemNode.aggregate).toHaveBeenCalledTimes(1);
            // 清除缓存
            await storageInfoService.invalidateQuotaCache(mockUserId, mockNodeId);
            // 第二次调用（缓存失效，重新计算）
            await storageInfoService.getStorageQuota(mockUserId, mockNodeId);
            expect(mockDatabaseService.fileSystemNode.aggregate).toHaveBeenCalledTimes(2);
        });
        it('T37-S11 - 更新节点存储配额', async () => {
            const mockNode = {
                id: mockNodeId,
                isRoot: true,
                libraryKey: null,
                storageQuota: 10,
            };
            mockDatabaseService.fileSystemNode.update.mockResolvedValue(mockNode);
            const newQuotaGB = 50;
            const updatedNode = await storageQuotaService.updateNodeStorageQuota(mockNodeId, newQuotaGB);
            expect(mockDatabaseService.fileSystemNode.update).toHaveBeenCalledWith({
                where: { id: mockNodeId },
                data: { storageQuota: newQuotaGB },
            });
        });
        it('T37-S12 - 验证配额值不能为负数', async () => {
            await expect(storageQuotaService.updateNodeStorageQuota(mockNodeId, -1)).rejects.toThrow('存储配额不能为负数');
        });
    });
});
//# sourceMappingURL=storage-quota-full.integration.spec.js.map