///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NodeType } from '@cloudcad/db';
import { DatabaseService } from '../database/database.service';
import { FileTreeService } from '../file-system/file-tree/file-tree.service';
import { TreeWalker } from '../file-system/file-tree/tree-walker.service';
import {
  IPERMISSION_SERVICE,
  IPermissionService,
} from '../permission/interfaces/permission-service.interface';
import { NodeTrashService } from '../file-operations/node-trash.service';
import { NodeMutationGuard } from '../file-operations/node-mutation.guard';
import { NodeCopyMoveService } from '../file-operations/node-copy-move.service';
import { NodeUpdateService } from '../file-operations/file-operations.service';
import { ProjectCrudService } from '../file-operations/project-crud.service';
import { StorageManager } from '../storage-management/services/storage-manager.service';
import { FileDownloadHandlerService } from '../file-system/file-download/file-download-handler.service';
import { MxcadFileHandlerService } from '../mxcad/core/mxcad-file-handler.service';
import { IMxcadSaveService } from '../mxcad/interfaces/mxcad-save.interface';
import { MXCAD_SAVE_SERVICE } from '../mxcad/interfaces/mxcad-service-tokens';
import { Inject } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { CreateFolderDto } from '../file-system/dto/create-folder.dto';
import { UpdateNodeDto } from '../file-system/dto/update-node.dto';
import { QueryChildrenDto } from '../file-system/dto/query-children.dto';
import { SaveLibraryAsDto } from './dto/save-library-as.dto';
import {
  findThumbnailSync,
  getDefaultThumbnailFileName,
} from '../mxcad/infra/thumbnail-utils';

