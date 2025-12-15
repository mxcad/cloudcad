import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionService } from '../common/services/permission.service';
import { PermissionCacheService } from '../common/services/permission-cache.service';

describe('AdminController', () => {
  let controller: AdminController;

  const mockPermissionService = {
    getUserPermissions: jest.fn(),
  };

  const mockPermissionCacheService = {
    getStats: jest.fn(),
    cleanup: jest.fn(),
    clearUserCache: jest.fn(),
    clearProjectCache: jest.fn(),
    clearFileCache: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: PermissionService,
          useValue: mockPermissionService,
        },
        {
          provide: PermissionCacheService,
          useValue: mockPermissionCacheService,
        },
      ],
    })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: () => true,
      constructor: jest.fn(),
    })
    .overrideGuard(RolesGuard)
    .useValue({
      canActivate: () => true,
      constructor: jest.fn(),
    })
    .compile();

    controller = module.get<AdminController>(AdminController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});