import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { DatabaseService } from '../database/database.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: DatabaseService;
  let permissionCacheService: PermissionCacheService;

  const mockPrisma = {
    project: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    projectMember: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockPermissionCacheService = {
    clearUserCache: jest.fn(),
    clearProjectCache: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: DatabaseService,
          useValue: mockPrisma,
        },
        {
          provide: PermissionCacheService,
          useValue: mockPermissionCacheService,
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    prisma = module.get<DatabaseService>(DatabaseService);
    permissionCacheService = module.get<PermissionCacheService>(PermissionCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const userId = 'user1';
    const createProjectDto: CreateProjectDto = {
      name: 'Test Project',
      description: 'Test project description',
    };

    it('should create project successfully', async () => {
      const expectedProject = {
        id: 'project1',
        name: 'Test Project',
        description: 'Test project description',
        ownerId: userId,
        members: [
          {
            id: 'member1',
            userId,
            role: 'OWNER',
            user: {
              id: userId,
              email: 'user1@example.com',
              username: 'user1',
              nickname: 'User 1',
              avatar: null,
            },
          },
        ],
      };

      mockPrisma.project.create.mockResolvedValue(expectedProject);

      const result = await service.create(userId, createProjectDto);

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: {
          ...createProjectDto,
          ownerId: userId,
          members: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  nickname: true,
                  avatar: true,
                },
              },
            },
          },
        },
      });

      expect(result).toEqual(expectedProject);
    });
  });

  describe('findAll', () => {
    const userId = 'user1';

    it('should return user projects', async () => {
      const expectedProjects = [
        {
          id: 'project1',
          name: 'Test Project',
          members: [
            {
              id: 'member1',
              userId,
              role: 'OWNER',
              user: {
                id: userId,
                email: 'user1@example.com',
                username: 'user1',
                nickname: 'User 1',
                avatar: null,
              },
            },
          ],
          _count: {
            files: 5,
            members: 3,
          },
        },
      ];

      mockPrisma.project.findMany.mockResolvedValue(expectedProjects);

      const result = await service.findAll(userId);

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  nickname: true,
                  avatar: true,
                },
              },
            },
          },
          _count: {
            select: {
              files: true,
              members: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      expect(result).toEqual(expectedProjects);
    });
  });

  describe('findOne', () => {
    const projectId = 'project1';

    it('should return project when found', async () => {
      const expectedProject = {
        id: projectId,
        name: 'Test Project',
        members: [
          {
            id: 'member1',
            userId: 'user1',
            role: 'OWNER',
            user: {
              id: 'user1',
              email: 'user1@example.com',
              username: 'user1',
              nickname: 'User 1',
              avatar: null,
              role: 'USER',
            },
          },
        ],
        files: [
          {
            id: 'file1',
            name: 'test.dwg',
            originalName: 'test.dwg',
            mimeType: 'application/dwg',
            size: 1024,
            status: 'COMPLETED',
            createdAt: new Date(),
            owner: {
              id: 'user1',
              username: 'user1',
              nickname: 'User 1',
            },
          },
        ],
      };

      mockPrisma.project.findUnique.mockResolvedValue(expectedProject);

      const result = await service.findOne(projectId);

      expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: projectId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  nickname: true,
                  avatar: true,
                  role: true,
                },
              },
            },
          },
          files: {
            select: {
              id: true,
              name: true,
              originalName: true,
              mimeType: true,
              size: true,
              status: true,
              createdAt: true,
              owner: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      expect(result).toEqual(expectedProject);
    });

    it('should throw NotFoundException when project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne(projectId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const projectId = 'project1';
    const updateDto = { name: 'Updated Project' };

    it('should update project successfully', async () => {
      const expectedProject = {
        id: projectId,
        name: 'Updated Project',
        members: [],
      };

      mockPrisma.project.update.mockResolvedValue(expectedProject);

      const result = await service.update(projectId, updateDto);

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: projectId },
        data: updateDto,
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  nickname: true,
                  avatar: true,
                },
              },
            },
          },
        },
      });

      expect(result).toEqual(expectedProject);
    });
  });

  describe('remove', () => {
    const projectId = 'project1';

    it('should delete project successfully', async () => {
      mockPrisma.project.delete.mockResolvedValue({});

      const result = await service.remove(projectId);

      expect(mockPrisma.project.delete).toHaveBeenCalledWith({
        where: { id: projectId },
      });

      expect(result).toEqual({ message: '项目删除成功' });
    });
  });

  describe('addMember', () => {
    const projectId = 'project1';
    const memberData = { userId: 'user2', role: 'MEMBER' };

    it('should add member successfully', async () => {
      const user = { id: 'user2', email: 'user2@example.com' };
      const expectedMember = {
        id: 'member1',
        projectId,
        userId: 'user2',
        role: 'MEMBER',
        user,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.projectMember.create.mockResolvedValue(expectedMember);

      const result = await service.addMember(projectId, memberData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user2' },
      });

      expect(mockPrisma.projectMember.findUnique).toHaveBeenCalledWith({
        where: {
          userId_projectId: {
            userId: 'user2',
            projectId,
          },
        },
      });

      expect(mockPrisma.projectMember.create).toHaveBeenCalledWith({
        data: {
          projectId,
          userId: 'user2',
          role: 'MEMBER',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
        },
      });

      expect(mockPermissionCacheService.clearUserCache).toHaveBeenCalledWith('user2');
      expect(mockPermissionCacheService.clearProjectCache).toHaveBeenCalledWith(projectId);

      expect(result).toEqual(expectedMember);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addMember(projectId, memberData)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is already a member', async () => {
      const user = { id: 'user2', email: 'user2@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.projectMember.findUnique.mockResolvedValue({ id: 'member1' });

      await expect(service.addMember(projectId, memberData)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMembers', () => {
    const projectId = 'project1';

    it('should return project members', async () => {
      const expectedMembers = [
        {
          id: 'member1',
          projectId,
          userId: 'user1',
          role: 'OWNER',
          user: {
            id: 'user1',
            email: 'user1@example.com',
            username: 'user1',
            nickname: 'User 1',
            avatar: null,
            role: 'USER',
            status: 'ACTIVE',
          },
        },
      ];

      mockPrisma.projectMember.findMany.mockResolvedValue(expectedMembers);

      const result = await service.getMembers(projectId);

      expect(mockPrisma.projectMember.findMany).toHaveBeenCalledWith({
        where: { projectId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
              role: true,
              status: true,
            },
          },
        },
        orderBy: {
          joinedAt: 'asc',
        },
      });

      expect(result).toEqual(expectedMembers);
    });
  });

  describe('updateMember', () => {
    const projectId = 'project1';
    const userId = 'user2';
    const role = 'ADMIN';

    it('should update member role successfully', async () => {
      const expectedMember = {
        id: 'member1',
        projectId,
        userId,
        role: 'ADMIN',
        user: {
          id: 'user2',
          email: 'user2@example.com',
          username: 'user2',
          nickname: 'User 2',
          avatar: null,
        },
      };

      mockPrisma.projectMember.update.mockResolvedValue(expectedMember);

      const result = await service.updateMember(projectId, userId, role);

      expect(mockPrisma.projectMember.update).toHaveBeenCalledWith({
        where: {
          userId_projectId: {
            userId,
            projectId,
          },
        },
        data: { role: 'ADMIN' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              avatar: true,
            },
          },
        },
      });

      expect(mockPermissionCacheService.clearUserCache).toHaveBeenCalledWith(userId);
      expect(mockPermissionCacheService.clearProjectCache).toHaveBeenCalledWith(projectId);

      expect(result).toEqual(expectedMember);
    });
  });

  describe('removeMember', () => {
    const projectId = 'project1';
    const userId = 'user2';

    it('should remove member successfully', async () => {
      mockPrisma.projectMember.delete.mockResolvedValue({});

      const result = await service.removeMember(projectId, userId);

      expect(mockPrisma.projectMember.delete).toHaveBeenCalledWith({
        where: {
          userId_projectId: {
            userId,
            projectId,
          },
        },
      });

      expect(mockPermissionCacheService.clearUserCache).toHaveBeenCalledWith(userId);
      expect(mockPermissionCacheService.clearProjectCache).toHaveBeenCalledWith(projectId);

      expect(result).toEqual({ message: '成员移除成功' });
    });
  });
});