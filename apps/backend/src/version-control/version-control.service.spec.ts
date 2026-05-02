///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VersionControlService } from './version-control.service';

// ----------------------------------------------------------------
// fs mock — plain functions survive jest.resetAllMocks
// ----------------------------------------------------------------
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: () => true,
    readdirSync: () => [],
    mkdirSync: () => undefined,
    readFileSync: () => '{}',
  };
});

// ----------------------------------------------------------------
// SVN tool mock — mutable dispatch pattern.
// The mock factory captures a mutable dispatch table.  Individual
// tests can replace behaviors via setSvn() without changing the
// promisified references already captured by the service.
// ----------------------------------------------------------------
const svnBehaviors: Record<string, Function> = {};

function svnDispatcher(...args: any[]) {
  const name = svnDispatcher._name!;
  const cb = args[args.length - 1];
  const handler = svnBehaviors[name];
  if (handler) return handler(...args);
  // default: success with empty result
  if (typeof cb === 'function') cb(null, '');
}

function installSvn(name: string, fn: Function) {
  svnBehaviors[name] = fn;
}

function svnOk(result: string) {
  return (...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, result);
  };
}

function svnFail(msg: string) {
  return (...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(new Error(msg), '');
  };
}

// Create named dispatchers
const svnNames = [
  'svnCheckout', 'svnAdd', 'svnCommit', 'svnDelete', 'svnadminCreate',
  'svnImport', 'svnLog', 'svnCat', 'svnList', 'svnPropset', 'svnUpdate', 'svnCleanup',
];
const svnMockObj: Record<string, Function> = {};
for (const name of svnNames) {
  const dispatcher = (...args: any[]) => {
    const handler = svnBehaviors[name];
    if (handler) return handler(...args);
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, '');
  };
  svnMockObj[name] = dispatcher;
}

jest.mock('@cloudcad/svn-version-tool', () => svnMockObj);

// Default behaviors — set before each test
function resetSvnDefaults() {
  installSvn('svnCheckout', svnOk('Checked out'));
  installSvn('svnAdd', svnOk('A  file'));
  installSvn('svnCommit', svnOk('Committed revision 1.'));
  installSvn('svnDelete', svnOk('D  file'));
  installSvn('svnadminCreate', svnOk('Created'));
  installSvn('svnImport', svnOk('Imported'));
  installSvn('svnLog', svnOk(`<?xml version="1.0"?><log><logentry revision="1"><author>t</author><date>2024-01-01T10:00:00.000000Z</date><msg>m</msg></logentry></log>`));
  installSvn('svnCat', svnOk('file content'));
  installSvn('svnList', svnOk('file1.dwg\nfile2.dxf'));
  installSvn('svnPropset', svnOk('property set'));
  installSvn('svnUpdate', svnOk('Updated'));
  installSvn('svnCleanup', svnOk('Cleanup'));
}
resetSvnDefaults();

// ----------------------------------------------------------------
// ConfigService mock — plain object, survives resetAllMocks
// ----------------------------------------------------------------
const mockConfig: Record<string, any> = {
  svnRepoPath: '/fake/svn/repo',
  filesDataPath: '/fake/filesData',
  svn: { ignorePatterns: ['*.tmp', '*.log'] },
};
const mockConfigService = {
  get: (key: string, opts?: any) => {
    if (opts?.infer && mockConfig[key] !== undefined) return mockConfig[key];
    return mockConfig[key];
  },
};

