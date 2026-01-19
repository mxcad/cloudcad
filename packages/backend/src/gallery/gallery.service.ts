import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  GalleryTypeDto,
  GalleryTypesResponseDto,
  GalleryFileListDto,
  GalleryFileListResponseDto,
  GalleryFileItemDto,
} from './dto/gallery.dto';

// 常量定义
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

/**
 * 图库服务
 * 基于独立的分类系统和文件系统实现图库功能
 */
@Injectable()
export class GalleryService {
  private readonly logger = new Logger(GalleryService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * 获取分类列表
   * @param galleryType 图库类型：'drawings'（图纸库）或 'blocks'（图块库）
   * @param userId 用户 ID（预留，当前未使用）
   * @returns 分类列表
   */
  async getTypes(
    galleryType: 'drawings' | 'blocks',
    userId: string
  ): Promise<GalleryTypesResponseDto> {
    this.logger.log(
      `[getTypes] 获取分类列表: ${galleryType}, userId: ${userId}`
    );

    // 查询所有一级分类（pid = 0）
    const firstLevelTypes = await this.database.galleryType.findMany({
      where: {
        pid: 0,
        status: 1,
        galleryType: galleryType,
        ownerId: userId,
      },
      orderBy: {
        id: 'asc',
      },
    });

    // 查询所有二级分类（pid != 0）
    const secondLevelTypes = await this.database.galleryType.findMany({
      where: {
        pid: {
          not: 0,
        },
        status: 1,
        galleryType: galleryType,
        ownerId: userId,
      },
      orderBy: {
        id: 'asc',
      },
    });

    // 构建分类列表
    const allblocks: GalleryTypeDto[] = [];

    // 添加一级分类
    for (const type of firstLevelTypes) {
      allblocks.push({
        id: type.id,
        pid: type.pid,
        name: type.name,
        pname: type.name,
        status: type.status,
      });
    }

    // 添加二级分类
    for (const type of secondLevelTypes) {
      // 查找父分类名称
      const parentType = firstLevelTypes.find((t) => t.id === type.pid);
      const pname = parentType ? parentType.name : type.name;

      allblocks.push({
        id: type.id,
        pid: type.pid,
        name: type.name,
        pname: pname,
        status: type.status,
      });
    }

    return {
      code: 'success',
      result: {
        allblocks,
      },
    };
  }

  /**
   * 获取文件列表
   * @param dto 查询参数
   * @param galleryType 图库类型：'drawings'（图纸库）或 'blocks'（图块库）
   * @param userId 用户 ID（用于判断收藏状态）
   * @returns 文件列表
   */
  async getFileList(
    dto: GalleryFileListDto,
    galleryType: 'drawings' | 'blocks',
    userId: string
  ): Promise<GalleryFileListResponseDto> {
    this.logger.log(
      `[getFileList] 获取文件列表: ${galleryType}, userId: ${userId}, 参数: ${JSON.stringify(dto)}`
    );

    // 参数类型转换和验证
    const keywords = dto.keywords || '';
    const firstType =
      typeof dto.firstType === 'string'
        ? parseInt(dto.firstType, 10)
        : dto.firstType || 0;

    // 分页参数验证
    const pageIndex = dto.pageIndex;
    let pageSize =
      typeof dto.pageSize === 'string'
        ? parseInt(dto.pageSize, 10)
        : dto.pageSize;

    // 边界检查
    if (pageSize < 1) {
      pageSize = DEFAULT_PAGE_SIZE;
    }
    if (pageSize > MAX_PAGE_SIZE) {
      pageSize = MAX_PAGE_SIZE;
    }

    // 如果 pageIndex 为 -1，设置为 0（兼容参考代码逻辑）
    const originalPageIndex = pageIndex;
    let effectivePageIndex = pageIndex;
    if (pageIndex === -1) {
      effectivePageIndex = 0;
    } else if (pageIndex < 0) {
      effectivePageIndex = 0;
    }

    // 构建查询条件（直接查询 FileSystemNode）
    const whereClause: any = {
      isInGallery: true,
      galleryType: galleryType,
      isFolder: false,
      deletedAt: null,
    };

    // 按一级分类筛选（galleryFirstType）
    if (firstType && firstType !== 0) {
      // 检查是否为二级分类（pid != 0）
      const type = await this.database.galleryType.findUnique({
        where: { id: firstType },
        select: { id: true, pid: true, galleryType: true },
      });

      if (type) {
        // 如果是二级分类，使用其父分类 ID
        if (type.pid !== 0) {
          this.logger.log(
            `[getFileList] firstType ${firstType} 是二级分类，使用父分类 ID ${type.pid} 进行查询`
          );
          whereClause.galleryFirstType = type.pid;
        } else {
          // 是一级分类，直接使用
          whereClause.galleryFirstType = firstType;
        }
      } else {
        // 分类不存在，使用原值（会导致返回空结果）
        whereClause.galleryFirstType = firstType;
      }
    }

    // 按二级分类筛选（gallerySecondType）
    if (dto.secondType && dto.secondType !== 0) {
      const secondTypeValue =
        typeof dto.secondType === 'string'
          ? parseInt(dto.secondType, 10)
          : dto.secondType;
      whereClause.gallerySecondType = secondTypeValue;
    }

    // 按三级分类筛选（galleryThirdType）
    if (
      dto.thirdType !== undefined &&
      dto.thirdType !== null &&
      dto.thirdType !== 0
    ) {
      const thirdTypeValue =
        typeof dto.thirdType === 'string'
          ? parseInt(dto.thirdType, 10)
          : dto.thirdType;
      whereClause.galleryThirdType = thirdTypeValue;
    }

    // 关键字搜索（通过文件名）
    if (keywords && keywords.trim()) {
      whereClause.OR = [
        { originalName: { contains: keywords, mode: 'insensitive' } },
        { name: { contains: keywords, mode: 'insensitive' } },
      ];
    }

    // 查询总数
    const count = await this.database.fileSystemNode.count({
      where: whereClause,
    });

    // 查询文件列表
    const skip =
      originalPageIndex === -1 ? 999999999 : effectivePageIndex * pageSize;

    const nodes = await this.database.fileSystemNode.findMany({
      where: whereClause,
      select: {
        id: true,
        originalName: true,
        name: true,
        fileHash: true,
        path: true,
        createdAt: true,
        galleryFirstType: true,
        gallerySecondType: true,
        galleryThirdType: true,
        galleryLookNum: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: skip,
      take: pageSize,
    });

    // 转换为 API 格式
    const sharedwgs = await Promise.all(
      nodes.map((node) => this.convertNodeToFileItem(node, userId))
    );

    // 计算分页信息
    const max = Math.ceil(count / pageSize);
    const page = {
      index: originalPageIndex,
      size: pageSize,
      count: count,
      max: max,
      up: originalPageIndex > 0,
      down: originalPageIndex < max - 1,
    };

    return {
      sharedwgs,
      page,
    };
  }

  /**
   * 将文件节点转换为 API 格式
   * @param node 文件节点
   * @param userId 用户 ID（用于判断收藏状态）
   * @returns API 格式的文件项
   */
  private async convertNodeToFileItem(
    node: {
      id: string;
      originalName: string | null;
      name: string;
      fileHash: string | null;
      path: string | null;
      createdAt: Date;
      galleryFirstType: number | null;
      gallerySecondType: number | null;
      galleryThirdType: number | null;
      galleryLookNum: number;
    },
    userId: string
  ): Promise<GalleryFileItemDto> {
    // 获取文件名
    const filename = node.originalName || node.name;

    // 提取文件哈希
    const filehash = node.fileHash || this.extractHashFromPath(node.path) || '';

    // 获取分类名称
    let typeName = '';
    if (node.gallerySecondType) {
      const type = await this.database.galleryType.findUnique({
        where: { id: node.gallerySecondType },
        select: { name: true },
      });
      typeName = type?.name || '';
    }

    return {
      uuid: node.id,
      filename: filename,
      firstType: node.galleryFirstType || 0,
      secondType: node.gallerySecondType || 0,
      filehash: filehash,
      type: typeName,
    };
  }

  /**
   * 从路径中提取文件哈希
   */
  private extractHashFromPath(path: string | null | undefined): string {
    if (!path) return '';

    // 示例路径: /mxcad/file/a1b2c3d4e5f6.../drawing.dwg.mxweb
    // 提取: a1b2c3d4e5f6...
    const match = path.match(/\/mxcad\/file\/([a-f0-9]+)\//);
    return match ? match[1] : '';
  }

  /**
   * 创建分类
   * @param galleryType 图库类型：'drawings'（图纸库）或 'blocks'（图块库）
   * @param name 分类名称
   * @param pid 父分类 ID，0 表示一级分类
   * @param userId 用户 ID
   * @returns 创建的分类
   */
  async createType(
    galleryType: 'drawings' | 'blocks',
    name: string,
    pid: number,
    userId: string
  ): Promise<GalleryTypeDto> {
    this.logger.log(
      `[createType] 创建分类: ${galleryType}, name: ${name}, pid: ${pid}, userId: ${userId}`
    );

    // 验证父分类是否存在
    if (pid !== 0) {
      const parentType = await this.database.galleryType.findUnique({
        where: { id: pid },
      });

      if (!parentType) {
        throw new Error('父分类不存在');
      }

      // 验证父分类是否属于当前用户
      if (parentType.ownerId !== userId) {
        throw new Error('父分类不存在');
      }

      if (parentType.galleryType !== galleryType) {
        throw new Error('父分类类型不匹配');
      }

      // 支持三级分类：父分类的 pid 不能是二级分类（即不能创建四级分类）
      if (parentType.pid !== 0) {
        // 检查父分类的父分类
        const grandParentType = await this.database.galleryType.findUnique({
          where: { id: parentType.pid },
        });

        if (grandParentType && grandParentType.pid !== 0) {
          throw new Error('不能创建四级分类');
        }
      }
    }
    // 检查分类名称是否重复
    const existingType = await this.database.galleryType.findFirst({
      where: {
        name,
        pid,
        galleryType,
        ownerId: userId,
      },
    });

    if (existingType) {
      throw new Error('分类名称已存在');
    }

    // 创建分类
    const newType = await this.database.galleryType.create({
      data: {
        name,
        pid,
        galleryType,
        status: 1,
        ownerId: userId,
      },
    });

    return {
      id: newType.id,
      pid: newType.pid,
      name: newType.name,
      pname:
        pid === 0
          ? newType.name
          : await this.getParentTypeName(newType.pid, galleryType, userId),
      status: newType.status,
    };
  }

  /**
   * 更新分类
   * @param typeId 分类 ID
   * @param name 新的分类名称
   * @param galleryType 图库类型
   * @param userId 用户 ID
   * @returns 更新后的分类
   */
  async updateType(
    typeId: number,
    name: string,
    galleryType: 'drawings' | 'blocks',
    userId: string
  ): Promise<GalleryTypeDto> {
    this.logger.log(
      `[updateType] 更新分类: typeId: ${typeId}, name: ${name}, galleryType: ${galleryType}, userId: ${userId}`
    );

    // 查找分类
    const existingType = await this.database.galleryType.findUnique({
      where: { id: typeId },
    });

    if (!existingType) {
      throw new Error('分类不存在');
    }

    // 验证分类是否属于当前用户
    if (existingType.ownerId !== userId) {
      throw new Error('分类不存在');
    }

    if (existingType.galleryType !== galleryType) {
      throw new Error('分类类型不匹配');
    }

    // 检查分类名称是否重复
    const duplicateType = await this.database.galleryType.findFirst({
      where: {
        name,
        pid: existingType.pid,
        galleryType,
        id: { not: typeId },
        ownerId: userId,
      },
    });

    if (duplicateType) {
      throw new Error('分类名称已存在');
    }

    // 更新分类
    const updatedType = await this.database.galleryType.update({
      where: { id: typeId },
      data: { name },
    });

    return {
      id: updatedType.id,
      pid: updatedType.pid,
      name: updatedType.name,
      pname:
        updatedType.pid === 0
          ? updatedType.name
          : await this.getParentTypeName(updatedType.pid, galleryType, userId),
      status: updatedType.status,
    };
  }

  /**
   * 删除分类
   * @param typeId 分类 ID
   * @param galleryType 图库类型
   * @param userId 用户 ID
   */
  async deleteType(
    typeId: number,
    galleryType: 'drawings' | 'blocks',
    userId: string
  ): Promise<void> {
    this.logger.log(
      `[deleteType] 删除分类: typeId: ${typeId}, galleryType: ${galleryType}, userId: ${userId}`
    );

    // 查找分类
    const existingType = await this.database.galleryType.findUnique({
      where: { id: typeId },
    });

    if (!existingType) {
      throw new Error('分类不存在');
    }

    // 验证分类是否属于当前用户
    if (existingType.ownerId !== userId) {
      throw new Error('分类不存在');
    }

    if (existingType.galleryType !== galleryType) {
      throw new Error('分类类型不匹配');
    }

    // 检查是否有子分类
    const childTypes = await this.database.galleryType.findMany({
      where: {
        pid: typeId,
        galleryType,
        ownerId: userId,
      },
    });

    if (childTypes.length > 0) {
      throw new Error('该分类下有子分类，无法删除');
    }

    // 检查是否有文件关联
    const relatedNodes = await this.database.fileSystemNode.findMany({
      where: {
        gallerySecondType: typeId,
        galleryType,
        isInGallery: true,
        ownerId: userId,
      },
    });

    if (relatedNodes.length > 0) {
      throw new Error('该分类下有文件，无法删除');
    }

    // 删除分类
    await this.database.galleryType.delete({
      where: { id: typeId },
    });
  }

  /**
   * 获取父分类名称
   * @param pid 父分类 ID
   * @param galleryType 图库类型
   * @param userId 用户 ID
   * @returns 父分类名称
   */
  private async getParentTypeName(
    pid: number,
    galleryType: 'drawings' | 'blocks',
    userId: string
  ): Promise<string> {
    if (pid === 0) {
      return '';
    }

    const parentType = await this.database.galleryType.findFirst({
      where: {
        id: pid,
        ownerId: userId,
      },
    });

    return parentType?.name || '';
  }

  /**
   * 增加浏览次数
   * @param fileHash 文件哈希值
   * @param galleryType 图库类型
   */
  async incrementLookNum(
    fileHash: string,
    galleryType: 'drawings' | 'blocks'
  ): Promise<void> {
    try {
      // 查找对应的 FileSystemNode
      const node = await this.database.fileSystemNode.findFirst({
        where: {
          fileHash: fileHash,
          isInGallery: true,
          galleryType: galleryType,
        },
      });

      if (!node) {
        this.logger.warn(
          `[incrementLookNum] 未找到图库文件: ${fileHash}, ${galleryType}`
        );
        return;
      }

      // 更新浏览次数
      await this.database.fileSystemNode.update({
        where: { id: node.id },
        data: { galleryLookNum: { increment: 1 } },
      });
    } catch (error) {
      this.logger.error(
        `[incrementLookNum] 更新浏览次数失败: ${error.message}`,
        error
      );
    }
  }

  /**
   * 添加文件到图库
   * @param nodeId 文件节点 ID
   * @param firstType 一级分类 ID
   * @param secondType 二级分类 ID
   * @param thirdType 三级分类 ID（可选）
   * @param galleryType 图库类型
   * @param userId 用户 ID
   * @returns 创建的图库项目
   */
  async addToGallery(
    nodeId: string,
    firstType: number,
    secondType: number,
    thirdType: number | undefined,
    galleryType: 'drawings' | 'blocks',
    userId: string
  ): Promise<any> {
    this.logger.log(
      `[addToGallery] 添加文件到图库: nodeId=${nodeId}, firstType=${firstType}, secondType=${secondType}, galleryType=${galleryType}, userId=${userId}`
    );

    // 验证文件节点存在且不是文件夹
    const node = await this.database.fileSystemNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      throw new Error('文件不存在');
    }

    if (node.isFolder) {
      throw new Error('不能添加文件夹到图库');
    }

    // 验证分类存在
    const type = await this.database.galleryType.findUnique({
      where: { id: secondType },
    });

    if (!type) {
      throw new Error('分类不存在');
    }

    if (type.galleryType !== galleryType) {
      throw new Error('分类类型不匹配');
    }

    // 验证一级分类存在且为一级分类（pid = 0）
    const firstTypeRecord = await this.database.galleryType.findUnique({
      where: { id: firstType },
    });

    if (!firstTypeRecord) {
      throw new Error('一级分类不存在');
    }

    if (firstTypeRecord.pid !== 0) {
      throw new Error('一级分类必须是顶级分类');
    }

    if (firstTypeRecord.galleryType !== galleryType) {
      throw new Error('一级分类类型不匹配');
    }

    // 验证二级分类属于一级分类
    if (type.pid !== firstType) {
      throw new Error('二级分类不属于选择的一级分类');
    }

    // 检查是否已经添加到图库
    if (node.isInGallery) {
      throw new Error('该文件已经在图库中');
    }

    // 更新文件节点的图库属性
    const updatedNode = await this.database.fileSystemNode.update({
      where: { id: nodeId },
      data: {
        isInGallery: true,
        galleryType: galleryType,
        galleryFirstType: firstType,
        gallerySecondType: secondType,
        galleryThirdType: thirdType,
        galleryLookNum: 0,
      },
    });

    return {
      id: updatedNode.id,
      nodeId: updatedNode.id,
      firstType: updatedNode.galleryFirstType,
      secondType: updatedNode.gallerySecondType,
      thirdType: updatedNode.galleryThirdType,
      galleryType: updatedNode.galleryType,
    };
  }

  /**
   * 从图库中移除文件
   * @param nodeId 文件节点 ID
   * @param galleryType 图库类型
   * @param userId 用户 ID
   */
  async removeFromGallery(
    nodeId: string,
    galleryType: 'drawings' | 'blocks',
    userId: string
  ): Promise<void> {
    this.logger.log(
      `[removeFromGallery] 从图库移除文件: nodeId=${nodeId}, galleryType=${galleryType}, userId=${userId}`
    );

    // 查找文件节点
    const node = await this.database.fileSystemNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      throw new Error('文件不存在');
    }

    if (!node.isInGallery) {
      throw new Error('文件不在图库中');
    }

    if (node.galleryType !== galleryType) {
      throw new Error('图库类型不匹配');
    }

    // 更新文件节点，清空图库属性
    await this.database.fileSystemNode.update({
      where: { id: nodeId },
      data: {
        isInGallery: false,
        galleryType: null,
        galleryFirstType: null,
        gallerySecondType: null,
        galleryThirdType: null,
      },
    });

    this.logger.log(`[removeFromGallery] 成功从图库移除文件: nodeId=${nodeId}`);
  }

  /**
   * 更新图库文件的分类
   * @param nodeId 文件节点 ID
   * @param firstType 一级分类 ID
   * @param secondType 二级分类 ID
   * @param thirdType 三级分类 ID（可选）
   * @param galleryType 图库类型
   * @param userId 用户 ID
   * @returns 更新后的图库项目
   */
  async updateGalleryItem(
    nodeId: string,
    firstType: number,
    secondType: number,
    thirdType: number | undefined,
    galleryType: 'drawings' | 'blocks',
    userId: string
  ): Promise<any> {
    this.logger.log(
      `[updateGalleryItem] 更新图库文件分类: nodeId=${nodeId}, firstType=${firstType}, secondType=${secondType}, galleryType=${galleryType}, userId=${userId}`
    );

    // 查找文件节点
    const node = await this.database.fileSystemNode.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      throw new Error('文件不存在');
    }

    if (!node.isInGallery) {
      throw new Error('文件不在图库中');
    }

    if (node.galleryType !== galleryType) {
      throw new Error('图库类型不匹配');
    }

    // 验证分类存在
    const type = await this.database.galleryType.findUnique({
      where: { id: secondType },
    });

    if (!type) {
      throw new Error('分类不存在');
    }

    if (type.galleryType !== galleryType) {
      throw new Error('分类类型不匹配');
    }

    // 更新文件节点的分类
    const updatedNode = await this.database.fileSystemNode.update({
      where: { id: nodeId },
      data: {
        galleryFirstType: firstType,
        gallerySecondType: secondType,
        galleryThirdType: thirdType,
      },
    });

    return {
      id: updatedNode.id,
      nodeId: updatedNode.id,
      firstType: updatedNode.galleryFirstType,
      secondType: updatedNode.gallerySecondType,
      thirdType: updatedNode.galleryThirdType,
      galleryType: updatedNode.galleryType,
    };
  }
}
