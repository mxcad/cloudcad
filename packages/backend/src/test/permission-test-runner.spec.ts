///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { PermissionTestRunner } from './permission-test-runner';
import { DatabaseService } from '../database/database.service';
import { PermissionService } from '../common/services/permission.service';
import { RoleInheritanceService } from '../common/services/role-inheritance.service';
import { SystemPermission, SystemRole } from '../common/enums/permissions.enum';

describe('PermissionTestRunner', () => {
  let runner: PermissionTestRunner;
  let mockPrisma: any;
  let mockPermissionService: any;
  let mockRoleInheritanceService: any;

  beforeEach(async () => {
    mockPrisma = {
      role: {
        findUnique: jest.fn(),
      },
      user: {
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockPermissionService = {
      checkSystemPermission: jest.fn(),
    };

    mockRoleInheritanceService = {
      getRolePermissions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionTestRunner,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: PermissionService,
          useValue: mockPermissionService,
        },
        {
          provide: RoleInheritanceService,
          useValue: mockRoleInheritanceService,
        },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    runner = module.get<PermissionTestRunner>(PermissionTestRunner);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runFullTestSuite', () => {
    it('should run all test suites', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'role-id',
        name: SystemRole.ADMIN,
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id',
        role: { name: SystemRole.ADMIN },
      });
      mockPrisma.user.delete.mockResolvedValue({});
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);

      const reports = await runner.runFullTestSuite();

      expect(reports).toBeDefined();
      expect(reports.length).toBeGreaterThan(0);
      expect(reports.length).toBe(4); // 4 个测试套件
    });

    it('should generate summary', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'role-id',
        name: SystemRole.ADMIN,
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id',
        role: { name: SystemRole.ADMIN },
      });
      mockPrisma.user.delete.mockResolvedValue({});
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);

      const reports = await runner.runFullTestSuite();
      const summary = runner.generateSummary(reports);

      expect(summary).toContain('权限测试报告摘要');
      expect(summary).toContain('总测试数');
      expect(summary).toContain('通过');
      expect(summary).toContain('失败');
    });
  });

  describe('runTestSuite', () => {
    it('should run a single test suite', async () => {
      const suite = runner['createSystemRoleTestSuite']();

      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'role-id',
        name: SystemRole.ADMIN,
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id',
        role: { name: SystemRole.ADMIN },
      });
      mockPrisma.user.delete.mockResolvedValue({});
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);

      const report = await runner.runTestSuite(suite);

      expect(report).toBeDefined();
      expect(report.suiteName).toBe('系统角色权限测试');
      expect(report.totalTests).toBe(suite.tests.length);
      expect(report.results.length).toBe(suite.tests.length);
    });

    it('should count passed and failed tests correctly', async () => {
      const suite = runner['createSystemRoleTestSuite']();

      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'role-id',
        name: SystemRole.ADMIN,
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id',
        role: { name: SystemRole.ADMIN },
      });
      mockPrisma.user.delete.mockResolvedValue({});

      // 第一次调用返回 true，第二次调用返回 false
      mockPermissionService.checkSystemPermission
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const report = await runner.runTestSuite(suite);

      expect(report.passedTests).toBe(1);
      expect(report.failedTests).toBe(1);
    });
  });

  describe('runTestCase', () => {
    it('should pass when permission matches expected', async () => {
      const testCase = {
        name: 'Test Case',
        description: 'Test',
        permission: SystemPermission.USER_DELETE,
        expectedRoles: [SystemRole.ADMIN],
      };

      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'role-id',
        name: SystemRole.ADMIN,
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id',
        role: { name: SystemRole.ADMIN },
      });
      mockPrisma.user.delete.mockResolvedValue({});
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);

      const result = await runner.runTestCase(testCase);

      expect(result.passed).toBe(true);
      expect(result.testName).toBe('Test Case');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should fail when permission does not match expected', async () => {
      const testCase = {
        name: 'Test Case',
        description: 'Test',
        permission: SystemPermission.USER_DELETE,
        expectedRoles: [SystemRole.USER],
      };

      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'role-id',
        name: SystemRole.USER,
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-id',
        role: { name: SystemRole.USER },
      });
      mockPrisma.user.delete.mockResolvedValue({});
      mockPermissionService.checkSystemPermission.mockResolvedValue(true); // USER 有权限

      const result = await runner.runTestCase(testCase);

      expect(result.passed).toBe(false);
      expect(result.testName).toBe('Test Case');
    });

    it('should handle errors gracefully', async () => {
      const testCase = {
        name: 'Test Case',
        description: 'Test',
        permission: SystemPermission.USER_DELETE,
        expectedRoles: [SystemRole.ADMIN],
      };

      mockPrisma.role.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await runner.runTestCase(testCase);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('Database error');
    });

    it('should clean up test user after test', async () => {
      const testCase = {
        name: 'Test Case',
        description: 'Test',
        permission: SystemPermission.USER_DELETE,
        expectedRoles: [SystemRole.ADMIN],
      };

      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'role-id',
        name: SystemRole.ADMIN,
      });
      mockPrisma.user.create.mockResolvedValue({
        id: 'test-user-id',
        role: { name: SystemRole.ADMIN },
      });
      mockPrisma.user.delete.mockResolvedValue({});
      mockPermissionService.checkSystemPermission.mockResolvedValue(true);

      await runner.runTestCase(testCase);

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'test-user-id' },
      });
    });
  });

  describe('report generation', () => {
    it('should generate summary', () => {
      const reports = [
        {
          suiteName: 'Test Suite 1',
          totalTests: 10,
          passedTests: 9,
          failedTests: 1,
          duration: 1000,
          results: [],
          timestamp: new Date(),
        },
      ];

      const summary = runner.generateSummary(reports);

      expect(summary).toContain('权限测试报告摘要');
      expect(summary).toContain('总测试数: 10');
      expect(summary).toContain('通过: 9');
      expect(summary).toContain('失败: 1');
      expect(summary).toContain('成功率: 90.00%');
    });

    it('should export report as JSON', () => {
      const reports = [
        {
          suiteName: 'Test Suite 1',
          totalTests: 10,
          passedTests: 9,
          failedTests: 1,
          duration: 1000,
          results: [],
          timestamp: new Date(),
        },
      ];

      const json = runner.exportReportAsJson(reports);

      expect(json).toContain('"suiteName"');
      expect(json).toContain('"totalTests"');
      const parsed = JSON.parse(json);
      expect(parsed[0].suiteName).toBe('Test Suite 1');
    });

    it('should export report as Markdown', () => {
      const reports = [
        {
          suiteName: 'Test Suite 1',
          totalTests: 10,
          passedTests: 9,
          failedTests: 1,
          duration: 1000,
          results: [
            {
              testName: 'Test 1',
              passed: true,
              duration: 100,
              details: { foo: 'bar' },
            },
            {
              testName: 'Test 2',
              passed: false,
              duration: 200,
              error: 'Test failed',
            },
          ],
          timestamp: new Date(),
        },
      ];

      const markdown = runner.exportReportAsMarkdown(reports);

      expect(markdown).toContain('# 权限测试报告');
      expect(markdown).toContain('## Test Suite 1');
      expect(markdown).toContain('| 测试名称 | 状态 | 耗时 | 详情 |');
      expect(markdown).toContain('Test 1');
      expect(markdown).toContain('Test 2');
    });
  });
});
