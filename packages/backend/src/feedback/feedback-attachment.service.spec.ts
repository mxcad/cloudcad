///////////////////////////////////////////////////////////////////////////////
// 用户反馈模块 - 附件服务单测
//
// 覆盖最高风险逻辑：DTO 投影下载 URL（/api/v1 前缀 + REFERENCE 不下发）、
// 签名 token 往返/篡改/过期、下载鉴权拒绝分支、上传校验、图纸注册校验。
// fs 落盘分支（moveToStorage/copyToStorage/缩略图）不在单测范围（集成测试）。
///////////////////////////////////////////////////////////////////////////////
import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeedbackAttachmentService } from './feedback-attachment.service';
import { DatabaseService } from '../database/database.service';
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';
import { ConfigService } from '@nestjs/config';
import { PublicFileService } from '../public-file/public-file.service';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import { ThumbnailGenerationService } from '../mxcad/infra/thumbnail-generation.service';
import {
  FeedbackAttachmentKind as PrismaKind,
  FeedbackAttachmentType as PrismaType,
} from '@cloudcad/db';
import { FeedbackAttachmentType } from './feedback.enums';

describe('FeedbackAttachmentService', () => {
  let service: FeedbackAttachmentService;

  const mockPrisma = {
    feedbackAttachment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    fileSystemNode: {
      findUnique: jest.fn(),
    },
  };

  const mockRuntimeConfig = {
    getValue: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'filesDataPath') return '/data';
      if (key === 'feedbackAttachmentPath') return '/data/feedback-attachments';
      if (key === 'jwt.secret') return 'test-secret';
      return undefined;
    }),
  };

  const mockPublicFileService = {
    findMxwebFile: jest.fn(),
  };

  const mockPermissionService = {
    checkSystemPermission: jest.fn(),
  } as unknown as IPermissionService;

  const mockThumbnailService = {
    generateThumbnail: jest.fn(),
  } as unknown as ThumbnailGenerationService;

  const baseRow = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'att-1',
    feedbackId: null,
    type: PrismaType.IMAGE,
    kind: PrismaKind.FILE,
    storagePath: 'attachments/202610/a/file.png',
    fileName: 'file.png',
    mimeType: 'image/png',
    size: 1024,
    nodeId: null,
    fileHash: null,
    contentHash: null,
    region: null,
    thumbnailPath: null,
    uploadedById: 'u-1',
    uploaderTokenHash: null,
    ip: '127.0.0.1',
    createdAt: new Date('2026-10-29T00:00:00Z'),
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // 默认：非管理员（权限检查返回 false）；单测按需覆盖
    (mockPermissionService.checkSystemPermission as jest.Mock).mockResolvedValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackAttachmentService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: RuntimeConfigService, useValue: mockRuntimeConfig },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PublicFileService, useValue: mockPublicFileService },
        { provide: IPERMISSION_SERVICE, useValue: mockPermissionService },
        { provide: ThumbnailGenerationService, useValue: mockThumbnailService },
      ],
    }).compile();

    service = module.get<FeedbackAttachmentService>(FeedbackAttachmentService);
  });

  describe('toDto（viewUrl/downloadUrl/thumbnailUrl 投影）', () => {
    const withCode = { feedback: { feedbackCode: 'CODE-123', submitterId: 'u-1' } };
    const adminUrl = /^\/api\/v1\/admin\/feedback\/attachments\/att-1\/download$/;
    const viewUrlRe = /^\/api\/v1\/feedback\/attachments\/att-1\/download\?token=[^&]+&code=CODE-123$/;

    it('admin + canManage + feedbackCode → viewUrl（签名 token）+ downloadUrl（管理员下载）', () => {
      const row = baseRow(withCode) as never;
      const dto = service.toDto(row, { mode: 'admin', canManage: true });
      expect(dto.viewUrl).toMatch(viewUrlRe);
      expect(dto.downloadUrl).toMatch(adminUrl);
    });

    it('admin 无 MANAGE → 只有 viewUrl，无 downloadUrl', () => {
      const row = baseRow(withCode) as never;
      const dto = service.toDto(row, { mode: 'admin', canManage: false });
      expect(dto.viewUrl).toMatch(viewUrlRe);
      expect(dto.downloadUrl).toBeNull();
    });

    it('submitter 图片 → viewUrl（内联查看），无 downloadUrl', () => {
      const row = baseRow({ type: PrismaType.IMAGE, ...withCode }) as never;
      const dto = service.toDto(row, { mode: 'submitter' });
      expect(dto.viewUrl).toMatch(viewUrlRe);
      expect(dto.downloadUrl).toBeNull();
    });

    it('submitter 图纸（FILE）→ 无 viewUrl（打开图纸=下载，提交者无权），只能看缩略图', () => {
      const row = baseRow({
        type: PrismaType.DRAWING,
        thumbnailPath: 'attachments/202610/a/t.png',
        ...withCode,
      }) as never;
      const dto = service.toDto(row, { mode: 'submitter' });
      expect(dto.viewUrl).toBeNull();
      expect(dto.downloadUrl).toBeNull();
      expect(dto.thumbnailUrl).toMatch(/^\/api\/v1\/feedback\/attachments\/att-1\/thumbnail\?token=/);
    });

    it('submitter REFERENCE 引用 → 无 viewUrl/downloadUrl/thumbnailUrl（仅管理员可看）', () => {
      const row = baseRow({
        type: PrismaType.DRAWING,
        kind: PrismaKind.REFERENCE,
        thumbnailPath: 'attachments/202610/a/t.png',
        ...withCode,
      }) as never;
      const dto = service.toDto(row, { mode: 'submitter' });
      expect(dto.viewUrl).toBeNull();
      expect(dto.downloadUrl).toBeNull();
      expect(dto.thumbnailUrl).toBeNull();
    });

    it('admin REFERENCE → viewUrl（管理员可看），无缩略图', () => {
      const row = baseRow({
        type: PrismaType.DRAWING,
        kind: PrismaKind.REFERENCE,
        ...withCode,
      }) as never;
      const dto = service.toDto(row, { mode: 'admin', canManage: true });
      expect(dto.viewUrl).toMatch(viewUrlRe);
      expect(dto.downloadUrl).toMatch(adminUrl);
      expect(dto.thumbnailUrl).toBeNull();
    });

    it('region 非空 → viewUrl 追加 ?region=（图纸框选区域定位）且 DTO.region 透出', () => {
      const row = baseRow({
        type: PrismaType.DRAWING,
        kind: PrismaKind.REFERENCE,
        region: '100,200,300,400',
        ...withCode,
      }) as never;
      const dto = service.toDto(row, { mode: 'admin', canManage: true });
      expect(dto.viewUrl).toContain('&region=100%2C200%2C300%2C400');
      expect(dto.region).toBe('100,200,300,400');
    });

    it('无 storagePath → 不下发 viewUrl/downloadUrl', () => {
      const row = baseRow({ storagePath: null, ...withCode }) as never;
      const dto = service.toDto(row, { mode: 'admin', canManage: true });
      expect(dto.viewUrl).toBeNull();
      expect(dto.downloadUrl).toBeNull();
    });

    it('mode none（上传响应）→ 无 viewUrl/downloadUrl', () => {
      const row = baseRow(withCode) as never;
      const dto = service.toDto(row, { mode: 'none' });
      expect(dto.viewUrl).toBeNull();
      expect(dto.downloadUrl).toBeNull();
    });

    it('缩略图 URL 带 /api/v1 前缀（无 code 时无 token）', () => {
      const row = baseRow({ thumbnailPath: 'attachments/202610/a/t.png' }) as never;
      const dto = service.toDto(row, { mode: 'none' });
      expect(dto.thumbnailUrl).toBe(
        '/api/v1/feedback/attachments/att-1/thumbnail'
      );
    });
  });

  describe('签名下载 token', () => {
    it('签名→校验通过（有效期内）', () => {
      const token = service.signDownloadToken('att-1', 'CODE-123');
      expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
      expect(service.verifyDownloadToken(token, 'att-1', 'CODE-123')).toBe(true);
    });

    it('篡改签名后校验失败', () => {
      const token = service.signDownloadToken('att-1', 'CODE-123');
      const [exp, sig] = token.split('.');
      const tampered = `${exp}.${'0'.repeat(sig.length)}`;
      expect(service.verifyDownloadToken(tampered, 'att-1', 'CODE-123')).toBe(false);
    });

    it('code 不匹配时校验失败', () => {
      const token = service.signDownloadToken('att-1', 'CODE-123');
      expect(service.verifyDownloadToken(token, 'att-1', 'CODE-999')).toBe(false);
    });

    it('畸形 token 校验失败', () => {
      expect(service.verifyDownloadToken('bad', 'att-1', 'CODE-123')).toBe(false);
      expect(service.verifyDownloadToken('1.', 'att-1', 'CODE-123')).toBe(false);
    });
  });

  describe('getDownload（查看鉴权，kind 感知）', () => {
    it('附件不存在 → NotFoundException', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(null);
      await expect(
        service.getDownload('att-1', {})
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('REFERENCE：非管理员（即使属主）→ ForbiddenException', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({
          type: PrismaType.DRAWING,
          kind: PrismaKind.REFERENCE,
          storagePath: 'attachments/202610/a/ref.dwg',
          uploadedById: 'u-1',
        })
      );
      // 属主 u-1 但无 SYSTEM_FEEDBACK_READ → 无权查看引用图纸
      await expect(
        service.getDownload('att-1', { userId: 'u-1' })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('REFERENCE：管理员（READ）→ 放行（fs.stat 文件不存在 → NotFound，证明未被 403 拦下）', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({
          type: PrismaType.DRAWING,
          kind: PrismaKind.REFERENCE,
          storagePath: 'attachments/202610/a/ref.dwg',
        })
      );
      (mockPermissionService.checkSystemPermission as jest.Mock).mockResolvedValue(true);
      await expect(
        service.getDownload('att-1', { userId: 'admin-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('REFERENCE：持有效签名 token（提交者）→ 仍 Forbidden（token 不足，仅管理员可看）', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({
          type: PrismaType.DRAWING,
          kind: PrismaKind.REFERENCE,
          storagePath: 'attachments/202610/a/ref.dwg',
          feedback: { feedbackCode: 'CODE-123', submitterId: 'someone-else' },
        })
      );
      const token = service.signDownloadToken('att-1', 'CODE-123');
      await expect(
        service.getDownload('att-1', { token, code: 'CODE-123' })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('FILE：非属主且无 token/code → ForbiddenException', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({ uploadedById: 'someone-else', feedback: null })
      );
      await expect(
        service.getDownload('att-1', {})
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('FILE：登录非属主但持有效 code token → 放行（查询码是查看凭据）', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({
          uploadedById: 'someone-else',
          feedback: { feedbackCode: 'CODE-123', submitterId: 'someone-else' },
        })
      );
      const token = service.signDownloadToken('att-1', 'CODE-123');
      // 通过鉴权后进入 fs.stat（文件不存在）→ NotFoundException，证明未被 403 拦下
      await expect(
        service.getDownload('att-1', {
          userId: 'other-user',
          token,
          code: 'CODE-123',
        })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('FILE：属主登录可查看（返回绝对路径，文件不存在 → NotFound）', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({ uploadedById: 'u-1', feedback: null })
      );
      // fs.stat 文件不存在 → NotFoundException（resolveWithinRoot 成功但无文件）
      await expect(
        service.getDownload('att-1', { userId: 'u-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('FILE：管理员（READ）可查看', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({ uploadedById: 'someone-else', feedback: null })
      );
      (mockPermissionService.checkSystemPermission as jest.Mock).mockResolvedValue(true);
      await expect(
        service.getDownload('att-1', { userId: 'admin-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getThumbnail（缩略图鉴权）', () => {
    it('REFERENCE 无缩略图 → NotFoundException', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({
          type: PrismaType.DRAWING,
          kind: PrismaKind.REFERENCE,
          thumbnailPath: 'attachments/202610/a/t.png',
        })
      );
      await expect(
        service.getThumbnail('att-1', { userId: 'u-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('FILE 无 thumbnailPath → NotFoundException', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, thumbnailPath: null })
      );
      await expect(
        service.getThumbnail('att-1', { userId: 'u-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('FILE 属主可看缩略图（文件不存在 → NotFound，证明未被 403 拦下）', async () => {
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, thumbnailPath: 'attachments/202610/a/t.png' })
      );
      await expect(
        service.getThumbnail('att-1', { userId: 'u-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('uploadFile（校验）', () => {
    it('缺少文件 → BadRequestException', async () => {
      await expect(service.uploadFile(null as never, {})).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('不支持的类型 → BadRequestException', async () => {
      const file = {
        mimetype: 'application/x-foo',
        originalname: 'x.zzz',
        size: 10,
        path: 'tmp/x',
      } as Express.Multer.File;
      await expect(service.uploadFile(file, {})).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('超过大小上限 → BadRequestException', async () => {
      mockRuntimeConfig.getValue.mockResolvedValue(1); // 1MB
      const file = {
        mimetype: 'application/pdf',
        originalname: 'doc.pdf',
        size: 3 * 1024 * 1024,
        path: 'tmp/doc',
      } as Express.Multer.File;
      await expect(service.uploadFile(file, {})).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('上传 dwg 图纸 → 调用缩略图服务生成缩略图并落 thumbnailPath', async () => {
      // resetMocks:true 会清空 mockConfigService.get 的初始实现，此处显式恢复
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'filesDataPath') return '/data';
        if (key === 'feedbackAttachmentPath') return '/data/feedback-attachments';
        if (key === 'jwt.secret') return 'test-secret';
        return undefined;
      });
      jest.spyOn(service as any, 'hashFileStream').mockResolvedValue('abc123');
      jest.spyOn(service as any, 'storeContent').mockResolvedValue({
        relativePath: 'ab/abc123',
        deduped: false,
      });
      (mockThumbnailService.generateThumbnail as jest.Mock).mockResolvedValue({
        success: true,
        thumbnailPath: '/data/feedback-attachments/ab/abc123.jpg',
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, thumbnailPath: 'ab/abc123.jpg' })
      );
      const file = {
        mimetype: 'application/octet-stream',
        originalname: 'a.dwg',
        size: 100,
        path: 'tmp/a.dwg',
      } as Express.Multer.File;
      await service.uploadFile(file, { userId: 'u-1' });
      expect(mockThumbnailService.generateThumbnail).toHaveBeenCalled();
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      // 内容寻址：storagePath 为 hash 目录（无扩展名），缩略图相对 attachmentRoot
      expect(created.storagePath).toBe('ab/abc123');
      expect(created.contentHash).toBe('abc123');
      expect(String(created.thumbnailPath).replace(/\\/g, '/')).toBe(
        'ab/abc123.jpg'
      );
    });

    it('上传 mxweb 图纸（不可渲染）→ 不调用缩略图服务（跳过 60s 超时）', async () => {
      jest.spyOn(service as any, 'hashFileStream').mockResolvedValue('def456');
      jest.spyOn(service as any, 'storeContent').mockResolvedValue({
        relativePath: 'de/def456',
        deduped: false,
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING })
      );
      const file = {
        mimetype: 'application/octet-stream',
        originalname: 'a.mxweb',
        size: 100,
        path: 'tmp/a.mxweb',
      } as Express.Multer.File;
      await service.uploadFile(file, { userId: 'u-1' });
      expect(mockThumbnailService.generateThumbnail).not.toHaveBeenCalled();
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.thumbnailPath).toBeNull();
      expect(created.contentHash).toBe('def456');
    });

    it('中文文件名（UTF-8）保持原样，不被误判为乱码', async () => {
      const hashSpy = jest.spyOn(service as any, 'hashFileStream').mockResolvedValue('zh789');
      const storeSpy = jest.spyOn(service as any, 'storeContent').mockResolvedValue({
        relativePath: 'zh/zh789',
        deduped: false,
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING })
      );
      const file = {
        mimetype: 'application/octet-stream',
        originalname: '测试图纸-防撞墙.dwg',
        size: 100,
        path: 'tmp/a.dwg',
      } as Express.Multer.File;
      await service.uploadFile(file, { userId: 'u-1' });
      expect(storeSpy.mock.calls[0][1]).toBe('zh789');
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.fileName).toBe('测试图纸-防撞墙.dwg');
    });

    it('mojibake 文件名（latin1 误码）被防御性回解为正确中文', async () => {
      // 「测试图纸-防撞墙.dwg」经 busboy 默认 latin1 误码后的形式（含 C1 控制字符，
      // 用 Buffer 动态构造避免源码内硬编码不可见转义）
      const mojibake = Buffer.from('测试图纸-防撞墙.dwg', 'utf8').toString('latin1');
      jest.spyOn(service as any, 'hashFileStream').mockResolvedValue('moji10');
      const storeSpy = jest.spyOn(service as any, 'storeContent').mockResolvedValue({
        relativePath: 'mo/moji10',
        deduped: false,
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING })
      );
      const file = {
        mimetype: 'application/octet-stream',
        originalname: mojibake,
        size: 100,
        path: 'tmp/a.dwg',
      } as Express.Multer.File;
      await service.uploadFile(file, { userId: 'u-1' });
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.fileName).toBe('测试图纸-防撞墙.dwg');
    });
  });

  describe('registerDrawing（校验 + 统一真实副本）', () => {
    const mockCopy = (rel = 'ab/abc123') => {
      jest.spyOn(service as any, 'storeContent').mockResolvedValue({
        relativePath: rel,
        deduped: false,
      });
      jest.spyOn(service as any, 'persistThumbnail').mockResolvedValue(null);
    };

    it('缺少 nodeId 且缺少 fileHash → BadRequestException', async () => {
      await expect(
        service.registerDrawing({ kind: 'copy' } as never, {})
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('图纸节点不存在 → NotFoundException', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue(null);
      await expect(
        service.registerDrawing(
          { nodeId: 'node-1', kind: 'copy' },
          {}
        )
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('copy 非图纸扩展名 → BadRequestException', async () => {
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        name: 'a.txt',
        path: '202610/n/a.txt',
        fileHash: 'hash-1',
      });
      await expect(
        service.registerDrawing(
          { nodeId: 'node-1', kind: 'copy' },
          { userId: 'u-1' }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('nodeId + reference 也转真实副本（copyToStorage 调用 + 落 storagePath，不落缩略图）', async () => {
      mockCopy();
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        name: 'a.dwg',
        path: '202610/n/a.dwg',
        fileHash: 'hash-1',
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, kind: PrismaKind.REFERENCE, nodeId: 'node-1' })
      );
      await service.registerDrawing(
        { nodeId: 'node-1', kind: 'reference' },
        { userId: 'u-1' }
      );
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.storagePath).toBe('ab/abc123');
      expect(created.kind).toBe(PrismaKind.REFERENCE);
      expect(created.nodeId).toBe('node-1');
      expect(created.fileHash).toBe('hash-1');
      // 内容寻址：contentHash 直取节点已有 fileHash（无需重算）
      expect(created.contentHash).toBe('hash-1');
      // 引用图纸不落缩略图（用户拍板：引用无缩略图）
      expect(created.thumbnailPath).toBeNull();
      expect((service as any).persistThumbnail).not.toHaveBeenCalled();
    });

    it('fileHash-only（未登录当前图纸）→ findMxwebFile 定位 + 转副本 + 落 fileHash', async () => {
      mockCopy();
      mockPublicFileService.findMxwebFile.mockResolvedValue(
        '/data/uploads/hash-1.dwg.mxweb'
      );
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, kind: PrismaKind.REFERENCE, fileHash: 'hash-1' })
      );
      await service.registerDrawing(
        { fileHash: 'hash-1', kind: 'reference', fileName: 'cur.dwg' },
        {}
      );
      expect(mockPrisma.fileSystemNode.findUnique).not.toHaveBeenCalled();
      expect(mockPublicFileService.findMxwebFile).toHaveBeenCalledWith('hash-1');
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.fileHash).toBe('hash-1');
      expect(created.contentHash).toBe('hash-1');
      expect(created.nodeId).toBeNull();
      expect(created.storagePath).toBe('ab/abc123');
    });

    it('fileHash 定位失败 → NotFoundException', async () => {
      mockPublicFileService.findMxwebFile.mockResolvedValue(null);
      await expect(
        service.registerDrawing({ fileHash: 'hash-x', kind: 'reference' }, {})
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('thumbnailData base64 → persistThumbnail 落 thumbnailPath', async () => {
      mockCopy();
      jest
        .spyOn(service as any, 'persistThumbnail')
        .mockResolvedValue('attachments/202610/a/t.png');
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        name: 'a.dwg',
        path: '202610/n/a.dwg',
        fileHash: 'hash-1',
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, kind: PrismaKind.REFERENCE })
      );
      await service.registerDrawing(
        { nodeId: 'node-1', kind: 'copy', thumbnailData: 'data:image/png;base64,AAA=' },
        { userId: 'u-1' }
      );
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.thumbnailPath).toBe('attachments/202610/a/t.png');
    });

    it('region 传入 → 落 region 字段（未传为 null）', async () => {
      mockCopy();
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        name: 'a.dwg',
        path: '202610/n/a.dwg',
        fileHash: 'hash-1',
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, kind: PrismaKind.REFERENCE, region: '10,20,30,40' })
      );
      await service.registerDrawing(
        { nodeId: 'node-1', kind: 'reference', region: '10,20,30,40' },
        { userId: 'u-1' }
      );
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.region).toBe('10,20,30,40');

      // 未传 region → null
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, kind: PrismaKind.REFERENCE })
      );
      await service.registerDrawing(
        { nodeId: 'node-1', kind: 'reference' },
        { userId: 'u-1' }
      );
      const created2 = mockPrisma.feedbackAttachment.create.mock.calls[1][0].data;
      expect(created2.region).toBeNull();
    });
  });

  describe('assertCountLimits（附件数量上限，后端最终防线）', () => {
    const limits = (over: Partial<Record<string, number>> = {}) => {
      const defaults = {
        'feedback.maxAttachmentCount': 30,
        'feedback.maxImageCount': 20,
        'feedback.maxDrawingCount': 5,
        'feedback.maxDocumentCount': 10,
        ...over,
      };
      (mockRuntimeConfig.getValue as jest.Mock).mockImplementation(
        (key: string) => Promise.resolve(defaults[key] ?? 30)
      );
    };

    it('总数超过上限 → BadRequestException', async () => {
      limits({ 'feedback.maxAttachmentCount': 2 });
      await expect(
        service.assertCountLimits([
          { id: 'a1', type: FeedbackAttachmentType.IMAGE },
          { id: 'a2', type: FeedbackAttachmentType.IMAGE },
          { id: 'a3', type: FeedbackAttachmentType.IMAGE },
        ])
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('图片数量超过上限 → BadRequestException', async () => {
      limits({ 'feedback.maxImageCount': 2 });
      await expect(
        service.assertCountLimits([
          { id: 'a1', type: FeedbackAttachmentType.IMAGE },
          { id: 'a2', type: FeedbackAttachmentType.IMAGE },
          { id: 'a3', type: FeedbackAttachmentType.IMAGE },
        ])
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('图纸数量超过上限 → BadRequestException', async () => {
      limits({ 'feedback.maxDrawingCount': 1 });
      await expect(
        service.assertCountLimits([
          { id: 'a1', type: FeedbackAttachmentType.DRAWING },
          { id: 'a2', type: FeedbackAttachmentType.DRAWING },
        ])
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('文档数量超过上限 → BadRequestException', async () => {
      limits({ 'feedback.maxDocumentCount': 1 });
      await expect(
        service.assertCountLimits([
          { id: 'a1', type: FeedbackAttachmentType.DOCUMENT },
          { id: 'a2', type: FeedbackAttachmentType.DOCUMENT },
        ])
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('全部未超限 → 通过', async () => {
      limits();
      await expect(
        service.assertCountLimits([
          { id: 'a1', type: FeedbackAttachmentType.IMAGE },
          { id: 'a2', type: FeedbackAttachmentType.DRAWING },
          { id: 'a3', type: FeedbackAttachmentType.DOCUMENT },
        ])
      ).resolves.toBeUndefined();
    });

    it('空数组 → 直接通过且不读配置', async () => {
      await expect(service.assertCountLimits([])).resolves.toBeUndefined();
      expect(mockRuntimeConfig.getValue).not.toHaveBeenCalled();
    });
  });

  describe('adminDeleteMany（管理端批量删除）', () => {
    it('全部存在 → 逐条删除并返回空 notFoundIds', async () => {
      const att1 = baseRow({ id: 'att-1', type: PrismaType.IMAGE, kind: PrismaKind.FILE });
      const att2 = baseRow({
        id: 'att-2',
        type: PrismaType.DRAWING,
        kind: PrismaKind.REFERENCE,
        storagePath: null,
        thumbnailPath: null,
      });
      const byId: Record<string, unknown> = { 'att-1': att1, 'att-2': att2 };
      (mockPrisma.feedbackAttachment.findMany as jest.Mock).mockResolvedValue([att1, att2]);
      (mockPrisma.feedbackAttachment.findUnique as jest.Mock).mockImplementation(
        ({ where }: { where: { id: string } }) => Promise.resolve(byId[where.id])
      );
      (mockPrisma.feedbackAttachment.delete as jest.Mock).mockResolvedValue({});

      const res = await service.adminDeleteMany(['att-1', 'att-2'], 'operator-1');

      expect(res).toEqual({ deleted: 2, notFoundIds: [] });
      expect(mockPrisma.feedbackAttachment.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['att-1', 'att-2'] } },
        select: { id: true, type: true, kind: true },
      });
      // 每条都走 adminDelete（含 @Audit 审计），删除记录调用 2 次
      expect(mockPrisma.feedbackAttachment.delete).toHaveBeenCalledTimes(2);
      expect(mockPrisma.feedbackAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(mockPrisma.feedbackAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-2' } });
    });

    it('部分不存在 → 只删存在的，notFoundIds 含缺失 id 且不触发其删除', async () => {
      const att1 = baseRow({ id: 'att-1' });
      (mockPrisma.feedbackAttachment.findMany as jest.Mock).mockResolvedValue([att1]);
      (mockPrisma.feedbackAttachment.findUnique as jest.Mock).mockResolvedValue(att1);
      (mockPrisma.feedbackAttachment.delete as jest.Mock).mockResolvedValue({});

      const res = await service.adminDeleteMany(['att-1', 'missing'], 'operator-1');

      expect(res).toEqual({ deleted: 1, notFoundIds: ['missing'] });
      expect(mockPrisma.feedbackAttachment.delete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.feedbackAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      // 缺失 id 不进入 adminDelete（不额外查库/不删）
      expect(mockPrisma.feedbackAttachment.findUnique).toHaveBeenCalledTimes(1);
    });

    it('全部不存在 → deleted=0，notFoundIds=全部，不触发任何删除', async () => {
      (mockPrisma.feedbackAttachment.findMany as jest.Mock).mockResolvedValue([]);

      const res = await service.adminDeleteMany(['x', 'y'], 'operator-1');

      expect(res).toEqual({ deleted: 0, notFoundIds: ['x', 'y'] });
      expect(mockPrisma.feedbackAttachment.delete).not.toHaveBeenCalled();
    });

    it('空数组 → 直接返回且不查库（DTO 层已拦，service 层防御）', async () => {
      const res = await service.adminDeleteMany([], 'operator-1');
      expect(res).toEqual({ deleted: 0, notFoundIds: [] });
      expect(mockPrisma.feedbackAttachment.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.feedbackAttachment.delete).not.toHaveBeenCalled();
    });
  });

  describe('adminList（搜索/筛选）', () => {
    beforeEach(() => {
      // 空行 → map 不执行 toDto，避免签名 token 依赖
      mockPrisma.feedbackAttachment.count.mockResolvedValue(0);
      mockPrisma.feedbackAttachment.findMany.mockResolvedValue([]);
    });

    it('无筛选 → where 为空', async () => {
      await service.adminList({ page: 1, pageSize: 20 });
      const arg = mockPrisma.feedbackAttachment.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
    });

    it('search → OR（fileName/feedbackCode/uploadedBy.username）', async () => {
      await service.adminList({ page: 1, pageSize: 20, search: 'abc' });
      const arg = mockPrisma.feedbackAttachment.findMany.mock.calls[0][0];
      expect(arg.where.OR).toEqual([
        { fileName: { contains: 'abc', mode: 'insensitive' } },
        { feedback: { feedbackCode: { contains: 'abc', mode: 'insensitive' } } },
        { uploadedBy: { username: { contains: 'abc', mode: 'insensitive' } } },
      ]);
    });

    it('type/kind 与 search 组合（AND）', async () => {
      await service.adminList({
        page: 1,
        pageSize: 20,
        type: 'IMAGE',
        kind: 'FILE',
        search: 'x',
      });
      const arg = mockPrisma.feedbackAttachment.findMany.mock.calls[0][0];
      expect(arg.where.type).toBe('IMAGE');
      expect(arg.where.kind).toBe('FILE');
      expect(arg.where.OR).toHaveLength(3);
    });
  });

  describe('内容寻址去重（storeContent / deduped 透出 / 引用检查）', () => {
    it('toDto 透出 contentHash（前端本地去重用）', () => {
      const row = baseRow({ contentHash: 'abc123' }) as never;
      const dto = service.toDto(row, { mode: 'none' });
      expect(dto.contentHash).toBe('abc123');
    });

    it('uploadFile 未命中（deduped=false）→ 不返回 deduped 标记，记录带 contentHash', async () => {
      jest.spyOn(service as any, 'hashFileStream').mockResolvedValue('newhash');
      jest.spyOn(service as any, 'storeContent').mockResolvedValue({
        relativePath: 'ne/newhash',
        deduped: false,
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ contentHash: 'newhash' })
      );
      const file = {
        mimetype: 'application/pdf',
        originalname: 'doc.pdf',
        size: 100,
        path: 'tmp/doc',
      } as Express.Multer.File;
      const dto = await service.uploadFile(file, { userId: 'u-1' });
      expect(dto.deduped).toBeUndefined();
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.contentHash).toBe('newhash');
      expect(created.storagePath).toBe('ne/newhash');
    });

    it('uploadFile 命中已有物理文件（deduped=true）→ 仍建独立记录 + 返回 deduped:true', async () => {
      jest.spyOn(service as any, 'hashFileStream').mockResolvedValue('samehash');
      jest.spyOn(service as any, 'storeContent').mockResolvedValue({
        relativePath: 'sa/samehash',
        deduped: true,
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ contentHash: 'samehash' })
      );
      const file = {
        mimetype: 'application/pdf',
        originalname: 'doc.pdf',
        size: 100,
        path: 'tmp/doc',
      } as Express.Multer.File;
      const dto = await service.uploadFile(file, { userId: 'u-1' });
      expect(dto.deduped).toBe(true);
      // 记录仍独立建行（归属不共享），物理文件复用
      const created = mockPrisma.feedbackAttachment.create.mock.calls[0][0].data;
      expect(created.contentHash).toBe('samehash');
      expect(created.uploadedById).toBe('u-1');
    });

    it('registerDrawing 命中去重 → deduped:true，contentHash 直取节点 fileHash（不重算）', async () => {
      jest.spyOn(service as any, 'storeContent').mockResolvedValue({
        relativePath: 'ha/hash-1',
        deduped: true,
      });
      jest.spyOn(service as any, 'persistThumbnail').mockResolvedValue(null);
      mockPrisma.fileSystemNode.findUnique.mockResolvedValue({
        id: 'node-1',
        name: 'a.dwg',
        path: '202610/n/a.dwg',
        fileHash: 'hash-1',
      });
      mockPrisma.feedbackAttachment.create.mockResolvedValue(
        baseRow({ type: PrismaType.DRAWING, kind: PrismaKind.REFERENCE, contentHash: 'hash-1' })
      );
      const dto = await service.registerDrawing(
        { nodeId: 'node-1', kind: 'reference' },
        { userId: 'u-1' }
      );
      expect(dto.deduped).toBe(true);
      expect((service as any).storeContent).toHaveBeenCalledWith(
        expect.stringContaining('a.dwg'),
        'hash-1'
      );
    });

    it('adminDelete 物理文件仍被其他记录引用 → 不删物理文件（只删记录）', async () => {
      const unlinkSpy = jest.spyOn(service as any, 'unlinkQuiet').mockResolvedValue(undefined);
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({ storagePath: 'ab/abc123' })
      );
      mockPrisma.feedbackAttachment.count.mockResolvedValue(2); // 仍有其他引用
      mockPrisma.feedbackAttachment.delete.mockResolvedValue({});
      await service.adminDelete('att-1', 'operator-1');
      expect(mockPrisma.feedbackAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(unlinkSpy).not.toHaveBeenCalled();
    });

    it('adminDelete 物理文件无其他引用 → 删物理文件 + 记录', async () => {
      const unlinkSpy = jest.spyOn(service as any, 'unlinkQuiet').mockResolvedValue(undefined);
      mockPrisma.feedbackAttachment.findUnique.mockResolvedValue(
        baseRow({ storagePath: 'ab/abc123' })
      );
      mockPrisma.feedbackAttachment.count.mockResolvedValue(0);
      mockPrisma.feedbackAttachment.delete.mockResolvedValue({});
      await service.adminDelete('att-1', 'operator-1');
      expect(mockPrisma.feedbackAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
      expect(unlinkSpy).toHaveBeenCalled();
    });
  });
});
