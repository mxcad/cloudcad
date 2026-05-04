///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software should reach an agreement with Chengdu Dream Kaide Technology
// Co., Ltd. to use this software, its documentation, or related materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaClient, UserStatus, Permission } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ProjectRolesService } from '../roles/project-roles.service';
describe('项目生命周期集成测试', () => {
    let app;
    let prisma;
    let projectRolesService;
    let testUser;
    let testAdmin;
    let authToken;
    let adminAuthToken;
    beforeAll(async () => {
        const moduleFixture = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
        prisma = new PrismaClient();
        await prisma.$connect();
        projectRolesService = moduleFixture.get(ProjectRolesService);
        // 确保系统默认项目角色存在
        try {
            await projectRolesService.createSystemDefaultRoles();
        }
        catch (error) {
            // 如果角色已存在，忽略错误
        }
        // 清理测试数据
        await cleanupTestData();
        // 准备测试用户
        await setupTestUsers();
    }, 60000);
    afterAll(async () => {
        await cleanupTestData();
        await prisma.$disconnect();
        await app.close();
    }, 60000);
    async function cleanupTestData() {
        // 删除项目相关数据
        await prisma.projectMember.deleteMany({});
        await prisma.fileSystemNode.deleteMany({});
        await prisma.projectRole.deleteMany({});
        await prisma.projectRolePermission.deleteMany({});
        // 删除用户相关数据
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: ['test-user@example.com', 'test-admin@example.com'],
                },
            },
        });
    }
    async function setupTestUsers() {
        // 创建普通用户角色
        let userRole = await prisma.role.findFirst({
            where: { name: 'USER' },
        });
        if (!userRole) {
            userRole = await prisma.role.create({
                data: {
                    name: 'USER',
                    description: '普通用户',
                    isSystem: true,
                    category: 'SYSTEM',
                    level: 0,
                },
            });
        }
        // 创建管理员角色
        let adminRole = await prisma.role.findFirst({
            where: { name: 'ADMIN' },
        });
        if (!adminRole) {
            adminRole = await prisma.role.create({
                data: {
                    name: 'ADMIN',
                    description: '系统管理员',
                    isSystem: true,
                    category: 'SYSTEM',
                    level: 100,
                },
            });
            // 为管理员分配权限
            const adminPermissions = [
                Permission.SYSTEM_USER_READ,
                Permission.SYSTEM_USER_CREATE,
                Permission.SYSTEM_USER_UPDATE,
                Permission.SYSTEM_USER_DELETE,
                Permission.SYSTEM_ROLE_READ,
                Permission.SYSTEM_ROLE_CREATE,
                Permission.SYSTEM_ROLE_UPDATE,
                Permission.SYSTEM_ROLE_DELETE,
                Permission.PROJECT_CREATE,
                Permission.STORAGE_QUOTA,
            ];
            await prisma.rolePermission.createMany({
                data: adminPermissions.map(p => ({
                    roleId: adminRole.id,
                    permission: p,
                })),
            });
        }
        // 创建普通用户
        const hashedPassword = await bcrypt.hash('Test@123456', 10);
        testUser = await prisma.user.create({
            data: {
                email: 'test-user@example.com',
                username: 'testuser',
                password: hashedPassword,
                nickname: '测试用户',
                roleId: userRole.id,
                status: UserStatus.ACTIVE,
                emailVerified: true,
                emailVerifiedAt: new Date(),
            },
        });
        // 创建管理员用户
        testAdmin = await prisma.user.create({
            data: {
                email: 'test-admin@example.com',
                username: 'testadmin',
                password: hashedPassword,
                nickname: '测试管理员',
                roleId: adminRole.id,
                status: UserStatus.ACTIVE,
                emailVerified: true,
                emailVerifiedAt: new Date(),
            },
        });
        // 登录获取 token
        const userLoginResponse = await request(app.getHttpServer())
            .post('/auth/login')
            .send({
            account: 'test-user@example.com',
            password: 'Test@123456',
        })
            .expect(201);
        authToken = userLoginResponse.body.accessToken;
        const adminLoginResponse = await request(app.getHttpServer())
            .post('/auth/login')
            .send({
            account: 'test-admin@example.com',
            password: 'Test@123456',
        })
            .expect(201);
        adminAuthToken = adminLoginResponse.body.accessToken;
    }
    describe('测试用例1：完整的项目创建流程', () => {
        it('应该能够成功创建项目', async () => {
            const projectName = '测试项目1';
            const projectDescription = '这是一个测试项目描述';
            const response = await request(app.getHttpServer())
                .post('/v1/file-system/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                name: projectName,
                description: projectDescription,
            })
                .expect(201);
            expect(response.body).toBeDefined();
            expect(response.body.id).toBeDefined();
            expect(response.body.name).toBe(projectName);
            expect(response.body.description).toBe(projectDescription);
            expect(response.body.isFolder).toBe(true);
            expect(response.body.isRoot).toBe(true);
            expect(response.body.projectStatus).toBe('ACTIVE');
            expect(response.body.ownerId).toBe(testUser.id);
        });
        it('创建项目后应该能够获取项目列表', async () => {
            const response = await request(app.getHttpServer())
                .get('/v1/file-system/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            expect(response.body).toBeDefined();
            expect(Array.isArray(response.body.nodes)).toBe(true);
            expect(response.body.nodes.length).toBeGreaterThan(0);
        });
        it('创建的项目应该能够作为根节点被查询到', async () => {
            // 先创建一个项目
            const createResponse = await request(app.getHttpServer())
                .post('/v1/file-system/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                name: '根节点测试项目',
                description: '用于测试根节点功能的项目',
            })
                .expect(201);
            const projectId = createResponse.body.id;
            // 获取项目详情
            const getResponse = await request(app.getHttpServer())
                .get(`/v1/file-system/projects/${projectId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            expect(getResponse.body).toBeDefined();
            expect(getResponse.body.id).toBe(projectId);
            expect(getResponse.body.isRoot).toBe(true);
        });
    });
    describe('测试用例2：项目配额管理流程', () => {
        let testProjectId;
        beforeEach(async () => {
            // 创建一个测试项目
            const createResponse = await request(app.getHttpServer())
                .post('/v1/file-system/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                name: '配额测试项目',
                description: '用于测试配额管理功能的项目',
            })
                .expect(201);
            testProjectId = createResponse.body.id;
        });
        it('应该能够获取项目的初始配额信息', async () => {
            const response = await request(app.getHttpServer())
                .get('/v1/file-system/quota')
                .query({ nodeId: testProjectId })
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            expect(response.body).toBeDefined();
            expect(response.body.type).toBeDefined();
            expect(response.body.used).toBeDefined();
            expect(typeof response.body.used).toBe('number');
            expect(response.body.total).toBeDefined();
            expect(typeof response.body.total).toBe('number');
        });
        it('管理员应该能够更新项目配额', async () => {
            const newQuota = 100; // 100 GB
            const response = await request(app.getHttpServer())
                .post('/v1/file-system/quota/update')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send({
                nodeId: testProjectId,
                quota: newQuota,
            })
                .expect(200);
            expect(response.body).toBeDefined();
            expect(response.body.id).toBe(testProjectId);
            expect(response.body.storageQuota).toBe(newQuota);
        });
        it('更新配额后应该能够查询到新的配额', async () => {
            const newQuota = 200;
            // 先更新配额
            await request(app.getHttpServer())
                .post('/v1/file-system/quota/update')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send({
                nodeId: testProjectId,
                quota: newQuota,
            })
                .expect(200);
            // 再查询配额
            const response = await request(app.getHttpServer())
                .get('/v1/file-system/quota')
                .query({ nodeId: testProjectId })
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            expect(response.body.total).toBe(newQuota * 1024 * 1024 * 1024); // 转换为字节
        });
    });
    describe('测试用例3：完整的项目生命周期管理', () => {
        let projectId;
        it('应该能够完成从创建到查看再到删除的完整生命周期', async () => {
            // 步骤1：创建项目
            const createResponse = await request(app.getHttpServer())
                .post('/v1/file-system/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                name: '完整生命周期项目',
                description: '测试完整的项目生命周期',
            })
                .expect(201);
            projectId = createResponse.body.id;
            expect(projectId).toBeDefined();
            // 步骤2：设置配额
            await request(app.getHttpServer())
                .post('/v1/file-system/quota/update')
                .set('Authorization', `Bearer ${adminAuthToken}`)
                .send({
                nodeId: projectId,
                quota: 50, // 50 GB
            })
                .expect(200);
            // 步骤3：查看项目详情（确认是根节点）
            const getResponse = await request(app.getHttpServer())
                .get(`/v1/file-system/projects/${projectId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            expect(getResponse.body.id).toBe(projectId);
            expect(getResponse.body.isRoot).toBe(true);
            // 步骤4：查看配额信息
            const quotaResponse = await request(app.getHttpServer())
                .get('/v1/file-system/quota')
                .query({ nodeId: projectId })
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            expect(quotaResponse.body.total).toBe(50 * 1024 * 1024 * 1024);
            // 步骤5：删除项目（软删除）
            await request(app.getHttpServer())
                .delete(`/v1/file-system/nodes/${projectId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            // 步骤6：确认项目不在活跃列表中
            const listResponse = await request(app.getHttpServer())
                .get('/v1/file-system/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            const activeProjects = listResponse.body.nodes;
            const deletedProject = activeProjects.find((p) => p.id === projectId);
            expect(deletedProject).toBeUndefined();
        });
    });
    describe('测试用例4：项目根节点的特殊属性验证', () => {
        it('创建的项目节点应该具有正确的根节点属性', async () => {
            const createResponse = await request(app.getHttpServer())
                .post('/v1/file-system/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                name: '根节点属性测试',
                description: '测试项目根节点的属性',
            })
                .expect(201);
            const project = createResponse.body;
            // 验证根节点属性
            expect(project.isRoot).toBe(true);
            expect(project.isFolder).toBe(true);
            expect(project.parentId).toBeNull();
            expect(project.projectStatus).toBe('ACTIVE');
            expect(project.personalSpaceKey).toBeNull();
            expect(project.libraryKey).toBeNull();
        });
        it('项目创建后应该正确关联创建者', async () => {
            const createResponse = await request(app.getHttpServer())
                .post('/v1/file-system/projects')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                name: '创建者测试项目',
            })
                .expect(201);
            const projectId = createResponse.body.id;
            // 验证项目成员列表中包含创建者
            const membersResponse = await request(app.getHttpServer())
                .get(`/v1/file-system/projects/${projectId}/members`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            expect(Array.isArray(membersResponse.body)).toBe(true);
            expect(membersResponse.body.length).toBeGreaterThan(0);
            const creatorMember = membersResponse.body.find((m) => m.user && m.user.id === testUser.id);
            expect(creatorMember).toBeDefined();
        });
    });
});
//# sourceMappingURL=project-lifecycle.integration.spec.js.map