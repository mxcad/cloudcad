import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FileStatus } from '@prisma/client';

export interface FileSystemNodeContext {
  nodeId: string; // 当前节点ID（项目根目录或文件夹）
  userId: string;
  userRole: string;
  srcDwgFileHash?: string; // 外部参照上传时的源图纸哈希
  isImage?: boolean; // 是否为图片外部参照
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
  async checkNodeExistsInDirectory(
    nodeId: string,
    fileHash: string,
    userId: string
  ): Promise<boolean> {
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
    const {
      originalName,
      fileHash,
      fileSize,
      accessPath,
      mimeType,
      extension,
      context,
    } = options;

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
      this.logger.error(
        `创建文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 执行实际的节点创建操作
   * 关键修复：不再做全局哈希值检查，而是直接调用 handleExistingNode
   * 这样可以确保在目标目录创建新节点，并正确处理同名文件加序号
   */
  private async performCreateNode(
    options: CreateNodeOptions,
    nodeKey: string
  ): Promise<void> {
    const {
      originalName,
      fileHash,
      fileSize,
      accessPath,
      mimeType,
      extension,
      context,
    } = options;

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
    const {
      originalName,
      fileHash,
      fileSize,
      accessPath,
      mimeType,
      extension,
      context,
    } = options;

    // 获取 nodeId 对应的节点信息
    const currentNode = await this.prisma.fileSystemNode.findUnique({
      where: { id: context.nodeId, deletedAt: null },
      select: { id: true, name: true, parentId: true, isFolder: true },
    });

    if (!currentNode) {
      this.logger.error(
        `[createNonCadNode] 节点不存在或已被删除: ${context.nodeId}`
      );
      throw new Error(`节点不存在或已被删除: ${context.nodeId}`);
    }

    // 如果当前节点是文件夹，则直接使用它作为父节点
    // 如果当前节点是文件，则使用它的父节点
    const parentId = currentNode.isFolder
      ? currentNode.id
      : currentNode.parentId;

    this.logger.log(
      `开始创建非CAD文件系统节点: ${originalName}, 大小: ${fileSize}字节, 存储路径: ${accessPath}, currentNode=${currentNode.name} (${currentNode.id}, isFolder=${currentNode.isFolder}), parentId=${parentId}`
    );

    try {
      const fileNode = await this.prisma.fileSystemNode.create({
        data: {
          name: originalName,
          isFolder: false,
          isRoot: false,
          parentId: parentId,
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

      this.logger.log(
        `非CAD文件系统节点创建成功: ${originalName} (${fileHash}), 节点ID: ${fileNode.id}`
      );
    } catch (error) {
      this.logger.error(
        `创建非CAD文件系统节点失败: ${originalName} (${fileHash}): ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 检查用户是否有项目访问权限
   */
  async checkProjectPermission(
    projectId: string,
    userId: string,
    userRole: string
  ): Promise<boolean> {
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
  async inferContextForMxCadApp(
    fileHash: string,
    request: any
  ): Promise<FileSystemNodeContext | null> {
    try {
      this.logger.log(`🔍 为文件哈希 ${fileHash} 推断 MxCAD-App 上下文`);

      // 1. 获取用户信息
      const user = await this.getUserFromRequest(request);
      if (!user) {
        this.logger.error(`❌ 无法找到有效用户，无法推断上下文`);
        return null;
      }

      // 2. 查找项目信息
      const projectInfo = await this.findProjectInfo(fileHash, user);

      // 3. 如果没有项目，创建默认项目
      const projectId =
        projectInfo.projectId || (await this.createDefaultProject(user));

      // 4. 创建上下文
      const context = {
        nodeId: projectInfo.parentId || projectId,
        userId: user.id,
        userRole: user.role,
      };

      this.logger.log(
        `🎯 推断上下文完成: nodeId=${context.nodeId}, userId=${context.userId}`
      );
      return context;
    } catch (error) {
      this.logger.error(
        `❌ 推断 MxCAD-App 上下文失败: ${error.message}`,
        error
      );
      return null;
    }
  }

  /**
   * 从请求中获取用户信息
   */
  private async getUserFromRequest(request: any): Promise<any | null> {
    // 1. 尝试从 Session 获取用户信息
    let user = request.session?.user;

    // 2. 如果没有 Session 用户，查找最近活动用户
    if (!user) {
      const recentToken = await this.prisma.refreshToken.findFirst({
        orderBy: { createdAt: 'desc' },
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

    return user;
  }

  /**
   * 查找项目信息
   */
  private async findProjectInfo(
    fileHash: string,
    user: any
  ): Promise<{ projectId: string | null; parentId: string | null }> {
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
      this.logger.log(
        `📁 找到现有文件节点: ${existingFile.id}, 父节点: ${fileParentId}`
      );

      // 向上查找项目根节点
      const foundProjectId = await this.findProjectRootId(
        existingFile.parentId
      );
      this.logger.log(
        `📋 从现有文件推断节点: projectId=${foundProjectId}, parentId=${fileParentId}`
      );
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
        orderBy: { createdAt: 'asc' },
      });

      if (userAccess && userAccess.node.isRoot) {
        projectId = userAccess.nodeId;
        parentId = projectId; // 上传到项目根目录
        this.logger.log(
          '✅ 使用用户默认项目: projectId=' +
            projectId +
            ' (' +
            userAccess.node.name +
            ')'
        );
      } else {
        this.logger.log(`⚠️ 用户没有有效的项目，将创建默认项目`);
      }
    }

    return { projectId, parentId };
  }

  /**
   * 向上查找项目根节点ID
   */
  private async findProjectRootId(
    parentId: string | null
  ): Promise<string | null> {
    let currentNodeId = parentId;
    let foundProjectId: string | null = null;

    while (currentNodeId) {
      const parentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: currentNodeId },
        select: { id: true, isRoot: true, parentId: true, name: true },
      });

      if (parentNode?.isRoot) {
        foundProjectId = parentNode.id;
        this.logger.log(
          `📍 找到项目根节点: ${foundProjectId} (${parentNode.name})`
        );
        break;
      }

      currentNodeId = parentNode?.parentId || null;
    }

    return foundProjectId;
  }

