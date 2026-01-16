import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Res,
  Logger,
  UseGuards,
  Req,
  InternalServerErrorException,
  Inject,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GalleryService } from './gallery.service';
import { GalleryFileListDto, AddToGalleryDto } from './dto/gallery.dto';
import { DatabaseService } from '../database/database.service';
import { MinioSyncService } from '../mxcad/minio-sync.service';
import * as path from 'path';

/**
 * 图库控制器
 * 绕过全局响应包装，直接返回原始 JSON 格式
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
    @Inject(MinioSyncService) private readonly minioSyncService: MinioSyncService,
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
  async getDrawingsTypes(@Req() req: any, @Res() res: Response) {
    try {
      this.logger.log('[getDrawingsTypes] 获取图纸库分类列表');

      const userId = req.user?.id;
      if (!userId) {
        throw new InternalServerErrorException('用户 ID 不存在');
      }

      const result = await this.galleryService.getTypes('drawings', userId);

      // 绕过全局响应包装，直接返回原始 JSON 格式
      return res.status(200).json(result);
    } catch (error) {
      this.logger.error('[getDrawingsTypes] 错误:', error);
      throw error;
    }
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
    @Body() dto: GalleryFileListDto,
    @Res() res: Response
  ) {
    try {
      // 打印详细的请求信息
      this.logger.log('========================================');
      this.logger.log('[getDrawingsFileList] 接收到请求');
      this.logger.log(`[getDrawingsFileList] 请求方法: ${req.method}`);
      this.logger.log(`[getDrawingsFileList] 请求路径: ${req.path}`);
      this.logger.log(`[getDrawingsFileList] 请求来源: ${req.headers.referer || req.headers['user-agent'] || 'unknown'}`);
      this.logger.log(`[getDrawingsFileList] 用户ID: ${req.user?.id || 'unknown'}`);
      this.logger.log(`[getDrawingsFileList] 请求参数: ${JSON.stringify(dto)}`);
      this.logger.log(`[getDrawingsFileList] pageIndex类型: ${typeof dto.pageIndex}, 值: ${dto.pageIndex}`);
      this.logger.log(`[getDrawingsFileList] pageSize类型: ${typeof dto.pageSize}, 值: ${dto.pageSize}`);
      this.logger.log('========================================');

      const userId = req.user?.id;
      if (!userId) {
        throw new InternalServerErrorException('用户 ID 不存在');
      }

      const result = await this.galleryService.getFileList(
        dto,
        'drawings',
        userId
      );

      // 绕过全局响应包装，直接返回原始 JSON 格式
      return res.status(200).json(result);
    } catch (error) {
      this.logger.error('[getDrawingsFileList] 错误:', error);
      throw error;
    }
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
  async getBlocksTypes(@Req() req: any, @Res() res: Response) {
    try {
      this.logger.log('[getBlocksTypes] 获取图块库分类列表');

      const userId = req.user?.id;
      if (!userId) {
        throw new InternalServerErrorException('用户 ID 不存在');
      }

      const result = await this.galleryService.getTypes('blocks', userId);

      // 绕过全局响应包装，直接返回原始 JSON 格式
      return res.status(200).json(result);
    } catch (error) {
      this.logger.error('[getBlocksTypes] 错误:', error);
      throw error;
    }
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
    @Body() dto: GalleryFileListDto,
    @Res() res: Response
  ) {
    try {
      this.logger.log(
        `[getBlocksFileList] 获取图块列表，参数: ${JSON.stringify(dto)}`
      );
      const userId = req.user?.id;
      if (!userId) {
        throw new InternalServerErrorException('用户 ID 不存在');
      }

      const result = await this.galleryService.getFileList(
        dto,
        'blocks',
        userId
      );

      // 绕过全局响应包装，直接返回原始 JSON 格式
      return res.status(200).json(result);
    } catch (error) {
      this.logger.error('[getBlocksFileList] 错误:', error);
      throw error;
    }
  }

  /**
   * 获取我的收藏列表
   * 路由: GET /gallery/{galleryType}/collect
   */
  @Get(':galleryType/collect')
  @ApiOperation({
    summary: '获取我的收藏列表',
    description: '获取当前用户的收藏列表',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getCollectList(
    @Param('galleryType') galleryType: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      this.logger.log(`[getCollectList] 获取收藏列表: ${galleryType}`);

      // 验证图库类型
      if (galleryType !== 'drawings' && galleryType !== 'blocks') {
        throw new InternalServerErrorException('无效的图库类型');
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new InternalServerErrorException('用户 ID 不存在');
      }

      const pageIndex = req.query.pageIndex
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await this.galleryService.getCollectList(
        galleryType as 'drawings' | 'blocks',
        userId,
        pageIndex,
        pageSize
      );

      // 绕过全局响应包装，直接返回原始 JSON 格式
      return res.status(200).json(result);
    } catch (error) {
      this.logger.error('[getCollectList] 错误:', error);
      throw error;
    }
  }

  /**
   * 访问图块文件 (.mxweb)
   * 路由: GET /gallery/blocks/{secondType}/{firstType}/{filehash}.mxweb
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
   * 路由: GET /gallery/drawings/{secondType}/{firstType}/{filehash}.mxweb
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async createType(
    @Param('galleryType') galleryType: string,
    @Req() req: any,
    @Body() body: { name: string; pid: number },
    @Res() res: Response
  ) {
    try {
      this.logger.log(`[createType] 创建分类: ${galleryType}, ${JSON.stringify(body)}`);

      // 验证图库类型
      if (galleryType !== 'drawings' && galleryType !== 'blocks') {
        throw new InternalServerErrorException('无效的图库类型');
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new InternalServerErrorException('用户 ID 不存在');
      }

      const result = await this.galleryService.createType(
        galleryType as 'drawings' | 'blocks',
        body.name,
        body.pid || 0,
        userId
      );

      return res.status(201).json({
        code: 'success',
        data: result,
      });
    } catch (error) {
      this.logger.error('[createType] 错误:', error);
      throw error;
    }
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async updateType(
    @Param('galleryType') galleryType: string,
    @Param('typeId', ParseIntPipe) typeId: number,
    @Req() req: any,
    @Body() body: { name: string },
    @Res() res: Response
  ) {
    try {
      this.logger.log(`[updateType] 更新分类: ${galleryType}, typeId: ${typeId}, ${JSON.stringify(body)}`);

      // 验证图库类型
      if (galleryType !== 'drawings' && galleryType !== 'blocks') {
        throw new InternalServerErrorException('无效的图库类型');
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new InternalServerErrorException('用户 ID 不存在');
      }

      const result = await this.galleryService.updateType(
        typeId,
        body.name,
        galleryType as 'drawings' | 'blocks',
        userId
      );

      return res.status(200).json({
        code: 'success',
        data: result,
      });
    } catch (error) {
      this.logger.error('[updateType] 错误:', error);
      throw error;
    }
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async deleteType(
    @Param('galleryType') galleryType: string,
    @Param('typeId', ParseIntPipe) typeId: number,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
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

      return res.status(200).json({
        code: 'success',
        message: '删除成功',
      });
    } catch (error) {
      this.logger.error('[deleteType] 错误:', error);
      throw error;
    }
  }

  /**
   * 添加文件到图库
   * 路由: POST /gallery/{galleryType}/items
   */
  @Post(':galleryType/items')
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
    @Body() body: AddToGalleryDto,
    @Res() res: Response
  ) {
    try {
      this.logger.log(
        `[addToGallery] 添加文件到图库: ${galleryType}, nodeId=${body.nodeId}, firstType=${body.firstType}, secondType=${body.secondType}`
      );

      // 验证图库类型
      if (galleryType !== 'drawings' && galleryType !== 'blocks') {
        return res.status(400).json({
          code: 'error',
          message: '无效的图库类型',
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(400).json({
          code: 'error',
          message: '用户 ID 不存在',
        });
      }

      const result = await this.galleryService.addToGallery(
        body.nodeId,
        body.firstType,
        body.secondType,
        body.thirdType,
        galleryType as 'drawings' | 'blocks',
        userId
      );

      return res.status(201).json({
        code: 'success',
        data: result,
      });
    } catch (error) {
      this.logger.error('[addToGallery] 错误:', error);

      // 处理业务错误
      if (error instanceof Error) {
        const errorMessage = error.message;
        let userMessage = errorMessage;

        // 友好的错误消息
        if (errorMessage.includes('文件不存在')) {
          userMessage = '文件不存在，请检查文件是否被删除';
        } else if (errorMessage.includes('不能添加文件夹')) {
          userMessage = '不能将文件夹添加到图库';
        } else if (errorMessage.includes('分类不存在')) {
          userMessage = '选择的分类不存在，请重新选择';
        } else if (errorMessage.includes('分类类型不匹配')) {
          userMessage = '分类类型不匹配，请重新选择';
        } else if (errorMessage.includes('该文件已经在图库中')) {
          userMessage = '该文件已经在图库中，无需重复添加';
        }

        return res.status(400).json({
          code: 'error',
          message: userMessage,
        });
      }

      // 其他未知错误
      return res.status(500).json({
        code: 'error',
        message: '服务器内部错误，请稍后重试',
      });
    }
  }

  /**
   * 收藏/取消收藏
   * 路由: POST /gallery/{galleryType}/collect
   */
  @Post(':galleryType/collect')
  @ApiOperation({
    summary: '收藏/取消收藏',
    description: '收藏或取消收藏图库文件',
  })
  @ApiResponse({
    status: 200,
    description: '操作成功',
  })
  async toggleCollect(
    @Param('galleryType') galleryType: string,
    @Req() req: any,
    @Body() body: { itemId: string },
    @Res() res: Response
  ) {
    try {
      this.logger.log(`[toggleCollect] 收藏操作: ${galleryType}, itemId: ${body.itemId}`);

      // 验证图库类型
      if (galleryType !== 'drawings' && galleryType !== 'blocks') {
        throw new InternalServerErrorException('无效的图库类型');
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new InternalServerErrorException('用户 ID 不存在');
      }

      const isCollected = await this.galleryService.toggleCollect(
        body.itemId,
        userId
      );

      return res.status(200).json({
        code: 'success',
        data: { collect: isCollected },
      });
    } catch (error) {
      this.logger.error('[toggleCollect] 错误:', error);

      // 处理业务错误
      if (error instanceof Error) {
        if (error.message.includes('文件不在图库中')) {
          return res.status(400).json({
            code: 'error',
            message: error.message,
          });
        }
      }

      throw error;
    }
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
      this.logger.error(`[findProjectRoot] 查找项目根节点失败: ${error.message}`, error);
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
   */
  private async handleGalleryFileRequest(
    req: any,
    res: Response,
    galleryType: 'blocks' | 'drawings'
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

      // 从路径中提取文件哈希值
      // 路径格式: {secondType}/{firstType}/{filehash}.mxweb
      const pathParts = filename.split('/');
      if (pathParts.length < 3) {
        this.logger.error(
          `[handleGalleryFileRequest] 路径格式错误: ${filename}`
        );
        return res.status(400).json({ code: -1, message: '无效的文件路径' });
      }

      // 提取文件哈希（去掉扩展名）
      const fileHashPart = pathParts[pathParts.length - 1];
      const fileHash = path.basename(fileHashPart, path.extname(fileHashPart));

      this.logger.log(
        `[handleGalleryFileRequest] 提取的 fileHash: ${fileHash}`
      );

      // 通过哈希值查找所有具有相同 fileHash 的节点，验证用户是否有访问权限
      const allNodes = await this.database.fileSystemNode.findMany({
        where: {
          fileHash: fileHash,
          isFolder: false,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          parentId: true,
          isRoot: true,
          fileHash: true,
        },
      });

      this.logger.log(
        `[handleGalleryFileRequest] 查找文件节点: hash=${fileHash}, 找到=${allNodes.length}个节点`
      );

      if (allNodes.length === 0) {
        this.logger.warn(
          `[handleGalleryFileRequest] 文件节点不存在: ${fileHash}`
        );
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }

      // 检查用户对任何一个节点是否有权限
      let hasPermission = false;
      let authorizedNodeId: string | null = null;

      for (const node of allNodes) {
        // 检查文件所有者
        if (node.ownerId === userId) {
          hasPermission = true;
          authorizedNodeId = node.id;
          break;
        }

        // 检查 FileAccess 表中的权限
        const fileAccess = await this.database.fileAccess.findUnique({
          where: {
            userId_nodeId: {
              userId: userId,
              nodeId: node.id,
            },
          },
        });

        if (fileAccess) {
          // 有 FileAccess 记录，说明有权限
          hasPermission = true;
          authorizedNodeId = node.id;
          break;
        }

        // 检查项目成员权限
        // 如果文件在项目中，检查用户是否是项目成员
        if (node.parentId) {
          // 查找项目根节点
          const projectRoot = await this.findProjectRoot(node.id);

          if (projectRoot) {
            // 检查用户是否是项目成员
            const projectAccess = await this.database.fileAccess.findUnique({
              where: {
                userId_nodeId: {
                  userId: userId,
                  nodeId: projectRoot.id,
                },
              },
            });

            if (projectAccess) {
              // 是项目成员，有权限
              hasPermission = true;
              authorizedNodeId = node.id;
              break;
            }
          }
        }
      }

      this.logger.log(
        `[handleGalleryFileRequest] 权限检查结果: userId=${userId}, hasPermission=${hasPermission}, authorizedNodeId=${authorizedNodeId}`
      );

      if (!hasPermission) {
        return res.status(401).json({
          code: -1,
          message: 'Unauthorized',
        });
      }

      // 构建可能的 MinIO 路径
      // MXWEB 文件存储路径: mxcad/file/{fileHash}.dwg.mxweb
      const possibleMinioPaths: string[] = [
        `mxcad/file/${fileHash}.dwg.mxweb`,
        `mxcad/file/${fileHash}.dxf.mxweb`,
        `mxcad/file/${fileHash}.mxweb`,
      ];

      this.logger.log(
        `[handleGalleryFileRequest] 尝试 MinIO 路径: ${possibleMinioPaths.join(', ')}`
      );

      let foundMinioPath: string | null = null;

      // 尝试从 MinIO 找到文件
      for (const mxcadPath of possibleMinioPaths) {
        try {
          const exists = await this.minioSyncService.fileExists(mxcadPath);
          if (exists) {
            foundMinioPath = mxcadPath;
            this.logger.log(`[handleGalleryFileRequest] 找到 MinIO 文件: ${mxcadPath}`);
            break;
          }
        } catch (error) {
          this.logger.log(`[handleGalleryFileRequest] MinIO 路径 ${mxcadPath} 不存在，尝试下一个路径`);
        }
      }

      // 如果 MinIO 中找到文件，直接返回
      if (foundMinioPath) {
        try {
          const fileStream = await this.minioSyncService.getFileStream(foundMinioPath);

          // 更新浏览次数
          await this.galleryService.incrementLookNum(fileHash, galleryType);

          // 设置响应头
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `inline; filename="${path.basename(filename)}"`);

          // 返回文件流
          fileStream.pipe(res);

          fileStream.on('error', (error) => {
            this.logger.error(
              `[handleGalleryFileRequest] MinIO 文件流错误: ${error.message}`,
              error
            );
            if (!res.headersSent) {
              res.status(500).json({ code: -1, message: '获取文件失败' });
            }
          });

          return;
        } catch (error) {
          this.logger.error(
            `[handleGalleryFileRequest] 获取 MinIO 文件流失败: ${error.message}`,
            error
          );
          // 继续尝试本地文件
        }
      }

      // MinIO 中未找到文件，尝试从本地文件系统获取
      this.logger.log(`[handleGalleryFileRequest] MinIO 中未找到文件，尝试本地文件系统`);

      // 获取本地上传路径配置
      const uploadPath = this.configService.get<string>('MXCAD_UPLOAD_PATH', 'D:\\web\\MxCADOnline\\cloudcad\\uploads');

      // 构建可能的本地文件路径
      const possibleLocalPaths: string[] = [
        `${uploadPath}\\${fileHash}\\${fileHash}.dwg.mxweb`,
        `${uploadPath}\\${fileHash}\\${fileHash}.dxf.mxweb`,
        `${uploadPath}\\${fileHash}\\${fileHash}.mxweb`,
      ];

      this.logger.log(
        `[handleGalleryFileRequest] 尝试本地路径: ${possibleLocalPaths.join(', ')}`
      );

      const fs = require('fs');
      let foundLocalPath: string | null = null;

      // 尝试从本地文件系统找到文件
      for (const localPath of possibleLocalPaths) {
        if (fs.existsSync(localPath)) {
          foundLocalPath = localPath;
          this.logger.log(`[handleGalleryFileRequest] 找到本地文件: ${localPath}`);
          break;
        }
      }

      if (!foundLocalPath) {
        this.logger.warn(
          `[handleGalleryFileRequest] MinIO 和本地文件系统均未找到文件: ${fileHash}`
        );
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }

      // 读取本地文件流
      try {
        const fileStream = fs.createReadStream(foundLocalPath);

        // 更新浏览次数
        await this.galleryService.incrementLookNum(fileHash, galleryType);

        // 设置响应头
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(filename)}"`);

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
      } catch (error) {
        this.logger.error(
          `[handleGalleryFileRequest] 读取本地文件失败: ${error.message}`,
          error
        );
        if (!res.headersSent) {
          res.status(500).json({ code: -1, message: '获取文件失败' });
        }
      }
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
}
