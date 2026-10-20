import { resolveLogLevels } from './log-levels';

describe('resolveLogLevels（ADR-0076 级别分裂）', () => {
	describe('生产环境默认值', () => {
		it('文件=debug（全量落盘）、实时=error', () => {
			expect(resolveLogLevels({}, true)).toEqual({ file: 'debug', console: 'error' });
		});

		it('NODE_ENV=production 触发生产默认', () => {
			const { NODE_ENV } = process.env;
			process.env.NODE_ENV = 'production';
			delete process.env.LOG_FILE_LEVEL;
			delete process.env.LOG_LEVEL;
			delete process.env.LOG_CONSOLE_LEVEL;
			expect(resolveLogLevels(process.env)).toEqual({ file: 'debug', console: 'error' });
			process.env.NODE_ENV = NODE_ENV;
		});
	});

	describe('开发环境默认值', () => {
		it('文件=debug、实时=debug（本地保留全量彩色输出）', () => {
			expect(resolveLogLevels({}, false)).toEqual({ file: 'debug', console: 'debug' });
		});
	});

	describe('环境变量优先级', () => {
		it('LOG_FILE_LEVEL 覆盖默认文件级别', () => {
			expect(resolveLogLevels({ LOG_FILE_LEVEL: 'info' }, true).file).toBe('info');
		});

		it('LOG_CONSOLE_LEVEL 覆盖默认实时级别（排障期临时放开）', () => {
			expect(resolveLogLevels({ LOG_CONSOLE_LEVEL: 'info' }, true).console).toBe('info');
		});

		it('LOG_LEVEL 作为 LOG_FILE_LEVEL 的旧别名生效', () => {
			expect(resolveLogLevels({ LOG_LEVEL: 'warn' }, true).file).toBe('warn');
		});

		it('显式 LOG_FILE_LEVEL 优先于旧别名 LOG_LEVEL', () => {
			expect(
				resolveLogLevels({ LOG_FILE_LEVEL: 'info', LOG_LEVEL: 'warn' }, true).file,
			).toBe('info');
		});

		it('已部署实例的 LOG_LEVEL=warn 不会被新默认覆盖（静默升级防护）', () => {
			expect(resolveLogLevels({ LOG_LEVEL: 'warn' }, true)).toEqual({
				file: 'warn',
				console: 'error',
			});
		});

		it('日志级别互不影响', () => {
			expect(
				resolveLogLevels({ LOG_FILE_LEVEL: 'info', LOG_CONSOLE_LEVEL: 'debug' }, true),
			).toEqual({ file: 'info', console: 'debug' });
		});
	});

	describe('非法值回落', () => {
		it('非法 LOG_FILE_LEVEL 回落到文件默认 debug', () => {
			expect(resolveLogLevels({ LOG_FILE_LEVEL: 'verbose' }, true).file).toBe('debug');
		});

		it('非法 LOG_CONSOLE_LEVEL 回落到实时默认（生产 error，非 debug 刷屏）', () => {
			expect(resolveLogLevels({ LOG_CONSOLE_LEVEL: 'all' }, true).console).toBe('error');
			expect(resolveLogLevels({ LOG_CONSOLE_LEVEL: 'all' }, false).console).toBe('debug');
		});

		it('空串与纯空白不算合法值', () => {
			expect(resolveLogLevels({ LOG_CONSOLE_LEVEL: '   ' }, true).console).toBe('error');
		});

		it('合法值大小写与首尾空白归一化', () => {
			expect(resolveLogLevels({ LOG_FILE_LEVEL: '  Warn ' }, true).file).toBe('warn');
		});

		it('全部级别名均被接受', () => {
			for (const level of ['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']) {
				expect(resolveLogLevels({ LOG_FILE_LEVEL: level }, true).file).toBe(level);
			}
		});
	});
});
