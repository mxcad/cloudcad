///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaClient, UserStatus, ProjectStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

describe('Project Creation → Quota Allocation → Root Node Generation Integration', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let testUserEmail: string;
  let testUserName: string;
  let testUserPassword: string;
  let testUserId: string;
  let testUserAuthToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();

    testUserEmail = `project-test-${Date.now()}@example.com`;
    testUserName = `projectuser-${Date.now()}`;
    testUserPassword = 'Project@123456';

    await cleanupTestData();
    await setupTestUser();
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    await prisma.projectMember.deleteMany({
      where: { user: { email: testUserEmail } },
    });
    await prisma.fileSystemNode.deleteMany({
      where: { owner: { email: testUserEmail } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: testUserEmail } },
    });
    await prisma.user.deleteMany({
      where: { email: testUserEmail },
    });
  }

  async function setupTestUser() {
    const registerResponse = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email: testUserEmail,
        username: testUserName,
        password: testUserPassword,
        nickname: 'Project Test User',
      });

    testUserId = registerResponse.body.user.id;
    testUserAuthToken = registerResponse.body.accessToken;
  }

  describe('T1: Project Creation Flow', () => {
    let createdProjectId: string;

    it('T1-S1: Should successfully create a new project', async () => {
      const projectName = 'Test Project';
      const projectDescription = 'This is a test project';

      const response = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
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
      expect(response.body.ownerId).toBe(testUserId);

      createdProjectId = response.body.id;
    });

    it('T1-S2: Should verify project root node is created in database', async () => {
      const project = await prisma.fileSystemNode.findUnique({
        where: { id: createdProjectId },
      });

      expect(project).toBeDefined();
      expect(project?.id).toBe(createdProjectId);
      expect(project?.isFolder).toBe(true);
      expect(project?.isRoot).toBe(true);
      expect(project?.projectStatus).toBe(ProjectStatus.ACTIVE);
    });

    it('T1-S3: Should verify project owner is added as member with owner role', async () => {
      const projectMember = await prisma.projectMember.findFirst({
        where: {
          projectId: createdProjectId,
          userId: testUserId,
        },
        include: {
          projectRole: true,
        },
      });

      expect(projectMember).toBeDefined();
      expect(projectMember?.projectRole?.name).toBe('PROJECT_OWNER');
    });

    it('T1-S4: Should reject project creation with empty name', async () => {
      await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          name: '',
          description: 'Test project',
        })
        .expect(400);
    });

    it('T1-S5: Should reject project creation with duplicate name for same user', async () => {
      const projectName = 'Duplicate Project';

      await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          name: projectName,
          description: 'First project',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          name: projectName,
          description: 'Second project with same name',
        })
        .expect(409);
    });
  });

  describe('T2: Project Query Flow', () => {
    let projectIds: string[] = [];

    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        const response = await request(app.getHttpServer())
          .post('/v1/file-system/projects')
          .set('Authorization', `Bearer ${testUserAuthToken}`)
          .send({
            name: `Query Project ${i}`,
            description: `Project for query testing ${i}`,
          });
        projectIds.push(response.body.id);
      }
    });

    afterEach(async () => {
      projectIds = [];
    });

    it('T2-S1: Should list user projects with pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/file-system/projects')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    it('T2-S2: Should get project details by ID', async () => {
      expect(projectIds.length).toBeGreaterThan(0);
      
      const response = await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${projectIds[0]}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBe(projectIds[0]);
    });
  });

  describe('T3: Project Update Flow', () => {
    let updateProjectId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          name: 'Update Test Project',
          description: 'Project for update testing',
        });
      updateProjectId = response.body.id;
    });

    it('T3-S1: Should update project name and description', async () => {
      const newName = 'Updated Project Name';
      const newDescription = 'Updated project description';

      const response = await request(app.getHttpServer())
        .patch(`/v1/file-system/projects/${updateProjectId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          name: newName,
          description: newDescription,
        })
        .expect(200);

      expect(response.body.name).toBe(newName);
      expect(response.body.description).toBe(newDescription);

      const updatedProject = await prisma.fileSystemNode.findUnique({
        where: { id: updateProjectId },
      });

      expect(updatedProject?.name).toBe(newName);
      expect(updatedProject?.description).toBe(newDescription);
    });
  });

  describe('T4: Project Archive/Unarchive Flow', () => {
    let archiveProjectId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          name: 'Archive Test Project',
          description: 'Project for archive testing',
        });
      archiveProjectId = response.body.id;
    });

    it('T4-S1: Should archive a project', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/file-system/projects/${archiveProjectId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      const archivedProject = await prisma.fileSystemNode.findUnique({
        where: { id: archiveProjectId },
      });

      expect(archivedProject?.projectStatus).toBe(ProjectStatus.ARCHIVED);
      expect(archivedProject?.deletedAt).not.toBeNull();
    });

    it('T4-S2: Should unarchive a project', async () => {
      await request(app.getHttpServer())
        .delete(`/v1/file-system/projects/${archiveProjectId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`);

      await request(app.getHttpServer())
        .patch(`/v1/file-system/projects/${archiveProjectId}/restore`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      const restoredProject = await prisma.fileSystemNode.findUnique({
        where: { id: archiveProjectId },
      });

      expect(restoredProject?.projectStatus).toBe(ProjectStatus.ACTIVE);
      expect(restoredProject?.deletedAt).toBeNull();
    });
  });

  describe('T5: Complete Project Creation Chain Integration', () => {
    it('T5-S1: Should complete full project chain - create → query → update → archive → unarchive', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/v1/file-system/projects')
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          name: 'Chain Test Project',
          description: 'Project for complete chain testing',
        })
        .expect(201);

      const projectId = createResponse.body.id;

      await request(app.getHttpServer())
        .get(`/v1/file-system/projects/${projectId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/v1/file-system/projects/${projectId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .send({
          name: 'Updated Chain Project',
        })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/v1/file-system/projects/${projectId}`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/v1/file-system/projects/${projectId}/restore`)
        .set('Authorization', `Bearer ${testUserAuthToken}`)
        .expect(200);

      const finalProject = await prisma.fileSystemNode.findUnique({
        where: { id: projectId },
      });

      expect(finalProject?.name).toBe('Updated Chain Project');
      expect(finalProject?.projectStatus).toBe(ProjectStatus.ACTIVE);
      expect(finalProject?.deletedAt).toBeNull();
    });
  });
});
