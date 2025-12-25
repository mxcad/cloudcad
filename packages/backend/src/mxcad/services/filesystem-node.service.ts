import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FileStatus } from '@prisma/client';

export interface FileSystemNodeContext {
  projectId: string;
  parentId?: string | null;
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
   * 创建或引用文件系统节点
   * @param options 创建选项
   */
  async createOrReferenceNode(options: CreateNodeOptions): Promise<void> {
    const { originalName, fileHash, fileSize, accessPath, mimeType, extension, context } = options;

    // 创建唯一的节点键，包含项目上下文
    const nodeKey = `${context.projectId}:${context.parentId || 'root'}:${fileHash}`;

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
   */
  private async performCreateNode(options: CreateNodeOptions, nodeKey: string): Promise<void> {
    const { originalName, fileHash, fileSize, accessPath, mimeType, extension, context } = options;

    // 使用事务确保数据一致性
    await this.prisma.$transaction(async (tx) => {
      // 检查是否已存在相同文件哈希的节点（全局去重）
      const existingNode = await tx.fileSystemNode.findFirst({
        where: { fileHash },
      });

      if (!existingNode) {
        // 创建新节点
        await this.createNewNode(tx, {
          name: originalName,
          accessPath,
          size: fileSize,
          mimeType,
          extension,
          fileHash,
          context,
        });
      } else {
        // 检查是否需要在当前项目/文件夹下创建引用
        await this.handleExistingNode(tx, existingNode, originalName, context);
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
          parentId: context.parentId || null,
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

      // 检查项目成员权限
      const membership = await this.prisma.projectMember.findFirst({
        where: {
          userId,
          nodeId: projectId,
        },
      });

      return !!membership;
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
        parentId = existingFile.parentId || null;
        this.logger.log(`📁 找到现有文件节点: ${existingFile.id}, 父节点: ${parentId}`);

        // 向上查找项目根节点
        let currentNodeId = existingFile.parentId;
        while (currentNodeId) {
          const parentNode = await this.prisma.fileSystemNode.findUnique({
            where: { id: currentNodeId },
            select: { id: true, isRoot: true, parentId: true, name: true }
          });

          if (parentNode?.isRoot) {
            projectId = parentNode.id;
            this.logger.log(`📍 找到项目根节点: ${projectId} (${parentNode.name})`);
            break;
          }

          currentNodeId = parentNode?.parentId || null;
        }

        this.logger.log(`📋 从现有文件推断项目: projectId=${projectId}, parentId=${parentId}`);
      } else {
        // 如果是新文件，尝试从用户的项目中查找默认项目
        this.logger.log(`🆕 新文件，查找用户的默认项目`);
        const userProject = await this.prisma.projectMember.findFirst({
          where: {
            userId: user.id,
            user: {
              status: 'ACTIVE'
            }
          },
          include: {
            node: {
              select: {
                id: true,
                name: true,
                isRoot: true,
              },
            },
            user: {
              select: {
                id: true,
                username: true,
                role: true,
                status: true,
              },
            },
          },
          orderBy: {
            id: 'asc'
          }
        });

        if (userProject && userProject.node.isRoot) {
          projectId = userProject.nodeId;
          parentId = projectId; // 上传到项目根目录
          this.logger.log(`✅ 使用用户默认项目: projectId=${projectId} (${userProject.node.name})`);
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
          await this.prisma.projectMember.create({
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
        projectId,
        parentId,
        userId: user.id,
        userRole: user.role,
      };

      this.logger.log(`🎯 推断上下文完成:`, context);
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

    this.logger.log('创建新的文件系统节点');

    const fileNode = await tx.fileSystemNode.create({
      data: {
        name,
        isFolder: false,
        isRoot: false,
        parentId: context.parentId || null,
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

    this.logger.log(`✅ 新节点创建成功，ID: ${fileNode.id}`);
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
    const targetParentId = context.parentId || context.projectId;

    // 检查是否完全相同（同名+同哈希+同目录+同用户）
    const exactDuplicate = await tx.fileSystemNode.findFirst({
      where: {
        parentId: targetParentId,
        fileHash: existingNode.fileHash,
        originalName: originalName,  // 同名
        ownerId: context.userId,
      },
    });

    if (exactDuplicate) {
      return;  // 完全相同的文件已存在，跳过创建
    }

    // 生成不重复的文件名（自动加序号）
    const uniqueName = await this.generateUniqueFileName(tx, targetParentId, originalName);

    // 创建新节点（即使是相同内容也创建新节点，共享存储路径）
    await tx.fileSystemNode.create({
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
  }
}