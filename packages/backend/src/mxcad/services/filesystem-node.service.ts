import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FileStatus } from '@prisma/client';

export interface FileSystemNodeContext {
  nodeId: string;  // 当前节点ID（项目根目录或文件夹）
  userId: string;
  userRole: string;
}

export interface CreateNodeOptions {
  originalName: string;
  fileHash: string;
  fileSize: number;
  accessPath: string;
  mimeType: string;
  extension: string;
  context: FileSystemNodeContext;
}

@Injectable()
export class FileSystemNodeService {
  private readonly logger = new Logger(FileSystemNodeService.name);
  
  // 并发控制：防止同一个文件同时创建多个节点
  private readonly creatingNodes: Map<string, Promise<void>> = new Map();

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 检查指定目录下是否已存在相同哈希值的文件节点
   */
  async checkNodeExistsInDirectory(nodeId: string, fileHash: string, userId: string): Promise<boolean> {
    const existingNode = await this.prisma.fileSystemNode.findFirst({
      where: {
        parentId: nodeId,
        fileHash: fileHash,
        ownerId: userId,
      },
    });

    return !!existingNode;
  }

  /**
   * 创建或引用文件系统节点
   * @param options 创建选项
   */
  async createOrReferenceNode(options: CreateNodeOptions): Promise<void> {
    const { originalName, fileHash, fileSize, accessPath, mimeType, extension, context } = options;

    // 创建唯一的节点键
    const nodeKey = `${context.nodeId}:${fileHash}`;

    try {
      // 并发控制：如果同一个文件正在创建，等待结果
      if (this.creatingNodes.has(nodeKey)) {
        await this.creatingNodes.get(nodeKey)!;
        return;
      }

      // 创建创建 Promise 并缓存
      const createPromise = this.performCreateNode(options, nodeKey);
      this.creatingNodes.set(nodeKey, createPromise);

      try {
        await createPromise;
      } finally {
        // 清理并发控制
        this.creatingNodes.delete(nodeKey);
      }
    } catch (error) {
      this.logger.error(`创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 执行实际的节点创建操作
   * 关键修复：不再做全局哈希值检查，而是直接调用 handleExistingNode
   * 这样可以确保在目标目录创建新节点，并正确处理同名文件加序号
   */
  private async performCreateNode(options: CreateNodeOptions, nodeKey: string): Promise<void> {
    const { originalName, fileHash, fileSize, accessPath, mimeType, extension, context } = options;

    // 使用事务确保数据一致性
    await this.prisma.$transaction(async (tx) => {
      // 查找全局是否有相同哈希值的文件（用于共享存储路径）
      const existingNode = await tx.fileSystemNode.findFirst({
        where: { fileHash },
      });

      if (existingNode) {
        // 文件在存储中存在，调用 handleExistingNode 处理同名文件加序号
        await this.handleExistingNode(tx, existingNode, originalName, context);
      } else {
        // 文件在存储中不存在，创建新节点
        await this.createNewNode(tx, {
          name: originalName,
          accessPath,
          size: fileSize,
          mimeType,
          extension,
          fileHash,
          context,
        });
      }
    });
  }

  /**
   * 为非CAD文件创建文件系统节点
   */
  async createNonCadNode(options: CreateNodeOptions): Promise<void> {
    const { originalName, fileHash, fileSize, accessPath, mimeType, extension, context } = options;

    this.logger.log(`开始创建非CAD文件系统节点: ${originalName}, 大小: ${fileSize}字节, 存储路径: ${accessPath}`);

    try {
      const fileNode = await this.prisma.fileSystemNode.create({
        data: {
          name: originalName,
          isFolder: false,
          isRoot: false,
          parentId: context.nodeId,
          originalName,
          path: accessPath,
          size: fileSize,
          mimeType,
          extension,
          fileStatus: FileStatus.COMPLETED,
          fileHash,
          ownerId: context.userId,
        },
      });

      this.logger.log(`非CAD文件系统节点创建成功: ${originalName} (${fileHash}), 节点ID: ${fileNode.id}`);
    } catch (error) {
      this.logger.error(`创建非CAD文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 检查用户是否有项目访问权限
   */
  async checkProjectPermission(projectId: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // 管理员有所有权限
      if (userRole === 'ADMIN') {
        return true;
      }

      // 检查节点访问权限
      const access = await this.prisma.fileAccess.findUnique({
        where: {
          userId_nodeId: { userId, nodeId: projectId },
        },
      });

      return !!access;
    } catch (error) {
      this.logger.error(`检查项目权限失败: ${error.message}`, error);
      return false;
    }
  }

  /**
   * 为 MxCAD-App 推断上下文信息
   */
  async inferContextForMxCadApp(fileHash: string, request: any): Promise<FileSystemNodeContext | null> {
    try {
      this.logger.log(`🔍 为文件哈希 ${fileHash} 推断 MxCAD-App 上下文`);

      // 1. 尝试从 Session 获取用户信息
      let user = request.session?.user;

      // 2. 如果没有 Session 用户，查找最近活动用户
      if (!user) {
        const recentToken = await this.prisma.refreshToken.findFirst({
          orderBy: { createdAt: 'desc' }
        });

        if (recentToken) {
          user = await this.prisma.user.findUnique({
            where: { id: recentToken.userId },
            select: {
              id: true,
              email: true,
              username: true,
              nickname: true,
              role: true,
              status: true,
            },
          });

          if (user && user.status === 'ACTIVE') {
            this.logger.log(`✅ 使用最近活动用户: ${user.username} (${user.id})`);
          } else {
            user = null;
          }
        }
      }

      if (!user) {
        this.logger.error(`❌ 无法找到有效用户，无法推断上下文`);
        return null;
      }

      // 3. 尝试从文件哈希查找项目信息
      let projectId: string | null = null;
      let parentId: string | null = null;

      const existingFile = await this.prisma.fileSystemNode.findFirst({
        where: {
          fileHash,
          isFolder: false,
        },
        select: {
          id: true,
          parentId: true,
          owner: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      if (existingFile) {
        // 如果文件已存在，使用其父节点信息
        const fileParentId = existingFile.parentId || null;
        this.logger.log(`📁 找到现有文件节点: ${existingFile.id}, 父节点: ${fileParentId}`);

        // 向上查找项目根节点
        let currentNodeId = existingFile.parentId;
        let foundProjectId: string | null = null;
        while (currentNodeId) {
          const parentNode = await this.prisma.fileSystemNode.findUnique({
            where: { id: currentNodeId },
            select: { id: true, isRoot: true, parentId: true, name: true }
          });

          if (parentNode?.isRoot) {
            foundProjectId = parentNode.id;
            this.logger.log(`📍 找到项目根节点: ${foundProjectId} (${parentNode.name})`);
            break;
          }

          currentNodeId = parentNode?.parentId || null;
        }

        this.logger.log(`📋 从现有文件推断节点: projectId=${foundProjectId}, parentId=${fileParentId}`);
        projectId = foundProjectId;
        parentId = fileParentId;
      } else {
        // 如果是新文件，尝试从用户的项目中查找默认项目
        this.logger.log(`🆕 新文件，查找用户的默认项目`);
        const userAccess = await this.prisma.fileAccess.findFirst({
          where: {
            userId: user.id,
            node: { isRoot: true },
          },
          include: {
            node: { select: { id: true, name: true, isRoot: true } },
          },
          orderBy: { createdAt: 'asc' }
        });

        if (userAccess && userAccess.node.isRoot) {
          projectId = userAccess.nodeId;
          parentId = projectId; // 上传到项目根目录
          this.logger.log('✅ 使用用户默认项目: projectId=' + projectId + ' (' + userAccess.node.name + ')');
        } else {
          this.logger.log(`⚠️ 用户没有有效的项目，将创建默认项目`);
        }
      }

      // 4. 如果还是没有项目，创建一个默认项目
      if (!projectId) {
        this.logger.log(`🏗️ 为用户 ${user.username} 创建默认项目`);
        
        // 检查是否已有同名默认项目
        const existingDefaultProject = await this.prisma.fileSystemNode.findFirst({
          where: {
            name: `${user.username}的默认项目`,
            isRoot: true,
            ownerId: user.id,
          },
        });

        if (existingDefaultProject) {
          projectId = existingDefaultProject.id;
          parentId = projectId;
          this.logger.log(`📂 使用现有的默认项目: projectId=${projectId}`);
        } else {
          const defaultProject = await this.prisma.fileSystemNode.create({
            data: {
              name: `${user.username}的默认项目`,
              isFolder: true,
              isRoot: true,
              parentId: null,
              description: 'MxCAD-App 自动创建的默认项目',
              projectStatus: 'ACTIVE',
              ownerId: user.id,
            },
          });

          // 添加用户为项目所有者
          await this.prisma.fileAccess.create({
            data: {
              userId: user.id,
              nodeId: defaultProject.id,
              role: 'OWNER',
            },
          });

          projectId = defaultProject.id;
          parentId = projectId;
          this.logger.log(`🆕 创建默认项目成功: projectId=${projectId} (${defaultProject.name})`);
        }
      }

      const context = {
        nodeId: parentId || projectId,
        userId: user.id,
        userRole: user.role,
      };

      this.logger.log(`🎯 推断上下文完成: nodeId=${context.nodeId}, userId=${context.userId}`);
      return context;

    } catch (error) {
      this.logger.error(`❌ 推断 MxCAD-App 上下文失败: ${error.message}`, error);
      return null;
    }
  }

  /**
   * 获取 MIME 类型
   */
  getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.dwg': 'application/dwg',
      '.dxf': 'application/dxf',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.mxweb': 'application/octet-stream',
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  private async createNewNode(
    tx: any,
    options: {
      name: string;
      accessPath: string;
      size: number;
      mimeType: string;
      extension: string;
      fileHash: string;
      context: FileSystemNodeContext;
    }
  ): Promise<void> {
    const { name, accessPath, size, mimeType, extension, fileHash, context } = options;

    this.logger.log(`[createNewNode] 创建新节点: name=${name}, nodeId=${context.nodeId}`);

    const fileNode = await tx.fileSystemNode.create({
      data: {
        name,
        isFolder: false,
        isRoot: false,
        parentId: context.nodeId,
        originalName: name,
        path: accessPath,
        size,
        mimeType,
        extension,
        fileStatus: FileStatus.COMPLETED,
        fileHash,
        ownerId: context.userId,
      },
    });

    this.logger.log(`✅ 新节点创建成功，ID: ${fileNode.id}, parentId: ${fileNode.parentId}`);
  }

  /**
   * 生成不重复的文件名，自动添加序号
   * 例如: dxf.dxf -> dxf (1).dxf -> dxf (2).dxf
   */
  private async generateUniqueFileName(
    tx: any,
    parentId: string,
    originalName: string
  ): Promise<string> {
    const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.'));
    const extension = originalName.substring(originalName.lastIndexOf('.'));
    
    // 检查是否已存在同名文件
    const existingCount = await tx.fileSystemNode.count({
      where: {
        parentId,
        originalName: { startsWith: nameWithoutExt },
        extension,
      },
    });

    if (existingCount === 0) {
      return originalName;
    }

    // 生成带序号的文件名
    let counter = 1;
    while (true) {
      const newName = `${nameWithoutExt} (${counter})${extension}`;
      const exists = await tx.fileSystemNode.findFirst({
        where: {
          parentId,
          name: newName,
        },
      });
      if (!exists) {
        return newName;
      }
      counter++;
    }
  }

  private async handleExistingNode(
    tx: any,
    existingNode: any,
    originalName: string,
    context: FileSystemNodeContext
  ): Promise<void> {
    const targetParentId = context.nodeId;
    this.logger.log(`[handleExistingNode] 处理现有节点: originalName=${originalName}, targetParentId=${targetParentId}, existingNodeId=${existingNode.id}, fileHash=${existingNode.fileHash}`);

    // 检查是否在当前目录下已存在相同哈希值的文件
    // 如果存在，说明文件已经上传过了，直接返回
    const existingFileWithSameHash = await tx.fileSystemNode.findFirst({
      where: {
        parentId: targetParentId,
        fileHash: existingNode.fileHash,  // 检查哈希值而不是文件名
        ownerId: context.userId,
      },
    });

    if (existingFileWithSameHash) {
      this.logger.log(`[handleExistingNode] 相同哈希值的文件已存在于当前目录: ID=${existingFileWithSameHash.id}, 不创建新节点`);
      return; // 文件已存在，无需重复创建
    }

    // 文件在存储中存在，但当前目录下没有相同哈希值的文件
    // 需要创建新的文件节点，并处理同名文件情况
    this.logger.log(`[handleExistingNode] 文件在存储中存在，当前目录没有相同文件，创建新节点...`);

    // 检查是否在当前目录下已存在同名文件（不同哈希值）
    // 如果存在，则生成唯一文件名（添加序号）
    const existingInTarget = await tx.fileSystemNode.findFirst({
      where: {
        parentId: targetParentId,
        originalName: originalName,
        ownerId: context.userId,
      },
    });

    // 如果存在同名文件但哈希值不同，生成唯一文件名
    const uniqueName = existingInTarget
      ? await this.generateUniqueFileName(tx, targetParentId, originalName)
      : originalName;

    this.logger.log(`[handleExistingNode] 当前目录检查: ${existingInTarget ? `找到同名文件 ID=${existingInTarget.id}` : '无同名文件'}`);
    this.logger.log(`[handleExistingNode] 使用文件名: ${uniqueName}, targetParentId=${targetParentId}`);

    // 创建新节点（引用现有存储路径，节省空间）
    this.logger.log(`[handleExistingNode] 开始创建引用节点...`);
    const newNode = await tx.fileSystemNode.create({
      data: {
        name: uniqueName,
        isFolder: false,
        isRoot: false,
        parentId: targetParentId,
        originalName: uniqueName,
        path: existingNode.path,  // 共享存储路径
        size: existingNode.size,
        mimeType: existingNode.mimeType,
        extension: existingNode.extension,
        fileStatus: FileStatus.COMPLETED,
        fileHash: existingNode.fileHash,
        ownerId: context.userId,
      },
    });
    this.logger.log(`✅ 引用节点创建成功，ID: ${newNode.id}, parentId: ${newNode.parentId}, 共享存储: ${existingNode.path}`);
  }
}