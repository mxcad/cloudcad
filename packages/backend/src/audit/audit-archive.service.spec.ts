///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, ResourceType } from '../common/enums/audit.enum';
import type { AuditLogListItem } from './audit-log.service';
import { DatabaseService } from '../database/database.service';
import { AuditArchiveService } from './audit-archive.service';
import { verifyChainFiles } from './audit-chain';

/**
 * 审计日志按月归档（#322，fail-closed）+ 删除前置归档校验（#323）
 *
 * 接缝：AuditArchiveService.archiveExpiredLogs(days) / verifyArchivedForCutoff(cutoff)
 * 文件系统用真实临时目录验证；哈希断言用 crypto 独立重算（非复用实现）。
 */
describe('AuditArchiveService (#322)', () => {
	let service: AuditArchiveService;
	let tmpDir: string;

	const mockPrisma = {
		auditLog: {
			findMany: jest.fn(),
			deleteMany: jest.fn(),
		},
		$queryRaw: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn(),
	};

	function makeLog(overrides: Partial<AuditLogListItem> = {}): AuditLogListItem {
		return {
			id: 'log-1',
			createdAt: new Date('2026-06-15T08:00:00Z'),
			action: AuditAction.FILE_UPLOAD,
			resourceType: ResourceType.FILE,
			resourceId: 'res-1',
			resourceName: '图纸A.dwg',
			projectId: 'proj-1',
			userId: 'user-1',
			user: { id: 'user-1', email: 'alice@test.com', username: 'alice' },
			ipAddress: '127.0.0.1',
			userAgent: 'jest-agent',
			success: true,
			errorMessage: null,
			params: { foo: 'bar' },
			...overrides,
		} as unknown as AuditLogListItem;
	}

	async function readCsvFile(month: string): Promise<Buffer> {
		return fs.readFile(path.join(tmpDir, `${month}.csv`));
	}

	async function readManifest(month: string): Promise<string> {
		return fs.readFile(path.join(tmpDir, `${month}.sha256`), 'utf8');
	}

	beforeEach(async () => {
		jest.clearAllMocks();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-archive-test-'));
		mockConfigService.get.mockImplementation((key: string, def: unknown) =>
			key === 'audit.archivePath' ? tmpDir : def
		);
		mockPrisma.auditLog.findMany.mockResolvedValue([]);
		mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 });

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuditArchiveService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: ConfigService, useValue: mockConfigService },
			],
		}).compile();

		service = module.get<AuditArchiveService>(AuditArchiveService);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('无超期记录：不写任何文件、不删库', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([]);

		const result = await service.archiveExpiredLogs(183);

		expect(result.files).toEqual([]);
		expect(result.archivedCount).toBe(0);
		expect(result.deletedCount).toBe(0);
		expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
		const entries = await fs.readdir(tmpDir);
		expect(entries).toEqual([]);
	});

	it('跨月记录按月分片：CSV 带 UTF-8 BOM、行内容正确', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([
			makeLog(),
			makeLog({
				id: 'log-2',
				createdAt: new Date('2026-07-01T23:59:59Z'),
				resourceName: '带,逗号"引号".dwg',
			}),
		]);

		const result = await service.archiveExpiredLogs(183);

		const months = result.files.map((f) => f.month).sort();
		expect(months).toEqual(['2026-06', '2026-07']);
		expect(result.archivedCount).toBe(2);

		const juneCsv = await readCsvFile('2026-06');
		expect(juneCsv[0]).toBe(0xef); // UTF-8 BOM
		expect(juneCsv[1]).toBe(0xbb);
		expect(juneCsv[2]).toBe(0xbf);
		const juneText = juneCsv.toString('utf8');
		expect(juneText).toContain('时间');
		expect(juneText).toContain('alice');
		expect(juneText).toContain('2026-06-15T08:00:00.000Z');

		// CSV 转义语义与 exportLogs 一致（RFC 4180）
		const julyText = (await readCsvFile('2026-07')).toString('utf8');
		expect(julyText).toContain('"带,逗号""引号"".dwg"');
	});

	it('SHA-256 清单与文件实际内容一致（sha256sum -c 两空格格式）', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([makeLog()]);

		const result = await service.archiveExpiredLogs(183);

		const file = result.files[0];
		expect(file.month).toBe('2026-06');

		const actualBytes = await readCsvFile('2026-06');
		const expectedSha = createHash('sha256').update(actualBytes).digest('hex');
		expect(file.sha256).toBe(expectedSha);
		expect(await readManifest('2026-06')).toBe(`${expectedSha}  2026-06.csv\n`);
	});

	it('归档成功后才删除超期记录，且导出查询无行数上限', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([makeLog()]);
		mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 1 });

		const result = await service.archiveExpiredLogs(183);

		expect(result.deletedCount).toBe(1);
		expect(mockPrisma.auditLog.deleteMany).toHaveBeenCalledTimes(1);

		const exportArgs = mockPrisma.auditLog.findMany.mock.calls[0][0];
		expect(exportArgs.take).toBeUndefined(); // fail-closed：必须导出全部超期记录
		const lt = mockPrisma.auditLog.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
		const expectedCutoff = Date.now() - 183 * 24 * 3600 * 1000;
		expect(Math.abs(lt.getTime() - expectedCutoff)).toBeLessThan(60_000);
	});

	it('fail-closed：写盘失败时保留记录并抛错（不删库）', async () => {
		// 归档路径指向一个已存在的普通文件 → mkdir 必然失败（跨平台稳定构造写盘失败）
		const blockedPath = path.join(tmpDir, 'not-a-dir');
		await fs.writeFile(blockedPath, 'x');
		mockConfigService.get.mockImplementation((key: string, def: unknown) =>
			key === 'audit.archivePath' ? blockedPath : def
		);
		mockPrisma.auditLog.findMany.mockResolvedValue([makeLog()]);
		mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 1 });

		await expect(service.archiveExpiredLogs(183)).rejects.toThrow();

		expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
	});

	it('fail-closed：清单写入失败时不删库（先全部归档成功才删除）', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([
			makeLog(),
			makeLog({ id: 'log-2', createdAt: new Date('2026-07-10T00:00:00Z') }),
		]);
		// 第二个月分片 CSV 写入后破坏其清单落盘：把 07 的 .sha256 目标位置占位为目录
		// （writeFile 到目录路径必然失败），模拟"归档中途失败"
		await fs.mkdir(path.join(tmpDir, '2026-07.sha256'));

		mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 2 });

		await expect(service.archiveExpiredLogs(183)).rejects.toThrow();

		expect(mockPrisma.auditLog.deleteMany).not.toHaveBeenCalled();
	});

	it('重跑覆盖旧分片文件（幂等），清单同步更新', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([makeLog()]);
		await service.archiveExpiredLogs(183);

		const changed = makeLog({ resourceName: '改名后.dwg' });
		mockPrisma.auditLog.findMany.mockResolvedValue([changed]);
		await service.archiveExpiredLogs(183);

		const csvText = (await readCsvFile('2026-06')).toString('utf8');
		expect(csvText).toContain('改名后.dwg');
		const expectedSha = createHash('sha256')
			.update(await readCsvFile('2026-06'))
			.digest('hex');
		expect(await readManifest('2026-06')).toBe(`${expectedSha}  2026-06.csv\n`);
	});
});

