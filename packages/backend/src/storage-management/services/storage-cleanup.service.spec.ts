import { Test, type TestingModule } from '@nestjs/testing';
import { StorageCleanupService } from './storage-cleanup.service';
import { DatabaseService } from '../../database/database.service';
import { StorageManager } from './storage-manager.service';
import { DirectoryAllocator } from './directory-allocator.service';
import { LocalStorageProvider } from '../../storage/local-storage.provider';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { NodeType } from '@cloudcad/db';

describe('StorageCleanupService freedSpace 统计 (#325)', () => {
	let service: StorageCleanupService;

	const mockPrisma = {
		fileSystemNode: {
			findMany: jest.fn(),
			update: jest.fn(),
			delete: jest.fn(),
		},
	};

	const mockStorageManager = {
		deleteNodeStorage: jest.fn(),
		cleanupEmptyDirectories: jest.fn(),
	};

	const mockRuntimeConfigService = {
		getValue: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockStorageManager.deleteNodeStorage.mockResolvedValue(undefined);
		mockStorageManager.cleanupEmptyDirectories.mockResolvedValue(0);
		mockPrisma.fileSystemNode.update.mockResolvedValue({});
		mockPrisma.fileSystemNode.delete.mockResolvedValue({});

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageCleanupService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: StorageManager, useValue: mockStorageManager },
				{
					provide: DirectoryAllocator,
					useValue: {},
				},
				{ provide: LocalStorageProvider, useValue: {} },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
			],
		}).compile();

		service = module.get<StorageCleanupService>(StorageCleanupService);
	});

	describe('cleanupExpiredStorage', () => {
		it('累加已删除节点的 size 到 freedSpace', async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([
				{ id: 'n1', path: '202401/nodeA', deletedFromStorage: new Date(), size: 1024 },
				{ id: 'n2', path: '202401/nodeB', deletedFromStorage: new Date(), size: null },
			]);

			const result = await service.cleanupExpiredStorage();

			expect(result.deletedNodes).toBe(2);
			expect(result.freedSpace).toBe(1024);
		});
	});

	describe('cleanupExpiredTrash', () => {
		it('累加回收站 FILE 项目的 size 到 freedSpace', async () => {
			mockPrisma.fileSystemNode.findMany.mockResolvedValue([
				{
					id: 't1',
					nodeType: NodeType.FILE,
					path: '202401/nodeC',
					size: 2048,
				},
				{
					id: 't2',
					nodeType: NodeType.FILE,
					path: null,
					size: 9999,
				},
			]);

			const result = await service.cleanupExpiredTrash();

			// path 为 null 的项目无法定位存储目录，沿用既有语义跳过不删
			expect(result.deletedNodes).toBe(1);
			expect(result.freedSpace).toBe(2048);
		});
	});
});
