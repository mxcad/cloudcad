import { Test, type TestingModule } from '@nestjs/testing';
import client from 'prom-client';
import { PinoLogger } from 'nestjs-pino';
import { CLEANUP_PARTIAL_MESSAGE_KEY, CleanupMetricsService } from './cleanup-metrics.service';

describe('CleanupMetricsService (#325)', () => {
	let service: CleanupMetricsService;

	const mockPinoLogger = {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	};

	beforeEach(async () => {
		jest.clearAllMocks();

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CleanupMetricsService,
				{ provide: PinoLogger, useValue: mockPinoLogger },
			],
		}).compile();

		service = module.get<CleanupMetricsService>(CleanupMetricsService);
	});

	const getMetricValues = async (
		name: string
	): Promise<Array<{ value: number; labels: Record<string, string | number> }>> => {
		const metric = client.register.getSingleMetric(name) as
			| client.Metric<string>
			| undefined;
		expect(metric).toBeDefined();
		return (await (metric as client.Metric<string>).get()).values;
	};

	const findValue = async (name: string, task: string): Promise<number> => {
		const values = await getMetricValues(name);
		return values.find((v) => v.labels.task === task)?.value ?? 0;
	};

	it('should expose the three cleanup_* metrics in the global register', () => {
		expect(client.register.getSingleMetric('cleanup_records_deleted_total')).toBeDefined();
		expect(client.register.getSingleMetric('cleanup_space_freed_bytes')).toBeDefined();
		expect(client.register.getSingleMetric('cleanup_last_duration_seconds')).toBeDefined();
	});

	it('increments cleanup_records_deleted_total by recordsDeleted', async () => {
		service.observe({ task: 't:records-a', recordsDeleted: 5, durationSeconds: 1 });

		await expect(findValue('cleanup_records_deleted_total', 't:records-a')).resolves.toBe(5);

		service.observe({ task: 't:records-a', recordsDeleted: 2, durationSeconds: 1 });

		await expect(findValue('cleanup_records_deleted_total', 't:records-a')).resolves.toBe(7);
	});

	it('defaults recordsDeleted to 0 and still creates the per-task series', async () => {
		await expect(
			findValue('cleanup_records_deleted_total', 't:records-b')
		).resolves.toBe(0);

		service.observe({ task: 't:records-b', durationSeconds: 0.5 });

		await expect(
			findValue('cleanup_records_deleted_total', 't:records-b')
		).resolves.toBe(0);
	});

	it('increments cleanup_space_freed_bytes only when spaceFreedBytes is provided', async () => {
		service.observe({
			task: 't:bytes-a',
			recordsDeleted: 1,
			spaceFreedBytes: 2048,
			durationSeconds: 2,
		});

		await expect(findValue('cleanup_space_freed_bytes', 't:bytes-a')).resolves.toBe(2048);

		service.observe({
			task: 't:bytes-a',
			spaceFreedBytes: 1024,
			durationSeconds: 1,
		});

		await expect(findValue('cleanup_space_freed_bytes', 't:bytes-a')).resolves.toBe(3072);
	});

	it('does not create a freed-bytes series for tasks without spaceFreedBytes', async () => {
		service.observe({ task: 't:bytes-b', recordsDeleted: 3, durationSeconds: 1 });

		await expect(findValue('cleanup_space_freed_bytes', 't:bytes-b')).resolves.toBe(0);
	});

	it('sets cleanup_last_duration_seconds to the latest observation per task', async () => {
		service.observe({ task: 't:dur-a', durationSeconds: 1.25 });
		await expect(findValue('cleanup_last_duration_seconds', 't:dur-a')).resolves.toBe(1.25);

		service.observe({ task: 't:dur-a', durationSeconds: 3.5 });
		await expect(findValue('cleanup_last_duration_seconds', 't:dur-a')).resolves.toBe(3.5);
	});

	it('writes one structured log line per observation with task/rows/freed/duration fields', () => {
		service.observe({
			task: 'storage-cleanup:trash',
			recordsDeleted: 4,
			spaceFreedBytes: 4096,
			durationSeconds: 1.2344,
		});

		expect(mockPinoLogger.info).toHaveBeenCalledTimes(1);
		const [fields, message] = mockPinoLogger.info.mock.calls[0];
		expect(fields).toEqual({
			event: 'cleanup_run',
			task: 'storage-cleanup:trash',
			rows: 4,
			freed: 4096,
			duration: 1.234,
		});
		expect(message).toBe('cleanup_run');
	});

	it('logs rows=0 / freed=0 when counts are omitted', () => {
		service.observe({ task: 'cache-cleanup:stats-log', durationSeconds: 0.002 });

		expect(mockPinoLogger.info).toHaveBeenCalledWith(
			expect.objectContaining({ task: 'cache-cleanup:stats-log', rows: 0, freed: 0 }),
			'cleanup_run'
		);
	});

	it('clamps negative inputs to 0 instead of corrupting counters', async () => {
		service.observe({ task: 't:neg', recordsDeleted: -3, spaceFreedBytes: -100, durationSeconds: -1 });

		await expect(findValue('cleanup_records_deleted_total', 't:neg')).resolves.toBe(0);
		await expect(findValue('cleanup_space_freed_bytes', 't:neg')).resolves.toBe(0);
		await expect(findValue('cleanup_last_duration_seconds', 't:neg')).resolves.toBe(0);
	});

	it('exports the shared cleanup.partial message key for schedulers', () => {
		expect(CLEANUP_PARTIAL_MESSAGE_KEY).toBe('cleanup.partial');
	});
});