/**
 * #323 删除前置归档校验（verifyArchivedForCutoff）
 *
 * 门禁语义：目标时间段的每个月度分片必须有 CSV + SHA-256 清单，
 * 且 CSV 实际哈希与清单一致；任一不满足即报违规（未归档拒删）。
 */
describe('AuditArchiveService verifyArchivedForCutoff (#323)', () => {
	let service: AuditArchiveService;
	let tmpDir: string;

	const mockPrisma = {
		$queryRaw: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn(),
	};

	async function writeShard(month: string, csvText: string): Promise<void> {
		await fs.writeFile(
			path.join(tmpDir, `${month}.csv`),
			Buffer.from(`\uFEFF${csvText}`, 'utf8'),
		);
		const sha = createHash('sha256')
			.update(await fs.readFile(path.join(tmpDir, `${month}.csv`)))
			.digest('hex');
		await fs.writeFile(
			path.join(tmpDir, `${month}.sha256`),
			`${sha}  ${month}.csv\n`,
			'utf8',
		);
	}

	beforeEach(async () => {
		jest.clearAllMocks();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-archive-verify-'));
		mockConfigService.get.mockImplementation((key: string, def: unknown) =>
			key === 'audit.archivePath' ? tmpDir : def
		);
		mockPrisma.$queryRaw.mockResolvedValue([]);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuditArchiveService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: ConfigService, useValue: mockConfigService },
			],
		}).compile();

		service = module.get<AuditArchiveService>(AuditArchiveService);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('无超期记录：无需归档产物，直接通过', async () => {
		mockPrisma.$queryRaw.mockResolvedValue([]);

		await expect(service.verifyArchivedForCutoff(new Date())).resolves.toEqual(
			[],
		);
		expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
	});

	it('全部月份分片齐全且哈希一致：校验通过（空违规）', async () => {
		mockPrisma.$queryRaw.mockResolvedValue([
			{ month: '2026-05' },
			{ month: '2026-06' },
		]);
		await writeShard('2026-05', 'a,b\n1,2');
		await writeShard('2026-06', 'x,y\n3,4');

		await expect(service.verifyArchivedForCutoff(new Date())).resolves.toEqual(
			[],
		);
	});

	it('CSV 缺失：报 CSV_MISSING 且不继续查清单', async () => {
		mockPrisma.$queryRaw.mockResolvedValue([{ month: '2026-06' }]);

		const violations = await service.verifyArchivedForCutoff(new Date());

		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({
			month: '2026-06',
			reason: 'CSV_MISSING',
		});
	});

	it('清单缺失：报 MANIFEST_MISSING', async () => {
		mockPrisma.$queryRaw.mockResolvedValue([{ month: '2026-06' }]);
		await fs.writeFile(
			path.join(tmpDir, '2026-06.csv'),
			'\uFEFFa,b\n1,2',
			'utf8',
		);

		const violations = await service.verifyArchivedForCutoff(new Date());

		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({
			month: '2026-06',
			reason: 'MANIFEST_MISSING',
		});
	});

	it('CSV 被篡改/损坏（实际哈希与清单不符）：报 HASH_MISMATCH 拒绝放行', async () => {
		mockPrisma.$queryRaw.mockResolvedValue([{ month: '2026-06' }]);
		await writeShard('2026-06', 'a,b\n1,2');
		// 归档落盘后内容被改动（截断/篡改场景）
		await fs.writeFile(path.join(tmpDir, '2026-06.csv'), '\uFEFFtampered');

		const violations = await service.verifyArchivedForCutoff(new Date());

		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({
			month: '2026-06',
			reason: 'HASH_MISMATCH',
		});
		expect(String(violations[0].detail)).toContain('actual=');
	});

	it('部分月份缺失：逐月报告所有违规', async () => {
		mockPrisma.$queryRaw.mockResolvedValue([
			{ month: '2026-04' },
			{ month: '2026-05' },
			{ month: '2026-06' },
		]);
		// 仅 2026-05 产物齐全
		await writeShard('2026-05', 'ok\n1');

		const violations = await service.verifyArchivedForCutoff(new Date());

		expect(violations.map((v) => `${v.month}:${v.reason}`).sort()).toEqual([
			'2026-04:CSV_MISSING',
			'2026-06:CSV_MISSING',
		]);
	});
});

