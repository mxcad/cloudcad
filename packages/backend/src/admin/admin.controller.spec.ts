import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
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