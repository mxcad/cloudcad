import { Test, type TestingModule } from '@nestjs/testing';
import { BillingCron } from './billing-cron.service';
import { BillingService } from './billing.service';
import { DatabaseService } from '../database/database.service';
import { MembershipService } from '../vip/membership.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { AlertService } from '../alert/alert.service';
import { AlertLevel } from '../alert/enums/alert.enum';
import { TaskRunService } from '../task-run/task-run.service';
import { TaskRunFailureReporter } from '../task-run/task-run-failure-reporter';
import { OrderStatus } from './enums/billing.enum';

describe('BillingCron', () => {
	let cron: BillingCron;

	const mockPrisma = {
		userMembership: {
			findMany: jest.fn(),
			updateMany: jest.fn(),
		},
		paymentOrder: {
			updateMany: jest.fn(),
		},
	};

	const mockMembershipService = {
		expireOverdueMemberships: jest.fn(),
	};

	const mockRuntimeConfigService = {
		getValue: jest.fn(),
	};

	const mockAlertService = {
		raise: jest.fn(),
	};

	const mockTaskRunService = {
		run: jest.fn(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		),
		register: jest.fn(),
		getRunner: jest.fn(),
		listRunners: jest.fn(),
	};

	const mockBillingService = {
		reconcilePendingOrders: jest.fn().mockResolvedValue(0),
	};

	beforeEach(async () => {
		jest.clearAllMocks();
		mockRuntimeConfigService.getValue.mockResolvedValue(true);
		mockTaskRunService.run.mockImplementation(
			async (_taskName: string, fn: () => Promise<unknown>) => fn()
		);
		mockBillingService.reconcilePendingOrders.mockResolvedValue(0);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				BillingCron,
				// 真实 reporter + mock AlertService：协议断言仍落在 alertService.raise 上
				TaskRunFailureReporter,
				{ provide: DatabaseService, useValue: mockPrisma },
				{ provide: MembershipService, useValue: mockMembershipService },
				{ provide: RuntimeConfigService, useValue: mockRuntimeConfigService },
				{ provide: AlertService, useValue: mockAlertService },
				{ provide: TaskRunService, useValue: mockTaskRunService },
				{ provide: BillingService, useValue: mockBillingService },
			],
		}).compile();

		cron = module.get<BillingCron>(BillingCron);
	});

	describe('downgradeExpiredMemberships', () => {
		it('should delegate expiry downgrade to MembershipService', async () => {
			mockMembershipService.expireOverdueMemberships.mockResolvedValue(2);

			await cron.downgradeExpiredMemberships();

			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'billing:downgrade-memberships',
				expect.any(Function)
			);
			expect(mockMembershipService.expireOverdueMemberships).toHaveBeenCalledTimes(
				1
			);
		});

		it('should skip when billingCronEnabled is false', async () => {
			mockRuntimeConfigService.getValue.mockResolvedValue(false);

			await cron.downgradeExpiredMemberships();

			expect(mockMembershipService.expireOverdueMemberships).not.toHaveBeenCalled();
		});

		it('should raise task_run_failed when task throws', async () => {
			mockMembershipService.expireOverdueMemberships.mockRejectedValue(
				new Error('billing error')
			);

			await cron.downgradeExpiredMemberships();

			expect(mockAlertService.raise).toHaveBeenCalledWith({
				source: 'scheduler:billing',
				messageKey: 'task_run_failed',
				level: AlertLevel.P1,
				message: expect.stringContaining('billing error'),
				detail: {
					task: 'downgradeExpiredMemberships',
					error: 'billing error',
				},
			});
		});
	});

	describe('timeoutPendingOrders', () => {
		it('should timeout pending orders', async () => {
			mockPrisma.paymentOrder.updateMany.mockResolvedValue({ count: 1 });

			await cron.timeoutPendingOrders();

			expect(mockTaskRunService.run).toHaveBeenCalledWith(
				'billing:timeout-orders',
				expect.any(Function)
			);
			const where =
				mockPrisma.paymentOrder.updateMany.mock.calls[0][0].where;
			expect(where.status).toBe(OrderStatus.PENDING);
			expect(where.createdAt.lte).toBeInstanceOf(Date);
		});

		it('should reconcile paid orders before timing out (callback-loss fallback)', async () => {
			mockBillingService.reconcilePendingOrders.mockResolvedValue(2);
			mockPrisma.paymentOrder.updateMany.mockResolvedValue({ count: 3 });

			await cron.timeoutPendingOrders();

			// 关单前先对账：已支付订单补激活，不会被误关（关单带 PENDING 守卫）
			expect(mockBillingService.reconcilePendingOrders).toHaveBeenCalledTimes(1);
			expect(
				mockBillingService.reconcilePendingOrders.mock.calls[0][0]
			).toBeInstanceOf(Date);
			expect(mockPrisma.paymentOrder.updateMany).toHaveBeenCalledTimes(1);
			expect(mockPrisma.paymentOrder.updateMany.mock.calls[0][0].where.status).toBe(
				OrderStatus.PENDING
			);
		});

		it('should still timeout orders when reconcile throws', async () => {
			mockBillingService.reconcilePendingOrders.mockRejectedValue(
				new Error('gateway unavailable')
			);
			mockPrisma.paymentOrder.updateMany.mockResolvedValue({ count: 5 });

			await cron.timeoutPendingOrders();

			// 对账失败不阻断关单
			expect(mockPrisma.paymentOrder.updateMany).toHaveBeenCalledTimes(1);
		});
	});
});