/**
 * 哈希链（#420，等保 8.1.4.3 审计记录保护）
 *
 * 接缝：archiveExpiredLogs 生成 `<month>.chain.json` + `chain-head.json`；
 * verifyChain 校验链式连续性。链哈希公式与实现共用 computeChainHash（独立重算验证）。
 */
describe('AuditArchiveService 哈希链 (#420)', () => {
	let service: AuditArchiveService;
	let tmpDir: string;

	const mockPrisma = {
		auditLog: { findMany: jest.fn(), deleteMany: jest.fn() },
		$queryRaw: jest.fn(),
	};
	const mockConfigService = { get: jest.fn() };

	function makeLog(month: string, id: string): unknown {
		return {
			id,
			createdAt: new Date(`${month}-15T08:00:00Z`),
			action: 'FILE_UPLOAD',
			resourceType: 'FILE',
			resourceId: 'res-1',
			resourceName: '图纸.dwg',
			projectId: 'proj-1',
			userId: 'user-1',
			user: { id: 'user-1', email: 'alice@test.com', username: 'alice' },
			ipAddress: '127.0.0.1',
			userAgent: 'jest-agent',
			success: true,
			errorMessage: null,
			params: {},
		};
	}

	function readChain(month: string): Promise<Record<string, string>> {
		return fs
			.readFile(path.join(tmpDir, `${month}.chain.json`), 'utf8')
			.then((s) => JSON.parse(s));
	}

	beforeEach(async () => {
		jest.clearAllMocks();
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-chain-test-'));
		mockConfigService.get.mockImplementation((key: string, def: unknown) =>
			key === 'audit.archivePath' ? tmpDir : def
		);
		mockPrisma.auditLog.findMany.mockResolvedValue([]);
		mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 });

		const module = await Test.createTestingModule({
			providers: [
				AuditArchiveService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: ConfigService, useValue: mockConfigService },
			],
		}).compile();
		service = module.get<AuditArchiveService>(AuditArchiveService);
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('computeChainHash 为确定性纯函数（同入参同输出，异入参异输出）', () => {
		const a = AuditArchiveService.computeChainHash('2026-06', 'shaA', '');
		const b = AuditArchiveService.computeChainHash('2026-06', 'shaA', '');
		const c = AuditArchiveService.computeChainHash('2026-06', 'shaB', '');
		expect(a).toBe(b);
		expect(a).not.toBe(c);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	it('归档两期：首期 prevHash 空、次期链接首期 chainHash，链头=最新期', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([
			makeLog('2026-06', 'log-1'),
			makeLog('2026-07', 'log-2'),
		]);

		const result = await service.archiveExpiredLogs(183);
		const byMonth = new Map(result.files.map((f) => [f.month, f]));
		const june = byMonth.get('2026-06')!;
		const july = byMonth.get('2026-07')!;

		// 首期 prevHash 空，chainHash 独立重算一致
		expect(june.prevHash).toBe('');
		expect(june.chainHash).toBe(
			AuditArchiveService.computeChainHash('2026-06', june.sha256, ''),
		);
		// 次期 prevHash=首期 chainHash
		expect(july.prevHash).toBe(june.chainHash);
		expect(july.chainHash).toBe(
			AuditArchiveService.computeChainHash('2026-07', july.sha256, june.chainHash),
		);

		// 链头状态文件=最新期
		const head = JSON.parse(
			await fs.readFile(path.join(tmpDir, 'chain-head.json'), 'utf8'),
		);
		expect(head).toEqual({
			latestMonth: '2026-07',
			latestChainHash: july.chainHash,
		});
	});

	it('verifyChain：完整链校验通过（firstBreak=null）', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([
			makeLog('2026-06', 'log-1'),
			makeLog('2026-07', 'log-2'),
		]);
		await service.archiveExpiredLogs(183);

		const verify = await verifyChainFiles(tmpDir);
		expect(verify.firstBreak).toBeNull();
		expect(verify.verifiedCount).toBe(2);
		expect(verify.months).toEqual(['2026-06', '2026-07']);
	});

	it('verifyChain：篡改某期 csvSha256 → 定位到该期 CHAIN_HASH_MISMATCH', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([
			makeLog('2026-06', 'log-1'),
			makeLog('2026-07', 'log-2'),
		]);
		await service.archiveExpiredLogs(183);

		// 篡改 2026-07 的 csvSha256（模拟清单/CSV 被改动后未重算链）
		const july = await readChain('2026-07');
		july.csvSha256 = 'tampered'.padEnd(64, '0');
		await fs.writeFile(
			path.join(tmpDir, '2026-07.chain.json'),
			JSON.stringify(july),
			'utf8',
		);

		const verify = await verifyChainFiles(tmpDir);
		expect(verify.firstBreak).not.toBeNull();
		expect(verify.firstBreak!.month).toBe('2026-07');
		expect(verify.firstBreak!.reason).toMatch(/CHAIN_HASH_MISMATCH/);
	});

	it('verifyChain：篡改 CSV 本体（清单/链文件完好）→ 检出 CSV_MISMATCH（验收：篡改历史 CSV 报错）', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([
			makeLog('2026-06', 'log-1'),
			makeLog('2026-07', 'log-2'),
		]);
		await service.archiveExpiredLogs(183);

		// 仅篡改 2026-07 的 CSV 文件内容（chain.json / .sha256 清单均完好）
		await fs.writeFile(
			path.join(tmpDir, '2026-07.csv'),
			'\uFEFFtampered-content',
			'utf8',
		);

		const verify = await verifyChainFiles(tmpDir);
		expect(verify.firstBreak).not.toBeNull();
		expect(verify.firstBreak!.month).toBe('2026-07');
		expect(verify.firstBreak!.reason).toMatch(/CSV_MISMATCH/);
	});

	it('verifyChain：篡改某期 prevHash（断链）→ 定位到该期 PREV_HASH_BREAK', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([
			makeLog('2026-06', 'log-1'),
			makeLog('2026-07', 'log-2'),
		]);
		await service.archiveExpiredLogs(183);

		// 篡改 2026-07 的 prevHash（模拟插期/删期/断链）
		const july = await readChain('2026-07');
		const june = await readChain('2026-06');
		july.prevHash = june.chainHash.replace(/^./, (c) =>
			c === 'a' ? 'b' : 'a',
		);
		// 同时重算 chainHash 以隔离出 prevHash 断链（而非哈希不匹配）
		july.chainHash = AuditArchiveService.computeChainHash(
			'2026-07',
			july.csvSha256,
			july.prevHash,
		);
		await fs.writeFile(
			path.join(tmpDir, '2026-07.chain.json'),
			JSON.stringify(july),
			'utf8',
		);

		const verify = await verifyChainFiles(tmpDir);
		expect(verify.firstBreak).not.toBeNull();
		expect(verify.firstBreak!.month).toBe('2026-07');
		expect(verify.firstBreak!.reason).toMatch(/PREV_HASH_BREAK/);
	});

	it('verifyChain：删除中间期（2026-06）→ 2026-07 prevHash 失配定位断点', async () => {
		mockPrisma.auditLog.findMany.mockResolvedValue([
			makeLog('2026-06', 'log-1'),
			makeLog('2026-07', 'log-2'),
		]);
		await service.archiveExpiredLogs(183);

		// 删除中间期 2026-06 的 chain 文件（模拟删期）
		await fs.rm(path.join(tmpDir, '2026-06.chain.json'));

		const verify = await verifyChainFiles(tmpDir);
		// 2026-07 成为"首期"但其 prevHash 非空 → PREV_HASH_BREAK
		expect(verify.firstBreak).not.toBeNull();
		expect(verify.firstBreak!.month).toBe('2026-07');
		expect(verify.firstBreak!.reason).toMatch(/PREV_HASH_BREAK/);
	});
});

