import configuration from './configuration';

describe('configuration', () => {
	const ORIGINAL_ENV = process.env;

	beforeEach(() => {
		jest.resetModules();
		process.env = { ...ORIGINAL_ENV };
		delete process.env.TASK_RUN_RETENTION_DAYS;
	});

	afterEach(() => {
		process.env = ORIGINAL_ENV;
	});

	describe('taskRun.retentionDays (#326)', () => {
		it('should default to 180 when TASK_RUN_RETENTION_DAYS is not set', () => {
			const config = configuration();

			expect(config.taskRun.retentionDays).toBe(180);
		});

		it('should use TASK_RUN_RETENTION_DAYS from env when set', () => {
			process.env.TASK_RUN_RETENTION_DAYS = '90';

			const config = configuration();

			expect(config.taskRun.retentionDays).toBe(90);
		});
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
});
