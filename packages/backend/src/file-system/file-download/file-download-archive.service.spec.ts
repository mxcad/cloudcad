///////////////////////////////////////////////////////////////////////////////
// FileDownloadArchiveService 目录 ZIP 打包测试
// 覆盖：目录节点递归收集子文件产 ZIP 流 / 深度超限拒绝 / 单文件超限拒绝
///////////////////////////////////////////////////////////////////////////////

import { NodeType } from '@cloudcad/db';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseService } from '../../database/database.service';
import { StorageManager } from '../../storage-management/services/storage-manager.service';
import { AuditLogger } from '../../audit/audit-logger.service';
import { RuntimeConfigService } from '../../runtime-config/runtime-config.service';
import { FileDownloadArchiveService } from './file-download-archive.service';

function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('FileDownloadArchiveService - 目录 ZIP 打包', () => {
  let service: FileDownloadArchiveService;
  let prisma: {
    fileSystemNode: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let audit: jest.Mock;
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-'));
    fs.mkdirSync(path.join(tmpRoot, 'files'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'files/a.txt'), 'hello');

    prisma = {
      fileSystemNode: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    audit = jest.fn().mockResolvedValue(undefined);

    const configGet = jest.fn((key: string) => {
      if (key === 'fileLimits') {
        return {
          zipMaxTotalSize: 1000,
          zipMaxFileCount: 10,
          zipMaxDepth: 3,
          zipMaxSingleFileSize: 1000,
          maxFilenameLength: 200,
        };
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileDownloadArchiveService,
        { provide: DatabaseService, useValue: prisma },
        {
          provide: StorageManager,
          useValue: {
            getFullPath: (rel: string) => path.join(tmpRoot, rel),
          },
        },
        {
          provide: RuntimeConfigService,
          useValue: { getValue: jest.fn().mockResolvedValue(1) },
        },
        { provide: AuditLogger, useValue: { audit } },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get(FileDownloadArchiveService);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  const folderNode = (id: string, name: string) => ({
    id,
    name,
    originalName: name,
    nodeType: NodeType.FOLDER,
  });
  const fileNode = (id: string, name: string, size: number) => ({
    id,
    name,
    originalName: name,
    path: `files/${name}`,
    size,
    nodeType: NodeType.FILE,
  });

  it('目录节点：递归收集子文件，产出 ZIP 流并审计成功', async () => {
    const child = fileNode('file-1', 'a.txt', 5);
    prisma.fileSystemNode.findUnique.mockImplementation(({ where }) => {
      if (where.id === 'folder-1') return Promise.resolve(folderNode('folder-1', 'folder'));
      if (where.id === 'file-1') return Promise.resolve(child);
      return Promise.resolve(null);
    });
    prisma.fileSystemNode.findMany.mockResolvedValue([child]);

    const result = await service.buildZip('folder-1', 'user-1');

    expect(result.filename).toBe('folder.zip');
    expect(result.mimeType).toBe('application/zip');
    const buf = await collectStream(result.stream);
    // ZIP 魔数：PK\x03\x04（本地文件头）
    expect(buf.slice(0, 2).toString('utf-8')).toBe('PK');
    expect(buf.length).toBeGreaterThan(0);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FILE_DOWNLOAD',
        resourceId: 'folder-1',
        success: true,
        details: expect.objectContaining({ format: 'zip', fileCount: 1 }),
      })
    );
  });

  it('目录深度超过限制：拒绝打包', async () => {
    // 深度限制 3：构造嵌套超出
    const childFolder = folderNode('sub-1', 'sub');
    prisma.fileSystemNode.findUnique.mockResolvedValue(folderNode('folder-1', 'folder'));
    prisma.fileSystemNode.findMany.mockResolvedValue([childFolder]);
    // sub 下再有子目录 → 深度 2，再深一层触发
    // 简化：直接断言超过 zipMaxDepth 抛错（经私有路径由 findMany 空返回绕不开深度，改用单层嵌套触发）

    await expect(service.buildZip('folder-1', 'user-1')).rejects.toThrow();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'folder-1', success: false })
    );
  });

  it('单文件超过 zipMaxSingleFileSize：拒绝打包', async () => {
    const bigFile = fileNode('big-1', 'big.txt', 5000);
    prisma.fileSystemNode.findUnique.mockImplementation(({ where }) => {
      if (where.id === 'folder-1')
        return Promise.resolve(folderNode('folder-1', 'folder'));
      if (where.id === 'big-1') return Promise.resolve(bigFile);
      return Promise.resolve(null);
    });
    prisma.fileSystemNode.findMany.mockResolvedValue([bigFile]);

    await expect(service.buildZip('folder-1', 'user-1')).rejects.toThrow(
      '文件大小超过限制'
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'folder-1', success: false })
    );
  });
});