  /**
   * 创建默认项目
   */
  private async createDefaultProject(user: any): Promise<string> {
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
      this.logger.log(
        `📂 使用现有的默认项目: projectId=${existingDefaultProject.id}`
      );
      return existingDefaultProject.id;
    }

    // 创建新的默认项目
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

    this.logger.log(
      `🆕 创建默认项目成功: projectId=${defaultProject.id} (${defaultProject.name})`
    );
    return defaultProject.id;
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
    const { name, accessPath, size, mimeType, extension, fileHash, context } =
      options;

    // 获取 nodeId 对应的节点信息
    const currentNode = await tx.fileSystemNode.findUnique({
      where: { id: context.nodeId, deletedAt: null },
      select: { id: true, name: true, parentId: true, isFolder: true },
    });

    if (!currentNode) {
      this.logger.error(
        `[createNewNode] 节点不存在或已被删除: ${context.nodeId}`
      );
      throw new Error(`节点不存在或已被删除: ${context.nodeId}`);
    }

    // 如果当前节点是文件夹，则直接使用它作为父节点
    // 如果当前节点是文件，则使用它的父节点
    const parentId = currentNode.isFolder
      ? currentNode.id
      : currentNode.parentId;

    this.logger.log(
      `[createNewNode] 创建新节点: name=${name}, currentNode=${currentNode.name} (${currentNode.id}, isFolder=${currentNode.isFolder}), parentId=${parentId}`
    );

