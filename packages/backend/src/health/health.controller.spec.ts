import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { HealthController } from './health.controller';
import { HealthCheckService } from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { PermissionService } from '../common/services/permission.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  let databaseService: DatabaseService;
  let storageService: StorageService;

  const mockHealthCheckService = {
    check: jest.fn(),
  };

  const mockDatabaseService = {
    healthCheck: jest
      .fn()
      .mockResolvedValue({ status: 'healthy', message: 'OK' }),
  };

  const mockStorageService = {
    healthCheck: jest
      .fn()
      .mockResolvedValue({ status: 'healthy', message: 'OK' }),
  };

  const mockPermissionService = {
    checkSystemPermission: jest.fn().mockResolvedValue(true),
    checkSystemPermissionWithContext: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: PermissionService,
          useValue: mockPermissionService,
        },
        Reflector,
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

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    storageService = module.get<StorageService>(StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have health check service', () => {
    expect(healthCheckService).toBeDefined();
  });

  it('should have database service', () => {
    expect(databaseService).toBeDefined();
  });

  it('should have storage service', () => {
    expect(storageService).toBeDefined();
  });
});
