import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Head,
  Body,
  Res,
  Logger,
  UseGuards,
  Req,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GalleryService } from './gallery.service';
import { GalleryFileListDto, AddToGalleryDto, GalleryTypesResponseDto } from './dto/gallery.dto';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../common/services/storage-manager.service';
import { FileSystemPermissionService } from '../file-system/file-system-permission.service';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 图库控制器
 */
@ApiTags('图库管理')
@ApiBearerAuth()
@Controller('gallery')
@UseGuards(JwtAuthGuard)
export class GalleryController {
  private readonly logger = new Logger(GalleryController.name);

  constructor(
    private readonly galleryService: GalleryService,
    private readonly database: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly storageManager: StorageManager,
    private readonly permissionService: FileSystemPermissionService
  ) {}

  /**
   * 获取图纸库分类列表
   * 路由: POST /gallery/drawings/types
   */
  @Post('drawings/types')
  @ApiOperation({
    summary: '获取图纸库分类列表',
    description: '获取图纸库的所有分类信息',
  })
  @ApiResponse({
    status: 201,
    description: '返回分类列表',
    type: GalleryTypesResponseDto,
  })
  async getDrawingsTypes(@Req() req: any) {
    this.logger.log('[getDrawingsTypes] 获取图纸库分类列表');

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    return this.galleryService.getTypes('drawings', userId);
  }

  /**
   * 获取图纸列表
   * 路由: POST /gallery/drawings/filelist
   */
  @Post('drawings/filelist')
  @ApiOperation({
    summary: '获取图纸列表',
    description: '根据条件查询图纸列表，支持分页',
  })
  async getDrawingsFileList(
    @Req() req: any,
    @Body() dto: GalleryFileListDto
  ) {
    this.logger.log(`[getDrawingsFileList] 参数: ${JSON.stringify(dto)}`);

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    return this.galleryService.getFileList(dto, 'drawings', userId);
  }

  /**
   * 获取图块库分类列表
   * 路由: POST /gallery/blocks/types
   */
  @Post('blocks/types')
  @ApiOperation({
    summary: '获取图块库分类列表',
    description: '获取图块库的所有分类信息',
  })
  @ApiResponse({
    status: 201,
    description: '返回分类列表',
    type: GalleryTypesResponseDto,
  })
  async getBlocksTypes(@Req() req: any) {
    this.logger.log('[getBlocksTypes] 获取图块库分类列表');

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    return this.galleryService.getTypes('blocks', userId);
  }

  /**
   * 获取图块列表
   * 路由: POST /gallery/blocks/filelist
   */
  @Post('blocks/filelist')
  @ApiOperation({
    summary: '获取图块列表',
    description: '根据条件查询图块列表，支持分页',
  })
  async getBlocksFileList(
    @Req() req: any,
    @Body() dto: GalleryFileListDto
  ) {
    this.logger.log(`[getBlocksFileList] 参数: ${JSON.stringify(dto)}`);

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    return this.galleryService.getFileList(dto, 'blocks', userId);
  }

  /**
   * 访问图块文件 (.mxweb)
   * 路由: GET /gallery/blocks/{secondType}/{firstType}/{nodeId}.mxweb
   *
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @returns 返回文件流或错误信息
   */
  @Get('blocks/*path')
  @ApiOperation({
    summary: '访问图块文件',
    description: '获取图块库中的转换后文件（.mxweb）',
  })
  @ApiResponse({
    status: 200,
    description: '成功获取文件',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: '未授权',
  })
  @ApiResponse({
    status: 404,
    description: '文件不存在',
  })
  async getBlocksFile(@Res() res: Response, @Req() req: any) {
    return this.handleGalleryFileRequest(req, res, 'blocks');
  }

