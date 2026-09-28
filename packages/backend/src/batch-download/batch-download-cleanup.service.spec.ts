import { Test, type TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BatchDownloadCleanupService } from './batch-download-cleanup.service';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';
import {
	CLEANUP_PARTIAL_MESSAGE_KEY,
	CleanupMetricsService,
} from '../metrics/cleanup-metrics.service';
import { BatchJobStatus } from '@cloudcad/db';

describe('BatchDownloadCleanupService', () => {
	let service: BatchDownloadCleanupService;
	let tempExportDir: string;
	let tempCacheDir: string;

	const mockPrisma = {
		batchDownloadJob: {
			findMany: jest.fn(),
			deleteMany: jest.fn(),
		},
	};

	const mockConfigService = {
		get: jest.fn(),
	};

	const mockRuntimeConfigService = {
		getValue: jest.fn(),
	};

	const mockAlertService = {
		raise: jest.fn(),
	};

	const mockTaskRunService = {
		run: jest.fn(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		),
		register: jest.fn(),
		getRunner: jest.fn(),
		listRunners: jest.fn(),
	};

	const mockCleanupMetrics = {
		observe: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		// exportDir / conversionCacheDir 在构造函数中缓存，
		// 必须在模块编译（构造）前就位：每个用例独立临时目录
		tempExportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-export-'));
		tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-cache-'));
		mockConfigService.get.mockImplementation((key: string) => {
			if (key === 'mxcadUploadPath') return '';
			return {
				exportDir: tempExportDir,
				zipRetentionHours: 24,
				dbRetentionDays: 7,
				conversionCacheDir: tempCacheDir,
				conversionCacheTtlHours: 1,
			};
		});
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				BatchDownloadCleanupService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
				{ provide: CleanupMetricsService, useValue: mockCleanupMetrics },
			],
		}).compile();

		service = module.get<BatchDownloadCleanupService>(
			BatchDownloadCleanupService
		);
	});

	afterEach(() => {
		fs.rmSync(tempExportDir, { recursive: true, force: true });
		fs.rmSync(tempCacheDir, { recursive: true, force: true });
	});

	describe('cleanupExpiredZips', () => {
		it('should query expired completed jobs with zipPath', async () => {
			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([]);

			await service.cleanupExpiredZips();

			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'batch-download:zip-cleanup',
				expect.any(Function)
			);
			const where = mockPrisma.batchDownloadJob.findMany.mock.calls[0][0]
				.where;
			expect(where.status).toBe(BatchJobStatus.COMPLETED);
			expect(where.zipPath).toEqual({ not: null });
			// 优先按 expiresAt 判定；历史行没有该列时回落按 completedAt
			expect(where.OR).toEqual([
				expect.objectContaining({
					expiresAt: expect.objectContaining({
						lte: expect.any(Date),
					}),
				}),
				expect.objectContaining({
					expiresAt: null,
					completedAt: expect.objectContaining({
						lte: expect.any(Date),
					}),
				}),
			]);
			// 回落窗口同样来自 zipRetentionHours，不是写死的 24 小时
			const legacyCutoff = where.OR[1].completedAt.lte as Date;
			const expected = Date.now() - 24 * 60 * 60 * 1000;
			expect(Math.abs(legacyCutoff.getTime() - expected)).toBeLessThan(
				5000
			);
		});

		it('should skip when batchDownloadCleanupEnabled is false', async () => {
			mockRuntimeConfigService.getValue.mockResolvedValue(false);

			await service.cleanupExpiredZips();

			expect(mockPrisma.batchDownloadJob.findMany).not.toHaveBeenCalled();
		});

		it('should raise task_run_failed (P1) when query throws (#325 分级)', async () => {
			mockPrisma.batchDownloadJob.findMany.mockRejectedValue(
				new Error('zip query error')
			);

			await service.cleanupExpiredZips();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:batch-download',
				messageKey: 'task_run_failed',
				level: AlertLevel.P1,
				message: expect.stringContaining('zip query error'),
				detail: {
					task: 'cleanupExpiredZips',
					error: 'zip query error',
				},
			});
		});
	});

	// ==================== cleanup_* 指标埋点（#325） ====================
	describe('cleanup metrics instrumentation (#325)', () => {
		it('observes zip cleanup row count and freed bytes', async () => {
			const zipPath = path.join(tempExportDir, 'expired.zip');
			fs.writeFileSync(zipPath, 'x'.repeat(1024));
			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([
				{ id: 'job-1', zipPath: 'expired.zip' },
			]);

			await service.cleanupExpiredZips();

			expect(mockCleanupMetrics.observe).toHaveBeenCalledWith({
				task: 'batch-download:zip-cleanup',
				recordsDeleted: 1,
				spaceFreedBytes: 1024,
				durationSeconds: expect.any(Number),
			});
			expect(mockAlertService.raise).not.toHaveBeenCalledWith(
				expect.objectContaining({ messageKey: CLEANUP_PARTIAL_MESSAGE_KEY })
			);
		});

		it('raises cleanup.partial (P2) when some zips fail to delete', async () => {
			fs.writeFileSync(path.join(tempExportDir, 'ok.zip'), 'ok');
			// 用目录代替文件：existsSync 为 true 但 unlinkSync 抛错，模拟删除异常
			const dirPath = path.join(tempExportDir, 'stubborn');
			fs.mkdirSync(dirPath, { recursive: true });
			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([
				{ id: 'job-1', zipPath: 'ok.zip' },
				{ id: 'job-2', zipPath: 'stubborn' },
			]);

			await service.cleanupExpiredZips();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:batch-download',
				messageKey: CLEANUP_PARTIAL_MESSAGE_KEY,
				level: AlertLevel.P2,
				message: expect.stringContaining('部分成功'),
				detail: expect.objectContaining({
					task: 'batch-download:zip-cleanup',
					errorCount: 1,
				}),
			});
			expect(fs.existsSync(path.join(tempExportDir, 'ok.zip'))).toBe(false);
		});

		it('observes db cleanup row count', async () => {
			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([]);
			mockPrisma.batchDownloadJob.deleteMany.mockResolvedValue({ count: 6 });

			await service.cleanupExpiredDbRecords();

			expect(mockCleanupMetrics.observe).toHaveBeenCalledWith({
				task: 'batch-download:db-cleanup',
				recordsDeleted: 6,
				durationSeconds: expect.any(Number),
			});
		});

		it('observes conversion cache cleanup with freed bytes', async () => {
			// 文件名须符合缓存产物模式 {hash}-{paramKey}{ext}，否则被清理判据跳过
			const cacheFile = path.join(
				tempCacheDir,
				`${'a'.repeat(32)}-pdf-2000x2000-mono.pdf`
			);
			fs.writeFileSync(cacheFile, 'c'.repeat(512));
			// mtime 回拨 2h，使 TTL=1h 的过期判定命中
			const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
			fs.utimesSync(cacheFile, past, past);

			await service.cleanupExpiredConversionCache();

			expect(mockCleanupMetrics.observe).toHaveBeenCalledWith({
				task: 'batch-download:conversion-cache-cleanup',
				recordsDeleted: 1,
				spaceFreedBytes: 512,
				durationSeconds: expect.any(Number),
			});
		});

		it('skips non-cache files (snapshots / other) in the cache dir', async () => {
			const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
			// 内容寻址快照 {hash}.mxweb：与缓存产物同目录，过期也绝不删除
			const snapshot = path.join(tempCacheDir, `${'b'.repeat(32)}.mxweb`);
			// 非缓存产物（.bak 后缀不匹配模式）
			const other = path.join(
				tempCacheDir,
				`${'c'.repeat(32)}-pdf-2000x2000-mono.pdf.bak`
			);
			// 符合模式的过期缓存产物 → 应删除
			const cacheFile = path.join(
				tempCacheDir,
				`${'d'.repeat(32)}-dwg-v2018.dwg`
			);
			for (const f of [snapshot, other, cacheFile]) {
				fs.writeFileSync(f, 'x');
				fs.utimesSync(f, past, past);
			}

			await service.cleanupExpiredConversionCache();

			expect(fs.existsSync(cacheFile)).toBe(false);
			expect(fs.existsSync(snapshot)).toBe(true);
			expect(fs.existsSync(other)).toBe(true);
		});
	});

	describe('conversion cache cleanup directory parity (C3)', () => {
		// 写入方（FileDownloadExportService）缓存目录解析为 mxcadUploadPath || conversionCacheDir，
		// 清理方必须同源，否则真实缓存目录里的孤儿产物永不被清扫。
		it('scans mxcadUploadPath (writer dir) when configured, not batchConfig.conversionCacheDir', async () => {
			const uploadsDir = fs.mkdtempSync(
				path.join(os.tmpdir(), 'bd-uploads-c3-')
			);
			const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
			// 真实缓存目录（uploads）里的过期产物 → 应清扫
			const expired = path.join(
				uploadsDir,
				`${'a'.repeat(32)}-pdf-2000x2000-mono.pdf`
			);
			fs.writeFileSync(expired, 'x'.repeat(128));
			fs.utimesSync(expired, past, past);
			// 旧目录（batchConfig.conversionCacheDir）里的同模式过期文件：写入方不再写此处，清理也不应碰
			const stale = path.join(tempCacheDir, `${'e'.repeat(32)}-dwg.dwg`);
			fs.writeFileSync(stale, 'y');
			fs.utimesSync(stale, past, past);

			mockConfigService.get.mockImplementation((key: string) => {
				if (key === 'mxcadUploadPath') return uploadsDir;
				return {
					exportDir: tempExportDir,
					zipRetentionHours: 24,
					dbRetentionDays: 7,
					conversionCacheDir: tempCacheDir,
					conversionCacheTtlHours: 1,
				};
			});
			const module = await Test.createTestingModule({
				providers: [
					BatchDownloadCleanupService,
					{ provide: DatabaseService, useValue: mockPrisma },
					{ provide: ConfigService, useValue: mockConfigService },
					{
						provide: RuntimeConfigService,
						useValue: mockRuntimeConfigService,
					},
					{ provide: AlertService, useValue: mockAlertService },
					{ provide: TaskRunService, useValue: mockTaskRunService },
					{ provide: CleanupMetricsService, useValue: mockCleanupMetrics },
				],
			}).compile();
			service = module.get(BatchDownloadCleanupService);

			await service.cleanupExpiredConversionCache();

			expect(fs.existsSync(expired)).toBe(false);
			expect(fs.existsSync(stale)).toBe(true);
			fs.rmSync(uploadsDir, { recursive: true, force: true });
		});
	});

	describe('cleanupExpiredDbRecords', () => {
		it('should delete expired db records', async () => {
			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([]);
			mockPrisma.batchDownloadJob.deleteMany.mockResolvedValue({
				count: 3,
			});

			await service.cleanupExpiredDbRecords();

			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'batch-download:db-cleanup',
				expect.any(Function)
			);
			const where = mockPrisma.batchDownloadJob.deleteMany.mock.calls[0][0]
				.where;
			expect(where.createdAt.lte).toBeInstanceOf(Date);
		});

		it('should clean up individual temp files before deleting expired records', async () => {
			const tempPath = path.join(
				os.tmpdir(),
				`bd-cleanup-test-${Date.now()}.dwg`
			);
			fs.writeFileSync(tempPath, 'temp');
			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([
				{
					id: 'job-ind-1',
					itemsManifest: [
						{ index: 0, name: 'a.dwg', sourcePath: tempPath, temp: true },
						{
							index: 1,
							name: 'src.mxweb',
							sourcePath: '/never-delete/source.mxweb',
							temp: false,
						},
					],
				},
			]);
			mockPrisma.batchDownloadJob.deleteMany.mockResolvedValue({ count: 1 });

			await service.cleanupExpiredDbRecords();

			// temp=true 的转换产物被删除；temp=false 的源文件绝不删除
			expect(fs.existsSync(tempPath)).toBe(false);
			expect(mockPrisma.batchDownloadJob.deleteMany).toHaveBeenCalled();
		});

		it('should skip uploads/ cache artifacts (shared content-addressed cache)', async () => {
			const uploadsDir = fs.mkdtempSync(
				path.join(os.tmpdir(), 'bd-uploads-')
			);
			const cachePath = path.join(uploadsDir, 'a1b2c3.dwg');
			fs.writeFileSync(cachePath, 'cache');
			// 让构造函数读到真实 uploads 根，覆盖 beforeEach 的空字符串
			mockConfigService.get.mockImplementation((key: string) => {
				if (key === 'mxcadUploadPath') return uploadsDir;
				return {
					exportDir: tempExportDir,
					zipRetentionHours: 24,
					dbRetentionDays: 7,
					conversionCacheDir: tempCacheDir,
					conversionCacheTtlHours: 1,
				};
			});
			const module = await Test.createTestingModule({
				providers: [
					BatchDownloadCleanupService,
					{ provide: DatabaseService, useValue: mockPrisma },
					{ provide: ConfigService, useValue: mockConfigService },
					{
						provide: RuntimeConfigService,
						useValue: mockRuntimeConfigService,
					},
					{ provide: AlertService, useValue: mockAlertService },
					{ provide: TaskRunService, useValue: mockTaskRunService },
					{
						provide: CleanupMetricsService,
						useValue: mockCleanupMetrics,
					},
				],
			}).compile();
			service = module.get(BatchDownloadCleanupService);

			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([
				{
					id: 'job-ind-2',
					itemsManifest: [
						{ index: 0, name: 'a.dwg', sourcePath: cachePath, temp: true },
					],
				},
			]);
			mockPrisma.batchDownloadJob.deleteMany.mockResolvedValue({ count: 1 });

			await service.cleanupExpiredDbRecords();

			// uploads/ 下产物即使存了 temp:true 也保留（共享缓存由 mtime 清理回收）
			expect(fs.existsSync(cachePath)).toBe(true);
			expect(mockPrisma.batchDownloadJob.deleteMany).toHaveBeenCalled();
		});

		it('should raise task_run_failed (P1) when delete throws (#325 分级)', async () => {
			mockPrisma.batchDownloadJob.findMany.mockResolvedValue([]);
			mockPrisma.batchDownloadJob.deleteMany.mockRejectedValue(
				new Error('db delete error')
			);

			await service.cleanupExpiredDbRecords();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:batch-download',
				messageKey: 'task_run_failed',
				level: AlertLevel.P1,
				message: expect.stringContaining('db delete error'),
				detail: {
					task: 'cleanupExpiredDbRecords',
					error: 'db delete error',
				},
			});
		});
	});
});
