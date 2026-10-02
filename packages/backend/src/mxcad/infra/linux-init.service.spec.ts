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
    // killLeftoverMxcadAssembly 读 /proc/<pid>/cmdline 排除协同引擎
    readFileSync: jest.fn(),
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

// killLeftoverMxcadAssembly 走 execAsync（promisify(exec)）：
// 真实 exec 带 customPromisified（resolve { stdout, stderr }），mock 须同契约，
// 否则默认 promisify 只 resolve 第二个参数（字符串），解构 { stdout } 得 undefined
jest.mock('child_process', () => {
  const { promisify } = jest.requireActual('util');
  const exec = jest.fn();
  // 走 util.promisify.custom（Symbol）而非属性名——promisify 只认该 Symbol
  exec[promisify.custom] = (cmd: string) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      exec(cmd, (err: Error | null, stdout: string, stderr: string) => {
        if (err) reject(err);
        else resolve({ stdout, stderr });
      });
    });
  return { exec };
});

const mockExistsSync = fs.existsSync as unknown as jest.Mock;
const mockReadFileSync = fs.readFileSync as unknown as jest.Mock;
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
    mockReadFileSync.mockReset();
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

  describe('killLeftoverMxcadAssembly', () => {
    // 读 /proc/<pid>/cmdline 的 mock：按 PID 返回指定命令行
    function mockCmdlines(map: Record<number, string>) {
      mockReadFileSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        const m = s.match(/\/proc\/(\d+)\/cmdline$/);
        if (m && m[1] in map) return map[Number(m[1])];
        throw new Error(`ENOENT: ${s}`);
      });
    }

    it('pgrep 用 [m]xcadassembly 方括号模式防自匹配，按 PID 杀遗留孤儿', async () => {
      const { exec: mockExec } = jest.requireMock(
        'child_process',
      ) as { exec: jest.Mock };
      mockExec.mockImplementation(
        (
          cmd: string,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          // pgrep 返回一个遗留转换孤儿 PID
          cb(null, cmd.startsWith('pgrep') ? '12345\n' : '', '');
        },
      );
      mockCmdlines({ 12345: '/opt/mxcad/mxcadassembly {"srcpath":"/x.dwg"}' });
      const killSpy = jest.spyOn(process, 'kill').mockReturnValue(true);

      await (service as any).killLeftoverMxcadAssembly();

      const commands = mockExec.mock.calls.map((c) => c[0] as string);
      expect(commands).toHaveLength(1);
      expect(commands[0]).toContain('pgrep -f "[m]xcadassembly"');
      // 回归判据：命令行不得含裸模式串——exec 经 sh -c 执行，包装 shell 的
      // 命令行本身含裸模式时 pgrep -f 会自匹配并 SIGKILL 包装 shell，
      // exec 报 "Command failed"，该 WARN 会误触发部署包断网验证的日志关键词检查
      expect(commands[0].includes('mxcadassembly')).toBe(false);
      // 按 PID 杀，不再用 pkill 模式匹配
      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGKILL');
      killSpy.mockRestore();
    });

    it('不杀协同引擎（cmdline 含 run_cooperate_server），只杀转换孤儿', async () => {
      const { exec: mockExec } = jest.requireMock(
        'child_process',
      ) as { exec: jest.Mock };
      mockExec.mockImplementation(
        (
          cmd: string,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          // 协同引擎(111) + 转换孤儿(222)
          cb(null, cmd.startsWith('pgrep') ? '111\n222\n' : '', '');
        },
      );
      mockCmdlines({
        111: '/opt/mxcad/mxcadassembly {"run_cooperate_server":true}',
        222: '/opt/mxcad/mxcadassembly {"srcpath":"/x.dwg"}',
      });
      const killSpy = jest.spyOn(process, 'kill').mockReturnValue(true);

      await (service as any).killLeftoverMxcadAssembly();

      expect(killSpy).toHaveBeenCalledTimes(1);
      expect(killSpy).toHaveBeenCalledWith(222, 'SIGKILL');
      expect(killSpy).not.toHaveBeenCalledWith(111, 'SIGKILL');
      killSpy.mockRestore();
    });

    it('全部为协同引擎时不杀任何进程', async () => {
      const { exec: mockExec } = jest.requireMock(
        'child_process',
      ) as { exec: jest.Mock };
      mockExec.mockImplementation(
        (
          cmd: string,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, cmd.startsWith('pgrep') ? '111\n' : '', '');
        },
      );
      mockCmdlines({
        111: '/opt/mxcad/mxcadassembly {"run_cooperate_server":true}',
      });
      const killSpy = jest.spyOn(process, 'kill').mockReturnValue(true);

      await (service as any).killLeftoverMxcadAssembly();

      expect(killSpy).not.toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it('cmdline 读不到（进程已退出）时跳过该 PID，不抛错', async () => {
      const { exec: mockExec } = jest.requireMock(
        'child_process',
      ) as { exec: jest.Mock };
      mockExec.mockImplementation(
        (
          cmd: string,
          cb: (err: Error | null, stdout: string, stderr: string) => void,
        ) => {
          cb(null, cmd.startsWith('pgrep') ? '333\n' : '', '');
        },
      );
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: /proc/333/cmdline');
      });
      const killSpy = jest.spyOn(process, 'kill').mockReturnValue(true);

      await (service as any).killLeftoverMxcadAssembly();

      expect(killSpy).not.toHaveBeenCalled();
      killSpy.mockRestore();
    });
  });
});
