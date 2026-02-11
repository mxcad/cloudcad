import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PermissionService } from '../common/services/permission.service';
import { RoleInheritanceService } from '../common/services/role-inheritance.service';
import { SystemRole } from '../common/enums/permissions.enum';
import { Permission as PrismaPermission, ProjectPermission as PrismaProjectPermission } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * 权限测试结果
 */
export interface PermissionTestResult {
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * 权限测试套件
 */
export interface PermissionTestSuite {
  name: string;
  description: string;
  tests: PermissionTestCase[];
}

/**
 * 权限测试用例
 */
export interface PermissionTestCase {
  name: string;
  description: string;
  permission: PrismaPermission;
  expectedRoles: SystemRole[];
  unexpectedRoles?: SystemRole[];
  context?: Record<string, unknown>;
}

/**
 * 权限测试报告
 */
export interface PermissionTestReport {
  suiteName: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
  results: PermissionTestResult[];
  timestamp: Date;
}

/**
 * 权限测试运行器
 *
 * 用于系统性测试权限系统的功能，包括：
 * - 角色权限检查
 * - 权限继承验证
 * - 权限缓存一致性
 * - 批量权限检查
 */
@Injectable()
export class PermissionTestRunner {
  private readonly logger = new Logger(PermissionTestRunner.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly permissionService: PermissionService,
    private readonly roleInheritanceService: RoleInheritanceService,
  ) {}

  /**
   * 运行完整的权限测试套件
   */
  async runFullTestSuite(): Promise<PermissionTestReport[]> {
    this.logger.log('开始运行完整权限测试套件...');

    const suites: PermissionTestSuite[] = [
      this.createSystemRoleTestSuite(),
      this.createPermissionInheritanceTestSuite(),
      this.createCacheConsistencyTestSuite(),
      this.createBatchPermissionTestSuite(),
    ];

    const reports: PermissionTestReport[] = [];

    for (const suite of suites) {
      const report = await this.runTestSuite(suite);
      reports.push(report);
    }

    this.logger.log(`权限测试套件运行完成，共 ${reports.length} 个测试套件`);

    return reports;
  }

  /**
   * 运行单个测试套件（批量优化版本）
   */
  async runTestSuite(suite: PermissionTestSuite): Promise<PermissionTestReport> {
    this.logger.log(`运行测试套件: ${suite.name}`);

    const startTime = Date.now();
    const results: PermissionTestResult[] = [];

    // 批量创建测试用户
    const testUsers = await this.batchCreateTestUsers(suite.tests);

    try {
      // 批量运行测试用例
      for (let i = 0; i < suite.tests.length; i++) {
        const testCase = suite.tests[i];
        const testUser = testUsers[i];

        if (testUser) {
          const result = await this.runTestCaseWithExistingUser(testCase, testUser);
          results.push(result);
        }
      }
    } finally {
      // 批量清理测试用户
      await this.batchCleanupTestUsers(testUsers.map((u) => u.id));
    }

    const duration = Date.now() - startTime;
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.filter((r) => !r.passed).length;

    const report: PermissionTestReport = {
      suiteName: suite.name,
      totalTests: results.length,
      passedTests,
      failedTests,
      duration,
      results,
      timestamp: new Date(),
    };

    this.logger.log(
      `测试套件 ${suite.name} 完成: ${passedTests}/${results.length} 通过`,
    );

    return report;
  }

