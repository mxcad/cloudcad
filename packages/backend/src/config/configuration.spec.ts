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
		describe('cacheTTL 段（字段必须有消费方，防止「填了没反应」的死配置回归）', () => {
			beforeEach(() => {
				process.env.NODE_ENV = 'development';
				[
					'CACHE_TTL_VERIFICATION_CODE',
					'CACHE_TTL_VERIFICATION_RATE_LIMIT',
					'CACHE_TTL_TOKEN_BLACKLIST',
					'CACHE_TTL_CACHE_VERSION',
					'CACHE_TTL_MXCAD',
				].forEach((v) => delete process.env[v]);
			});

			it('字段集只含有真实读取方的项（#483）', () => {
				// CACHE_TTL_DEFAULT / _PERMISSION / _POLICY 与 CACHE_L2_DEFAULT_TTL、
				// CACHE_VERSION_MAX_AGE 曾在此声明但全仓零读取方，已删除（连同 cache 整段）——
				// 权限缓存的实际 TTL 在 CACHE_TTL 常量表，按角色/项目/成员角色细分，
				// 不是一个 permission/policy 标量能表达的。
				expect(Object.keys(configuration().cacheTTL).sort()).toEqual([
					'cacheVersion',
					'mxcad',
					'tokenBlacklist',
					'verificationCode',
					'verificationRateLimit',
				]);
			});

			it('零读取方的 cache 段不再出现（#483）', () => {
				expect(
					Object.prototype.hasOwnProperty.call(configuration(), 'cache')
				).toBe(false);
			});

			it('CACHE_TTL_MXCAD 默认 300 秒，非法数值回退 300', () => {
				expect(configuration().cacheTTL.mxcad).toBe(300);
				process.env.CACHE_TTL_MXCAD = 'not-a-number';
				expect(configuration().cacheTTL.mxcad).toBe(300);
			});
		});
		describe('session cookie 段（占位符与死配置归一化，2026-10-15 部署包实跑定位）', () => {
		// 历史缺陷：旧版 mergeExampleIntoEnv 把 .env.example 的 25 项「注释 + 示例值」
		// 逐字激活写进 .env，其守卫只防注释态、不收敛已激活存量（生成端刻意保留「已激活的
		// 同值项不得被反向注释」），故只能在这里归一化。三条配置各自让离线 http 部署的 cookie
		// 被浏览器丢弃 -> 协同 401，且无浏览器报错、后端无错误日志。
		const cookieVars = [
			'SESSION_COOKIE_DOMAIN',
			'SESSION_COOKIE_SAME_SITE',
			'SESSION_COOKIE_SECURE',
		];

		beforeEach(() => {
			process.env.NODE_ENV = 'development';
			cookieVars.forEach((v) => delete process.env[v]);
		});

		describe('SESSION_COOKIE_DOMAIN：占位域名视同未配置', () => {
			it('.yourdomain.com 归一化为 undefined（浏览器按请求 host 匹配）', () => {
				process.env.SESSION_COOKIE_DOMAIN = '.yourdomain.com';
				expect(configuration().session.cookieDomain).toBeUndefined();
			});

			it('真实生产域名保留', () => {
				process.env.SESSION_COOKIE_DOMAIN = '.mxdraw3d.com';
				expect(configuration().session.cookieDomain).toBe('.mxdraw3d.com');
			});

			it('未设置时默认 undefined', () => {
				expect(configuration().session.cookieDomain).toBeUndefined();
			});
		});

		describe('SESSION_COOKIE_SECURE：显式 true 视同 auto', () => {
			it('true -> null（http 请求下强制 Secure 会让浏览器丢弃 cookie）', () => {
				process.env.SESSION_COOKIE_SECURE = 'true';
				expect(configuration().session.cookieSecure).toBeNull();
			});

			it('false -> false（显式关闭保留）', () => {
				process.env.SESSION_COOKIE_SECURE = 'false';
				expect(configuration().session.cookieSecure).toBe(false);
			});

			it('auto 与未设置 -> null（按请求协议自适应）', () => {
				expect(configuration().session.cookieSecure).toBeNull();
				process.env.SESSION_COOKIE_SECURE = 'auto';
				expect(configuration().session.cookieSecure).toBeNull();
			});
		});

		describe('SESSION_COOKIE_SAME_SITE：none 回落 lax', () => {
			it('none -> lax（none 需与 Secure 成对，http 不带 Secure 故必然不生效）', () => {
				process.env.SESSION_COOKIE_SAME_SITE = 'none';
				expect(configuration().session.cookieSameSite).toBe('lax');
			});

			it('strict 保留', () => {
				process.env.SESSION_COOKIE_SAME_SITE = 'strict';
				expect(configuration().session.cookieSameSite).toBe('strict');
			});

			it('lax 与未设置 -> lax', () => {
				expect(configuration().session.cookieSameSite).toBe('lax');
				process.env.SESSION_COOKIE_SAME_SITE = 'lax';
				expect(configuration().session.cookieSameSite).toBe('lax');
			});
		});

	});
	});
