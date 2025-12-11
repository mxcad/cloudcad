import { Test, TestingModule } from '@nestjs/testing';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { FilePermissionGuard } from '../common/guards/file-permission.guard';

describe('FilesController', () => {
  let controller: FilesController;
  let filesService: FilesService;

  const mockFilesService = {
    upload: jest.fn(),
    findAll: jest.fn(),
    findByProject: jest.fn(),
    findOne: jest.fn(),
    download: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    shareFile: jest.fn(),
    getFileAccess: jest.fn(),
    updateFileAccess: jest.fn(),
    removeFileAccess: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        {
          provide: FilesService,
          useValue: mockFilesService,
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
    .overrideGuard(ProjectPermissionGuard)
    .useValue({
      canActivate: () => true,
      constructor: jest.fn(),
    })
    .overrideGuard(FilePermissionGuard)
    .useValue({
      canActivate: () => true,
      constructor: jest.fn(),
    })
    .compile();

    controller = module.get<FilesController>(FilesController);
    filesService = module.get<FilesService>(FilesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});