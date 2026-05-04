import { DatabaseService } from '../database/database.service';
import { PermissionService } from '../common/services/permission.service';
import { RoleInheritanceService } from '../common/services/role-inheritance.service';
import { SystemRole } from '../common/enums/permissions.enum';
import { Permission as PrismaPermission } from '@prisma/client';
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
export declare class PermissionTestRunner {
    private readonly prisma;
    private readonly permissionService;
    private readonly roleInheritanceService;
    private readonly logger;
    constructor(prisma: DatabaseService, permissionService: PermissionService, roleInheritanceService: RoleInheritanceService);
    /**
     * 运行完整的权限测试套件
     */
    runFullTestSuite(): Promise<PermissionTestReport[]>;
    /**
     * 运行单个测试套件（批量优化版本）
     */
    runTestSuite(suite: PermissionTestSuite): Promise<PermissionTestReport>;
    /**
     * 运行单个测试用例（使用预创建的用户）
     */
    private runTestCaseWithExistingUser;
    /**
     * 运行单个测试用例（兼容性方法，内部使用批量优化）
     */
    runTestCase(testCase: PermissionTestCase): Promise<PermissionTestResult>;
    /**
     * 运行缓存相关测试
     */
    private runCacheTest;
    /**
     * 创建系统角色测试套件
     */
    private createSystemRoleTestSuite;
    /**
     * 创建权限继承测试套件
     */
    private createPermissionInheritanceTestSuite;
    /**
     * 创建缓存一致性测试套件
     */
    private createCacheConsistencyTestSuite;
    /**
     * 创建批量权限测试套件
     */
    private createBatchPermissionTestSuite;
    /**
     * 创建测试用户
     */
    private createTestUser;
    /**
     * 批量创建测试用户（避免 N+1 查询问题）
     *
     * @param testCases 测试用例数组
     * @returns 创建的测试用户数组
     */
    private batchCreateTestUsers;
    /**
     * 清理测试用户
     */
    private cleanupTestUser;
    /**
     * 批量清理测试用户（避免 N+1 查询问题）
     *
     * @param userIds 用户ID数组
     */
    private batchCleanupTestUsers;
    /**
     * 生成测试报告摘要
     */
    generateSummary(reports: PermissionTestReport[]): string;
    /**
     * 导出测试报告为 JSON
     */
    exportReportAsJson(reports: PermissionTestReport[]): string;
    /**
     * 导出测试报告为 Markdown
     */
    exportReportAsMarkdown(reports: PermissionTestReport[]): string;
}
//# sourceMappingURL=permission-test-runner.d.ts.map