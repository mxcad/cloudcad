///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import configuration from './configuration';

/**
 * configuration() 审计段配置（#322）
 *
 * 接缝：configuration() 纯函数 —— 环境变量 → 结构化配置的唯一出口。
 * 顺带回归：AUDIT_ARCHIVE_ENABLED 必须经 parseBoolean 解析，
 * 字符串 'false' 不得为 truthy（旧实现直接 configService.get('AUDIT_ARCHIVE_ENABLED') 的隐患）。
 */
describe('configuration 审计段（#322）', () => {
	const ORIGINAL_ENV = { ...process.env };

	beforeEach(() => {
		process.env.NODE_ENV = 'development';
		delete process.env.AUDIT_LOG_RETENTION_DAYS;
		delete process.env.AUDIT_RETENTION_DAYS;
		delete process.env.AUDIT_ARCHIVE_ENABLED;
		delete process.env.AUDIT_ARCHIVE_PATH;
	});

	afterAll(() => {
		process.env = ORIGINAL_ENV;
	});

	describe('retentionDays', () => {
		it('默认 183 天（#322：严格大于 6 个月）', () => {
			expect(configuration().audit.retentionDays).toBe(183);
		});

		it('AUDIT_LOG_RETENTION_DAYS 覆盖默认值', () => {
			process.env.AUDIT_LOG_RETENTION_DAYS = '365';
			expect(configuration().audit.retentionDays).toBe(365);
		});

		it('旧变量 AUDIT_RETENTION_DAYS 兼容回退（#207）', () => {
			process.env.AUDIT_RETENTION_DAYS = '90';
			expect(configuration().audit.retentionDays).toBe(90);
		});

		it('非法数值回退默认 183', () => {
			process.env.AUDIT_LOG_RETENTION_DAYS = 'not-a-number';
			expect(configuration().audit.retentionDays).toBe(183);
		});
	});

	describe('archiveEnabled', () => {
		it('默认 false', () => {
			expect(configuration().audit.archiveEnabled).toBe(false);
		});

		it("字面 'true' 开启", () => {
			process.env.AUDIT_ARCHIVE_ENABLED = 'true';
			expect(configuration().audit.archiveEnabled).toBe(true);
		});

		it("字符串 'false' 必须解析为 false（不得 truthy）", () => {
			process.env.AUDIT_ARCHIVE_ENABLED = 'false';
			expect(configuration().audit.archiveEnabled).toBe(false);
		});
	});

	describe('archivePath', () => {
		it("默认 data/archives/audit-logs 并解析为项目根下的绝对路径", () => {
			const archivePath = configuration().audit.archivePath;
			const expectedSuffix = require('path').join('data', 'archives', 'audit-logs');
			expect(archivePath.endsWith(expectedSuffix)).toBe(true);
			expect(require('path').isAbsolute(archivePath)).toBe(true);
		});

		it('支持绝对路径覆盖', () => {
			const tmp = require('os').tmpdir();
			process.env.AUDIT_ARCHIVE_PATH = tmp;
			expect(configuration().audit.archivePath).toBe(
				require('path').normalize(tmp)
			);
		});
	});
});