describe('VersionControlService', () => {
  let service: VersionControlService;

  beforeEach(async () => {
    resetSvnDefaults();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionControlService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<VersionControlService>(VersionControlService);
    (service as any).isInitialized = true;
    (service as any).initPromise = Promise.resolve();
  });

  // ==================== isReady ====================
  describe('isReady', () => {
    it('returns true when initialized', () => { expect(service.isReady()).toBe(true); });
    it('returns false when not initialized', () => {
      (service as any).isInitialized = false;
      expect(service.isReady()).toBe(false);
    });
  });

  // ==================== ensureInitialized ====================
  describe('ensureInitialized', () => {
    it('resolves when already initialized', async () => {
      await expect(service.ensureInitialized()).resolves.toBeUndefined();
    });
    it('awaits initPromise when not initialized', async () => {
      (service as any).isInitialized = false;
      await expect(service.ensureInitialized()).resolves.toBeUndefined();
    });
  });

  // ==================== commitNodeDirectory ====================
  describe('commitNodeDirectory', () => {
    it('fails when SVN not initialized', async () => {
      (service as any).isInitialized = false;
      const r = await service.commitNodeDirectory('/dir', 'msg');
      expect(r.success).toBe(false);
      expect(r.message).toContain('未初始化');
    });
    it('succeeds when initialized', async () => {
      const r = await service.commitNodeDirectory('/fake/filesData/proj/sub/f.txt', 'msg', 'u1', 'User');
      expect(r.success).toBe(true);
    });
    it('tolerates already-tracked svnAdd error', async () => {
      installSvn('svnAdd', svnFail('already under version control'));
      const r = await service.commitNodeDirectory('/fake/filesData/existing/f.txt', 'msg');
      expect(r.success).toBe(true);
    });
    it('fails on commit error', async () => {
      installSvn('svnCommit', svnFail('Commit failed'));
      const r = await service.commitNodeDirectory('/fake/filesData/d/f.txt', 'x');
      expect(r.success).toBe(false);
      expect(r.message).toContain('Commit failed');
    });
  });

  // ==================== commitFiles ====================
  describe('commitFiles', () => {
    it('fails when not initialized', async () => {
      (service as any).isInitialized = false;
      expect((await service.commitFiles(['f'], 'm')).success).toBe(false);
    });
    it('succeeds with empty file list', async () => {
      const r = await service.commitFiles([], 'm');
      expect(r.success).toBe(true);
      expect(r.message).toContain('没有文件需要提交');
    });
    it('adds and commits files', async () => {
      expect((await service.commitFiles(['/a.dwg'], 'b')).success).toBe(true);
    });
  });

  // ==================== deleteNodeDirectory ====================
  describe('deleteNodeDirectory', () => {
    it('fails when not initialized', async () => {
      (service as any).isInitialized = false;
      expect((await service.deleteNodeDirectory('/d')).success).toBe(false);
    });
    it('succeeds when initialized', async () => {
      expect((await service.deleteNodeDirectory('/d')).success).toBe(true);
    });
    it('handles svnDelete error', async () => {
      installSvn('svnDelete', svnFail('not a working copy'));
      expect((await service.deleteNodeDirectory('/d')).success).toBe(false);
    });
  });

  // ==================== commitWorkingCopy ====================
  describe('commitWorkingCopy', () => {
    it('fails when not initialized', async () => {
      (service as any).isInitialized = false;
      expect((await service.commitWorkingCopy('m')).success).toBe(false);
    });
    it('succeeds when initialized', async () => {
      expect((await service.commitWorkingCopy('bulk')).success).toBe(true);
    });
    it('handles commit error', async () => {
      installSvn('svnCommit', svnFail('Commit error'));
      expect((await service.commitWorkingCopy('m')).success).toBe(false);
    });
  });

  // ==================== getFileHistory ====================
  describe('getFileHistory', () => {
    it('fails when not initialized', async () => {
      (service as any).isInitialized = false;
      expect((await service.getFileHistory('p/f.dwg')).success).toBe(false);
    });
    it('parses SVN log XML', async () => {
      installSvn('svnLog', svnOk(`<?xml version="1.0"?><log>
<logentry revision="3"><author>dev1</author><date>2024-01-03T10:00:00.000000Z</date><msg>{"type":"file_operation","message":"updated","userName":"Dev"}</msg><paths><path action="M" kind="file">/f.dwg</path></paths></logentry>
<logentry revision="2"><author>dev2</author><date>2024-01-02T10:00:00.000000Z</date><msg>plain</msg></logentry>
<logentry revision="1"><author>admin</author><date>2024-01-01T10:00:00.000000Z</date><msg>first</msg></logentry>
</log>`));
      const r = await service.getFileHistory('2026/nid/f.mxweb');
      expect(r.success).toBe(true);
      expect(r.entries).toHaveLength(3);
      expect(r.entries[0].revision).toBe(3);
      expect(r.entries[0].author).toBe('dev1');
      expect(r.entries[0].userName).toBe('Dev');
      expect(r.entries[0].message).toBe('updated');
      expect(r.entries[0].paths).toHaveLength(1);
    });
    it('handles non-JSON commit messages', async () => {
      installSvn('svnLog', svnOk(`<?xml version="1.0"?><log><logentry revision="1"><author>a</author><date>2024-01-01T10:00:00.000000Z</date><msg>simple</msg></logentry></log>`));
      expect((await service.getFileHistory('p/f.dwg')).entries[0].message).toBe('simple');
    });
    it('handles empty log', async () => {
      installSvn('svnLog', svnOk(''));
      expect((await service.getFileHistory('p/f.dwg')).entries).toHaveLength(0);
    });
    it('handles log errors', async () => {
      installSvn('svnLog', svnFail('E170001: Auth failed'));
      const r = await service.getFileHistory('p/f.dwg');
      expect(r.success).toBe(false);
      expect(r.entries).toEqual([]);
    });
    it('strips filesData/ prefix', async () => {
      installSvn('svnLog', svnOk(`<?xml version="1.0"?><log><logentry revision="1"><author>t</author><date>2024-01-01T10:00:00.000000Z</date><msg>m</msg></logentry></log>`));
      expect((await service.getFileHistory('filesData/2026/n/f.mxweb')).success).toBe(true);
    });
  });

  // ==================== listDirectoryAtRevision ====================
  describe('listDirectoryAtRevision', () => {
    it('fails when not initialized', async () => {
      (service as any).isInitialized = false;
      expect((await service.listDirectoryAtRevision('/d', 1)).success).toBe(false);
    });
    it('lists files', async () => {
      const r = await service.listDirectoryAtRevision('/fake/filesData/proj', 5);
      expect(r.success).toBe(true);
      expect(r.files).toEqual(['file1.dwg', 'file2.dxf']);
    });
    it('handles empty directory', async () => {
      installSvn('svnList', svnOk(''));
      const r = await service.listDirectoryAtRevision('/d', 1);
      expect(r.success).toBe(true);
      expect(r.files).toEqual([]);
    });
    it('handles list errors', async () => {
      installSvn('svnList', svnFail('E160013: Not found'));
      expect((await service.listDirectoryAtRevision('/d', 1)).success).toBe(false);
    });
  });

  // ==================== getFileContentAtRevision ====================
  describe('getFileContentAtRevision', () => {
    it('fails when not initialized', async () => {
      (service as any).isInitialized = false;
      expect((await service.getFileContentAtRevision('/f', 1)).success).toBe(false);
    });
    it('gets content', async () => {
      const r = await service.getFileContentAtRevision('/fake/filesData/p/f.dwg', 3);
      expect(r.success).toBe(true);
      expect(r.content!.toString()).toBe('file content');
    });
    it('handles empty content', async () => {
      installSvn('svnCat', svnOk(''));
      const r = await service.getFileContentAtRevision('/fake/filesData/f.txt', 1);
      expect(r.success).toBe(false);
      expect(r.message).toContain('内容为空');
    });
    it('handles cat errors', async () => {
      installSvn('svnCat', svnFail('E200009: Not found'));
      expect((await service.getFileContentAtRevision('/fake/f.txt', 1)).success).toBe(false);
    });
  });

  // ==================== XML entity decoding ====================
  describe('XML entity decoding', () => {
    it('decodes entities in log entries', async () => {
      installSvn('svnLog', svnOk(`<?xml version="1.0"?><log><logentry revision="1"><author>&lt;admin&gt;</author><date>2024-01-01T10:00:00.000000Z</date><msg>a &amp; b &lt;c&gt;</msg><paths><path action="A" kind="file">/f.dwg</path></paths></logentry></log>`));
      const r = await service.getFileHistory('p/f.dwg');
      expect(r.entries[0].author).toBe('<admin>');
      expect(r.entries[0].message).toBe('a & b <c>');
    });
  });

  // ==================== executeWithLockRetry ====================
  describe('executeWithLockRetry', () => {
    it('retries on locked error and succeeds', async () => {
      let calls = 0;
      const op = () => { calls++; if (calls === 1) throw new Error('E155004: Locked'); return 'ok'; };
      expect(await (service as any).executeWithLockRetry(op, 't')).toBe('ok');
      expect(calls).toBe(2);
    });
    it('throws non-lock errors directly', async () => {
      await expect((service as any).executeWithLockRetry(() => { throw new Error('Other'); }, 't')).rejects.toThrow('Other');
    });
  });
});
