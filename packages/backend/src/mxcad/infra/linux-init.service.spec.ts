import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import { LinuxInitService } from './linux-init.service';

jest.mock('@cloudcad/mx-version-tool', () => ({
  checkMxAvailableSync: jest.fn(() => ({ available: true, message: 'mock ok' })),
  getPlatformInfo: jest.fn(() => ({ platform: 'linux', mxPath: '/fake' })),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
    accessSync: jest.fn(),
    promises: {
      ...actual.promises,
      access: jest.fn(),
    },
  };
});

jest.mock('os', () => {
  const actual = jest.requireActual('os');
  return {
    ...actual,
    platform: jest.fn(() => 'win32'),
  };
});

const mockExistsSync = fs.existsSync as unknown as jest.Mock;
const mockAccessSync = fs.accessSync as unknown as jest.Mock;
const mockPlatform = os.platform as unknown as jest.Mock;
const mockPromisesAccess = fs.promises.access as unknown as jest.Mock;
const { checkMxAvailableSync: mockCheckMxAvailableSync } = jest.requireMock(
  '@cloudcad/mx-version-tool',
) as {
  checkMxAvailableSync: jest.Mock;
};

describe('LinuxInitService', () => {
  let service: LinuxInitService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    // jest 配置 restoreMocks+resetMocks 全开，此处显式设置默认行为
    mockExistsSync.mockReset();
    mockAccessSync.mockReset();
    mockPlatform.mockReset();
    mockPromisesAccess.mockReset();
    mockCheckMxAvailableSync.mockReset();
    mockCheckMxAvailableSync.mockReturnValue({
      available: true,
      message: 'mock ok',
    });
    mockExistsSync.mockReturnValue(true);
    mockAccessSync.mockImplementation(() => undefined);
    mockPlatform.mockReturnValue('win32');
    mockPromisesAccess.mockResolvedValue(undefined);

    mockConfigService = { get: jest.fn() };
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'mxcad.assemblyPath') {
        return '/fake/runtime/linux/mxcad/mxcadassembly';
      }
      if (key === 'nodeEnv') {
        return 'production';
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinuxInitService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LinuxInitService>(LinuxInitService);
  });

  describe('validateAssemblyPath', () => {
    it('路径以 .exe 结尾时（防御分支，配置层已回退）仅告警不抛错', () => {
      (service as any).mxcadBinPath =
        '/fake/runtime/windows/mxcad/mxcadassembly.exe';

      expect(() => (service as any).validateAssemblyPath()).not.toThrow();
    });

    it('生产环境: 程序文件不存在时 fail-fast', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => (service as any).validateAssemblyPath()).toThrow(
        /mxcadassembly 程序不存在/,
      );
    });

    it('开发环境: 程序文件不存在时仅告警不抛错', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'mxcad.assemblyPath') {
          return '/fake/runtime/linux/mxcad/mxcadassembly';
        }
        if (key === 'nodeEnv') {
          return 'development';
        }
        return undefined;
      });
      mockExistsSync.mockReturnValue(false);

      expect(() => (service as any).validateAssemblyPath()).not.toThrow();
    });

    it('生产环境: 文件存在但不可执行时 fail-fast', () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => (service as any).validateAssemblyPath()).toThrow(
        /没有可执行权限/,
      );
    });

    it('开发环境: 文件不可执行时仅告警不抛错', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'mxcad.assemblyPath') {
          return '/fake/runtime/linux/mxcad/mxcadassembly';
        }
        if (key === 'nodeEnv') {
          return 'development';
        }
        return undefined;
      });
      mockAccessSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => (service as any).validateAssemblyPath()).not.toThrow();
    });

    it('配置正确且文件可执行时不抛错', () => {
      expect(() => (service as any).validateAssemblyPath()).not.toThrow();
    });
  });

  describe('checkEnvironment', () => {
    it('Linux: 指向 .exe 时报告跨平台误配置 issue', async () => {
      mockPlatform.mockReturnValue('linux');
      (service as any).mxcadBinPath =
        '/fake/runtime/windows/mxcad/mxcadassembly.exe';

      const result = await (service as any).checkEnvironment();

      expect(result.isConfigured).toBe(false);
      expect(
        result.issues.some((i: string) => i.includes('Windows 可执行文件')),
      ).toBe(true);
    });

    it('Linux: 程序不存在时报告 issue 而非静默通过', async () => {
      mockPlatform.mockReturnValue('linux');
      mockExistsSync.mockReturnValue(false);

      const result = await (service as any).checkEnvironment();

      expect(result.isConfigured).toBe(false);
      expect(
        result.issues.some((i: string) => i.includes('程序不存在')),
      ).toBe(true);
    });
  });
});