/**
 * 启动自检（#420）：生产环境关闭审计归档时 Logger WARN（不阻塞启动）
 */
describe('AuditArchiveService 启动自检 (#420)', () => {
	let service: AuditArchiveService;
	let warnSpy: jest.SpyInstance;
	let originalNodeEnv: string | undefined;

	const mockPrisma = {
		auditLog: { findMany: jest.fn(), deleteMany: jest.fn() },
		$queryRaw: jest.fn(),
	};
	const mockConfigService = { get: jest.fn() };

	beforeEach(async () => {
		originalNodeEnv = process.env.NODE_ENV;
		warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
		mockPrisma.auditLog.findMany.mockResolvedValue([]);
		mockPrisma.auditLog.deleteMany.mockResolvedValue({ count: 0 });

		const module = await Test.createTestingModule({
			providers: [
				AuditArchiveService,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: ConfigService, useValue: mockConfigService },
			],
		}).compile();
		service = module.get<AuditArchiveService>(AuditArchiveService);
	});

	afterEach(() => {
		warnSpy.mockRestore();
		process.env.NODE_ENV = originalNodeEnv;
	});

	it('生产环境 + 归档关闭 → WARN 提示合规缺口', () => {
		process.env.NODE_ENV = 'production';
		mockConfigService.get.mockImplementation(
			(key: string, def: unknown) =>
				key === 'audit.archiveEnabled' ? false : def,
		);

		service.onApplicationBootstrap();

		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('生产环境已关闭审计日志归档'),
		);
	});

	it('生产环境 + 归档开启 → 不告警', () => {
		process.env.NODE_ENV = 'production';
		mockConfigService.get.mockImplementation(
			(key: string, def: unknown) =>
				key === 'audit.archiveEnabled' ? true : def,
		);

		service.onApplicationBootstrap();

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it('非生产环境 + 归档关闭 → 不告警（本地开发可自由关闭）', () => {
		process.env.NODE_ENV = 'test';
		mockConfigService.get.mockImplementation(
			(key: string, def: unknown) =>
				key === 'audit.archiveEnabled' ? false : def,
		);

		service.onApplicationBootstrap();

		expect(warnSpy).not.toHaveBeenCalled();
	});
});