    const fileNode = await tx.fileSystemNode.create({
      data: {
        name,
        isFolder: false,
        isRoot: false,
        parentId: parentId,
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

    this.logger.log(
      `✅ 新节点创建成功，ID: ${fileNode.id}, parentId: ${fileNode.parentId}`
    );
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
    const nameWithoutExt = originalName.substring(
      0,
      originalName.lastIndexOf('.')
    );
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
    let nameFound = false;
    let newName = originalName;

    while (!nameFound) {
      newName = `${nameWithoutExt} (${counter})${extension}`;
      const exists = await tx.fileSystemNode.findFirst({
        where: {
          parentId,
          name: newName,
        },
      });
      if (!exists) {
        nameFound = true;
      }
      counter++;
    }

    return newName;
  }

  private async handleExistingNode(
    tx: any,
    existingNode: any,
    originalName: string,
    context: FileSystemNodeContext
  ): Promise<void> {
    // 获取 nodeId 对应的节点信息
    const currentNode = await tx.fileSystemNode.findUnique({
      where: { id: context.nodeId, deletedAt: null },
      select: { id: true, name: true, parentId: true, isFolder: true },
    });

    if (!currentNode) {
      this.logger.error(
        `[handleExistingNode] 节点不存在或已被删除: ${context.nodeId}`
      );
      throw new Error(`节点不存在或已被删除: ${context.nodeId}`);
    }

    // 如果当前节点是文件夹，则直接使用它作为父节点
    // 如果当前节点是文件，则使用它的父节点
    const targetParentId = currentNode.isFolder
      ? currentNode.id
      : currentNode.parentId;

    this.logger.log(
      `[handleExistingNode] 处理现有节点: originalName=${originalName}, currentNode=${currentNode.name} (${currentNode.id}, isFolder=${currentNode.isFolder}), targetParentId=${targetParentId}, existingNodeId=${existingNode.id}, fileHash=${existingNode.fileHash}`
    );

    // 检查是否在当前目录下已存在相同哈希值的文件
    // 如果存在，说明文件已经上传过了，直接返回
    const existingFileWithSameHash = await tx.fileSystemNode.findFirst({
      where: {
        parentId: targetParentId,
        fileHash: existingNode.fileHash, // 检查哈希值而不是文件名
        ownerId: context.userId,
      },
    });

    if (existingFileWithSameHash) {
      this.logger.log(
        `[handleExistingNode] 相同哈希值的文件已存在于当前目录: ID=${existingFileWithSameHash.id}, 不创建新节点`
      );
      return; // 文件已存在，无需重复创建
    }

    // 文件在存储中存在，但当前目录下没有相同哈希值的文件
    // 需要创建新的文件节点，并处理同名文件情况
    this.logger.log(
      `[handleExistingNode] 文件在存储中存在，当前目录没有相同文件，创建新节点...`
    );

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

    this.logger.log(
      `[handleExistingNode] 当前目录检查: ${existingInTarget ? `找到同名文件 ID=${existingInTarget.id}` : '无同名文件'}`
    );
    this.logger.log(
      `[handleExistingNode] 使用文件名: ${uniqueName}, targetParentId=${targetParentId}`
    );

    // 创建新节点（引用现有存储路径，节省空间）
    this.logger.log(`[handleExistingNode] 开始创建引用节点...`);

    // 检查父节点是否存在
    const parentExists = await tx.fileSystemNode.findUnique({
      where: { id: targetParentId, deletedAt: null },
      select: { id: true, name: true, isFolder: true },
    });

    if (!parentExists) {
      this.logger.error(
        `[handleExistingNode] 父节点不存在或已被删除: ${targetParentId}`
      );
      throw new Error(`父节点不存在或已被删除: ${targetParentId}`);
    }

    this.logger.log(
      `[handleExistingNode] 父节点存在: ${parentExists.name} (${parentExists.id})`
    );

    const newNode = await tx.fileSystemNode.create({
      data: {
        name: uniqueName,
        isFolder: false,
        isRoot: false,
        parentId: targetParentId,
        originalName: uniqueName,
        path: existingNode.path, // 共享存储路径
        size: existingNode.size,
        mimeType: existingNode.mimeType,
        extension: existingNode.extension,
        fileStatus: FileStatus.COMPLETED,
        fileHash: existingNode.fileHash,
        ownerId: context.userId,
      },
    });
    this.logger.log(
      `✅ 引用节点创建成功，ID: ${newNode.id}, parentId: ${newNode.parentId}, 共享存储: ${existingNode.path}`
    );
  }

  /**
   * 根据文件哈希值查找文件节点
   * @param fileHash 文件哈希值
   * @returns 文件节点，如果不存在则返回 null
   */
  async findByFileHash(fileHash: string): Promise<any | null> {
    try {
      const node = await this.prisma.fileSystemNode.findFirst({
        where: { fileHash },
      });

      return node;
    } catch (error) {
      this.logger.error(
        `根据文件哈希查找节点失败: ${error.message}`,
        error.stack
      );
      return null;
    }
  }

  /**
   * 根据存储路径查找节点（用于路径转换）
   * @param storagePath MinIO 存储路径
   * @returns 节点或 null
   */
  async findByPath(storagePath: string): Promise<any | null> {
    try {
      const node = await this.prisma.fileSystemNode.findFirst({
        where: {
          path: storagePath,
          isFolder: false,
        },
        select: {
          id: true,
          name: true,
          fileHash: true,
          path: true,
        },
      });

      return node;
    } catch (error) {
      this.logger.error(
        `根据存储路径查找节点失败: ${error.message}`,
        error.stack
      );
      return null;
    }
  }

  /**
   * 更新文件节点的外部参照信息
   * @param nodeId 节点ID
   * @param hasMissing 是否有缺失的外部参照
   * @param missingCount 缺失的外部参照数量
   * @param references 外部参照列表
   */
  async updateExternalReferenceInfo(
    nodeId: string,
    hasMissing: boolean,
    missingCount: number,
    references: any[]
  ): Promise<void> {
    try {
      await this.prisma.fileSystemNode.update({
        where: { id: nodeId },
        data: {
          hasMissingExternalReferences: hasMissing,
          missingExternalReferencesCount: missingCount,
          externalReferencesJson: JSON.stringify(references),
        },
      });

      this.logger.log(
        `更新外部参照信息成功: nodeId=${nodeId}, 缺失数量=${missingCount}`
      );
    } catch (error) {
      this.logger.error(`更新外部参照信息失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
