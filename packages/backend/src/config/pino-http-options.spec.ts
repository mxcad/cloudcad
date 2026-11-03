import { join } from 'path';

import {
  buildPinoHttpOptions,
  buildPinoStreamDescriptors,
  type PinoStreamDescriptor,
} from './pino-http-options';
import { resolveLogLevels, type LogLevelPlan } from '@cloudcad/contracts';

describe('pino 配置形态（ADR-0076 级别分裂）', () => {
	const logDirAbs = '/data/logs';
	const logRetentionDays = 180;

	// 基础配置：根级别 / 脱敏 / mixin（不含流）
	const buildOptions = (levels: LogLevelPlan) => buildPinoHttpOptions(levels);

	// 两条流的描述：[0] = 实时流（stdout），[1] = 落盘流（pino-roll）
	const buildDescriptors = (
		levels: LogLevelPlan,
		isProduction: boolean,
	): PinoStreamDescriptor[] =>
		buildPinoStreamDescriptors(levels, logDirAbs, logRetentionDays, isProduction);

	const prod = (levels: LogLevelPlan) => buildDescriptors(levels, true);
	const dev = (levels: LogLevelPlan) => buildDescriptors(levels, false);

	describe('级别分裂的三个赋值点', () => {
		it('根级别取文件级别（落盘全量的前提）', () => {
			expect(buildOptions(resolveLogLevels({}, true)).level).toBe('debug');
		});

		it('生产默认：落盘=debug、实时=error', () => {
			const [realtime, file] = prod(resolveLogLevels({}, true));
			expect(file.level).toBe('debug');
			expect(realtime.level).toBe('error');
		});

		it('开发默认：两条流都全量', () => {
			const levels = resolveLogLevels({}, false);
			const [realtime, file] = dev(levels);
			expect(buildOptions(levels).level).toBe('debug');
			expect(file.level).toBe('debug');
			expect(realtime.level).toBe('debug');
		});
	});

	describe('两条流级别互不影响', () => {
		it('LOG_CONSOLE_LEVEL 只放开实时流，不动根级别与落盘级别', () => {
			const levels = resolveLogLevels({ LOG_CONSOLE_LEVEL: 'info' }, true);
			const [realtime, file] = prod(levels);
			expect(realtime.level).toBe('info');
			expect(buildOptions(levels).level).toBe('debug');
			expect(file.level).toBe('debug');
		});

		it('LOG_FILE_LEVEL 收紧根级别与落盘级别，实时流保持 error', () => {
			const levels = resolveLogLevels({ LOG_FILE_LEVEL: 'info' }, true);
			const [realtime, file] = prod(levels);
			expect(buildOptions(levels).level).toBe('info');
			expect(file.level).toBe('info');
			expect(realtime.level).toBe('error');
		});

		it('实时级别独立于根级别：根级别被 LOG_FILE_LEVEL 收紧时实时仍可单独放开', () => {
			const levels = resolveLogLevels(
				{ LOG_FILE_LEVEL: 'error', LOG_CONSOLE_LEVEL: 'debug' },
				true,
			);
			const [realtime, file] = prod(levels);
			expect(realtime.level).toBe('debug');
			expect(file.level).toBe('error');
			expect(buildOptions(levels).level).toBe('error');
		});
	});

	describe('实时流按环境分叉（都走主进程 stdout，避免 worker 写字节被 GBK 控制台误读）', () => {
		it('生产为 JSON 行（stdout-json）', () => {
			expect(prod(resolveLogLevels({}, true))[0].kind).toBe('stdout-json');
		});

		it('开发为 pino-pretty 彩色输出（stdout-pretty）', () => {
			const realtime = dev(resolveLogLevels({}, false))[0];
			expect(realtime.kind).toBe('stdout-pretty');
			expect(realtime.singleLine).toBe(true);
			expect(realtime.colorize).toBe(true);
		});
	});

	describe('落盘流', () => {
		it('固定为 pino-roll 按天轮转，路径与保留天数来自入参', () => {
			const file = prod(resolveLogLevels({}, true))[1];
			expect(file.kind).toBe('roll');
			expect(file.file).toBe(join(logDirAbs, 'backend', 'app.log'));
			expect(file.frequency).toBe('daily');
			expect(file.dateFormat).toBe('yyyy-MM-dd');
			expect(file.mkdir).toBe(true);
			expect(file.limit).toEqual({ count: 180 });
		});

		it('LOG_RETENTION_DAYS 变化时保留份数跟着变', () => {
			const descriptors = buildPinoStreamDescriptors(
				resolveLogLevels({}, true),
				logDirAbs,
				30,
				true,
			);
			expect(descriptors[1].limit).toEqual({ count: 30 });
		});
	});

	describe('流清单固定', () => {
		it('恰好两条流（实时 + 落盘），autoLogging 关闭避免第三条访问日志流', () => {
			const levels = resolveLogLevels({}, true);
			const descriptors = prod(levels);
			expect(descriptors).toHaveLength(2);
			expect(descriptors.map((d) => d.kind)).toEqual(['stdout-json', 'roll']);
			expect(buildOptions(levels).autoLogging).toBe(false);
		});
	});

	describe('ADR-0055 §1 脱敏未随抽取丢失', () => {
		it('关键敏感路径仍在 redact.paths 内', () => {
			const options = buildOptions(resolveLogLevels({}, true));
			const paths = options.redact.paths;
			for (const expected of [
				'password',
				'token',
				'authorization',
				'req.headers.authorization',
			]) {
				expect(paths).toContain(expected);
			}
			expect(options.redact.censor).toBe('[Redacted]');
		});
	});

	describe('traceId 混入函数', () => {
		it('mixin 是函数，CLS 未初始化时返回空对象', () => {
			const options = buildOptions(resolveLogLevels({}, true));
			expect(typeof options.mixin).toBe('function');
			expect(options.mixin()).toEqual({});
		});
	});
});