  /**
   * 访问图纸文件 (.mxweb)
   * 路由: GET /gallery/drawings/{secondType}/{firstType}/{nodeId}.mxweb
   *
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @returns 返回文件流或错误信息
   */
  @Get('drawings/*path')
  @ApiOperation({
    summary: '访问图纸文件',
    description: '获取图纸库中的转换后文件（.mxweb）',
  })
  @ApiResponse({
    status: 200,
    description: '成功获取文件',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: '未授权',
  })
  @ApiResponse({
    status: 404,
    description: '文件不存在',
  })
  async getDrawingsFile(@Res() res: Response, @Req() req: any) {
    return this.handleGalleryFileRequest(req, res, 'drawings');
  }

  /**
   * 访问图块文件 (.mxweb) - HEAD 方法
   * 路由: HEAD /gallery/blocks/{secondType}/{firstType}/{nodeId}.mxweb
   *
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @returns 返回文件头信息或错误信息
   */
  @Head('blocks/*path')
  @ApiOperation({
    summary: '获取图块文件信息',
    description: '获取图块库中转换后文件的元信息（不返回文件内容）',
  })
  @ApiResponse({
    status: 200,
    description: '成功获取文件信息',
  })
  @ApiResponse({
    status: 401,
    description: '未授权',
  })
  @ApiResponse({
    status: 404,
    description: '文件不存在',
  })
  async getBlocksFileHead(@Res() res: Response, @Req() req: any) {
    return this.handleGalleryFileRequest(req, res, 'blocks', true);
  }

  /**
   * 访问图纸文件 (.mxweb) - HEAD 方法
   * 路由: HEAD /gallery/drawings/{secondType}/{firstType}/{nodeId}.mxweb
   *
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @returns 返回文件头信息或错误信息
   */
  @Head('drawings/*path')
  @ApiOperation({
    summary: '获取图纸文件信息',
    description: '获取图纸库中转换后文件的元信息（不返回文件内容）',
  })
  @ApiResponse({
    status: 200,
    description: '成功获取文件信息',
  })
  @ApiResponse({
    status: 401,
    description: '未授权',
  })
  @ApiResponse({
    status: 404,
    description: '文件不存在',
  })
  async getDrawingsFileHead(@Res() res: Response, @Req() req: any) {
    return this.handleGalleryFileRequest(req, res, 'drawings', true);
  }

