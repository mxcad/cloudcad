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
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GalleryService } from './gallery.service';
import { GalleryFileListDto, AddToGalleryDto } from './dto/gallery.dto';
import { DatabaseService } from '../database/database.service';
import { StorageManager } from '../common/services/storage-manager.service';
import { FileSystemPermissionService } from '../file-system/file-system-permission.service';
import * as path from 'path';
import * as fs from 'fs';

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
    private readonly storageManager: StorageManager,
    private readonly permissionService: FileSystemPermissionService,
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
      this.logger.log(
        `[getDrawingsFileList] 请求来源: ${req.headers.referer || req.headers['user-agent'] || 'unknown'}`
      );
      this.logger.log(
        `[getDrawingsFileList] 用户ID: ${req.user?.id || 'unknown'}`
      );
      this.logger.log(`[getDrawingsFileList] 请求参数: ${JSON.stringify(dto)}`);
      this.logger.log(
        `[getDrawingsFileList] pageIndex类型: ${typeof dto.pageIndex}, 值: ${dto.pageIndex}`
      );
      this.logger.log(
        `[getDrawingsFileList] pageSize类型: ${typeof dto.pageSize}, 值: ${dto.pageSize}`
      );
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
   * 访问图块文件 (.mxweb) - HEAD 方法
   * 路由: HEAD /gallery/blocks/{secondType}/{firstType}/{filehash}.mxweb
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
   * 路由: HEAD /gallery/drawings/{secondType}/{firstType}/{filehash}.mxweb
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
    @Body() body: { name: string; pid: number },
    @Res() res: Response
  ) {
    try {
      this.logger.log(
        `[createType] 创建分类: ${galleryType}, ${JSON.stringify(body)}`
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

      // 处理业务错误
      if (error instanceof Error) {
        const errorMessage = error.message;
        let userMessage = errorMessage;

        // 友好的错误消息
        if (errorMessage.includes('父分类不存在')) {
          userMessage = '父分类不存在，请重新选择';
        } else if (errorMessage.includes('父分类类型不匹配')) {
          userMessage = '父分类类型不匹配，请重新选择';
        } else if (errorMessage.includes('不能创建四级分类')) {
          userMessage = '不能创建四级分类，最多支持三级分类';
        } else if (errorMessage.includes('分类名称已存在')) {
          userMessage = '该分类名称已存在，请使用其他名称';
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
    @Body() body: { name: string },
    @Res() res: Response
  ) {
    try {
      this.logger.log(
        `[updateType] 更新分类: ${galleryType}, typeId: ${typeId}, ${JSON.stringify(body)}`
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

      // 处理业务错误
      if (error instanceof Error) {
        const errorMessage = error.message;
        let userMessage = errorMessage;

        // 友好的错误消息
        if (errorMessage.includes('分类不存在')) {
          userMessage = '分类不存在，请刷新页面后重试';
        } else if (errorMessage.includes('分类类型不匹配')) {
          userMessage = '分类类型不匹配，请刷新页面后重试';
        } else if (errorMessage.includes('分类名称已存在')) {
          userMessage = '该分类名称已存在，请使用其他名称';
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
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      this.logger.log(
        `[deleteType] 删除分类: ${galleryType}, typeId: ${typeId}`
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

      // 处理业务错误
      if (error instanceof Error) {
        const errorMessage = error.message;
        let userMessage = errorMessage;

        // 友好的错误消息
        if (errorMessage.includes('分类不存在')) {
          userMessage = '分类不存在，请刷新页面后重试';
        } else if (errorMessage.includes('分类类型不匹配')) {
          userMessage = '分类类型不匹配，请刷新页面后重试';
        } else if (errorMessage.includes('该分类下有子分类')) {
          userMessage = '该分类下有子分类，无法删除。请先删除子分类。';
        } else if (errorMessage.includes('该分类下有文件')) {
          userMessage =
            '该分类下有文件，无法删除。请先将文件移到其他分类或从图库中移除。';
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
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
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

      return res.status(200).json({
        code: 'success',
        message: '已从图库中移除',
      });
    } catch (error) {
      this.logger.error('[removeFromGallery] 错误:', error);

      // 处理业务错误
      if (error instanceof Error) {
        const errorMessage = error.message;
        let userMessage = errorMessage;

        if (errorMessage.includes('文件不存在')) {
          userMessage = '文件不存在，请检查文件是否被删除';
        } else if (errorMessage.includes('文件不在图库中')) {
          userMessage = '文件不在图库中';
        } else if (errorMessage.includes('图库类型不匹配')) {
          userMessage = '图库类型不匹配';
        }

        return res.status(400).json({
          code: 'error',
          message: userMessage,
        });
      }

      throw error;
    }
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
    @Body() body: { firstType: number; secondType: number; thirdType?: number },
    @Res() res: Response
  ) {
    try {
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

      const result = await this.galleryService.updateGalleryItem(
        nodeId,
        body.firstType,
        body.secondType,
        body.thirdType,
        galleryType as 'drawings' | 'blocks',
        userId
      );

      return res.status(200).json({
        code: 'success',
        data: result,
      });
    } catch (error) {
      this.logger.error('[updateGalleryItem] 错误:', error);

      // 处理业务错误
      if (error instanceof Error) {
        const errorMessage = error.message;
        let userMessage = errorMessage;

        if (errorMessage.includes('文件不存在')) {
          userMessage = '文件不存在，请检查文件是否被删除';
        } else if (errorMessage.includes('文件不在图库中')) {
          userMessage = '文件不在图库中';
        } else if (errorMessage.includes('图库类型不匹配')) {
          userMessage = '图库类型不匹配';
        } else if (errorMessage.includes('分类不存在')) {
          userMessage = '选择的分类不存在，请重新选择';
        } else if (errorMessage.includes('分类类型不匹配')) {
          userMessage = '分类类型不匹配，请重新选择';
        }

        return res.status(400).json({
          code: 'error',
          message: userMessage,
        });
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
      const fileExtension = path.extname(fileHashPart).toLowerCase();

      this.logger.log(
        `[handleGalleryFileRequest] 提取的 fileHash: ${fileHash}, 扩展名: ${fileExtension}`
      );

      // 如果是缩略图请求（.jpg），使用缩略图处理逻辑
      if (fileExtension === '.jpg') {
        this.logger.log(
          `[handleGalleryFileRequest] 检测到缩略图请求，调用 handleThumbnailRequest`
        );
        return this.handleThumbnailRequest(
          req,
          res,
          galleryType,
          fileHash,
          isHeadRequest
        );
      }

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
        // 使用统一的权限检查服务
        const role = await this.permissionService.getNodeAccessRole(userId, node.id);
        if (role !== null) {
          hasPermission = true;
          authorizedNodeId = node.id;
          this.logger.log(
            `[handleGalleryFileRequest] 用户有权限访问节点: ${node.id}, 角色: ${role}`
          );
          break;
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

      // 获取授权节点的完整路径信息
      const authorizedNode = await this.database.fileSystemNode.findFirst({
        where: {
          fileHash: fileHash,
          isFolder: false,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          path: true,
          fileHash: true,
        },
      });

      let foundFilePath: string | null = null;

      // 从 filesData 目录查找文件（使用节点的 path 字段）
      if (authorizedNode && authorizedNode.path) {
        try {
          // 获取节点目录的完整路径
          const nodeFullPath = this.storageManager.getFullPath(authorizedNode.path);
          
          // 构建可能的文件名
          const possibleFileNames = [
            `${fileHash}.dwg.mxweb`,
            `${fileHash}.dxf.mxweb`,
            `${fileHash}.mxweb`,
            filename,
          ];

          // 尝试在节点目录中查找文件
          for (const fileName of possibleFileNames) {
            const targetPath = path.join(nodeFullPath, fileName);
            if (fs.existsSync(targetPath)) {
              foundFilePath = targetPath;
              this.logger.log(
                `[handleGalleryFileRequest] 从 filesData 目录找到文件: ${targetPath}`
              );
              break;
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
          // 对于 HEAD 请求，只返回文件头信息
          if (isHeadRequest) {
            const stats = fs.statSync(foundFilePath);

            // 检查路径是否是目录
            if (stats.isDirectory()) {
              this.logger.warn(`[handleGalleryFileRequest] 路径是目录而非文件: ${foundFilePath}`);
              return res.status(404).json({ code: -1, message: '文件不存在' });
            }

            // 设置响应头（与 MxCAD 保持一致）
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Access-Control-Allow-Origin', '*');

            // HEAD 请求只返回头部信息
            res.end();
            return;
          } else {
            // 检查路径是否是目录
            const stats = fs.statSync(foundFilePath);
            if (stats.isDirectory()) {
              this.logger.warn(`[handleGalleryFileRequest] 路径是目录而非文件: ${foundFilePath}`);
              return res.status(404).json({ code: -1, message: '文件不存在' });
            }

            // GET 请求返回文件流
            const fileStream = fs.createReadStream(foundFilePath);

            // 更新浏览次数
            await this.galleryService.incrementLookNum(fileHash, galleryType);

            // 设置响应头
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader(
              'Content-Disposition',
              `inline; filename="${path.basename(filename)}"`
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
        `[handleGalleryFileRequest] 本地文件系统未找到文件: ${fileHash}`
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
   * @param fileHash 文件哈希值
   * @param isHeadRequest 是否为 HEAD 请求（默认 false）
   */
  private async handleThumbnailRequest(
    req: any,
    res: Response,
    galleryType: 'blocks' | 'drawings',
    fileHash: string,
    isHeadRequest: boolean = false
  ) {
    try {
      this.logger.log(
        `[handleThumbnailRequest] 处理缩略图请求: galleryType=${galleryType}, fileHash=${fileHash}`
      );

      // 获取用户 ID（从 JWT token）
      const userId = req.user?.id;
      if (!userId) {
        this.logger.warn('[handleThumbnailRequest] 用户 ID 不存在');
        return res.status(401).json({ code: -1, message: 'Unauthorized' });
      }

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
          path: true, // 添加 path 字段
        },
      });

      this.logger.log(
        `[handleThumbnailRequest] 查找文件节点: hash=${fileHash}, 找到=${allNodes.length}个节点`
      );

      if (allNodes.length === 0) {
        this.logger.warn(
          `[handleThumbnailRequest] 文件节点不存在: ${fileHash}`
        );
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }

      // 检查用户对任何一个节点是否有权限
      let hasPermission = false;
      let authorizedNode: any | null = null;

      for (const node of allNodes) {
        // 使用统一的权限检查服务
        const role = await this.permissionService.getNodeAccessRole(userId, node.id);
        if (role !== null) {
          hasPermission = true;
          authorizedNode = node;
          this.logger.log(
            `[handleThumbnailRequest] 用户有权限访问节点: ${node.id}, 角色: ${role}`
          );
          break;
        }
      }

      this.logger.log(
        `[handleThumbnailRequest] 权限检查结果: userId=${userId}, hasPermission=${hasPermission}`
            );

      if (!hasPermission) {
        return res.status(401).json({
          code: -1,
          message: 'Unauthorized',
        });
      }

      // 检查节点是否有 path 字段
      if (!authorizedNode.path) {
        this.logger.warn(
          `[handleThumbnailRequest] 节点没有 path 字段: ${authorizedNode.id}`
        );
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }

      // 从 filesData 目录读取缩略图（使用 StorageManager 获取完整路径）
      const nodeFullPath = this.storageManager.getFullPath(authorizedNode.path);
      const localThumbnailPath = path.join(nodeFullPath, `${fileHash}.jpg`);

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
            this.logger.warn(`[handleThumbnailRequest] 路径是目录而非文件: ${localThumbnailPath}`);
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
            this.logger.warn(`[handleThumbnailRequest] 路径是目录而非文件: ${localThumbnailPath}`);
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
        this.logger.warn(`[handleThumbnailRequest] 缩略图不存在: ${fileHash}`);
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