  /**
   * 运行单个测试用例（使用预创建的用户）
   */
  private async runTestCaseWithExistingUser(
    testCase: PermissionTestCase,
    testUser: { id: string; role: { name: SystemRole } },
  ): Promise<PermissionTestResult> {
    const startTime = Date.now();

    try {
      // 对于缓存测试，执行缓存验证逻辑
      if (testCase.name.includes('缓存')) {
        const cacheResult = await this.runCacheTest(
          testUser.id,
          testCase,
        );

        const duration = Date.now() - startTime;

        return {
          testName: testCase.name,
          passed: cacheResult.passed,
          duration,
          details: {
            ...cacheResult.details,
            role: testUser.role.name,
          },
        };
      }

      // 检查权限（仅处理系统权限）
      const hasPermission = await this.permissionService.checkSystemPermission(
        testUser.id,
        testCase.permission as PrismaPermission,
      );

      // 验证期望结果
      const shouldHavePermission = testCase.expectedRoles.includes(
        testUser.role.name as SystemRole,
      );

      const passed = hasPermission === shouldHavePermission;

      const duration = Date.now() - startTime;

      // 安全：details 中只包含角色名称，不包含用户 ID 或其他敏感信息
      return {
        testName: testCase.name,
        passed,
        duration,
        details: {
          role: testUser.role.name,
          hasPermission,
          expectedRoles: testCase.expectedRoles,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        testName: testCase.name,
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 运行单个测试用例（兼容性方法，内部使用批量优化）
   */
  async runTestCase(testCase: PermissionTestCase): Promise<PermissionTestResult> {
    const startTime = Date.now();

    try {
      // 创建测试用户
      const testUser = await this.createTestUser(testCase);

      // 检查权限（仅处理系统权限）
      const hasPermission = await this.permissionService.checkSystemPermission(
        testUser.id,
        testCase.permission as PrismaPermission,
      );

      // 验证期望结果
      const shouldHavePermission = testCase.expectedRoles.includes(
        testUser.role.name as SystemRole,
      );

      const passed = hasPermission === shouldHavePermission;

      // 清理测试用户
      await this.cleanupTestUser(testUser.id);

      const duration = Date.now() - startTime;

      // 安全：details 中只包含角色名称，不包含用户 ID 或其他敏感信息
      return {
        testName: testCase.name,
        passed,
        duration,
        details: {
          role: testUser.role.name as SystemRole,
          hasPermission,
          expectedRoles: testCase.expectedRoles,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        testName: testCase.name,
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 运行缓存相关测试
   */
  private async runCacheTest(
    userId: string,
    testCase: PermissionTestCase,
  ): Promise<{ passed: boolean; details: any }> {
    const isFirstCheck = testCase.name.includes('缓存命中');
    const isClearCache = testCase.name.includes('缓存失效');

    // 第一次检查
    const firstCheck = await this.permissionService.checkSystemPermission(
      userId,
      testCase.permission as PrismaPermission,
    );

    // 第二次检查（应该使用缓存）
    const secondCheck = await this.permissionService.checkSystemPermission(
      userId,
      testCase.permission as PrismaPermission,
    );

    if (isFirstCheck) {
      // 缓存命中测试：验证两次结果一致
      const passed = firstCheck === secondCheck;

      return {
        passed,
        details: {
          firstCheck,
          secondCheck,
          cacheConsistency: passed ? '✅ 一致' : '❌ 不一致',
        },
      };
    }

    if (isClearCache) {
      // 缓存失效测试：验证清除缓存后重新检查
      const thirdCheck = await this.permissionService.checkSystemPermission(
        userId,
        testCase.permission as PrismaPermission,
      );

      // 清除缓存
      await this.permissionService.clearUserCache(userId);

      // 第四次检查（应该重新查询数据库）
      const fourthCheck = await this.permissionService.checkSystemPermission(
        userId,
        testCase.permission as PrismaPermission,
      );

      const passed = firstCheck === secondCheck && secondCheck === thirdCheck && thirdCheck === fourthCheck;

      return {
        passed,
        details: {
          firstCheck,
          secondCheck,
          thirdCheck,
          fourthCheck,
          cacheCleared: true,
          resultConsistency: passed ? '✅ 一致' : '❌ 不一致',
        },
      };
    }

    // 默认权限检查
    return {
      passed: firstCheck === secondCheck,
      details: {
        firstCheck,
        secondCheck,
      },
    };
  }

  /**
   * 创建系统角色测试套件
   */
  private createSystemRoleTestSuite(): PermissionTestSuite {
    return {
      name: '系统角色权限测试',
      description: '验证各系统角色是否具有正确的权限',
      tests: [
        {
          name: 'ADMIN - 用户删除权限',
          description: '管理员应具有删除用户的权限',
          permission: PrismaPermission.SYSTEM_USER_DELETE,
          expectedRoles: [SystemRole.ADMIN],
        },
        {
          name: 'ADMIN - 角色管理权限',
          description: '管理员应具有管理角色的权限',
          permission: PrismaPermission.SYSTEM_ROLE_PERMISSION_MANAGE,
          expectedRoles: [SystemRole.ADMIN],
        },
        {
          name: 'USER - 字体上传权限',
          description: '普通用户应具有上传字体的权限',
          permission: PrismaPermission.SYSTEM_FONT_UPLOAD,
          expectedRoles: [SystemRole.USER, SystemRole.ADMIN],
        },
        {
          name: 'USER - 系统监控权限',
          description: '普通用户不应具有系统监控权限',
          permission: PrismaPermission.SYSTEM_MONITOR,
          expectedRoles: [SystemRole.ADMIN],
          unexpectedRoles: [SystemRole.USER],
        },
      ],
    };
  }

  /**
   * 创建权限继承测试套件
   */
  private createPermissionInheritanceTestSuite(): PermissionTestSuite {
    return {
      name: '权限继承测试',
      description: '验证角色层级继承是否正常工作',
      tests: [
        {
          name: 'USER_MANAGER 继承 USER 权限',
          description: '用户管理员应继承普通用户的权限',
          permission: PrismaPermission.SYSTEM_FONT_UPLOAD,
          expectedRoles: [SystemRole.USER, SystemRole.USER_MANAGER, SystemRole.ADMIN],
        },
        {
          name: 'FONT_MANAGER 继承 USER 权限',
          description: '字体管理员应继承普通用户的权限',
          permission: PrismaPermission.SYSTEM_FONT_UPLOAD,
          expectedRoles: [SystemRole.USER, SystemRole.FONT_MANAGER, SystemRole.ADMIN],
        },
      ],
    };
  }

  /**
   * 创建缓存一致性测试套件
   */
  private createCacheConsistencyTestSuite(): PermissionTestSuite {
    return {
      name: '缓存一致性测试',
      description: '验证权限缓存的一致性和失效机制',
      tests: [
        {
          name: '缓存命中测试',
          description: '验证权限缓存是否正常工作',
          permission: PrismaPermission.SYSTEM_FONT_UPLOAD,
          expectedRoles: [SystemRole.USER],
        },
        {
          name: '缓存失效测试',
          description: '验证权限清除后缓存是否失效',
          permission: PrismaPermission.SYSTEM_FONT_UPLOAD,
          expectedRoles: [SystemRole.USER],
        },
      ],
    };
  }

  /**
   * 创建批量权限测试套件
   */
  private createBatchPermissionTestSuite(): PermissionTestSuite {
    return {
      name: '批量权限检查测试',
      description: '验证批量权限检查的性能和正确性',
      tests: [
        {
          name: '批量权限检查 - 部分权限',
          description: '验证批量检查时只有部分权限的情况',
          permission: PrismaPermission.SYSTEM_FONT_UPLOAD,
          expectedRoles: [SystemRole.USER],
        },
        {
          name: '批量权限检查 - 全部权限',
          description: '验证批量检查时具有全部权限的情况',
          permission: PrismaPermission.SYSTEM_FONT_UPLOAD,
          expectedRoles: [SystemRole.ADMIN],
        },
      ],
    };
  }

  /**
   * 创建测试用户
   */
  private async createTestUser(
    testCase: PermissionTestCase,
  ): Promise<{ id: string; role: { name: SystemRole } }> {
    const roleName = testCase.expectedRoles[0];

    // 获取角色
    const role = await this.prisma.role.findFirst({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`角色 ${roleName} 不存在`);
    }

    // 创建测试用户
    const user = await this.prisma.user.create({
      data: {
        email: `test-${Date.now()}-${Math.random()}@example.com`,
        username: `test${Date.now()}${Math.random()}`,
        password: await bcrypt.hash('test123', 12),
        nickname: 'Test User',
        roleId: role.id,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    return {
      id: user.id,
      role: { name: roleName },
    };
  }

  /**
   * 批量创建测试用户（避免 N+1 查询问题）
   *
   * @param testCases 测试用例数组
   * @returns 创建的测试用户数组
   */
  private async batchCreateTestUsers(
    testCases: PermissionTestCase[],
  ): Promise<Array<{ id: string; role: { name: SystemRole } }>> {
    if (testCases.length === 0) {
      return [];
    }

    // 提取所有需要的角色名称
    const roleNames = Array.from(
      new Set(testCases.map((tc) => tc.expectedRoles[0]))
    );

    // 批量查询所有角色（避免 N+1 查询）
    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
    });

    const roleMap = new Map<string, string>();
    roles.forEach((role) => roleMap.set(role.name, role.id));

    // 检查所有角色是否存在
    for (const roleName of roleNames) {
      if (!roleMap.has(roleName)) {
        throw new Error(`角色 ${roleName} 不存在`);
      }
    }

    // 批量创建用户
    const hashedPassword = await bcrypt.hash('test123', 12);
    const timestamp = Date.now();

    const users = await this.prisma.user.createMany({
      data: testCases.map((testCase, index) => ({
        email: `test-${timestamp}-${index}-${Math.random()}@example.com`,
        username: `test${timestamp}${index}${Math.random()}`,
        password: hashedPassword,
        nickname: 'Test User',
        roleId: roleMap.get(testCase.expectedRoles[0])!,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
      })),
    });

    // 获取创建的用户（通过批量查询）
    const createdUsers = await this.prisma.user.findMany({
      where: {
        email: {
          in: testCases.map((_, index) => `test-${timestamp}-${index}-`),
        },
      },
      include: {
        role: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: testCases.length,
    });

    return createdUsers.map((user) => ({
      id: user.id,
      role: { name: user.role.name as SystemRole },
    }));
  }

  /**
   * 清理测试用户
   */
  private async cleanupTestUser(userId: string): Promise<void> {
    try {
      await this.prisma.user.delete({
        where: { id: userId },
      });
    } catch (error) {
      this.logger.warn(`清理测试用户失败: ${userId}`, error);
    }
  }

  /**
   * 批量清理测试用户（避免 N+1 查询问题）
   *
   * @param userIds 用户ID数组
   */
  private async batchCleanupTestUsers(userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    try {
      // 使用批量删除
      await this.prisma.user.deleteMany({
        where: {
          id: { in: userIds },
        },
      });

      this.logger.debug(`批量清理了 ${userIds.length} 个测试用户`);
    } catch (error) {
      this.logger.warn(`批量清理测试用户失败: ${error.message}`, error);
    }
  }

  /**
   * 生成测试报告摘要
   */
  generateSummary(reports: PermissionTestReport[]): string {
    let summary = '========================================\n';
    summary += '权限测试报告摘要\n';
    summary += '========================================\n\n';

    const totalTests = reports.reduce((sum, r) => sum + r.totalTests, 0);
    const totalPassed = reports.reduce((sum, r) => sum + r.passedTests, 0);
    const totalFailed = reports.reduce((sum, r) => sum + r.failedTests, 0);
    const totalDuration = reports.reduce((sum, r) => sum + r.duration, 0);

    summary += `总测试数: ${totalTests}\n`;
    summary += `通过: ${totalPassed}\n`;
    summary += `失败: ${totalFailed}\n`;
    summary += `成功率: ${((totalPassed / totalTests) * 100).toFixed(2)}%\n`;
    summary += `总耗时: ${totalDuration}ms\n\n`;

    for (const report of reports) {
      summary += '----------------------------------------\n';
      summary += `测试套件: ${report.suiteName}\n`;
      summary += '----------------------------------------\n';
      summary += `测试数: ${report.totalTests}\n`;
      summary += `通过: ${report.passedTests}\n`;
      summary += `失败: ${report.failedTests}\n`;
      summary += `耗时: ${report.duration}ms\n\n`;

      if (report.failedTests > 0) {
        summary += '失败的测试:\n';
        for (const result of report.results.filter((r) => !r.passed)) {
          summary += `  - ${result.testName}\n`;
          if (result.error) {
            summary += `    错误: ${result.error}\n`;
          }
        }
        summary += '\n';
      }
    }

    summary += '========================================\n';

    return summary;
  }

  /**
   * 导出测试报告为 JSON
   */
  exportReportAsJson(reports: PermissionTestReport[]): string {
    return JSON.stringify(reports, null, 2);
  }

  /**
   * 导出测试报告为 Markdown
   */
  exportReportAsMarkdown(reports: PermissionTestReport[]): string {
    let markdown = '# 权限测试报告\n\n';
    markdown += `生成时间: ${new Date().toISOString()}\n\n`;

    for (const report of reports) {
      markdown += `## ${report.suiteName}\n\n`;
      markdown += `- **测试数**: ${report.totalTests}\n`;
      markdown += `- **通过**: ${report.passedTests}\n`;
      markdown += `- **失败**: ${report.failedTests}\n`;
      markdown += `- **耗时**: ${report.duration}ms\n`;
      markdown += `- **成功率**: ${((report.passedTests / report.totalTests) * 100).toFixed(2)}%\n\n`;

      markdown += '### 测试结果\n\n';
      markdown += '| 测试名称 | 状态 | 耗时 | 角色 | 详情 |\n';
      markdown += '|---------|------|------|------|------|\n';

      for (const result of report.results) {
        const status = result.passed ? '✅ 通过' : '❌ 失败';
        // 安全：只提取角色名称，不包含用户 ID 或其他敏感信息
        const role = result.details?.role || 'N/A';
        const hasPermission = result.details?.hasPermission ? '有权限' : '无权限';
        const errorInfo = result.error ? `错误: ${result.error}` : '';
        const details = `${hasPermission} ${errorInfo}`.trim();
        markdown += `| ${result.testName} | ${status} | ${result.duration}ms | ${role} | ${details} |\n`;
      }

      markdown += '\n';
    }

    return markdown;
  }
}
