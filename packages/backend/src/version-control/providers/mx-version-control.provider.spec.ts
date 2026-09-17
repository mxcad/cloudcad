import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import * as path from 'path';
import { FileUtils } from '../../common/utils/file-utils';
import { MxVersionControlProvider } from './mx-version-control.provider';

const mockMxCommit = jest.fn();
const mockMxAdd = jest.fn();
const mockMxCat = jest.fn();
const mockMxList = jest.fn();
const mockMxDelete = jest.fn();
const mockMxLog = jest.fn();

function cbMock(returnValue?: unknown) {
  return jest.fn((...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') {
      cb(null, returnValue ?? 'ok');
    }
  });
}

jest.mock('@cloudcad/mx-version-tool', () => ({
  mxCheckout: cbMock(),
  mxAdd: (...args: unknown[]) => mockMxAdd(...args),
  mxCommit: (...args: unknown[]) => mockMxCommit(...args),
  mxDelete: (...args: unknown[]) => mockMxDelete(...args),
  mxadminCreate: cbMock(),
  mxImport: cbMock(),
  mxLog: (...args: unknown[]) => mockMxLog(...args),
  mxCat: (...args: unknown[]) => mockMxCat(...args),
  mxList: (...args: unknown[]) => mockMxList(...args),
  mxPropset: cbMock(),
  mxUpdate: cbMock(),
  mxCleanup: cbMock(),
  mxRevert: cbMock(),
  mxInfo: jest.fn((...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, 'URL: file:///tmp/test-mx-repo\n');
  }),
  mxRelocate: cbMock(),
  mxSwitch: cbMock(),
  getPlatformInfo: jest.fn().mockReturnValue({ isWindows: false }),
}));

jest.mock('../../common/utils/file-utils', () => ({
  FileUtils: {
    validatePath: jest.fn((inputPath: string) => inputPath),
    stripStoragePrefix: jest.requireActual('../../common/utils/file-utils')
      .FileUtils.stripStoragePrefix,
    resolveStoragePath: jest.requireActual('../../common/utils/file-utils')
      .FileUtils.resolveStoragePath,
  },
}));

