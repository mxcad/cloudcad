import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FileSystemPermissionService } from '../file-system/file-permission/file-system-permission.service';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { NodeType } from '@cloudcad/db';
import type { BatchFileItem } from './dto/create-batch-download.dto';

/** 文件夹递归文件树节点：isFolder=true 时 children 为同构子节点 */
export interface FolderFileNode {
  nodeId: string;
  fileName: string;
  isFolder: boolean;
  children?: FolderFileNode[];
}

@Injectable()
export class FolderExpanderService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly fileSystemPermissionService: FileSystemPermissionService,
  ) {}

  async expandFolderItems(
    fileList: BatchFileItem[],
    dirPaths: Set<string>,
  ): Promise<BatchFileItem[]> {
    const result: BatchFileItem[] = [];
    for (const item of fileList) {
      // fileHash-only 项（CAD 编辑器内存导出）：无 DB 节点，直接保留（非文件夹）
      if (!item.nodeId) {
        result.push(item);
        continue;
      }
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: item.nodeId },
        select: { nodeType: true, name: true },
      });
      if (!node || node.nodeType === NodeType.FILE) {
        result.push(item);
      } else {
        const folderName = node.name;
        dirPaths.add(folderName);
        const children = await this.collectFolderChildren(
          item.nodeId, folderName, item.formats, dirPaths,
        );
        result.push(...children);
      }
    }
    return result;
  }

  private async collectFolderChildren(
    folderId: string,
    basePath: string,
    inheritedFormats: string[],
    dirPaths: Set<string>,
  ): Promise<BatchFileItem[]> {
    const result: BatchFileItem[] = [];
    const queue: Array<{ id: string; path: string }> = [{ id: folderId, path: basePath }];

    while (queue.length > 0) {
      const batch = queue.splice(0);
      for (const f of batch) {
        dirPaths.add(f.path);
      }
      const folderIds = batch.map((f) => f.id);
      const children = await this.prisma.fileSystemNode.findMany({
        where: { parentId: { in: folderIds }, deletedAt: null },
        select: { id: true, name: true, originalName: true, nodeType: true, parentId: true },
      });
      const pathMap = new Map(batch.map((f) => [f.id, f.path]));
      for (const child of children) {
        const parentPath = pathMap.get(child.parentId) || basePath;
        if (child.nodeType === NodeType.FILE) {
          result.push({
            nodeId: child.id,
            fileName: child.originalName || child.name,
            formats: inheritedFormats,
            relativePath: parentPath,
          });
        } else {
          queue.push({ id: child.id, path: `${parentPath}/${child.name}` });
        }
      }
    }
    return result;
  }

  async getFolderFilesRecursive(
    nodeId: string, userId: string,
  ): Promise<FolderFileNode> {
    const node = await this.prisma.fileSystemNode.findUnique({
      where: { id: nodeId },
      select: { id: true, name: true, originalName: true, nodeType: true, projectId: true, ownerId: true },
    });
    if (!node) throw new NotFoundException('Node not found');
    // 节点级访问校验统一走 assertNodeAccess（IDOR 防线，语义与
    // RequireProjectPermissionGuard 一致）：项目/个人空间按 FILE_OPEN 项目权限，
    // 资源库上下文按 LIBRARY_*_MANAGE 系统权限，根不可解析 fail-closed。
    await this.fileSystemPermissionService.assertNodeAccess(
      userId, nodeId, ProjectPermission.FILE_OPEN,
    );
    if (node.nodeType === NodeType.FILE) {
      return { nodeId: node.id, fileName: node.originalName || node.name, isFolder: false };
    }
    const children = await this.prisma.fileSystemNode.findMany({
      where: { parentId: nodeId, deletedAt: null },
      select: { id: true, name: true, originalName: true, nodeType: true },
    });
    const result: FolderFileNode[] = [];
    for (const child of children) {
      if (child.nodeType === NodeType.FILE) {
        result.push({ nodeId: child.id, fileName: child.originalName || child.name, isFolder: false });
      } else {
        result.push(await this.getFolderFilesRecursive(child.id, userId));
      }
    }
    return { nodeId: node.id, fileName: node.originalName || node.name, isFolder: true, children: result };
  }
}
