import { Test, type TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TaskRunController } from './task-run.controller';
import { TaskRunService } from './task-run.service';
import { AlertService } from '../alert/alert.service';
import { TaskRunStatus, TaskRunTrigger } from './enums/task-run.enum';
import { SystemPermission } from '../common/enums/permissions.enum';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';

describe('TaskRunController', () => {
	let controller: TaskRunController;
	let mockTaskRunService: {
		run: jest.Mock;
		getRunner: jest.Mock;
		findRecent: jest.Mock;
		listRunners: jest.Mock;
	};
	let mockAlertService: { raise: jest.Mock; resolveBySourceKey: jest.Mock };

	const mockReq = (userId = 'user-1') =>
		({ user: { id: userId } }) as never;

	beforeEach(async () => {
		jest.clearAllMocks();
		mockTaskRunService = {
			run: jest.fn(),
			getRunner: jest.fn(),
			findRecent: jest.fn(),
			listRunners: jest.fn(),
		};
		mockAlertService = {
			raise: jest.fn(),
			resolveBySourceKey: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [TaskRunController],
			providers: [
				{ provide: TaskRunService, useValue: mockTaskRunService },
				{ provide: AlertService, useValue: mockAlertService },
			],
		})
			.overrideGuard(RolesGuard)
			.useValue({ canActivate: jest.fn().mockResolvedValue(true) })
			.overrideGuard(PermissionsGuard)
			.useValue({ canActivate: jest.fn().mockResolvedValue(true) })
			.compile();

		controller = module.get<TaskRunController>(TaskRunController);
	});

	describe('permission metadata', () => {
		it('should require SYSTEM_MONITOR at class level', () => {
			const reflector = new Reflector();
			const permissions = reflector.getAllAndOverride<SystemPermission[]>(
				PERMISSIONS_KEY,
				[TaskRunController.prototype.listRuns, TaskRunController]
			);
			expect(permissions).toEqual([SystemPermission.SYSTEM_MONITOR]);
		});

		it('should require SYSTEM_ADMIN on runTask method', () => {
			const reflector = new Reflector();
			const permissions = reflector.getAllAndOverride<SystemPermission[]>(
				PERMISSIONS_KEY,
				[TaskRunController.prototype.runTask, TaskRunController]
			);
			expect(permissions).toEqual([SystemPermission.SYSTEM_ADMIN]);
		});

		it('should inherit class-level SYSTEM_MONITOR on listTasks', () => {
			const reflector = new Reflector();
			const permissions = reflector.getAllAndOverride<SystemPermission[]>(
				PERMISSIONS_KEY,
				[TaskRunController.prototype.listTasks, TaskRunController]
			);
			expect(permissions).toEqual([SystemPermission.SYSTEM_MONITOR]);
		});
	});

	describe('listRuns', () => {
		it('should delegate to findRecent with filters and pagination', async () => {
			const result = { data: [], pagination: { total: 0 } };
			mockTaskRunService.findRecent.mockResolvedValue(result);

			const query = {
				taskName: 'test:task',
				status: TaskRunStatus.FAILED,
				trigger: TaskRunTrigger.MANUAL,
				page: 2,
				limit: 10,
			};

			const response = await controller.listRuns(query as never);

			expect(response).toBe(result);
			expect(mockTaskRunService.findRecent).toHaveBeenCalledWith(
				{
					taskName: 'test:task',
					status: TaskRunStatus.FAILED,
					trigger: TaskRunTrigger.MANUAL,
				},
				{ page: 2, limit: 10 }
			);
		});

		it('should default page/limit to 1/20', async () => {
			mockTaskRunService.findRecent.mockResolvedValue({
				data: [],
				pagination: { total: 0 },
			});

			await controller.listRuns({} as never);

			expect(mockTaskRunService.findRecent).toHaveBeenCalledWith(
				{},
				{ page: 1, limit: 20 }
			);
		});
	});

	describe('listTasks', () => {
		it('should return registered tasks wrapped in { data }', async () => {
			const runners = [
				{
					taskName: 'storage-cleanup:expired-storage',
					description: '清理过期存储',
					schedule: '0 3 * * *',
					scheduleLabel: '每天 03:00',
				},
			];
			mockTaskRunService.listRunners.mockReturnValue(runners);

			const response = await controller.listTasks();

			expect(mockTaskRunService.listRunners).toHaveBeenCalledTimes(1);
			expect(response).toEqual({ data: runners });
		});

		it('should return empty data when no tasks registered', async () => {
			mockTaskRunService.listRunners.mockReturnValue([]);

			const response = await controller.listTasks();

			expect(response).toEqual({ data: [] });
		});
	});

	describe('runTask', () => {
		it('should run registered task with MANUAL trigger and audit log', async () => {
			const execute = jest.fn().mockResolvedValue(undefined);
			mockTaskRunService.getRunner.mockReturnValue({
				description: '测试任务',
				execute,
			});
			mockTaskRunService.run.mockResolvedValue(undefined);
			const auditSpy = jest
				.spyOn(
					(controller as unknown as { logger: { log: () => void } }).logger,
					'log'
				)
				.mockImplementation(() => undefined);

			const response = await controller.runTask(
				{ taskName: 'test:task' } as never,
				mockReq('admin-1')
			);

			expect(mockTaskRunService.getRunner).toHaveBeenCalledWith('test:task');
			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'test:task',
				expect.any(Function),
				{ trigger: TaskRunTrigger.MANUAL, triggeredBy: 'admin-1' }
			);
			expect(response).toEqual({
				success: true,
				taskName: 'test:task',
				triggeredAt: expect.any(Date),
			});
			expect(auditSpy).toHaveBeenCalledWith(
				{
					action: 'TASK_RUN_TRIGGER',
					resourceType: 'SYSTEM',
					resourceId: 'test:task',
					userId: 'admin-1',
				},
				'audit'
			);
			auditSpy.mockRestore();
		});

		it('should throw NotFoundException for unregistered task', async () => {
			mockTaskRunService.getRunner.mockReturnValue(undefined);

			await expect(
				controller.runTask({ taskName: 'unknown:task' } as never, mockReq())
			).rejects.toThrow(NotFoundException);
			expect(mockTaskRunService.run).not.toHaveBeenCalled();
		});

		it('should use unknown as operator id when user missing', async () => {
			const execute = jest.fn().mockResolvedValue(undefined);
			mockTaskRunService.getRunner.mockReturnValue({
				description: '测试任务',
				execute,
			});
			mockTaskRunService.run.mockResolvedValue(undefined);

			await controller.runTask(
				{ taskName: 'test:task' } as never,
				({} as never) as Parameters<typeof controller.runTask>[1]
			);

			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'test:task',
				expect.any(Function),
				{ trigger: TaskRunTrigger.MANUAL, triggeredBy: 'unknown' }
			);
		});

		it('should raise task_run_failed alert and rethrow when execution fails', async () => {
			const execute = jest.fn().mockResolvedValue(undefined);
			mockTaskRunService.getRunner.mockReturnValue({
				description: '测试任务',
				execute,
			});
			mockTaskRunService.run.mockRejectedValue(new Error('task boom'));

			await expect(
				controller.runTask({ taskName: 'test:task' } as never, mockReq('admin-1'))
			).rejects.toThrow('task boom');

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'task-run:manual',
				messageKey: 'task_run_failed',
				level: 'P1',
				message: expect.stringContaining('test:task'),
				detail: expect.objectContaining({
					task: 'test:task',
					triggeredBy: 'admin-1',
					error: 'task boom',
				}),
			});
		});
	});
});