describe('MxVersionControlProvider', () => {
  let provider: MxVersionControlProvider;
  let mockI18n: jest.Mocked<I18nService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockI18n = {
      t: jest.fn().mockReturnValue('translated'),
    } as unknown as jest.Mocked<I18nService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MxVersionControlProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'mxRepoPath') return '/tmp/test-mx-repo';
              if (key === 'filesDataPath') return '/tmp/test-files-data';
              if (key === 'mx') return { ignorePatterns: ['*.tmp', '*.log'] };
              return undefined;
            }),
          },
        },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compile();

    provider = module.get<MxVersionControlProvider>(MxVersionControlProvider);
    // 绕过初始化逻辑，直接标记为已初始化
    (provider as any).isInitialized = true;
  });

  describe('commitFiles', () => {
    it('空文件列表应返回成功', async () => {
      const result = await provider.commitFiles([], 'no files');
      expect(result.success).toBe(true);
    });

    it('多文件提交应调用 add + commit', async () => {
      mockI18n.t.mockReturnValue('提交成功');
      mockMxAdd.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'added');
      });
      mockMxCommit.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'committed');
      });

      const result = await provider.commitFiles(
        ['/tmp/test-files-data/a.dwg', '/tmp/test-files-data/b.dwg'],
        'batch commit'
      );

      expect(result.success).toBe(true);
      expect(mockMxAdd).toHaveBeenCalled();
      expect(mockMxCommit).toHaveBeenCalled();
    });

    it('MX commit 错误应返回失败', async () => {
      mockMxAdd.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'added');
      });
      mockMxCommit.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(new Error('E155010: commit error'));
      });

      const result = await provider.commitFiles(
        ['/tmp/test-files-data/a.dwg'],
        'failing commit'
      );

      expect(result.success).toBe(false);
    });
  });

  describe('parseMxLogXml', () => {
    it('应正确解析 XML', () => {
      const xml = `<?xml version="1.0"?>
<log>
<logentry revision="5">
<author>admin</author>
<date>2026-07-20T08:00:00.000000Z</date>
<msg>test message</msg>
<paths>
<path action="M" kind="file">/path/to/file.txt</path>
</paths>
</logentry>
</log>`;
      const entries = (provider as any).parseMxLogXml(xml);
      expect(entries).toHaveLength(1);
      expect(entries[0].revision).toBe(5);
      expect(entries[0].author).toBe('admin');
    });

    it('空 XML 应返回空数组', () => {
      const entries = (provider as any).parseMxLogXml('');
      expect(entries).toEqual([]);
    });

    it('应解析 JSON 格式的 commit message', () => {
      const xml = `<?xml version="1.0"?>
<log>
<logentry revision="3">
<author>dev</author>
<date>2026-07-21T10:00:00.000000Z</date>
<msg>{"message":"Added file","userName":"Dev User"}</msg>
</logentry>
</log>`;
      const entries = (provider as any).parseMxLogXml(xml);
      expect(entries[0].message).toBe('Added file');
      expect(entries[0].userName).toBe('Dev User');
    });
  });

  describe('commitNodeDirectory', () => {
    it('目录含文件时应收集路径并提交', async () => {
      mockMxAdd.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'added');
      });
      mockMxCommit.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'committed');
      });
      mockI18n.t.mockReturnValue('提交成功');

      const result = await provider.commitNodeDirectory(
        '/tmp/test-files-data/202607/some-node',
        'test commit',
        'user-1'
      );

      expect(result.success).toBe(true);
      expect(mockMxAdd).toHaveBeenCalled();
      expect(mockMxCommit).toHaveBeenCalled();
    });
  });

  describe('getFileContentAtRevision', () => {
    const sep = path.sep;

    it('成功时应返回文件内容', async () => {
      const buf = Buffer.from('file content');
      mockMxCat.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, buf.toString());
      });

      const result = await provider.getFileContentAtRevision(
        '/tmp/test-files-data/202607/node/file.dwg',
        1
      );
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('传入绝对路径时不应重复拼接 filesDataPath', async () => {
      const buf = Buffer.from('content');
      mockMxCat.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, buf.toString());
      });

      await provider.getFileContentAtRevision(
        '/tmp/test-files-data/202607/node/file.dwg',
        3
      );

      const mxCatPath = mockMxCat.mock.calls[0][0];
      expect(mxCatPath).toContain(`202607${sep}node${sep}file.dwg`);
      expect(mxCatPath).not.toContain(`test-files-data${sep}tmp`);
      expect(mxCatPath).not.toContain(`test-files-data${sep}test-files-data`);
    });

    it('传入相对路径时应拼接 filesDataPath', async () => {
      mockMxCat.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'content');
      });

      const result = await provider.getFileContentAtRevision(
        '202607/node/file.dwg',
        1
      );
      expect(result.success).toBe(true);
      const mxCatPath = mockMxCat.mock.calls[0][0];
      expect(mxCatPath).toContain(
        `test-files-data${sep}202607${sep}node${sep}file.dwg`
      );
    });

    it('传入 filesData/ 前缀相对路径时应剥离前缀再拼接', async () => {
      mockMxCat.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'content');
      });

      const result = await provider.getFileContentAtRevision(
        'filesData/202607/node/file.dwg',
        1
      );
      expect(result.success).toBe(true);
      const mxCatPath = mockMxCat.mock.calls[0][0];
      expect(mxCatPath).toContain(
        `test-files-data${sep}202607${sep}node${sep}file.dwg`
      );
    });

    it('传入 filesData\\ 反斜杠前缀相对路径时应剥离前缀', async () => {
      mockMxCat.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, 'content');
      });

      const result = await provider.getFileContentAtRevision(
        'filesData\\202607\\node\\file.dwg',
        1
      );
      expect(result.success).toBe(true);
      const mxCatPath = mockMxCat.mock.calls[0][0];
      // 前缀已被剥离（Windows 下路径可能混合分隔符，只断言前缀消失）
      expect(mxCatPath).not.toContain('filesData');
    });

    it('文件内容为空时应返回失败', async () => {
      mockMxCat.mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1];
        if (typeof cb === 'function') cb(null, '');
      });

      const result = await provider.getFileContentAtRevision(
        '/tmp/test-files-data/202607/node/file.dwg',
        1
      );
      expect(result.success).toBe(false);
    });
  });

  describe('isReady', () => {
    it('初始化后应返回 true', () => {
      expect(provider.isReady()).toBe(true);
    });

    it('未初始化时应返回 false', () => {
      (provider as any).isInitialized = false;
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('commitWorkingCopy', () => {
    describe('when successful', () => {
      it('should return success and call mxCommit', async () => {
        mockI18n.t.mockReturnValue('提交成功');
        mockMxCommit.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') cb(null, 'committed');
        });

        const result = await provider.commitWorkingCopy('full backup');
        expect(result.success).toBe(true);
        expect(mockMxCommit).toHaveBeenCalled();
      });
    });

    describe('when CLI returns error', () => {
      it('should return failure', async () => {
        mockMxCommit.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') cb(new Error('E155010: commit error'));
        });

        const result = await provider.commitWorkingCopy('failing');
        expect(result.success).toBe(false);
      });
    });

    describe('when CLI returns timeout error', () => {
      it('should return failure for timeout error', async () => {
        mockMxCommit.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function')
            cb(new Error('E155004: operation timed out'));
        });

        const result = await provider.commitWorkingCopy('timeout');
        expect(result.success).toBe(false);
      });
    });
  });

  describe('isFirstCommit', () => {
    describe('when directory exists in repository', () => {
      it('should return false', async () => {
        mockMxList.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') cb(null, 'file list');
        });

        const result = await provider.isFirstCommit(
          '/tmp/test-files-data/202607/some-node'
        );
        expect(result).toBe(false);
      });
    });

    describe('when directory does not exist in repository', () => {
      it('should return true', async () => {
        mockMxList.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function')
            cb(new Error('E155010: path not found'));
        });

        const result = await provider.isFirstCommit(
          '/tmp/test-files-data/202607/some-node'
        );
        expect(result).toBe(true);
      });
    });
  });

  describe('getFileHistory', () => {
    describe('when successful', () => {
      it('should return history entries in ascending revision order with totalCount', async () => {
        mockI18n.t.mockReturnValue('获取成功');
        mockMxLog.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            cb(
              null,
              '<?xml version="1.0"?><log>' +
                '<logentry revision="3"><author>c</author><date>2026-01-03T00:00:00.000Z</date><msg>third</msg></logentry>' +
                '<logentry revision="2"><author>b</author><date>2026-01-02T00:00:00.000Z</date><msg>second</msg></logentry>' +
                '<logentry revision="1"><author>a</author><date>2026-01-01T00:00:00.000Z</date><msg>first</msg></logentry>' +
                '</log>'
            );
          }
        });

        const result = await provider.getFileHistory(
          'filesData/some-path/file.dwg'
        );

        expect(result.success).toBe(true);
        expect(result.totalCount).toBe(3);
        expect(result.entries).toHaveLength(3);
        // MX log 返回新→旧，应反转成旧→新（r0 初始在前，最后一次修改在后）
        expect(result.entries.map((e) => e.revision)).toEqual([1, 2, 3]);
      });

      it('should limit returned entries but keep real totalCount', async () => {
        mockI18n.t.mockReturnValue('获取成功');
        mockMxLog.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            cb(
              null,
              '<?xml version="1.0"?><log>' +
                '<logentry revision="5"><msg>fifth</msg></logentry>' +
                '<logentry revision="4"><msg>fourth</msg></logentry>' +
                '<logentry revision="3"><msg>third</msg></logentry>' +
                '<logentry revision="2"><msg>second</msg></logentry>' +
                '<logentry revision="1"><msg>first</msg></logentry>' +
                '</log>'
            );
          }
        });

        const result = await provider.getFileHistory(
          'filesData/some-path/file.dwg',
          2
        );

        expect(result.success).toBe(true);
        expect(result.totalCount).toBe(5);
        // 保留最近 2 条修改（旧→新）
        expect(result.entries.map((e) => e.revision)).toEqual([4, 5]);
      });

      it('should request full history (limit 0) for accurate totalCount', async () => {
        mockI18n.t.mockReturnValue('获取成功');
        mockMxLog.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            cb(
              null,
              '<?xml version="1.0"?><log><logentry revision="1"><msg>first</msg></logentry></log>'
            );
          }
        });

        const result = await provider.getFileHistory(
          'filesData/some-path/file.dwg'
        );

        expect(result.success).toBe(true);
        expect(mockMxLog).toHaveBeenCalledWith(
          expect.any(String),
          0,
          true,
          null,
          null,
          expect.any(Function)
        );
        expect(result.totalCount).toBe(1);
      });

      it('should accept absolute path without double-prefixing repoUrl', async () => {
        mockI18n.t.mockReturnValue('获取成功');
        mockMxLog.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            cb(
              null,
              '<?xml version="1.0"?><log><logentry revision="1"><msg>first</msg></logentry></log>'
            );
          }
        });

        const result = await provider.getFileHistory(
          '/tmp/test-files-data/202607/some-node/file.dwg'
        );

        expect(result.success).toBe(true);
        const repoUrl = mockMxLog.mock.calls[0][0];
        expect(repoUrl).toContain('202607/some-node');
        expect(repoUrl).not.toContain('test-files-data/test-files-data');
      });

      it('should strip filesData\\ backslash prefix', async () => {
        mockI18n.t.mockReturnValue('获取成功');
        mockMxLog.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            cb(
              null,
              '<?xml version="1.0"?><log><logentry revision="1"><msg>first</msg></logentry></log>'
            );
          }
        });

        const result = await provider.getFileHistory(
          'filesData\\some-path\\file.dwg'
        );

        expect(result.success).toBe(true);
        const repoUrl = mockMxLog.mock.calls[0][0];
        expect(repoUrl).not.toContain('filesData');
      });

      it('should default to 50 entries when limit is omitted but keep real totalCount', async () => {
        mockI18n.t.mockReturnValue('获取成功');
        const logEntries: string[] = [];
        for (let i = 60; i >= 1; i--) {
          logEntries.push(
            `<logentry revision="${i}"><msg>rev ${i}</msg></logentry>`
          );
        }
        mockMxLog.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') {
            cb(null, `<?xml version="1.0"?><log>${logEntries.join('')}</log>`);
          }
        });

        const result = await provider.getFileHistory(
          'filesData/some-path/file.dwg'
        );

        expect(result.success).toBe(true);
        expect(result.totalCount).toBe(60);
        expect(result.entries).toHaveLength(50);
        // 保留最近 50 条（旧→新）
        expect(result.entries[0].revision).toBe(11);
        expect(result.entries[49].revision).toBe(60);
      });
    });

    describe('when CLI returns error', () => {
      it('should return failure', async () => {
        mockMxLog.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function')
            cb(new Error('E155010: path not found'));
        });

        const result = await provider.getFileHistory('filesData/missing-path');
        expect(result.success).toBe(false);
        expect(result.totalCount).toBe(0);
      });
    });

    describe('路径遍历门禁（与 listDirectoryAtRevision / getFileContentAtRevision 一致）', () => {
      it('filePath 含 .. 时经 validatePath 拒绝（BadRequest），不拼进仓库 URL', async () => {
        // 旧代码 getFileHistory 未调用 validatePath：此 once 实现不会被消费，操作继续推进
        // （mxLogAsync mock 返回成功 → 不抛错），断言失败即回归测试的「牙齿」
        (FileUtils.validatePath as jest.Mock).mockImplementationOnce(
          (p: string) => {
            if (p.includes('..')) {
              throw new BadRequestException('路径包含非法字符');
            }
            return p;
          }
        );

        await expect(
          provider.getFileHistory('../../etc/passwd')
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });
  });

  describe('listDirectoryAtRevision', () => {
    describe('when successful', () => {
      it('should return file list', async () => {
        mockI18n.t.mockReturnValue('获取成功');
        mockMxList.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') cb(null, 'file1.dwg\nfile2.dxf');
        });

        const result = await provider.listDirectoryAtRevision(
          '/tmp/test-files-data/202607/some-node',
          1
        );
        expect(result.success).toBe(true);
      });
    });

    describe('when CLI returns error', () => {
      it('should return failure', async () => {
        mockMxList.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function')
            cb(new Error('E155010: path not found'));
        });

        const result = await provider.listDirectoryAtRevision(
          '/tmp/test-files-data/202607/some-node',
          1
        );
        expect(result.success).toBe(false);
      });
    });

    describe('when CLI times out', () => {
      it('should return failure on timeout', async () => {
        mockMxList.mockImplementation((...args: unknown[]) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function')
            cb(new Error('E155004: operation timed out'));
        });

        const result = await provider.listDirectoryAtRevision(
          '/tmp/test-files-data/202607/some-node',
          1
        );
        expect(result.success).toBe(false);
      });
    });
  });
});