  /**
   * 创建分类
   * 路由: POST /gallery/{galleryType}/types/create
   */
  @Post(':galleryType/types/create')
  @ApiOperation({
    summary: '创建分类',
    description: '创建图库分类（一级或二级）',
  })
  @ApiResponse({
    status: 200,
    description: '创建成功',
  })
  @UseGuards(JwtAuthGuard)
  async createType(
    @Param('galleryType') galleryType: string,
    @Req() req: any,
    @Body() body: { name: string; pid: number }
  ) {
    this.logger.log(
      `[createType] 创建分类: ${galleryType}, ${JSON.stringify(body)}`
    );

    // 验证图库类型
    if (galleryType !== 'drawings' && galleryType !== 'blocks') {
      throw new InternalServerErrorException('无效的图库类型');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    return this.galleryService.createType(
      galleryType as 'drawings' | 'blocks',
      body.name,
      body.pid || 0,
      userId
    );
  }

  /**
   * 更新分类
   * 路由: PUT /gallery/{galleryType}/types/:typeId
   */
  @Put(':galleryType/types/:typeId')
  @ApiOperation({
    summary: '更新分类',
    description: '更新图库分类名称',
  })
  @ApiResponse({
    status: 200,
    description: '更新成功',
  })
  @UseGuards(JwtAuthGuard)
  async updateType(
    @Param('galleryType') galleryType: string,
    @Param('typeId', ParseIntPipe) typeId: number,
    @Req() req: any,
    @Body() body: { name: string }
  ) {
    this.logger.log(
      `[updateType] 更新分类: ${galleryType}, typeId: ${typeId}, ${JSON.stringify(body)}`
    );

    // 验证图库类型
    if (galleryType !== 'drawings' && galleryType !== 'blocks') {
      throw new InternalServerErrorException('无效的图库类型');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    return this.galleryService.updateType(
      typeId,
      body.name,
      galleryType as 'drawings' | 'blocks',
      userId
    );
  }

  /**
   * 删除分类
   * 路由: DELETE /gallery/{galleryType}/types/:typeId
   */
  @Delete(':galleryType/types/:typeId')
  @ApiOperation({
    summary: '删除分类',
    description: '删除图库分类',
  })
  @ApiResponse({
    status: 200,
    description: '删除成功',
  })
  @UseGuards(JwtAuthGuard)
  async deleteType(
    @Param('galleryType') galleryType: string,
    @Param('typeId', ParseIntPipe) typeId: number,
    @Req() req: any
  ) {
    this.logger.log(`[deleteType] 删除分类: ${galleryType}, typeId: ${typeId}`);

    // 验证图库类型
    if (galleryType !== 'drawings' && galleryType !== 'blocks') {
      throw new InternalServerErrorException('无效的图库类型');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    await this.galleryService.deleteType(
      typeId,
      galleryType as 'drawings' | 'blocks',
      userId
    );

    return { message: '删除成功' };
  }

  /**
   * 添加文件到图库
   * 路由: POST /gallery/{galleryType}/items
   */
  @Post(':galleryType/items')
  @RequirePermissions([ProjectPermission.GALLERY_ADD])
  @ApiOperation({
    summary: '添加文件到图库',
    description: '将项目文件添加到图库',
  })
  @ApiResponse({
    status: 200,
    description: '添加成功',
  })
  async addToGallery(
    @Param('galleryType') galleryType: string,
    @Req() req: any,
    @Body() body: AddToGalleryDto
  ) {
    this.logger.log(
      `[addToGallery] 添加文件到图库: ${galleryType}, nodeId=${body.nodeId}, firstType=${body.firstType}, secondType=${body.secondType}`
    );

    // 验证图库类型
    if (galleryType !== 'drawings' && galleryType !== 'blocks') {
      throw new InternalServerErrorException('无效的图库类型');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    return this.galleryService.addToGallery(
      body.nodeId,
      body.firstType,
      body.secondType,
      body.thirdType,
      galleryType as 'drawings' | 'blocks',
      userId
    );
  }

  /**
   * 从图库中移除文件
   * 路由: DELETE /gallery/{galleryType}/items/:nodeId
   */
  @Delete(':galleryType/items/:nodeId')
  @ApiOperation({
    summary: '从图库中移除文件',
    description: '将文件从图库中移除（文件本身不会被删除）',
  })
  @ApiResponse({
    status: 200,
    description: '移除成功',
  })
  async removeFromGallery(
    @Param('galleryType') galleryType: string,
    @Param('nodeId') nodeId: string,
    @Req() req: any
  ) {
    this.logger.log(
      `[removeFromGallery] 从图库移除文件: ${galleryType}, nodeId: ${nodeId}`
    );

    // 验证图库类型
    if (galleryType !== 'drawings' && galleryType !== 'blocks') {
      throw new InternalServerErrorException('无效的图库类型');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    await this.galleryService.removeFromGallery(
      nodeId,
      galleryType as 'drawings' | 'blocks',
      userId
    );

    return { message: '已从图库中移除' };
  }

  /**
   * 更新图库文件的分类
   * 路由: PUT /gallery/{galleryType}/items/:nodeId
   */
  @Put(':galleryType/items/:nodeId')
  @ApiOperation({
    summary: '更新图库文件的分类',
    description: '更新图库文件的分类信息',
  })
  @ApiResponse({
    status: 200,
    description: '更新成功',
  })
  async updateGalleryItem(
    @Param('galleryType') galleryType: string,
    @Param('nodeId') nodeId: string,
    @Req() req: any,
    @Body() body: { firstType: number; secondType: number; thirdType?: number }
  ) {
    this.logger.log(
      `[updateGalleryItem] 更新图库文件分类: ${galleryType}, nodeId: ${nodeId}, ${JSON.stringify(body)}`
    );

    // 验证图库类型
    if (galleryType !== 'drawings' && galleryType !== 'blocks') {
      throw new InternalServerErrorException('无效的图库类型');
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new InternalServerErrorException('用户 ID 不存在');
    }

    return this.galleryService.updateGalleryItem(
      nodeId,
      body.firstType,
      body.secondType,
      body.thirdType,
      galleryType as 'drawings' | 'blocks',
      userId
    );
  }

  /**
   * 查找项目根节点
   * @param nodeId 文件节点 ID
   * @returns 项目根节点或 null
   */
  private async findProjectRoot(nodeId: string): Promise<any> {
    try {
      let currentNode = await this.database.fileSystemNode.findUnique({
        where: { id: nodeId },
      });

      if (!currentNode) {
        return null;
      }

      // 向上遍历，找到项目根节点（isRoot = true）
      while (currentNode && !currentNode.isRoot && currentNode.parentId) {
        currentNode = await this.database.fileSystemNode.findUnique({
          where: { id: currentNode.parentId },
        });
      }

      // 如果是项目根节点，返回它
      if (currentNode && currentNode.isRoot) {
        return currentNode;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `[findProjectRoot] 查找项目根节点失败: ${error.message}`,
        error
      );
      return null;
    }
  }

  /**
   * 处理图库文件访问请求
   * 复用 MxCadController 的逻辑，验证权限并返回文件流
   *
   * @param req Express Request 对象
   * @param res Express Response 对象
   * @param galleryType 图库类型：'blocks' 或 'drawings'
   * @param isHeadRequest 是否为 HEAD 请求（默认 false）
   */
  private async handleGalleryFileRequest(
    req: any,
    res: Response,
    galleryType: 'blocks' | 'drawings',
    isHeadRequest: boolean = false
  ) {
    try {
      // 从 req.params.path 获取完整的路径（支持多层路径）
      const pathArray = req.params.path;
      const filename = Array.isArray(pathArray)
        ? pathArray.join('/')
        : pathArray || '';

      if (!filename) {
        this.logger.error(
          `[handleGalleryFileRequest] 无法获取文件路径，req.params: ${JSON.stringify(req.params)}`
        );
        return res.status(400).json({ code: -1, message: '无效的文件路径' });
      }

      this.logger.log(
        `[handleGalleryFileRequest] 访问${galleryType}文件: ${filename}`
      );

      // 获取用户 ID（从 JWT token）
      const userId = req.user?.id;
      if (!userId) {
        this.logger.warn('[handleGalleryFileRequest] 用户 ID 不存在');
        return res.status(401).json({ code: -1, message: 'Unauthorized' });
      }

      // 从路径中提取节点 ID
      // 路径格式: {secondType}/{firstType}/{nodeId}[/{extraPath}]
      // pathParts[0] = secondType
      // pathParts[1] = firstType
      // pathParts[2] = nodeId
      // pathParts[3...] = 额外路径（如果有）
      let pathParts = filename.split('/');
      if (pathParts.length < 3) {
        this.logger.error(
          `[handleGalleryFileRequest] 路径格式错误: ${filename}`
        );
        return res.status(400).json({ code: -1, message: '无效的文件路径' });
      }

      // URL 解码（处理中文文件名等特殊字符）
      pathParts = pathParts.map((part) => decodeURIComponent(part));

      // 第三位（索引2）是 nodeId（需要去除扩展名）
      const nodeId = path.basename(pathParts[2], path.extname(pathParts[2]));

      // 提取文件扩展名（最后一个元素）
      const nodeIdPart = pathParts[pathParts.length - 1];
      const fileExtension = path.extname(nodeIdPart).toLowerCase();

      // 判断是否是主文件（文件名是 nodeId.xxx）
      const lastFileName = path.basename(nodeIdPart);
      const nodeIdFromFile = path.basename(
        nodeIdPart,
        path.extname(nodeIdPart)
      );
      const isMainFile = nodeIdFromFile === nodeId;

      this.logger.log(
        `[handleGalleryFileRequest] 提取的 nodeId: ${nodeId}, 扩展名: ${fileExtension}, 文件名: ${nodeIdFromFile}, 是否主文件: ${isMainFile}`
      );

      // 如果是缩略图请求（主文件且文件名为 nodeId.jpg），使用缩略图处理逻辑
      if (
        isMainFile &&
        fileExtension === '.jpg' &&
        lastFileName === `${nodeId}.jpg`
      ) {
        this.logger.log(
          `[handleGalleryFileRequest] 检测到缩略图请求，调用 handleThumbnailRequest`
        );
        return this.handleThumbnailRequest(
          req,
          res,
          galleryType,
          nodeId,
          isHeadRequest
        );
      }

      // 通过节点 ID 查找节点，验证用户是否有访问权限
      const node = await this.database.fileSystemNode.findFirst({
        where: {
          id: nodeId,
          isFolder: false,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          parentId: true,
          isRoot: true,
          path: true,
        },
      });

      this.logger.log(
        `[handleGalleryFileRequest] 查找文件节点: nodeId=${nodeId}, 找到=${node ? '是' : '否'}`
      );

      if (!node) {
        this.logger.warn(
          `[handleGalleryFileRequest] 文件节点不存在: ${nodeId}`
        );
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }

      // 检查用户是否有权限
      const role = await this.permissionService.getNodeAccessRole(
        userId,
        node.id
      );
      const hasPermission = role !== null;

      this.logger.log(
        `[handleGalleryFileRequest] 权限检查结果: userId=${userId}, hasPermission=${hasPermission}, 角色: ${role}`
      );

      if (!hasPermission) {
        return res.status(401).json({
          code: -1,
          message: 'Unauthorized',
        });
      }

      let foundFilePath: string | null = null;

      // 从 filesData 目录查找文件
      if (node.path) {
        try {
          // 获取节点目录的完整路径（node.path 包含文件名，需要提取目录）
          const nodeFullPath = this.storageManager.getFullPath(node.path);
          const nodeDir = path.dirname(nodeFullPath);

          if (isMainFile) {
            // 主文件：尝试多种格式
            const possibleFileNames = [
              `${nodeId}.dwg.mxweb`,
              `${nodeId}.dxf.mxweb`,
              `${nodeId}.mxweb`,
            ];

            // 尝试在节点目录中查找文件
            for (const fileName of possibleFileNames) {
              const targetPath = path.join(nodeDir, fileName);
              if (fs.existsSync(targetPath)) {
                foundFilePath = targetPath;
                this.logger.log(
                  `[handleGalleryFileRequest] 找到主文件: ${targetPath}`
                );
                break;
              }
            }
          } else {
            // 外部参照文件：拼接额外路径
            if (pathParts.length > 3) {
              const extraPath = pathParts.slice(3).join('/');
              foundFilePath = path.join(nodeDir, extraPath);
              this.logger.log(
                `[handleGalleryFileRequest] 外部参照文件路径: ${foundFilePath}`
              );
            }
          }
        } catch (error) {
          this.logger.error(
            `[handleGalleryFileRequest] 从 filesData 目录查找失败: ${error.message}`,
            error
          );
        }
      }

      // 如果找到文件，直接返回
      if (foundFilePath) {
        try {
          const stats = fs.statSync(foundFilePath);

          // 检查路径是否是目录
          if (stats.isDirectory()) {
            this.logger.warn(
              `[handleGalleryFileRequest] 路径是目录而非文件: ${foundFilePath}`
            );
            return res.status(404).json({ code: -1, message: '文件不存在' });
          }

          // 根据 Content-Disposition 中使用的文件名（使用原始文件名或节点 ID）
          const downloadFilename = isMainFile
            ? pathParts[pathParts.length - 1] // 主文件使用路径中的文件名
            : pathParts[pathParts.length - 1]; // 外部参照使用路径中的文件名

          // 对文件名进行 URL 编码（处理中文文件名）
          const encodedFilename = encodeURIComponent(downloadFilename);

          // 对于 HEAD 请求，只返回文件头信息
          if (isHeadRequest) {
            // 设置响应头（与 MxCAD 保持一致）
            res.setHeader(
              'Content-Type',
              isMainFile ? 'application/octet-stream' : 'image/jpeg'
            );
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Access-Control-Allow-Origin', '*');

            // HEAD 请求只返回头部信息
            res.end();
            return;
          } else {
            // GET 请求返回文件流
            const fileStream = fs.createReadStream(foundFilePath);

            // 只对主文件更新浏览次数
            if (isMainFile) {
              await this.galleryService.incrementLookNum(nodeId, galleryType);
            }

            // 设置响应头
            res.setHeader(
              'Content-Type',
              isMainFile ? 'application/octet-stream' : 'image/jpeg'
            );
            res.setHeader(
              'Content-Disposition',
              `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
            );

            // 返回文件流
            fileStream.pipe(res);

            fileStream.on('error', (error) => {
              this.logger.error(
                `[handleGalleryFileRequest] 本地文件流错误: ${error.message}`,
                error
              );
              if (!res.headersSent) {
                res.status(500).json({ code: -1, message: '获取文件失败' });
              }
            });

            return;
          }
        } catch (error) {
          this.logger.error(
            `[handleGalleryFileRequest] 获取本地文件失败: ${error.message}`,
            error
          );
          // 返回错误
          return res.status(500).json({ code: -1, message: '文件读取失败' });
        }
      }

      // 本地文件系统中未找到文件
      this.logger.warn(
        `[handleGalleryFileRequest] 本地文件系统未找到文件: ${nodeId}`
      );
      return res.status(404).json({ code: -1, message: '文件不存在' });
    } catch (error) {
      this.logger.error(
        `[handleGalleryFileRequest] 处理失败: ${error.message}`,
        error
      );
      if (!res.headersSent) {
        res.status(500).json({ code: -1, message: '服务器内部错误' });
      }
    }
  }

  /**
   * 处理缩略图请求
   * 支持 .jpg 缩略图的访问，用于图库中的缩略图显示
   *
   * @param req Express Request 对象
   * @param res Express Response 对象
   * @param galleryType 图库类型：'blocks' 或 'drawings'
   * @param nodeId 节点 ID
   * @param isHeadRequest 是否为 HEAD 请求（默认 false）
   */
  private async handleThumbnailRequest(
    req: any,
    res: Response,
    galleryType: 'blocks' | 'drawings',
    nodeId: string,
    isHeadRequest: boolean = false
  ) {
    try {
      this.logger.log(
        `[handleThumbnailRequest] 处理缩略图请求: galleryType=${galleryType}, nodeId=${nodeId}`
      );

      // 重新从路径中提取节点 ID（因为现在格式是 {secondType}/{firstType}/{nodeId}/{nodeId}.jpg）
      const pathArray = req.params.path;
      const filename = Array.isArray(pathArray)
        ? pathArray.join('/')
        : pathArray || '';

      const pathParts = filename.split('/');
      if (pathParts.length >= 2) {
        // 提取倒数第二个元素作为 nodeId
        const extractedNodeId = pathParts[pathParts.length - 2];
        const nodeIdPart = pathParts[pathParts.length - 1];
        const nodeIdFromFile = path.basename(
          nodeIdPart,
          path.extname(nodeIdPart)
        );

        if (extractedNodeId !== nodeIdFromFile) {
          this.logger.warn(
            `[handleThumbnailRequest] 路径中的 nodeId 不一致: ${extractedNodeId} vs ${nodeIdFromFile}`
          );
        }

        // 使用提取的 nodeId
        if (nodeId !== extractedNodeId) {
          this.logger.warn(
            `[handleThumbnailRequest] 传入的 nodeId 与路径提取的不一致: ${nodeId} vs ${extractedNodeId}`
          );
        }
      }

      // 获取用户 ID（从 JWT token）
      const userId = req.user?.id;
      if (!userId) {
        this.logger.warn('[handleThumbnailRequest] 用户 ID 不存在');
        return res.status(401).json({ code: -1, message: 'Unauthorized' });
      }

      // 通过节点 ID 查找节点，验证用户是否有访问权限
      const node = await this.database.fileSystemNode.findFirst({
        where: {
          id: nodeId,
          isFolder: false,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          parentId: true,
          isRoot: true,
          path: true,
        },
      });

      this.logger.log(
        `[handleThumbnailRequest] 查找文件节点: nodeId=${nodeId}, 找到=${node ? '是' : '否'}`
      );

      if (!node) {
        this.logger.warn(`[handleThumbnailRequest] 文件节点不存在: ${nodeId}`);
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }

      // 检查用户是否有权限
      const role = await this.permissionService.getNodeAccessRole(
        userId,
        node.id
      );
      const hasPermission = role !== null;

      this.logger.log(
        `[handleThumbnailRequest] 权限检查结果: userId=${userId}, hasPermission=${hasPermission}, 角色: ${role}`
      );

      if (!hasPermission) {
        return res.status(401).json({
          code: -1,
          message: 'Unauthorized',
        });
      }

      // 检查节点是否有 path 字段
      if (!node.path) {
        this.logger.warn(
          `[handleThumbnailRequest] 节点没有 path 字段: ${node.id}`
        );
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }

      // 从 filesData 目录读取缩略图（使用 StorageManager 获取完整路径）
      // 注意：node.path 包含文件名，需要先提取目录路径
      const nodeFullPath = this.storageManager.getFullPath(node.path);
      const nodeDir = path.dirname(nodeFullPath);
      const localThumbnailPath = path.join(nodeDir, 'thumbnail.jpg');

      // 检查文件是否存在
      if (fs.existsSync(localThumbnailPath)) {
        this.logger.log(
          `[handleThumbnailRequest] 缩略图存在于本地: ${localThumbnailPath}`
        );

        // 对于 HEAD 请求，只返回文件头信息
        if (isHeadRequest) {
          const stats = fs.statSync(localThumbnailPath);

          // 检查路径是否是目录
          if (stats.isDirectory()) {
            this.logger.warn(
              `[handleThumbnailRequest] 路径是目录而非文件: ${localThumbnailPath}`
            );
            return res.status(404).json({ code: -1, message: '缩略图不存在' });
          }

          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Content-Length', stats.size);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end();
          return;
        } else {
          // 检查路径是否是目录
          const stats = fs.statSync(localThumbnailPath);
          if (stats.isDirectory()) {
            this.logger.warn(
              `[handleThumbnailRequest] 路径是目录而非文件: ${localThumbnailPath}`
            );
            return res.status(404).json({ code: -1, message: '缩略图不存在' });
          }

          // GET 请求返回文件流
          const fileStream = fs.createReadStream(localThumbnailPath);

          // 设置响应头
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('Access-Control-Allow-Origin', '*');

          // 返回文件流
          fileStream.pipe(res);

          fileStream.on('error', (error) => {
            this.logger.error(
              `[handleThumbnailRequest] 本地文件流错误: ${error.message}`,
              error
            );
            if (!res.headersSent) {
              res.status(500).json({ code: -1, message: '获取缩略图失败' });
            }
          });

          return;
        }
      } else {
        this.logger.warn(`[handleThumbnailRequest] 缩略图不存在: ${nodeId}`);
        return res.status(404).json({ code: -1, message: '缩略图不存在' });
      }
    } catch (error) {
      this.logger.error(
        `[handleThumbnailRequest] 处理失败: ${error.message}`,
        error
      );
      if (!res.headersSent) {
        res.status(500).json({ code: -1, message: '服务器内部错误' });
      }
    }
  }
}
