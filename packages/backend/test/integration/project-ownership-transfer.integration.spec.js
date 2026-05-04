///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2026，成都梦想凯德科技有限公司。
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司。
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProjectMemberService } from '../../src/file-system/project-member/project-member.service';
import { DatabaseService } from '../../src/database/database.service';
import { FileSystemPermissionService } from '../../src/file-system/file-permission/file-system-permission.service';
import { ProjectPermissionService } from '../../src/roles/project-permission.service';
import { AuditLogService } from '../../src/audit/audit-log.service';
describe('项目域：转让所有权→原所有者权限失效集成测试', () => {
    let projectMemberService;
    // 模拟数据
    const mockOriginalOwnerId = 'original-owner-id';
    const mockNewOwnerId = 'new-owner-id';
    const mockProjectId = 'test-project-id';
    const mockProjectRoleOwnerId = 'owner-role-id';
    const mockProjectRoleAdminId = 'admin-role-id';
    // 模拟服务
    const mockDatabaseService = {
        fileSystemNode: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        projectMember: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        projectRole: {
            findFirst: jest.fn(),
        },
        $transaction: jest.fn((callback) => callback(mockDatabaseService)),
    };
    const mockPermissionService = {
        clearNodeCache: jest.fn(),
    };
    const mockProjectPermissionService = {
        checkPermission: jest.fn(),
    };
    const mockAuditLogService = {
        log: jest.fn(),
    };
    beforeEach(async () => {
        jest.clearAllMocks();
        const moduleFixture = await Test.createTestingModule({
            providers: [
                ProjectMemberService,
                { provide: DatabaseService, useValue: mockDatabaseService },
                { provide: FileSystemPermissionService, useValue: mockPermissionService },
                { provide: ProjectPermissionService, useValue: mockProjectPermissionService },
                { provide: AuditLogService, useValue: mockAuditLogService },
            ],
        }).compile();
        projectMemberService = moduleFixture.get(ProjectMemberService);
    });
    describe('T1: 正常转让所有权流程', () => {
        it('T1-S1: 项目所有者可以将所有权转让给项目成员', async () => {
            // 设置模拟数据
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            const mockNewOwnerMember = {
                id: 'member-1',
                projectId: mockProjectId,
                userId: mockNewOwnerId,
                projectRoleId: 'some-role-id',
            };
            const mockOwnerRole = {
                id: mockProjectRoleOwnerId,
                name: 'PROJECT_OWNER',
                isSystem: true,
            };
            const mockAdminRole = {
                id: mockProjectRoleAdminId,
                name: 'PROJECT_ADMIN',
                isSystem: true,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            mockDatabaseService.projectMember.findUnique.mockResolvedValue(mockNewOwnerMember);
            mockDatabaseService.projectRole.findFirst
                .mockResolvedValueOnce(mockOwnerRole)
                .mockResolvedValueOnce(mockAdminRole);
            // 执行转让操作
            const result = await projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, mockOriginalOwnerId);
            // 验证结果
            expect(result.message).toBe('项目所有权转让成功');
            // 验证数据库操作
            expect(mockDatabaseService.$transaction).toHaveBeenCalled();
            expect(mockPermissionService.clearNodeCache).toHaveBeenCalledWith(mockProjectId);
            expect(mockAuditLogService.log).toHaveBeenCalled();
        });
    });
    describe('T2: 权限验证场景', () => {
        it('T2-S1: 非项目所有者不能转让项目所有权', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            await expect(projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, 'non-owner-id')).rejects.toThrow(ForbiddenException);
        });
        it('T2-S2: 私人空间不能转让所有权', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: 'personal-space-key',
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            await expect(projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, mockOriginalOwnerId)).rejects.toThrow(BadRequestException);
        });
        it('T2-S3: 不能转让给自己', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            await expect(projectMemberService.transferProjectOwnership(mockProjectId, mockOriginalOwnerId, mockOriginalOwnerId)).rejects.toThrow(BadRequestException);
        });
    });
    describe('T3: 转让目标验证场景', () => {
        it('T3-S1: 转让目标必须是项目成员', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            mockDatabaseService.projectMember.findUnique.mockResolvedValue(null);
            await expect(projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, mockOriginalOwnerId)).rejects.toThrow(BadRequestException);
        });
        it('T3-S2: 项目不存在时应抛出异常', async () => {
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(null);
            await expect(projectMemberService.transferProjectOwnership('non-existent-project-id', mockNewOwnerId, mockOriginalOwnerId)).rejects.toThrow(NotFoundException);
        });
    });
    describe('T4: 原所有者权限变更验证', () => {
        it('T4-S1: 转让后新所有者获得所有者角色', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            const mockNewOwnerMember = {
                id: 'member-1',
                projectId: mockProjectId,
                userId: mockNewOwnerId,
                projectRoleId: 'old-role-id',
            };
            const mockOwnerRole = {
                id: mockProjectRoleOwnerId,
                name: 'PROJECT_OWNER',
                isSystem: true,
            };
            const mockAdminRole = {
                id: mockProjectRoleAdminId,
                name: 'PROJECT_ADMIN',
                isSystem: true,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            mockDatabaseService.projectMember.findUnique.mockResolvedValue(mockNewOwnerMember);
            mockDatabaseService.projectRole.findFirst
                .mockResolvedValueOnce(mockOwnerRole)
                .mockResolvedValueOnce(mockAdminRole);
            await projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, mockOriginalOwnerId);
            // 验证在事务中更新新所有者角色
            const transactionCallback = mockDatabaseService.$transaction.mock.calls[0][0];
            const tx = {
                projectMember: { update: jest.fn() },
                projectRole: { findFirst: jest.fn() },
                fileSystemNode: { update: jest.fn() },
            };
            tx.projectRole.findFirst
                .mockResolvedValueOnce(mockOwnerRole)
                .mockResolvedValueOnce(mockAdminRole);
            await transactionCallback(tx);
            // 验证新所有者角色被更新为所有者
            expect(tx.projectMember.update).toHaveBeenCalledWith({
                where: {
                    projectId_userId: {
                        projectId: mockProjectId,
                        userId: mockNewOwnerId,
                    },
                },
                data: { projectRoleId: mockProjectRoleOwnerId },
            });
        });
        it('T4-S2: 转让后原所有者角色变为管理员（如果管理员角色存在）', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            const mockNewOwnerMember = {
                id: 'member-1',
                projectId: mockProjectId,
                userId: mockNewOwnerId,
                projectRoleId: 'old-role-id',
            };
            const mockOwnerRole = {
                id: mockProjectRoleOwnerId,
                name: 'PROJECT_OWNER',
                isSystem: true,
            };
            const mockAdminRole = {
                id: mockProjectRoleAdminId,
                name: 'PROJECT_ADMIN',
                isSystem: true,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            mockDatabaseService.projectMember.findUnique.mockResolvedValue(mockNewOwnerMember);
            mockDatabaseService.projectRole.findFirst
                .mockResolvedValueOnce(mockOwnerRole)
                .mockResolvedValueOnce(mockAdminRole);
            await projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, mockOriginalOwnerId);
            // 验证事务逻辑
            const transactionCallback = mockDatabaseService.$transaction.mock.calls[0][0];
            const tx = {
                projectMember: { update: jest.fn() },
                projectRole: { findFirst: jest.fn() },
                fileSystemNode: { update: jest.fn() },
            };
            tx.projectRole.findFirst
                .mockResolvedValueOnce(mockOwnerRole)
                .mockResolvedValueOnce(mockAdminRole);
            await transactionCallback(tx);
            // 验证原所有者角色被更新为管理员
            expect(tx.projectMember.update).toHaveBeenCalledTimes(2);
            expect(tx.fileSystemNode.update).toHaveBeenCalledWith({
                where: { id: mockProjectId },
                data: { ownerId: mockNewOwnerId },
            });
        });
        it('T4-S3: 项目所有者ID应正确更新', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            const mockNewOwnerMember = {
                id: 'member-1',
                projectId: mockProjectId,
                userId: mockNewOwnerId,
                projectRoleId: 'old-role-id',
            };
            const mockOwnerRole = {
                id: mockProjectRoleOwnerId,
                name: 'PROJECT_OWNER',
                isSystem: true,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            mockDatabaseService.projectMember.findUnique.mockResolvedValue(mockNewOwnerMember);
            mockDatabaseService.projectRole.findFirst.mockResolvedValueOnce(mockOwnerRole);
            await projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, mockOriginalOwnerId);
            const transactionCallback = mockDatabaseService.$transaction.mock.calls[0][0];
            const tx = {
                projectMember: { update: jest.fn() },
                projectRole: { findFirst: jest.fn() },
                fileSystemNode: { update: jest.fn() },
            };
            tx.projectRole.findFirst.mockResolvedValueOnce(mockOwnerRole);
            await transactionCallback(tx);
            // 验证项目所有者ID被更新
            expect(tx.fileSystemNode.update).toHaveBeenCalledWith({
                where: { id: mockProjectId },
                data: { ownerId: mockNewOwnerId },
            });
        });
    });
    describe('T5: 缓存和审计日志验证', () => {
        it('T5-S1: 转让后应清除权限缓存', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            const mockNewOwnerMember = {
                id: 'member-1',
                projectId: mockProjectId,
                userId: mockNewOwnerId,
                projectRoleId: 'old-role-id',
            };
            const mockOwnerRole = {
                id: mockProjectRoleOwnerId,
                name: 'PROJECT_OWNER',
                isSystem: true,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            mockDatabaseService.projectMember.findUnique.mockResolvedValue(mockNewOwnerMember);
            mockDatabaseService.projectRole.findFirst.mockResolvedValueOnce(mockOwnerRole);
            await projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, mockOriginalOwnerId);
            expect(mockPermissionService.clearNodeCache).toHaveBeenCalledWith(mockProjectId);
        });
        it('T5-S2: 转让成功后应记录审计日志', async () => {
            const mockProject = {
                id: mockProjectId,
                ownerId: mockOriginalOwnerId,
                personalSpaceKey: null,
            };
            const mockNewOwnerMember = {
                id: 'member-1',
                projectId: mockProjectId,
                userId: mockNewOwnerId,
                projectRoleId: 'old-role-id',
            };
            const mockOwnerRole = {
                id: mockProjectRoleOwnerId,
                name: 'PROJECT_OWNER',
                isSystem: true,
            };
            mockDatabaseService.fileSystemNode.findUnique.mockResolvedValue(mockProject);
            mockDatabaseService.projectMember.findUnique.mockResolvedValue(mockNewOwnerMember);
            mockDatabaseService.projectRole.findFirst.mockResolvedValueOnce(mockOwnerRole);
            await projectMemberService.transferProjectOwnership(mockProjectId, mockNewOwnerId, mockOriginalOwnerId);
            expect(mockAuditLogService.log).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=project-ownership-transfer.integration.spec.js.map