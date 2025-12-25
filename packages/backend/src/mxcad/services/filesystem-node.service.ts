import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FileStatus } from '@prisma/client';
import * as path from 'path';

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

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * 创建或引用文件系统节点
   * @param options 创建选项
   */
  async createOrReferenceNode(options: CreateNodeOptions): Promise<void> {
    const { originalName, fileHash, fileSize, accessPath, mimeType, extension, context } = options;

    this.logger.log(`🔍 开始创建文件系统节点: ${originalName}, 大小: ${fileSize}字节, 项目: ${context.projectId}, 父目录: ${context.parentId}, 用户: ${context.userId}`);

    try {
      // 使用事务确保数据一致性
      await this.prisma.$transaction(async (tx) => {
        // 检查是否已存在相同文件哈希的节点（全局去重）
        this.logger.log(`查找现有文件节点，哈希: ${fileHash}`);
        const existingNode = await tx.fileSystemNode.findFirst({
          where: { fileHash },
        });

        this.logger.log(`现有节点查找结果:`, existingNode ? `存在(${existingNode.id})` : '不存在');

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

      this.logger.log(`✅ 事务提交成功`);
    } catch (error) {
      this.logger.error(`创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`, error.stack);
      throw error;
    }
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

  private async handleExistingNode(
    tx: any,
    existingNode: any,
    originalName: string,
    context: FileSystemNodeContext
  ): Promise<void> {
    this.logger.log('检查当前项目/文件夹下的引用');
    this.logger.log('查找条件:', {
      parentId: context.parentId || context.projectId,
      fileHash: existingNode.fileHash,
      userId: context.userId,
    });

    // 检查是否已存在引用节点
    const existingRef = await tx.fileSystemNode.findFirst({
      where: {
        parentId: context.parentId || context.projectId,
        fileHash: existingNode.fileHash,
        ownerId: context.userId,
      },
    });

    this.logger.log('现有引用查找结果:', existingRef ? `存在(${existingRef.id})` : '不存在');

    if (!existingRef) {
      this.logger.log('创建引用节点');

      const newRef = await tx.fileSystemNode.create({
        data: {
          name: existingNode.name,
          isFolder: false,
          isRoot: false,
          parentId: context.parentId || context.projectId,
          originalName: existingNode.originalName,
          path: existingNode.path,
          size: existingNode.size,
          mimeType: existingNode.mimeType,
          extension: existingNode.extension,
          fileStatus: FileStatus.COMPLETED,
          fileHash: existingNode.fileHash,
          ownerId: context.userId,
        },
      });

      this.logger.log(`✅ 引用节点创建成功，ID: ${newRef.id}`);
      this.logger.log(`文件已存在，创建引用节点: ${originalName} -> 父节点: ${context.parentId}`);
    } else {
      this.logger.log('⚠️ 文件引用节点已存在，跳过创建');
      this.logger.log(`文件引用节点已存在，跳过创建: ${originalName}`);
    }
  }
}