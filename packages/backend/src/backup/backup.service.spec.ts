import { Test, type TestingModule } from '@nestjs/testing';
import { basename, join } from 'path';
import { ConfigService } from '@nestjs/config';
import * as cp from 'child_process';
import * as fsp from 'fs/promises';
import { BackupService, BackupVerifyError } from './backup.service';
import { CleanupMetricsService } from '../metrics/cleanup-metrics.service';

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  access: jest.fn(),
  rename: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
}));

const BACKUP_DIR_ABS = join(process.cwd(), 'data', 'backups');

describe('BackupService', () => {
  let service: BackupService;

  const CleanupMetricsMock = { observe: jest.fn() };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockDbConfig = {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'secret',
    database: 'cloudcad',
  };

  function configureBackup(overrides: Record<string, unknown> = {}) {
    mockConfigService.get.mockImplementation((key: string, def?: unknown) => {
      if (key === 'database') return mockDbConfig;
      if (key === 'backup') {
        return {
          dir: BACKUP_DIR_ABS,
          keepLocal: 2,
          pgDumpPath: '',
          ...overrides,
        };
      }
      return def;
    });
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.PG_DUMP_PATH;
    configureBackup();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CleanupMetricsService, useValue: CleanupMetricsMock },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);

    // 默认探活成功：直接返回固定路径
    jest
      .spyOn(service, 'resolvePgDumpPath')
      .mockResolvedValue(
        process.platform === 'win32'
          ? 'C:\\pgsql\\bin\\pg_dump.exe'
          : '/usr/bin/pg_dump'
      );
  });

  afterEach(() => {
    delete process.env.PG_DUMP_PATH;
  });

  describe('backup', () => {
    it('should run pg_dump -Fc with connection args and PGPASSWORD env', async () => {
      (fsp.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fsp.stat as jest.Mock).mockResolvedValue({ size: 1234 });
      (fsp.readdir as jest.Mock).mockResolvedValue([]);
      (cp.execFile as unknown as jest.Mock).mockImplementation(
        (
          file: string,
          args: string[],
          _options: Record<string, unknown>,
          cb: (err: Error | null) => void
        ) => cb(null)
      );

      const result = await service.backup();

      expect(result.filename).toMatch(/^cloudcad-\d{8}-\d{6}\.dump$/);
      expect(result.sizeBytes).toBe(1234);

      const dumpCall = (cp.execFile as unknown as jest.Mock).mock.calls[0];
      const [file, args, options] = dumpCall;
      expect(file).toContain('pg_dump');
      expect(args).toEqual(
        expect.arrayContaining(['-Fc', '-h', 'localhost', '-U', 'postgres'])
      );
      expect(args[args.indexOf('-d') + 1]).toBe('cloudcad');
      expect((options.env as Record<string, string>).PGPASSWORD).toBe('secret');

      // 完整性校验：pg_restore --list
      const verifyCall = (cp.execFile as unknown as jest.Mock).mock.calls[1];
      expect(verifyCall[0]).toContain('pg_restore');
      expect(verifyCall[1]).toEqual(['--list', expect.any(String)]);
    });

    it('should throw and skip rotation when pg_dump fails', async () => {
      (fsp.mkdir as jest.Mock).mockResolvedValue(undefined);
      (cp.execFile as unknown as jest.Mock).mockImplementation(
        (
          _file: string,
          _args: string[],
          _options: Record<string, unknown>,
          cb: (err: Error | null, stdout: string, stderr: string) => void
        ) =>
          cb(new Error('exit code 1'), '', 'pg_dump: error: connection refused')
      );

      await expect(service.backup()).rejects.toThrow(/connection refused/);
      expect(fsp.unlink).not.toHaveBeenCalled();
    });

    it('should throw BackupVerifyError and mark dump invalid when pg_restore --list fails', async () => {
      (fsp.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fsp.stat as jest.Mock).mockResolvedValue({ size: 100 });
      (fsp.rename as jest.Mock).mockResolvedValue(undefined);
      (cp.execFile as unknown as jest.Mock)
        .mockImplementationOnce(
          (
            _file: string,
            _args: string[],
            _options: Record<string, unknown>,
            cb: (err: Error | null) => void
          ) => cb(null)
        )
        .mockImplementation(
          (
            _file: string,
            _args: string[],
            _options: Record<string, unknown>,
            cb: (err: Error | null, stdout: string, stderr: string) => void
          ) => cb(new Error('exit code 1'), '', 'invalid format')
        );

      await expect(service.backup()).rejects.toBeInstanceOf(BackupVerifyError);
      // 损坏的 dump 标记为 .invalid 保留现场，不删除
      expect(fsp.rename).toHaveBeenCalledWith(
        expect.stringContaining('.dump'),
        expect.stringContaining('.dump.invalid')
      );
      expect(fsp.unlink).not.toHaveBeenCalled();
    });

    it('should rotate old backups after successful dump', async () => {
      (fsp.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fsp.stat as jest.Mock).mockResolvedValue({ size: 100 });
      (cp.execFile as unknown as jest.Mock).mockImplementation(
        (
          _file: string,
          _args: string[],
          _options: Record<string, unknown>,
          cb: (err: Error | null) => void
        ) => cb(null)
      );
      (fsp.readdir as jest.Mock).mockResolvedValue([
        'cloudcad-20260824-010000.dump',
        'cloudcad-20260825-010000.dump',
        'cloudcad-20260826-010000.dump',
      ]);
      (fsp.stat as jest.Mock).mockImplementation(async (fullPath: string) => {
        const name = basename(fullPath);
        const iso = `${name.slice(9, 13)}-${name.slice(13, 15)}-${name.slice(15, 17)}T01:00:00Z`;
        return {
          size: 100,
          mtime: new Date(Date.parse(iso)),
          isFile: () => true,
        };
      });
      configureBackup({ keepLocal: 2 });

      const result = await service.backup();

      expect(result.deletedCount).toBe(1);
      expect(fsp.unlink).toHaveBeenCalledWith(
        expect.stringContaining('cloudcad-20260824-010000.dump')
      );
    });

    it('should observe cleanup metrics on rotation (#325)', async () => {
      (fsp.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fsp.stat as jest.Mock).mockResolvedValue({ size: 100 });
      (cp.execFile as unknown as jest.Mock).mockImplementation(
        (
          _file: string,
          _args: string[],
          _options: Record<string, unknown>,
          cb: (err: Error | null) => void
        ) => cb(null)
      );
      jest.spyOn(service, 'listBackups').mockResolvedValue([
        {
          name: 'cloudcad-20260826-010000.dump',
          sizeBytes: 200,
          modifiedAt: new Date('2026-08-26T01:00:00Z'),
        },
        {
          name: 'cloudcad-20260825-010000.dump',
          sizeBytes: 100,
          modifiedAt: new Date('2026-08-25T01:00:00Z'),
        },
      ]);
      configureBackup({ keepLocal: 1 });

      const result = await service.backup();

      expect(result.deletedCount).toBe(1);
      expect(CleanupMetricsMock.observe).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'backup:rotate',
          recordsDeleted: 1,
          spaceFreedBytes: 100,
        })
      );
    });
  });

  describe('resolvePgDumpPath', () => {
    it('should prefer pgDumpPath from config when set', async () => {
      jest.spyOn(service, 'resolvePgDumpPath').mockRestore();
      configureBackup({ pgDumpPath: '/opt/pgsql/bin/pg_dump' });
      (fsp.access as jest.Mock).mockResolvedValue(undefined);

      await expect(service.resolvePgDumpPath()).resolves.toBe(
        '/opt/pgsql/bin/pg_dump'
      );
    });

    it('should reject when configured pgDumpPath is missing', async () => {
      jest.spyOn(service, 'resolvePgDumpPath').mockRestore();
      configureBackup({ pgDumpPath: '/missing/pg_dump' });
      (fsp.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(service.resolvePgDumpPath()).rejects.toThrow(
        /不存在或不可执行/
      );
    });
  });

  describe('listBackups', () => {
    it('should filter cloudcad-*.dump and sort by time desc', async () => {
      (fsp.readdir as jest.Mock).mockResolvedValue([
        'cloudcad-20260825-010000.dump',
        'other.txt',
        'cloudcad-20260826-010000.dump',
        'db_backup_x.sql',
      ]);
      (fsp.stat as jest.Mock).mockImplementation(async (fullPath: string) => {
        const name = basename(fullPath);
        return {
          size: 42,
          mtime: new Date(
            Date.parse(
              `${name.slice(9, 13)}-${name.slice(13, 15)}-${name.slice(15, 17)}T01:00:00Z`
            )
          ),
          isFile: () => true,
        };
      });

      const list = await service.listBackups();

      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('cloudcad-20260826-010000.dump');
      expect(list[0].sizeBytes).toBe(42);
      expect(list[1].name).toBe('cloudcad-20260825-010000.dump');
    });
  });

  describe('deleteBackup', () => {
    it('should reject path traversal and invalid names', async () => {
      await expect(service.deleteBackup('../evil.dump')).rejects.toThrow();
      await expect(service.deleteBackup('foo.txt')).rejects.toThrow();
      expect(fsp.unlink).not.toHaveBeenCalled();
    });

    it('should delete matching backup file', async () => {
      (fsp.unlink as jest.Mock).mockResolvedValue(undefined);

      await expect(
        service.deleteBackup('cloudcad-20260826-010000.dump')
      ).resolves.toBeUndefined();
      expect(fsp.unlink).toHaveBeenCalledWith(
        expect.stringContaining('cloudcad-20260826-010000.dump')
      );
    });
  });

  describe('restoreDrill', () => {
    const LATEST = {
      name: 'cloudcad-20260826-010000.dump',
      sizeBytes: 100,
      modifiedAt: new Date('2026-08-26T01:00:00Z'),
    };
    const OLDER = {
      name: 'cloudcad-20260825-010000.dump',
      sizeBytes: 100,
      modifiedAt: new Date('2026-08-25T01:00:00Z'),
    };

    function mockExecWithCounts(stdoutValue = '7') {
      (cp.execFile as unknown as jest.Mock).mockImplementation(
        (
          file: string,
          args: string[],
          _options: Record<string, unknown>,
          cb: (err: Error | null, stdout: string) => void
        ) => cb(null, file.includes('psql') ? stdoutValue : '')
      );
    }

    beforeEach(() => {
      jest.spyOn(service, 'listBackups').mockResolvedValue([LATEST, OLDER]);
      jest.spyOn(service, 'verify').mockResolvedValue(undefined);
    });

    it('should restore latest backup into temp db and drop it afterwards', async () => {
      configureBackup({ drillTables: ['users'] });
      (fsp.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      mockExecWithCounts();

      const result = await service.restoreDrill();

      expect(result.backupName).toBe(LATEST.name);
      expect(result.tablesChecked).toBe(0);
      expect(result.mismatches).toEqual([]);

      const calls = (cp.execFile as unknown as jest.Mock).mock.calls;
      const psqlCalls = calls.filter((c) => c[0].includes('psql'));
      // DROP IF EXISTS（前置）+ CREATE + DROP IF EXISTS（finally 清理）
      expect(psqlCalls.length).toBeGreaterThanOrEqual(3);
      expect(psqlCalls[0][1]).toEqual([
        '-d',
        'cloudcad',
        '-c',
        'DROP DATABASE IF EXISTS "cloudcad_restore_drill"',
      ]);
      expect(psqlCalls[1][1]).toEqual([
        '-d',
        'cloudcad',
        '-c',
        'CREATE DATABASE "cloudcad_restore_drill"',
      ]);

      const restoreCall = calls.find((c) => c[0].includes('pg_restore'));
      expect(restoreCall[1]).toEqual(
        expect.arrayContaining(['-d', 'cloudcad_restore_drill'])
      );
      // 末位参数为备份文件完整路径
      expect(String(restoreCall[1][restoreCall[1].length - 1])).toContain(
        LATEST.name
      );
    });

    it('should report mismatches against counts snapshot', async () => {
      configureBackup({ drillTables: ['users'] });
      (fsp.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({ filename: LATEST.name, tables: { users: 5 } })
      );
      mockExecWithCounts('7');

      const result = await service.restoreDrill();

      expect(result.tablesChecked).toBe(1);
      expect(result.mismatches).toEqual([
        { table: 'users', expected: 5, actual: 7 },
      ]);
    });

    it('should skip invalid latest backup and use next valid one', async () => {
      (fsp.rename as jest.Mock).mockResolvedValue(undefined);
      (jest.spyOn(service, 'verify') as jest.SpyInstance)
        .mockRejectedValueOnce(new Error('corrupt'))
        .mockResolvedValue(undefined);
      (fsp.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      mockExecWithCounts();

      const result = await service.restoreDrill();

      expect(result.backupName).toBe(OLDER.name);
      expect(fsp.rename).toHaveBeenCalledWith(
        expect.stringContaining(LATEST.name),
        expect.stringContaining('.invalid')
      );
    });

    it('should throw when all candidates fail verification', async () => {
      (fsp.rename as jest.Mock).mockResolvedValue(undefined);
      jest.spyOn(service, 'verify').mockRejectedValue(new Error('corrupt'));

      await expect(service.restoreDrill()).rejects.toThrow(
        /全部备份完整性校验均失败/
      );
    });

    it('should throw when no backups exist', async () => {
      jest.spyOn(service, 'listBackups').mockResolvedValue([]);

      await expect(service.restoreDrill()).rejects.toThrow(/无可用备份/);
    });
  });

  describe('pushRemote (#319)', () => {
    function mockStatOk(size = 123): void {
      (fsp.stat as jest.Mock).mockImplementation(async (fullPath: string) => {
        const name = fullPath.split(/[\\/]/).at(-1)!;
        // 从文件名解析 mtime，保证「最新备份」排序确定性
        const iso = name.match(/^cloudcad-(\d{4})(\d{2})(\d{2})-/)
          ? `${name.slice(9, 13)}-${name.slice(13, 15)}-${name.slice(15, 17)}T01:00:00Z`
          : '2026-08-26T01:00:00Z';
        return {
          size,
          mtime: new Date(Date.parse(iso)),
          isFile: () => !fullPath.endsWith('.txt'),
        };
      });
    }

    function makeExec(
      handler: (file: string, args: string[]) => { stdout?: string } | Error
    ): void {
      (cp.execFile as unknown as jest.Mock).mockImplementation(
        (
          file: string,
          args: string[],
          _options: Record<string, unknown>,
          cb: (err: Error | null, stdout?: string) => void
        ) => {
          const outcome = handler(file, args);
          if (outcome instanceof Error) cb(outcome);
          else cb(null, outcome.stdout ?? '');
        }
      );
    }

    const rsyncRemote = {
      type: 'rsync',
      host: 'backup.example.com',
      user: 'ops',
      path: '/data/backups/cloudcad',
      keep: 1,
      rsyncPath: '',
      ossutilPath: '',
      awsCliPath: '',
    };

    it('should throw when remote type is none or unconfigured', async () => {
      await expect(service.pushRemote()).rejects.toThrow(/未配置异地推送/);
    });

    it('should push newest local backup via rsync and rotate remote', async () => {
      configureBackup({ remote: rsyncRemote });
      mockStatOk(2048);
      (fsp.readdir as jest.Mock).mockResolvedValue([
        'cloudcad-20260825-010000.dump',
        'cloudcad-20260826-010000.dump',
      ]);
      // 第一次：rsync 推送；第二次：ssh 列远端（含刚推的共 2 份）；第三次：rm 最旧
      makeExec((file, args) => {
        if (file.includes('rsync')) return {};
        if (file.includes('ssh')) {
          if (args.some((a) => a.includes('ls -1'))) {
            return {
              stdout:
                'cloudcad-20260825-010000.dump\ncloudcad-20260826-010000.dump\n',
            };
          }
          return {};
        }
        return new Error(`unexpected exec: ${file}`);
      });

      const result = await service.pushRemote();

      expect(result.type).toBe('rsync');
      expect(result.filename).toBe('cloudcad-20260826-010000.dump');
      expect(result.sizeBytes).toBe(2048);
      expect(result.remoteTarget).toBe(
        'ops@backup.example.com:/data/backups/cloudcad/'
      );
      expect(result.remoteDeletedCount).toBe(1);

      const calls = (cp.execFile as unknown as jest.Mock).mock.calls;
      const pushCall = calls.find((c) => c[0].includes('rsync'));
      expect(pushCall[1]).toEqual(
        expect.arrayContaining([
          '-az',
          '-e',
          'ssh -o BatchMode=yes -o ConnectTimeout=30',
        ])
      );
      expect(pushCall[1]).toEqual(
        expect.arrayContaining([
          expect.stringContaining('cloudcad-20260826-010000.dump'),
          'ops@backup.example.com:/data/backups/cloudcad/',
        ])
      );
      // 远端轮转删除的是最旧一份
      const rmCalls = calls.filter(
        (c) =>
          c[0].includes('ssh') &&
          c[1].some(
            (a: string) => typeof a === 'string' && a.startsWith('rm -f')
          )
      );
      expect(rmCalls).toHaveLength(1);
      expect(rmCalls[0][1].at(-1)).toContain('cloudcad-20260825-010000.dump');
    });

    it('should upload via ossutil with endpoint and credentials', async () => {
      configureBackup({
        remote: {
          ...rsyncRemote,
          type: 'oss',
          endpoint: 'https://oss-cn-chengdu.aliyuncs.com',
          bucket: 'mybucket/cloudcad-backups',
          accessKey: 'AKID',
          secret: 'SEC',
        },
      });
      mockStatOk(100);
      makeExec(() => ({}));

      const result = await service.pushRemote('cloudcad-20260825-010000.dump');

      expect(result.type).toBe('oss');
      expect(result.remoteTarget).toBe(
        'oss://mybucket/cloudcad-backups/cloudcad-20260825-010000.dump'
      );
      const call = (cp.execFile as unknown as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('ossutil');
      expect(call[1]).toEqual(
        expect.arrayContaining([
          'cp',
          '-f',
          '-e',
          'https://oss-cn-chengdu.aliyuncs.com',
          '-i',
          'AKID',
          '-k',
          'SEC',
        ])
      );
    });

    it('should upload via aws cli with credential env and optional endpoint', async () => {
      configureBackup({
        remote: {
          ...rsyncRemote,
          type: 's3',
          endpoint: 'http://minio.local:9000',
          bucket: 'caddump',
          accessKey: 'AK',
          secret: 'SK',
        },
      });
      mockStatOk(100);
      makeExec(() => ({}));

      const result = await service.pushRemote('cloudcad-20260826-010000.dump');

      expect(result.type).toBe('s3');
      expect(result.remoteTarget).toBe(
        's3://caddump/cloudcad-20260826-010000.dump'
      );
      const call = (cp.execFile as unknown as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('aws');
      expect(call[1].slice(0, 2)).toEqual(['s3', 'cp']);
      expect(call[1]).toEqual(
        expect.arrayContaining(['--endpoint-url', 'http://minio.local:9000'])
      );
      expect(call[2].env.AWS_ACCESS_KEY_ID).toBe('AK');
      expect(call[2].env.AWS_SECRET_ACCESS_KEY).toBe('SK');

      // endpoint 留空时不追加 --endpoint-url
      configureBackup({
        remote: {
          ...rsyncRemote,
          type: 's3',
          bucket: 'caddump',
          accessKey: 'AK',
          secret: 'SK',
        },
      });
      await service.pushRemote('cloudcad-20260826-010000.dump');
      const secondCall = (cp.execFile as unknown as jest.Mock).mock.calls.at(
        -1
      )!;
      expect(secondCall[1]).not.toContain('--endpoint-url');
    });

    it('should reject with clear message when required config missing', async () => {
      configureBackup({ remote: { ...rsyncRemote, host: '' } });
      mockStatOk();
      await expect(
        service.pushRemote('cloudcad-20260826-010000.dump')
      ).rejects.toThrow(/BACKUP_REMOTE_HOST/);

      configureBackup({ remote: { ...rsyncRemote, type: 'oss', bucket: '' } });
      await expect(
        service.pushRemote('cloudcad-20260826-010000.dump')
      ).rejects.toThrow(/BACKUP_REMOTE_BUCKET/);

      configureBackup({
        remote: { ...rsyncRemote, type: 's3', accessKey: '', bucket: 'b' },
      });
      await expect(
        service.pushRemote('cloudcad-20260826-010000.dump')
      ).rejects.toThrow(/BACKUP_REMOTE_ACCESS_KEY/);
    });

    it('should reject when local backup file missing', async () => {
      configureBackup({ remote: rsyncRemote });
      (fsp.stat as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.pushRemote('cloudcad-20260826-010000.dump')
      ).rejects.toThrow(/备份文件不存在/);
    });

    it('should reject when configured CLI path is not executable', async () => {
      configureBackup({
        remote: { ...rsyncRemote, rsyncPath: '/missing/rsync' },
      });
      mockStatOk();
      (fsp.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.pushRemote('cloudcad-20260826-010000.dump')
      ).rejects.toThrow(/不存在或不可执行/);
    });
  });

  describe('pushAuditArchiveRemote (#420)', () => {
    const ARCHIVE_DIR = join(process.cwd(), 'data', 'archives', 'audit-logs');
    const ARCHIVE_FILES = [
      '2026-06.csv',
      '2026-06.sha256',
      '2026-06.chain.json',
      'chain-head.json',
    ];

    function configureAuditArchive(
      remote: Record<string, unknown>,
      archivePath = ARCHIVE_DIR
    ): void {
      mockConfigService.get.mockImplementation(
        (key: string, def?: unknown) => {
          if (key === 'database') return mockDbConfig;
          if (key === 'backup') {
            return { dir: BACKUP_DIR_ABS, keepLocal: 2, pgDumpPath: '', remote };
          }
          if (key === 'audit.archivePath') return archivePath;
          return def;
        }
      );
    }

    function mockArchiveFiles(files: string[] = ARCHIVE_FILES): void {
      (fsp.readdir as jest.Mock).mockResolvedValue(files);
      (fsp.stat as jest.Mock).mockImplementation(async () => ({
        isFile: () => true,
      }));
    }

    function makeExecOk(): void {
      (cp.execFile as unknown as jest.Mock).mockImplementation(
        (_file: string, _args: string[], _o: unknown, cb: (e: Error | null) => void) =>
          cb(null)
      );
    }

    it('should throw when remote type is none or unconfigured', async () => {
      configureAuditArchive({ type: 'none' });
      await expect(service.pushAuditArchiveRemote()).rejects.toThrow(
        /未配置异地推送/
      );
    });

    it('should sync archive dir via rsync to audit-logs subdir', async () => {
      configureAuditArchive({
        type: 'rsync',
        host: 'backup.example.com',
        user: 'ops',
        path: '/data/backups/cloudcad',
        keep: 1,
        rsyncPath: '',
      });
      mockArchiveFiles();
      makeExecOk();

      const result = await service.pushAuditArchiveRemote();

      expect(result).not.toBeNull();
      expect(result!.type).toBe('rsync');
      expect(result!.fileCount).toBe(4);
      expect(result!.remoteTarget).toBe(
        'ops@backup.example.com:/data/backups/cloudcad/audit-logs/'
      );
      const call = (cp.execFile as unknown as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('rsync');
      expect(call[1]).toEqual(
        expect.arrayContaining([
          '-az',
          `${ARCHIVE_DIR}/`,
          'ops@backup.example.com:/data/backups/cloudcad/audit-logs/',
        ])
      );
    });

    it('should upload archive dir via ossutil recursively', async () => {
      configureAuditArchive({
        type: 'oss',
        endpoint: 'https://oss-cn-chengdu.aliyuncs.com',
        bucket: 'mybucket/cloudcad-backups',
        accessKey: 'AKID',
        secret: 'SEC',
        ossutilPath: '',
      });
      mockArchiveFiles();
      makeExecOk();

      const result = await service.pushAuditArchiveRemote();

      expect(result!.remoteTarget).toBe(
        'oss://mybucket/cloudcad-backups/audit-logs/'
      );
      const call = (cp.execFile as unknown as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('ossutil');
      expect(call[1]).toEqual(
        expect.arrayContaining([
          '-r',
          '-f',
          `${ARCHIVE_DIR}/`,
          'oss://mybucket/cloudcad-backups/audit-logs/',
        ])
      );
    });

    it('should upload archive dir via aws s3 recursively', async () => {
      configureAuditArchive({
        type: 's3',
        endpoint: 'https://s3.example.com',
        bucket: 'mybucket/cloudcad-backups',
        accessKey: 'AKID',
        secret: 'SEC',
        awsCliPath: '',
      });
      mockArchiveFiles();
      makeExecOk();

      const result = await service.pushAuditArchiveRemote();

      expect(result!.remoteTarget).toBe(
        's3://mybucket/cloudcad-backups/audit-logs/'
      );
      const call = (cp.execFile as unknown as jest.Mock).mock.calls[0];
      expect(call[0]).toContain('aws');
      expect(call[1]).toEqual(
        expect.arrayContaining([
          's3',
          'cp',
          `${ARCHIVE_DIR}/`,
          's3://mybucket/cloudcad-backups/audit-logs/',
          '--recursive',
        ])
      );
    });

    it('should return null and skip when no archive files exist', async () => {
      configureAuditArchive({
        type: 'rsync',
        host: 'h',
        user: 'u',
        path: '/p',
        keep: 1,
        rsyncPath: '',
      });
      (fsp.readdir as jest.Mock).mockResolvedValue([]);

      const result = await service.pushAuditArchiveRemote();

      expect(result).toBeNull();
      expect(cp.execFile).not.toHaveBeenCalled();
    });
  });
});
