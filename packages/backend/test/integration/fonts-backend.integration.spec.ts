///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient, UserStatus } from '@cloudcad/db';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { AppModule } from '../../src/app.module';
import { initIntegrationApp } from '../../src/test/integration-app';
import { SystemRole } from '../../src/common/enums/permissions.enum';

/**
 * Fonts Backend Integration Test (#362)
 *
 * 覆盖 5 个端点的 HTTP 契约 + 权限守卫验证：
 *   T1 — GET  /font-management             列出（空→上传后出现）
 *   T2 — POST /font-management/upload      上传 + 下载内容校验
 *   T3 — DELETE /font-management/:fileName  单删 + 列表消失
 *   T4 — POST /font-management/batch-delete  批量删（部分成功）
 *   T5 — POST /font-management/upload      无效扩展名 → 400
 *   T6 — 权限拒绝（USER 角色无 SYSTEM_FONT_READ）→ 403
 */
describe('Fonts Backend HTTP Integration (#362)', () => {
	let app: INestApplication;
	let prisma: PrismaClient;

	// 临时字体目录（backend/frontend 独立，避免互相干扰）
	let tmpBackendDir: string;
	let tmpFrontendDir: string;

	// ADMIN 用户（FONT_MANAGER 权限，正向测试用）
	let adminEmail: string;
	let adminPassword: string;
	let adminToken: string;

	// USER 用户（无字体权限，权限拒绝测试用）
	let userEmail: string;
	let userPassword: string;
	let userToken: string;

	beforeAll(async () => {
		// 1. 创建临时字体目录，通过 env 注入 FontsService
		tmpBackendDir = await fs.mkdtemp(path.join(tmpdir(), 'fonts-be-'));
		tmpFrontendDir = await fs.mkdtemp(path.join(tmpdir(), 'fonts-fe-'));
		process.env.MXCAD_FONTS_PATH = tmpBackendDir;
		process.env.FRONTEND_FONTS_PATH = tmpFrontendDir;

		// 2. 创建 Nest app（ConfigModule 此时读取 env）
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = initIntegrationApp(moduleFixture.createNestApplication());
		await app.init();

		// 3. Prisma client
		prisma = new PrismaClient({
			adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
		});
		await prisma.$connect();

		// 4. 创建两个测试用户
		const ts = Date.now();
		adminEmail = `fonts-admin-${ts}@example.com`;
		adminPassword = 'Admin@123456';
		userEmail = `fonts-user-${ts}@example.com`;
		userPassword = 'User@123456';

		await cleanupTestData();
		await setupUsers();
	}, 60000);

	afterAll(async () => {
		await cleanupTestData();
		await prisma.$disconnect();
		await app.close();

		// 清理临时目录
		await fs.rm(tmpBackendDir, { recursive: true, force: true });
		await fs.rm(tmpFrontendDir, { recursive: true, force: true });

		delete process.env.MXCAD_FONTS_PATH;
		delete process.env.FRONTEND_FONTS_PATH;
	}, 60000);

	async function cleanupTestData() {
		await prisma.refreshToken.deleteMany({});
		await prisma.user.deleteMany({
			where: {
				email: { in: [adminEmail, userEmail] },
			},
		});
	}

	async function setupUsers() {
		// 查系统角色（由 InitializationService 在 app.init() 时创建）
		const adminRole = await prisma.role.findFirst({
			where: { name: SystemRole.ADMIN },
		});
		const userRole = await prisma.role.findFirst({
			where: { name: SystemRole.USER },
		});

		const adminHash = await bcrypt.hash(adminPassword, 12);
		const userHash = await bcrypt.hash(userPassword, 12);

		await prisma.user.createMany({
			data: [
				{
					email: adminEmail,
					username: `fontsadmin${Date.now()}`,
					password: adminHash,
					nickname: 'Fonts Admin Test User',
					roleId: adminRole!.id,
					status: UserStatus.ACTIVE,
					emailVerified: true,
					emailVerifiedAt: new Date(),
				},
				{
					email: userEmail,
					username: `fontsuser${Date.now()}`,
					password: userHash,
					nickname: 'Fonts User Test User',
					roleId: userRole!.id,
					status: UserStatus.ACTIVE,
					emailVerified: true,
					emailVerifiedAt: new Date(),
				},
			],
		});

		// 登录获取 token
		const adminLogin = await request(app.getHttpServer())
			.post('/v1/auth/login')
			.send({ account: adminEmail, password: adminPassword })
			.expect(200);
		adminToken = adminLogin.body.data.accessToken;

		const userLogin = await request(app.getHttpServer())
			.post('/v1/auth/login')
			.send({ account: userEmail, password: userPassword })
			.expect(200);
		userToken = userLogin.body.data.accessToken;
	}

	/** 构造一个合法的 .ttf 文件内容（最小 ttf 头 + 填充，不需要是真实字体） */
	function makeFakeTtfBuffer(name: string): Buffer {
		const header = Buffer.from(
			[
				0x00, 0x01, 0x00, 0x00, // sfnt version
				0x00, 0x01, // numTables
				0x00, 0x00, 0x00, 0x00, // searchRange, entrySelector, rangeShift
			],
		);
		const padding = Buffer.alloc(60, 0x00);
		return Buffer.concat([header, padding, Buffer.from(name)]);
	}

	describe('T1: List Fonts (empty → after upload)', () => {
		it('T1-S1: Should return empty list initially', async () => {
			const response = await request(app.getHttpServer())
				.get('/v1/font-management')
				.set('Authorization', `Bearer ${adminToken}`)
				.expect(200);

			expect(response.body.data).toEqual([]);
		});

		it('T1-S2: Should support location=backend filter', async () => {
			const response = await request(app.getHttpServer())
				.get('/v1/font-management')
				.query({ location: 'backend' })
				.set('Authorization', `Bearer ${adminToken}`)
				.expect(200);

			expect(Array.isArray(response.body.data)).toBe(true);
			response.body.data.forEach((font: any) => {
				expect(font.existsInBackend).toBe(true);
			});
		});
	});

	describe('T2: Upload + Download Lifecycle', () => {
		const testFontName = 'test-lifecycle.ttf';
		const testFontContent = makeFakeTtfBuffer(testFontName);

		it('T2-S1: Should upload a font file via multipart POST', async () => {
			const response = await request(app.getHttpServer())
				.post('/v1/font-management/upload')
				.set('Authorization', `Bearer ${adminToken}`)
				.field('target', 'both')
				.attach('files', testFontContent, {
					filename: testFontName,
					contentType: 'font/ttf',
				})
				.expect(201);

			expect(response.body.data.message).toBeDefined();
			expect(response.body.data.fonts).toHaveLength(1);
			expect(response.body.data.fonts[0].name).toBe(testFontName);
			expect(response.body.data.fonts[0].extension).toBe('.ttf');
		});

		it('T2-S2: Should list the uploaded font', async () => {
			const response = await request(app.getHttpServer())
				.get('/v1/font-management')
				.set('Authorization', `Bearer ${adminToken}`)
				.expect(200);

			const fonts = response.body.data;
			const found = fonts.find((f: any) => f.name === testFontName);
			expect(found).toBeDefined();
			expect(found.existsInBackend).toBe(true);
			expect(found.existsInFrontend).toBe(true);
		});

		it('T2-S3: Should download the font with correct content', async () => {
			const response = await request(app.getHttpServer())
				.get(`/v1/font-management/download/${encodeURIComponent(testFontName)}`)
				.query({ location: 'backend' })
				.set('Authorization', `Bearer ${adminToken}`)
				.expect(200);

			expect(response.headers['content-type']).toContain('application/octet-stream');
			expect(Buffer.isBuffer(response.body)).toBe(true);
			expect(response.body.length).toBe(testFontContent.length);
		});

		afterAll(async () => {
			// 清理上传的测试文件
			await fs.rm(path.join(tmpBackendDir, testFontName), { force: true });
			await fs.rm(path.join(tmpFrontendDir, testFontName), { force: true });
		});
	});

	describe('T3: Delete Single Font', () => {
		const testFontName = 'test-single-delete.ttf';
		const testFontContent = makeFakeTtfBuffer(testFontName);

		beforeAll(async () => {
			await request(app.getHttpServer())
				.post('/v1/font-management/upload')
				.set('Authorization', `Bearer ${adminToken}`)
				.field('target', 'both')
				.attach('files', testFontContent, {
					filename: testFontName,
					contentType: 'font/ttf',
				})
				.expect(201);
		});

		it('T3-S1: Should delete a font file', async () => {
			const response = await request(app.getHttpServer())
				.delete(`/v1/font-management/${encodeURIComponent(testFontName)}`)
				.query({ target: 'both' })
				.set('Authorization', `Bearer ${adminToken}`)
				.expect(200);

			expect(response.body.data.message).toBeDefined();
		});

		it('T3-S2: Deleted font should not appear in list', async () => {
			const response = await request(app.getHttpServer())
				.get('/v1/font-management')
				.set('Authorization', `Bearer ${adminToken}`)
				.expect(200);

			expect(response.body.data).not.toContainEqual(
				expect.objectContaining({ name: testFontName }),
			);
		});

		it('T3-S3: Should reject delete with path traversal attempt', async () => {
			await request(app.getHttpServer())
				.delete(`/v1/font-management/${encodeURIComponent('../secret.ttf')}`)
				.query({ target: 'both' })
				.set('Authorization', `Bearer ${adminToken}`)
				.expect(400);
		});
	});

	describe('T4: Batch Delete', () => {
		const font1 = 'batch-font-a.ttf';
		const font2 = 'batch-font-b.ttf';

		beforeAll(async () => {
			for (const name of [font1, font2]) {
				await request(app.getHttpServer())
					.post('/v1/font-management/upload')
					.set('Authorization', `Bearer ${adminToken}`)
					.field('target', 'both')
					.attach('files', makeFakeTtfBuffer(name), {
						filename: name,
						contentType: 'font/ttf',
					})
					.expect(201);
			}
		});

		it('T4-S1: Should batch-delete one font while keeping the other', async () => {
			const response = await request(app.getHttpServer())
				.post('/v1/font-management/batch-delete')
				.set('Authorization', `Bearer ${adminToken}`)
				.send({ fileNames: [font1], target: 'both' })
				.expect(200);

			expect(response.body.data.successCount).toBe(1);
			expect(response.body.data.failedCount).toBe(0);
			expect(response.body.data.successIds).toContain(font1);
		});

		it('T4-S2: Only the deleted font should be gone from list', async () => {
			const response = await request(app.getHttpServer())
				.get('/v1/font-management')
				.set('Authorization', `Bearer ${adminToken}`)
				.expect(200);

			const names = response.body.data.map((f: any) => f.name);
			expect(names).not.toContain(font1);
			expect(names).toContain(font2);
		});

		it('T4-S3: Should handle batch-delete of non-existent font gracefully', async () => {
			const response = await request(app.getHttpServer())
				.post('/v1/font-management/batch-delete')
				.set('Authorization', `Bearer ${adminToken}`)
				.send({ fileNames: ['does-not-exist.ttf'], target: 'both' })
				.expect(200);

			expect(response.body.data.successCount).toBe(0);
			expect(response.body.data.failedCount).toBe(1);
		});

		afterAll(async () => {
			await fs.rm(path.join(tmpBackendDir, font2), { force: true });
			await fs.rm(path.join(tmpFrontendDir, font2), { force: true });
		});
	});

	describe('T5: Upload Validation', () => {
		it('T5-S1: Should reject upload with unsupported extension (.exe)', async () => {
			const exeBuffer = Buffer.from('fake exe content');

			await request(app.getHttpServer())
				.post('/v1/font-management/upload')
				.set('Authorization', `Bearer ${adminToken}`)
				.field('target', 'both')
				.attach('files', exeBuffer, {
					filename: 'malware.exe',
					contentType: 'application/octet-stream',
				})
				.expect(400);
		});

		it('T5-S2: Should reject upload without any files', async () => {
			await request(app.getHttpServer())
				.post('/v1/font-management/upload')
				.set('Authorization', `Bearer ${adminToken}`)
				.field('target', 'both')
				.expect(400);
		});
	});

	describe('T6: Permission Rejection', () => {
		it('T6-S1: USER role should be rejected when listing fonts (403)', async () => {
			await request(app.getHttpServer())
				.get('/v1/font-management')
				.set('Authorization', `Bearer ${userToken}`)
				.expect(403);
		});

		it('T6-S2: USER role should be rejected when uploading (403)', async () => {
			const ttfBuffer = makeFakeTtfBuffer('denied.ttf');

			await request(app.getHttpServer())
				.post('/v1/font-management/upload')
				.set('Authorization', `Bearer ${userToken}`)
				.field('target', 'both')
				.attach('files', ttfBuffer, {
					filename: 'denied.ttf',
					contentType: 'font/ttf',
				})
				.expect(403);
		});

		it('T6-S3: USER role should be rejected when deleting (403)', async () => {
			await request(app.getHttpServer())
				.delete('/v1/font-management/nonexistent.ttf')
				.query({ target: 'both' })
				.set('Authorization', `Bearer ${userToken}`)
				.expect(403);
		});

		it('T6-S4: USER role should be rejected when downloading (403)', async () => {
			await request(app.getHttpServer())
				.get('/v1/font-management/download/nonexistent.ttf')
				.query({ location: 'backend' })
				.set('Authorization', `Bearer ${userToken}`)
				.expect(403);
		});
	});
});