export type LibraryType = 'drawing' | 'block';

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private readonly DEFAULT_THUMBNAILS_DIR = path.join(
    __dirname,
    '..',
    'assets',
    'default-thumbnails'
  );

  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileTreeService: FileTreeService,
    private readonly treeWalker: TreeWalker,
    @Inject(IPERMISSION_SERVICE)
    private readonly permissionService: IPermissionService,
    private readonly nodeTrashService: NodeTrashService,
    private readonly nodeCopyMoveService: NodeCopyMoveService,
    private readonly nodeUpdateService: NodeUpdateService,
    private readonly projectCrudService: ProjectCrudService,
    private readonly storageManager: StorageManager,
    private readonly fileDownloadHandler: FileDownloadHandlerService,
    private readonly mxcadFileHandler: MxcadFileHandlerService,
    @Inject(MXCAD_SAVE_SERVICE)
    private readonly mxCadSaveService: IMxcadSaveService,
    private readonly nodeMutationGuard: NodeMutationGuard
  ) {}

  async getLibraryId(libraryType: LibraryType): Promise<string> {
    const library = await this.prisma.fileSystemNode.findFirst({
      where: {
        nodeType:
          libraryType === 'drawing'
            ? NodeType.LIBRARY_DRAWING
            : NodeType.LIBRARY_BLOCK,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!library) {
      throw new NotFoundException(
        `公共资源库 (${libraryType}) 不存在，请先初始化`
      );
    }
    return library.id;
  }

  async getLibrary(libraryType: LibraryType) {
    const libraryId = await this.getLibraryId(libraryType);
    return this.prisma.fileSystemNode.findUnique({
      where: { id: libraryId },
      include: {
        children: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async isLibrary(nodeId: string): Promise<boolean> {
    const nodeType = await this.fileTreeService.getNodeType(nodeId);
    return (
      nodeType === NodeType.LIBRARY_DRAWING ||
      nodeType === NodeType.LIBRARY_BLOCK
    );
  }

  async validateLibraryNode(
    nodeId: string,
    expectedKey: LibraryType
  ): Promise<void> {
    const nodeType = await this.fileTreeService.getNodeType(nodeId);
    if (!nodeType) {
      throw new NotFoundException(`Node not found: ${nodeId}`);
    }

    const expectedNodeType =
      expectedKey === 'drawing'
        ? NodeType.LIBRARY_DRAWING
        : NodeType.LIBRARY_BLOCK;

    if (nodeType === expectedNodeType) return;

    if (nodeType === NodeType.FILE || nodeType === NodeType.FOLDER) {
      const rootId = await this.treeWalker.resolveProjectId(nodeId);
      if (rootId) {
        const rootType = await this.fileTreeService.getNodeType(rootId);
        if (rootType === expectedNodeType) return;
      }
    }

    throw new BadRequestException(
      `Node does not belong to ${expectedKey === 'drawing' ? 'drawing library' : 'block library'}`
    );
  }

  private throwNotInLibrary(libraryKey: LibraryType): never {
    throw new BadRequestException(
      `Target is not in ${libraryKey === 'drawing' ? 'drawing library' : 'block library'}`
    );
  }

  async saveLibraryNode(
    nodeId: string,
    file: Express.Multer.File,
    userId: string,
    username: string
  ) {
    try {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.mxweb') {
        throw new BadRequestException(
          `Unsupported format: ${ext}, only .mxweb is supported`
        );
      }

      const result = await this.mxCadSaveService.saveMxwebFile(
        nodeId,
        file,
        userId,
        username,
        'Overwrite save library file',
        true
      );

      if (!result.success) {
        throw new BadRequestException(result.message);
      }

      return { nodeId, path: result.path };
    } catch (error) {
      // 失败路径（格式拒绝 / 保存失败）下清理 diskStorage 临时文件
      this.cleanupUploadedFile(file);
      throw error;
    }
  }

  /** 删除 multer diskStorage 落盘的临时文件（幂等，成功路径由消费方自行清理） */
  private cleanupUploadedFile(file?: Express.Multer.File): void {
    if (!file?.path) return;
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      this.logger.warn(
        `[library] Failed to delete temp file: ${(e as Error).message}`
      );
    }
  }

  /** 流式计算文件 MD5，避免大文件全量读入内存 */
  private computeFileHash(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
      stream.on('error', (error) => reject(error));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  async saveLibraryAs(
    file: Express.Multer.File,
    dto: SaveLibraryAsDto,
    req: any,
    libraryKey: LibraryType
  ) {
    try {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext !== '.mxweb') {
        throw new BadRequestException(
          `Unsupported format: ${ext}, only .mxweb is supported`
        );
      }

      const parentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: dto.targetParentId },
      });
      if (!parentNode) {
        throw new NotFoundException('Target folder does not exist');
      }

      // 目标必须属于目标库（库根或库内节点，上溯校验）；保存目标不能是文件
      await this.validateLibraryNode(parentNode.id, libraryKey);
      if (parentNode.nodeType === NodeType.FILE) {
        this.throwNotInLibrary(libraryKey);
      }

      // 配额断言置于目标校验之后，避免 targetParentId 无效时被配额错误掩盖；
      // 库目标（含库内文件夹）的配额在 NodeMutationGuard 中自动跳过
      if (req.user?.id && file?.size) {
        await this.nodeMutationGuard.assertByteQuota(
          { node: { id: dto.targetParentId }, incrementBytes: file.size },
          req.user.id
        );
      }

      const fileName = dto.fileName || 'untitled';
      const newNode = await this.fileTreeService.createFileNode({
        name: fileName,
        fileHash: '',
        size: file.size,
        mimeType: file.mimetype,
        extension: '.mxweb',
        parentId: parentNode.id,
        ownerId: req.user.id,
        skipFileCopy: true,
      });

      // skipFileCopy 路径下 createFileNode 保持 path 为 null（不分配物理目录/不拷贝文件），
      // 物理落盘与 path 更新由本服务完成（与 save-as.service.saveMxwebAs 相同模式）：
      // allocateNodeStorage → 拷贝 → updateNodePath → 真实 size/fileHash
      const storageInfo = await this.storageManager.allocateNodeStorage(
        newNode.id,
        `${newNode.id}.mxweb`
      );
      // MulterModule 已配置 diskStorage：上传内容在 file.path，直接流式拷贝落盘，
      // 不经过 file.buffer（大文件避免全量进内存）
      if (!file?.path) {
        throw new BadRequestException('Failed to read uploaded file content');
      }
      fs.copyFileSync(file.path, storageInfo.filePath);

      const stats = fs.statSync(storageInfo.filePath);
      const fileHash = await this.computeFileHash(storageInfo.filePath);
      await this.fileTreeService.updateNodePath(
        newNode.id,
        storageInfo.fileRelativePath
      );
      await this.prisma.fileSystemNode.update({
        where: { id: newNode.id },
        data: { size: stats.size, fileHash },
      });

      return {
        nodeId: newNode.id,
        fileName: newNode.name,
        path: storageInfo.fileRelativePath,
        parentId: newNode.parentId,
      };
    } finally {
      // diskStorage 临时文件：无论成功失败都清理
      this.cleanupUploadedFile(file);
    }
  }

  private serveStaticFile(
    filePath: string,
    headers: Record<string, string>,
    errorLabel: string,
    res: Response
  ): boolean {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    res.setHeader('Content-Length', stats.size.toString());
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', (error) => {
      this.logger.error(`${errorLabel}: ${error.message}`, error.stack);
      if (!res.headersSent) res.status(500).json({ message: errorLabel });
    });
    fileStream.pipe(res);
    return true;
  }

  async serveLibraryThumbnail(nodeId: string, res: Response, req: any) {
    let node: any;
    try {
      node = await this.fileTreeService.getNodeIgnoreDeleted(nodeId);
    } catch {
      this.serveDefaultThumbnail(res);
      return;
    }

    if (node.nodeType !== NodeType.FILE || !node.path) {
      this.serveDefaultThumbnail(res);
      return;
    }

    const nodeFullPath = this.storageManager.getFullPath(node.path);
    const nodeDir = path.dirname(nodeFullPath);
    const thumbnail = findThumbnailSync(nodeDir);

    if (!thumbnail) {
      const ext = node.extension || path.extname(node.name || '').toLowerCase();
      const defaultFile = getDefaultThumbnailFileName(ext);
      const defaultPath = path.join(this.DEFAULT_THUMBNAILS_DIR, defaultFile);

      if (
        this.serveStaticFile(
          defaultPath,
          {
            ETag: `"${fs.statSync(defaultPath).mtimeMs}-${fs.statSync(defaultPath).size}"`,
            'Last-Modified': fs.statSync(defaultPath).mtime.toUTCString(),
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-cache',
          },
          '读取默认缩略图失败',
          res
        )
      )
        return;
      res.status(204).end();
      return;
    }

    const thumbnailPath = thumbnail.path;
    const stats = fs.statSync(thumbnailPath);
    if (stats.isDirectory()) {
      this.logger.warn(`缩略图路径是目录而非文件: ${thumbnailPath}`);
      res.status(204).end();
      return;
    }

    if (
      this.serveStaticFile(
        thumbnailPath,
        {
          ETag: `"${stats.mtimeMs}-${stats.size}"`,
          'Last-Modified': stats.mtime.toUTCString(),
          'Content-Type': thumbnail.mimeType,
          'Cache-Control': 'no-cache',
        },
        '读取缩略图失败',
        res
      )
    )
      return;
    res.status(204).end();
  }

  private serveDefaultThumbnail(res: Response): void {
    const defaultPath = path.join(this.DEFAULT_THUMBNAILS_DIR, 'default.jpg');
    if (
      this.serveStaticFile(
        defaultPath,
        {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'no-cache',
        },
        '读取默认缩略图失败',
        res
      )
    )
      return;
    res.status(204).end();
  }

  async getCategoryTree(rootId: string) {
    return this.fileTreeService.getCategoryTree(rootId);
  }

  async getChildren(nodeId: string, query?: QueryChildrenDto) {
    const mockUserId = 'system';
    return this.fileTreeService.getChildren(nodeId, mockUserId, query);
  }

  async getAllFilesUnderNode(nodeId: string, query?: QueryChildrenDto) {
    const mockUserId = 'system';
    return this.fileTreeService.getAllFilesUnderNode(nodeId, mockUserId, query);
  }

  async getNodeTree(nodeId: string) {
    return this.fileTreeService.getNodeTree(nodeId);
  }

  async serveFile(filename: string, res: Response) {
    return this.mxcadFileHandler.serveFile(filename, res);
  }

  async downloadNode(
    nodeId: string,
    userId: string,
    res: Response,
    options?: { clientIp?: string }
  ) {
    await this.fileDownloadHandler.handleDownload(nodeId, userId, res, options);
  }

  async resolvePath(libraryId: string, path: string) {
    return this.fileTreeService.resolvePath(libraryId, path);
  }

  async createFolder(userId: string, parentId: string, dto: CreateFolderDto) {
    return this.projectCrudService.createFolder(userId, parentId, dto);
  }

  async deleteNode(nodeId: string, permanently?: boolean) {
    return this.nodeTrashService.deleteNode(nodeId, permanently ?? true);
  }

  async updateNode(nodeId: string, dto: UpdateNodeDto) {
    return this.nodeUpdateService.updateNode(nodeId, dto);
  }

  async moveNode(nodeId: string, targetParentId: string, userId?: string) {
    // 透传 userId：库操作经 NodeMutationGuard 完整校验（库内同根=库管理权限断言；
    // 跨根=6 域转移矩阵 + 库源 move 拒绝/copy 豁免），修复库 API 绕过项目出向策略的漏洞
    return this.nodeCopyMoveService.moveNode(nodeId, targetParentId, userId);
  }

  async copyNode(nodeId: string, targetParentId: string, userId?: string) {
    return this.nodeCopyMoveService.copyNode(nodeId, targetParentId, userId);
  }

  async batchDeleteNodes(nodeIds: string[], permanently?: boolean) {
    return this.nodeTrashService.batchDeleteNodes(nodeIds, permanently);
  }

  async batchMoveNodes(
    nodeIds: string[],
    targetParentId: string,
    userId?: string
  ) {
    return this.nodeCopyMoveService.batchMoveNodes(
      nodeIds,
      targetParentId,
      userId
    );
  }

  async batchCopyNodes(
    nodeIds: string[],
    targetParentId: string,
    userId?: string
  ) {
    return this.nodeCopyMoveService.batchCopyNodes(
      nodeIds,
      targetParentId,
      userId
    );
  }
}
