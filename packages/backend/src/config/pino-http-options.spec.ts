import { join } from 'path';

import { buildPinoHttpOptions } from './pino-http-options';
import { resolveLogLevels, type LogLevelPlan } from '@cloudcad/contracts';

describe('buildPinoHttpOptions（ADR-0076 pino 配置形态）', () => {
	const logDirAbs = '/data/logs';
	const logRetentionDays = 180;

	// 两个生产目标：[0] = 实时流，[1] = 落盘流
	const buildProd = (levels: LogLevelPlan) => buildPinoHttpOptions(levels, logDirAbs, logRetentionDays, true);
	const buildDev = (levels: LogLevelPlan) => buildPinoHttpOptions(levels, logDirAbs, logRetentionDays, false);

	describe('级别分裂的三个赋值点', () => {
		it('根级别取文件级别（落盘全量的前提）', () => {
			const options = buildProd(resolveLogLevels({}, true));
			expect(options.level).toBe('debug');
		});

		it('生产默认：落盘=debug、实时=error', () => {
			const options = buildProd(resolveLogLevels({}, true));
			const [realtime, file] = options.transport.targets;
			expect(file.level).toBe('debug');
			expect(realtime.level).toBe('error');
		});

		it('开发默认：两条流都全量', () => {
			const options = buildDev(resolveLogLevels({}, false));
			const [realtime, file] = options.transport.targets;
			expect(options.level).toBe('debug');
			expect(file.level).toBe('debug');
			expect(realtime.level).toBe('debug');
		});
	});

	describe('两条流级别互不影响', () => {
		it('LOG_CONSOLE_LEVEL 只放开实时流，不动根级别与落盘级别', () => {
			const levels = resolveLogLevels({ LOG_CONSOLE_LEVEL: 'info' }, true);
			const options = buildProd(levels);
			const [realtime, file] = options.transport.targets;
			expect(realtime.level).toBe('info');
			expect(options.level).toBe('debug');
			expect(file.level).toBe('debug');
		});

		it('LOG_FILE_LEVEL 收紧根级别与落盘级别，实时流保持 error', () => {
			const levels = resolveLogLevels({ LOG_FILE_LEVEL: 'info' }, true);
			const options = buildProd(levels);
			const [realtime, file] = options.transport.targets;
			expect(options.level).toBe('info');
			expect(file.level).toBe('info');
			expect(realtime.level).toBe('error');
		});

		it('实时级别独立于根级别：根级别被 LOG_FILE_LEVEL 收紧时实时仍可单独放开', () => {
			const levels = resolveLogLevels({ LOG_FILE_LEVEL: 'error', LOG_CONSOLE_LEVEL: 'debug' }, true);
			const options = buildProd(levels);
			const [realtime, file] = options.transport.targets;
			expect(realtime.level).toBe('debug');
			expect(file.level).toBe('error');
			expect(options.level).toBe('error');
		});
	});

	describe('实时目标按环境分叉', () => {
		it('生产走 pino/file 到 stdout（destination 1）', () => {
			const options = buildProd(resolveLogLevels({}, true));
			expect(options.transport.targets[0].target).toBe('pino/file');
			expect(options.transport.targets[0].options).toEqual({ destination: 1 });
		});

		it('开发走 pino-pretty 彩色输出', () => {
			const options = buildDev(resolveLogLevels({}, false));
			expect(options.transport.targets[0].target).toBe('pino-pretty');
			expect(options.transport.targets[0].options).toEqual({ singleLine: true, colorize: true });
		});
	});

	describe('落盘目标', () => {
		it('固定为 pino-roll 按天轮转，路径与保留天数来自入参', () => {
			const options = buildProd(resolveLogLevels({}, true));
			const file = options.transport.targets[1];
			expect(file.target).toBe('pino-roll');
			expect(file.options.file).toBe(join(logDirAbs, 'backend', 'app.log'));
			expect(file.options.frequency).toBe('daily');
			expect(file.options.dateFormat).toBe('yyyy-MM-dd');
			expect(file.options.mkdir).toBe(true);
			expect(file.options.limit).toEqual({ count: 180 });
		});

		it('LOG_RETENTION_DAYS 变化时保留份数跟着变', () => {
			const options = buildPinoHttpOptions(resolveLogLevels({}, true), logDirAbs, 30, true);
			expect(options.transport.targets[1].options.limit).toEqual({ count: 30 });
		});
	});

	describe('流清单固定', () => {
		it('恰好两条流（实时 + 落盘），autoLogging 关闭避免第三条访问日志流', () => {
			const options = buildProd(resolveLogLevels({}, true));
			expect(options.transport.targets).toHaveLength(2);
			expect(options.transport.targets.map((t) => t.target)).toEqual(['pino/file', 'pino-roll']);
			expect(options.autoLogging).toBe(false);
		});
	});

	describe('ADR-0055 §1 脱敏未随抽取丢失', () => {
		it('关键敏感路径仍在 redact.paths 内', () => {
			const options = buildProd(resolveLogLevels({}, true));
			const paths = options.redact.paths;
			for (const expected of ['password', 'token', 'authorization', 'req.headers.authorization']) {
				expect(paths).toContain(expected);
			}
			expect(options.redact.censor).toBe('[Redacted]');
		});
	});

	describe('traceId 混入函数', () => {
		it('mixin 是函数，CLS 未初始化时返回空对象', () => {
			const options = buildProd(resolveLogLevels({}, true));
			expect(typeof options.mixin).toBe('function');
			expect(options.mixin()).toEqual({});
		});
	});
});
