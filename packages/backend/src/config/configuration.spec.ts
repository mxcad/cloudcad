import configuration from './configuration';

describe('configuration', () => {
	const ORIGINAL_ENV = process.env;

	beforeEach(() => {
		jest.resetModules();
		process.env = { ...ORIGINAL_ENV };
	});

	afterEach(() => {
		process.env = ORIGINAL_ENV;
	});

	describe('生产环境必需环境变量（#419 等保 8.1.2.2）', () => {
		// 生产语义下 REDIS_PASSWORD 必填——内部链路 Redis 须 requirepass
		const requiredVars = [
			'JWT_SECRET',
			'DB_PASSWORD',
			'SESSION_SECRET',
			'REDIS_PASSWORD',
		];

		beforeEach(() => {
			process.env.NODE_ENV = 'production';
			requiredVars.forEach((v) => {
				process.env[v] = `dev-${v}`;
			});
			// getRequiredEnv 在生产下对缺失项同样 fail-fast（JWT_REFRESH_SECRET 不在 requiredVars 但被 jwt.refreshSecret 消费）
			process.env.JWT_REFRESH_SECRET = 'dev-JWT_REFRESH_SECRET';
		});

		it('全部必需变量齐备时正常返回配置', () => {
			expect(() => configuration()).not.toThrow();
			const config = configuration();
			expect(config.redis.password).toBe('dev-REDIS_PASSWORD');
		});

		it('缺失 REDIS_PASSWORD 时启动失败（fail-fast）', () => {
			delete process.env.REDIS_PASSWORD;

			expect(() => configuration()).toThrow(/生产环境缺少必需的环境变量.*REDIS_PASSWORD/);
		});

		it('REDIS_PASSWORD 为空白串视同缺失', () => {
			process.env.REDIS_PASSWORD = '   ';

			expect(() => configuration()).toThrow(/REDIS_PASSWORD/);
		});

			it('非生产环境（dev）缺失 REDIS_PASSWORD 不报错（向后兼容本地无密码 Redis）', () => {
				process.env.NODE_ENV = 'development';
				delete process.env.REDIS_PASSWORD;

				expect(() => configuration()).not.toThrow();
			});
		});

		describe('upload 段（字段必须有消费方，防止「填了没反应」的死配置回归）', () => {
			beforeEach(() => {
				process.env.NODE_ENV = 'development';
				delete process.env.UPLOAD_MAX_FILES;
				delete process.env.UPLOAD_ALLOWED_EXTENSIONS;
				delete process.env.UPLOAD_BLOCKED_EXTENSIONS;
				delete process.env.UPLOAD_MAX_CONCURRENT;
				delete process.env.UPLOAD_CHUNK_MAX_CONCURRENT;
			});

			it('字段集只含有真实读取方的项', () => {
				// maxSize（500MB）与 allowedTypes 全仓零读取方——multer 的 fileSize 走
				// buildMulterUploadLimits（运行时 maxFileSize 兜底 512MB），扩展名校验
				// 走 allowedExtensions。带注释回归即意味着又在配置面放了一个没人读的值。
				expect(Object.keys(configuration().upload).sort()).toEqual([
					'allowedExtensions',
					'blockedExtensions',
					'chunkMaxConcurrent',
					'conversionMaxConcurrent',
					'maxFilesPerUpload',
				]);
			});

			it('conversionMaxConcurrent 默认 3，UPLOAD_MAX_CONCURRENT 可覆盖', () => {
				expect(configuration().upload.conversionMaxConcurrent).toBe(3);
				process.env.UPLOAD_MAX_CONCURRENT = '8';
				expect(configuration().upload.conversionMaxConcurrent).toBe(8);
			});

			it('UPLOAD_MAX_CONCURRENT 非法数值回退 3（不产出 NaN 让限流器失效）', () => {
				process.env.UPLOAD_MAX_CONCURRENT = 'not-a-number';
				expect(configuration().upload.conversionMaxConcurrent).toBe(3);
			});
		});
	});
