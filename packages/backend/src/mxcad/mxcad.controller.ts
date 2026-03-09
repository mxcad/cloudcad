import {
  Controller,
  Post,
  Get,
  Head,
  Body,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  HttpStatus,
  HttpCode,
  Param,
  Res,
  Req,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  UseGuards,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

import { ApiTags, ApiConsumes, ApiResponse, ApiBody } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { MxCadService } from './mxcad.service';
import { DatabaseService } from '../database/database.service';
import { PreloadingDataDto } from './dto/preloading-data.dto';
import { UploadExtReferenceDto } from './dto/upload-ext-reference.dto';
import { UploadFilesDto } from './dto/upload-files.dto';
import { FileExistResponseDto } from './dto/file-exist-response.dto';
import { ChunkExistResponseDto } from './dto/chunk-exist-response.dto';
import { CheckFileExistDto } from './dto/check-file-exist.dto';
import { CheckChunkExistDto } from './dto/check-chunk-exist.dto';
import { CheckReferenceResponseDto } from './dto/check-reference-response.dto';
import { RefreshExternalReferencesResponseDto } from './dto/refresh-external-references-response.dto';
import { UploadFileResponseDto } from './dto/upload-file-response.dto';
import { CheckThumbnailResponseDto } from './dto/check-thumbnail-response.dto';
import { UploadThumbnailResponseDto } from './dto/upload-thumbnail-response.dto';
import { SaveMxwebResponseDto } from './dto/save-mxweb-response.dto';
import { MxCadRequest } from './types/request.types';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage/storage.service';
import { FileSystemPermissionService } from '../file-system/file-system-permission.service';
import { VersionControlService } from '../version-control/version-control.service';
import { AppConfig } from '../config/app.config';
import { FileConversionService } from './services/file-conversion.service';
import { ProjectPermission } from '../common/enums/permissions.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireProjectPermissionGuard } from '../common/guards/require-project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';

@ApiTags('MxCAD 文件上传与转换')
@Controller('mxcad')
export class MxCadController {
  private readonly logger = new Logger(MxCadController.name);
  private readonly mxCadFileExt: string;
  private readonly cacheTTL: number;

  // 预加载数据缓存
  private preloadingDataCache = new Map<
    string,
    { data: PreloadingDataDto; timestamp: number }
  >();

  constructor(
    private readonly mxCadService: MxCadService,
    private readonly prisma: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly storageService: StorageService,
    private readonly permissionService: FileSystemPermissionService,
    private readonly versionControlService: VersionControlService,
    private readonly fileConversionService: FileConversionService
  ) {
    this.mxCadFileExt = this.configService.get('mxcad.fileExt', { infer: true }) || '.mxweb';
    const cacheTTLConfig = this.configService.get('cacheTTL', { infer: true });
    this.cacheTTL = cacheTTLConfig.mxcad * 1000; // 转为毫秒
  }

  /**
   * 检查分片是否存在
   */
  @Post('files/chunkisExist')
  @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: '检查分片是否存在',
    type: ChunkExistResponseDto,
  })
  async checkChunkExist(
    @Body() body: CheckChunkExistDto,
    @Req() request: MxCadRequest
  ) {
    this.logger.log(`[chunkisExist] 收到的参数: ${JSON.stringify(body)}`);
    // 构建上下文
    const context = await this.buildContextFromRequest(request);
    const result = await this.mxCadService.checkChunkExist(
      body.chunk,
      body.fileHash,
      body.size,
      body.chunks,
      body.filename,
      context
    );
    // 转换为标准格式：ret === 'chunkAlreadyExist' 表示分片已存在
    return { exists: result.ret === 'chunkAlreadyExist' };
  }

  /**
   * 检查文件是否存在
   */
  @Post('files/fileisExist')
  @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @HttpCode(HttpStatus.OK)
  @ApiResponse({
    status: 200,
    description: '检查文件是否存在',
    type: FileExistResponseDto,
  })
  async checkFileExist(
    @Body() body: CheckFileExistDto,
    @Req() request: MxCadRequest
  ) {
    const context = await this.buildContextFromRequest(request);
    // 添加文件大小到 context
    context.fileSize = body.fileSize;
    this.logger.log(
      `[checkFileExist] 接收参数: filename=${body.filename}, fileHash=${body.fileHash}, fileSize=${body.fileSize}, nodeId=${context.nodeId}`
    );
    const result = (await this.mxCadService.checkFileExist(
      body.filename,
      body.fileHash,
      context
    )) as { ret: string; nodeId?: string };
    // 转换为标准格式：ret === 'fileAlreadyExist' 表示文件已存在（秒传）
    return {
      exists: result.ret === 'fileAlreadyExist',
      nodeId: result.nodeId,
    };
  }

  /**
   * 获取外部参照预加载数据
   *
   * @param nodeId 节点 ID
   * @returns 预加载数据
   * @throws NotFoundException 预加载数据不存在时抛出异常
   */
  @Get('file/:nodeId/preloading')
  @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.FILE_OPEN)
  @ApiResponse({
    status: 200,
    description: '成功获取预加载数据',
    type: PreloadingDataDto,
  })
  @ApiResponse({
    status: 404,
    description: '预加载数据不存在',
  })
  async getPreloadingData(
    @Param('nodeId') nodeId: string
  ): Promise<PreloadingDataDto> {
    this.logger.debug(`[getPreloadingData] 请求参数: nodeId=${nodeId}`);

    // 检查缓存
    const cached = this.preloadingDataCache.get(nodeId);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheTTL) {
      this.logger.debug(`[getPreloadingData] 返回缓存数据: ${nodeId}`);
      return cached.data;
    }

    // 从服务获取数据
    const data = await this.mxCadService.getPreloadingData(nodeId);

    if (!data) {
      this.logger.warn(`[getPreloadingData] 预加载数据不存在: ${nodeId}`);
      throw new NotFoundException('预加载数据不存在');
    }

    // 更新缓存
    this.preloadingDataCache.set(nodeId, { data, timestamp: now });

    // 清理过期缓存
    this.cleanExpiredCache();

    this.logger.debug(`[getPreloadingData] 成功返回预加载数据: ${nodeId}`);
    return data;
  }

  /**
   * 清理过期的缓存项
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.preloadingDataCache.entries()) {
      if (now - value.timestamp >= this.cacheTTL) {
        this.preloadingDataCache.delete(key);
      }
    }
  }

  /**
   * 检查外部参照文件是否存在
   *
   * @param nodeId 源图纸节点 ID
   * @param body 请求体，包含 fileName 字段
   * @returns 文件是否存在
   */
  @Post('file/:nodeId/check-reference')
  @ApiResponse({
    status: 200,
    description: '成功检查文件存在性',
    type: CheckReferenceResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: -1 },
        message: { type: 'string', example: '缺少必要参数' },
      },
    },
  })
  async checkExternalReference(
    @Param('nodeId') nodeId: string,
    @Body() body: { fileName: string }
  ) {
    this.logger.log(
      `[checkExternalReference] 请求参数: nodeId=${nodeId}, fileName=${body.fileName}`
    );

    // 验证参数
    if (!body.fileName) {
      throw new BadRequestException('缺少必要参数: fileName');
    }

    const exists = await this.mxCadService.checkExternalReferenceExists(
      nodeId,
      body.fileName
    );

    this.logger.log(`[checkExternalReference] 检查结果: ${exists}`);

    return { exists };
  }

  /**
   * 手动刷新文件的外部参照信息
   * @param nodeId 文件系统节点 ID
   * @returns 刷新结果
   */
  @Post('file/:nodeId/refresh-external-references')
  @ApiResponse({
    status: 200,
    description: '刷新成功',
    type: RefreshExternalReferencesResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: '刷新失败',
  })
  async refreshExternalReferences(@Param('nodeId') nodeId: string) {
    this.logger.log(`[refreshExternalReferences] 请求参数: nodeId=${nodeId}`);

    const stats = await this.mxCadService.getExternalReferenceStats(nodeId);
    await this.mxCadService.updateExternalReferenceInfo(nodeId, stats);

    this.logger.log(`[refreshExternalReferences] 刷新成功: nodeId=${nodeId}`);

    return {
      code: 0,
      message: '刷新成功',
      stats,
    };
  }

  /**
   * 上传文件（支持分片）
   */
  @Post('files/uploadFiles')
  @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
  @UseInterceptors(AnyFilesInterceptor())
  @RequireProjectPermission(ProjectPermission.FILE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        hash: {
          type: 'string',
          description: '文件 MD5 哈希值',
        },
        name: {
          type: 'string',
          description: '原始文件名',
        },
        size: {
          type: 'number',
          description: '文件总大小（字节）',
        },
        chunk: {
          type: 'number',
          description: '分片索引（分片上传时必填）',
        },
        chunks: {
          type: 'number',
          description: '总分片数量（分片上传时必填）',
        },
        nodeId: {
          type: 'string',
          description: '节点ID（项目根目录或文件夹的 FileSystemNode ID）',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '上传文件成功',
    type: UploadFileResponseDto,
  })
  async uploadFile(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadFilesDto,
    @Req() request: MxCadRequest
  ) {
    const file = files && files.length > 0 ? files[0] : null;
    this.logger.log(
      `[uploadFile] files count: ${files?.length || 0}, file exists: ${!!file}, file size: ${file?.size}, body: ${JSON.stringify(body)}`
    );

    // 检查是否为合并请求（没有文件，只有 chunks 信息）
    const isMergeRequest = !file && body.chunks !== undefined;

    // 合并请求不需要检查 file，但需要检查必要参数
    if (!isMergeRequest && !file) {
      throw new BadRequestException('缺少上传文件');
    }

    if (!body.hash || !body.name || !body.size) {
      throw new BadRequestException('缺少必要参数: hash, name 或 size');
    }

    if (body.chunk !== undefined && body.chunks === undefined) {
      throw new BadRequestException('缺少必要参数: chunks');
    }

    // 构建上下文 - 从JWT token验证用户身份
    const context = await this.buildContextFromRequest(request);

    // 优先处理合并请求（没有文件，有 chunks 信息）
    if (isMergeRequest) {
      try {
        // 验证 chunks 参数
        if (body.chunks === undefined) {
          throw new BadRequestException('缺少必要参数: chunks');
        }

        const result = await this.mxCadService.mergeChunksWithPermission(
          body.hash,
          body.name,
          body.size,
          body.chunks,
          context,
          body.srcDwgNodeId // 外部参照上传时的源图纸节点 ID
        );
        // 返回标准格式
        return { nodeId: result.nodeId, tz: result.tz };
      } catch (error) {
        this.mxCadService.logError(`文件合并失败: ${error.message}`, error);
        throw new InternalServerErrorException(
          `文件合并失败: ${error.message}`
        );
      }
    }

    if (body.chunk !== undefined) {
      // 分片上传 - Multer 已在模块配置中正确处理存储位置和文件名
      this.logger.log(
        `[uploadFiles] 收到分片上传请求: chunk=${body.chunk}, chunks=${body.chunks}, hash=${body.hash}, filePath=${file?.path}`
      );
      try {
        // 验证 chunks 参数
        if (body.chunks === undefined) {
          throw new BadRequestException('缺少必要参数: chunks');
        }

        // 验证文件已由 Multer 正确保存
        if (!file) {
          throw new BadRequestException('缺少上传文件');
        }

        const result = await this.mxCadService.uploadChunkWithPermission(
          body.hash,
          body.name,
          body.size,
          body.chunk,
          body.chunks,
          context
        );
        // 返回标准格式
        return { nodeId: result.nodeId, tz: result.tz };
      } catch (error) {
        this.mxCadService.logError(`分片文件处理失败: ${error.message}`, error);
        throw new InternalServerErrorException(
          `分片文件处理失败: ${error.message}`
        );
      }
    } else {
      // 完整文件上传（带权限验证）
      if (!file) {
        throw new BadRequestException('缺少上传文件');
      }

      const result = await this.mxCadService.uploadAndConvertFileWithPermission(
        file.path,
        body.hash,
        body.name,
        body.size,
        context
      );
      // 返回标准格式
      return { nodeId: result.nodeId, tz: result.tz };
    }
  }

  /**
   * 保存 mxweb 文件到指定节点
   * 路由: POST /api/mxcad/savemxweb/:nodeId
   */
  @Post('savemxweb/:nodeId')
  @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_SAVE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: '保存 mxweb 文件到指定节点',
    type: SaveMxwebResponseDto,
  })
  async saveMxwebToNode(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('commitMessage') commitMessage: string,
    @Req() request: any
  ) {
    this.logger.log(
      `[saveMxwebToNode] 开始保存: nodeId=${nodeId}, commitMessage=${commitMessage || '(无)'}`
    );

    // 获取用户信息
    const userId = request.user?.id;
    const userName =
      request.user?.username || request.user?.nickname || request.user?.email;

    // 调用服务保存文件
    const result = await this.mxCadService.saveMxwebFile(
      nodeId,
      file,
      userId,
      userName,
      commitMessage
    );

    if (!result.success) {
      this.logger.error(`[saveMxwebToNode] 保存失败: ${result.message}`);
      throw new BadRequestException(result.message);
    }

    this.logger.log(`[saveMxwebToNode] 保存成功: nodeId=${nodeId}`);
    return {
      nodeId,
      path: result.path,
    };
  }

  /**
   * 上传外部参照 DWG
   *
   * 优化流程：先上传到临时目录，验证通过后直接移动到目标目录，避免转换后再拷贝。
   */
  @Post('up_ext_reference_dwg')
  @UseGuards(JwtAuthGuard, RequireProjectPermissionGuard)
  @RequireProjectPermission(ProjectPermission.CAD_EXTERNAL_REFERENCE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: '上传成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'ok' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 404,
    description: '图纸文件不存在',
  })
  @ApiResponse({
    status: 403,
    description: '无效的外部参照文件',
  })
  async uploadExtReferenceDwg(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadExtReferenceDto,
    @Req() request: MxCadRequest,
    @Res() res: Response
  ) {
    this.logger.log(`[uploadExtReferenceDwg] 开始处理: ${body.ext_ref_file}`);
    this.logger.log(
      `[uploadExtReferenceDwg] 接收到的 body 参数: ${JSON.stringify(body)}`
    );
    this.logger.log(`[uploadExtReferenceDwg] 接收到的文件路径: ${file?.path}`);

    // 验证上传请求
    const validationResult = await this.validateExtReferenceUpload(
      file,
      body,
      'uploadExtReferenceDwg',
      ['.dwg', '.dxf']
    );

    if (!validationResult.success) {
      return res.json(validationResult.error);
    }

    // 通过 nodeId 直接获取源图纸节点
    const node = await this.mxCadService.getFileSystemNodeByNodeId(body.nodeId);
    if (!node) {
      this.logger.warn(
        `[uploadExtReferenceDwg] 未找到源图纸: nodeId=${body.nodeId}`
      );
      return res.json({ code: -1, message: '未找到源图纸' });
    }

    this.logger.log(
      `[uploadExtReferenceDwg] 找到源图纸: ${node.name} (ID: ${node.id})`
    );

    // 计算文件哈希（优先使用前端传递的值，避免二次计算）
    let fileHash = body.hash;
    let isBackendCalculated = false;
    if (!fileHash) {
      // 兼容 MxCAD-App：如果前端没有传递 hash，则后端计算
      const fileBuffer = fs.readFileSync(file.path);
      fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
      isBackendCalculated = true;
      this.logger.log(
        `[uploadExtReferenceDwg] 前端未传递 hash，后端计算: ${fileHash}`
      );

      // 重命名文件为 hash 格式
      const ext = path.extname(file.originalname);
      const newPath = path.join(path.dirname(file.path), `${fileHash}${ext}`);
      if (file.path !== newPath) {
        fs.renameSync(file.path, newPath);
        file.path = newPath;
        this.logger.log(
          `[uploadExtReferenceDwg] 文件已重命名: ${file.originalname} -> ${path.basename(newPath)}`
        );
      }
    } else {
      this.logger.log(
        `[uploadExtReferenceDwg] 使用前端传递的 hash: ${fileHash}`
      );
    }

    // 外部参照文件应该创建在源图纸所在目录中
    // 如果源图纸在项目根目录，则使用项目根目录
    // 否则使用源图纸的父节点（图纸所在目录）
    const parentFolderId = node?.parentId || node?.id || 'external-reference';

    this.logger.log(
      `[uploadExtReferenceDwg] 外部参照文件将存储在目录: ${parentFolderId} (源图纸: ${node?.name})`
    );

    // 构建上下文（外部参照上传）
    const context = {
      nodeId: parentFolderId, // 使用源图纸所在目录
      userId: await this.validateTokenAndGetUserId(request),
      userRole: 'USER',
      srcDwgNodeId: node.id, // 源图纸节点 ID（从节点获取）
      isImage: false, // DWG 文件
    };

    // 复用现有的上传和转换逻辑
    const result = await this.mxCadService.uploadAndConvertFileWithPermission(
      file.path,
      fileHash || '',
      body.ext_ref_file,
      file.size,
      context
    );

    // 统一返回格式：与参考代码保持一致
    if (result.ret === 'ok' || result.ret === 'fileAlreadyExist') {
      // 更新源图纸的外部参照信息
      try {
        await this.mxCadService.updateExternalReferenceAfterUpload(body.nodeId);
        this.logger.log(
          `[uploadExtReferenceDwg] 外部参照信息已更新: nodeId=${body.nodeId}`
        );
      } catch (updateError) {
        this.logger.error(
          `[uploadExtReferenceDwg] 更新外部参照信息失败: ${updateError.message}`,
          updateError.stack
        );
        // 更新失败不影响主流程
      }
      return res.json({ code: 0, message: 'ok' });
    } else {
      return res.json({ code: -1, message: result.ret || 'upload failed' });
    }
  }

  /**
   * 上传外部参照图片
   *
   * 图片不需要转换，直接拷贝到源图纸的 hash 目录。
   */
  @Post('up_ext_reference_image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: '上传成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'ok' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 404,
    description: '图纸文件不存在',
  })
  @ApiResponse({
    status: 403,
    description: '无效的外部参照文件',
  })
  async uploadExtReferenceImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadExtReferenceDto,
    @Req() request: MxCadRequest,
    @Res() res: Response
  ) {
    this.logger.log(`[uploadExtReferenceImage] 开始处理: ${body.ext_ref_file}`);

    // 验证上传请求
    const validationResult = await this.validateExtReferenceUpload(
      file,
      body,
      'uploadExtReferenceImage',
      ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']
    );

    if (!validationResult.success) {
      return res.json(validationResult.error);
    }

    // 验证用户权限
    let sourceNode: any = null;
    try {
      const userId = await this.validateTokenAndGetUserId(request);
      this.logger.log(`[uploadExtReferenceImage] 用户ID: ${userId}`);

      // 通过 nodeId 直接获取源图纸节点
      const node = await this.mxCadService.getFileSystemNodeByNodeId(
        body.nodeId
      );
      if (!node) {
        this.logger.warn(
          `[uploadExtReferenceImage] 未找到源图纸: nodeId=${body.nodeId}`
        );
        return res.json({ code: -1, message: '未找到源图纸' });
      }

      // 检查用户是否有权限访问该图纸
      const permission = await this.checkFileAccessPermission(
        body.nodeId,
        userId,
        userId
      );

      if (!permission) {
        this.logger.warn(
          `[uploadExtReferenceImage] 用户 ${userId} 无权限访问图纸 nodeId=${body.nodeId}`
        );
        return res.json({ code: -1, message: '无权限访问该图纸' });
      }

      // 保存节点信息，供后续使用
      sourceNode = node;
      this.logger.log(
        `[uploadExtReferenceImage] 用户有权限访问图纸: ${sourceNode.name} (ID: ${sourceNode.id})`
      );
    } catch (authError) {
      this.logger.warn(
        `[uploadExtReferenceImage] 权限验证失败: ${authError.message}`
      );
      return res.json({ code: -1, message: '权限验证失败' });
    }

    // 计算文件哈希
    const fileBuffer = fs.readFileSync(file.path);
    const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');

    this.logger.log(`[uploadExtReferenceImage] 文件哈希: ${fileHash}`);

    // 重命名文件为 hash 格式
    const ext = path.extname(file.originalname);
    const newPath = path.join(path.dirname(file.path), `${fileHash}${ext}`);
    if (file.path !== newPath) {
      fs.renameSync(file.path, newPath);
      file.path = newPath;
      this.logger.log(
        `[uploadExtReferenceImage] 文件已重命名: ${file.originalname} -> ${path.basename(newPath)}`
      );
    }

    // 构建上下文（外部参照上传）
    const context = {
      nodeId: sourceNode?.id,
      userId: await this.validateTokenAndGetUserId(request),
      userRole: 'USER',
      srcDwgNodeId: sourceNode.id, // 源图纸节点 ID（从节点获取）
      isImage: true, // 图片文件
    };

    // 直接拷贝图片到源图纸目录，不创建数据库记录
    try {
      await this.mxCadService.handleExternalReferenceImage(
        fileHash,
        sourceNode.id,
        body.ext_ref_file,
        file.path,
        context
      );

      // 更新源图纸的外部参照信息
      try {
        await this.mxCadService.updateExternalReferenceAfterUpload(body.nodeId);
        this.logger.log(
          `[uploadExtReferenceImage] 外部参照信息已更新: nodeId=${body.nodeId}`
        );
      } catch (updateError) {
        this.logger.error(
          `[uploadExtReferenceImage] 更新外部参照信息失败: ${updateError.message}`,
          updateError.stack
        );
        // 更新失败不影响主流程
      }

      return res.json({ code: 0, message: 'ok' });
    } catch (error) {
      this.logger.error(
        `[uploadExtReferenceImage] 图片文件拷贝失败: ${error.message}`,
        error.stack
      );
      return res.json({ code: -1, message: '图片文件拷贝失败' });
    }
  }

  /**
   * 查询缩略图是否存在
   *
   * 查询逻辑：通过 nodeId 检查本地存储中是否存在缩略图
   * 缩略图文件名格式：thumbnail.jpg
   *
   * @param nodeId 文件系统节点 ID
   * @returns 缩略图是否存在
   */
  @Get('thumbnail/:nodeId')
  @ApiResponse({
    status: 200,
    description: '查询成功',
    type: CheckThumbnailResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 404,
    description: '文件不存在',
  })
  async checkThumbnail(@Param('nodeId') nodeId: string, @Res() res: Response) {
    this.logger.log(`[checkThumbnail] 查询缩略图, nodeId: ${nodeId}`);

    try {
      // 通过 nodeId 查询节点
      const node = await this.mxCadService.getFileSystemNodeByNodeId(nodeId);

      if (!node || !node.path) {
        return res.status(404).json({
          code: -1,
          message: '文件不存在或没有 path',
        });
      }

      this.logger.log(`[checkThumbnail] 获取到节点: ${nodeId}`);

      const result = await this.mxCadService.checkThumbnailExists(nodeId);

      return res.json({
        code: 0,
        message: 'ok',
        exists: result.exists,
      });
    } catch (error) {
      this.logger.error(
        `[checkThumbnail] 查询缩略图失败: ${error.message}`,
        error.stack
      );
      return res.status(500).json({
        code: -1,
        message: '查询缩略图失败',
      });
    }
  }

  /**
   * 上传缩略图
   *
   * 通过 nodeId 获取 fileHash，上传到本地存储，并重命名为 {hash}.{图片后缀}
   *
   * @param nodeId 文件系统节点 ID
   * @param file 上传的缩略图文件
   * @returns 上传结果
   */
  @Post('thumbnail/:nodeId')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: '上传成功',
    type: UploadThumbnailResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
  })
  @ApiResponse({
    status: 500,
    description: '上传失败',
  })
  async uploadThumbnail(
    @Param('nodeId') nodeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ) {
    this.logger.log(`[uploadThumbnail] 上传缩略图, nodeId: ${nodeId}`);

    // 验证文件是否存在
    if (!file) {
      return res.status(400).json({
        code: -1,
        message: '缺少文件',
      });
    }

    // 详细日志记录
    this.logger.log(
      `[uploadThumbnail] 文件信息: path=${file.path}, originalname=${file.originalname}, size=${file.size}, mimetype=${file.mimetype}`
    );

    // 检查文件是否实际存在
    if (!fs.existsSync(file.path)) {
      this.logger.error(`[uploadThumbnail] 文件不存在: ${file.path}`);
      return res.status(500).json({
        code: -1,
        message: '上传的文件不存在',
      });
    }

    try {
      // 通过 nodeId 查询节点
      const node = await this.mxCadService.getFileSystemNodeByNodeId(nodeId);

      if (!node || !node.path) {
        return res.status(404).json({
          code: -1,
          message: '文件不存在或没有 path',
        });
      }

      this.logger.log(
        `[uploadThumbnail] 获取到节点: ${nodeId}, path=${node.path}`
      );

      // 构建目标目录路径
      // 注意：node.path 包含完整路径（如：202602/nodeId/nodeId.dwg.mxweb）
      // 需要提取目录部分（如：202602/nodeId）
      const filesDataPath = this.configService.get("filesDataPath", { infer: true });
      const nodePathParts = node.path.split('/');
      // 移除最后一个部分（文件名），保留目录部分
      const dirParts = nodePathParts.slice(0, -1);
      const targetDirPath = dirParts.join('/');
      const targetDir = path.resolve(filesDataPath, targetDirPath);

      // 确保目标目录存在
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        this.logger.log(`[uploadThumbnail] 创建目录: ${targetDir}`);
      }

      // 构建目标文件名（固定为 thumbnail.jpg）
      const targetFileName = 'thumbnail.jpg';
      const targetFilePath = path.join(targetDir, targetFileName);

      // 将文件从临时目录直接移动到目标目录
      try {
        // 如果目标文件已存在，先删除
        if (fs.existsSync(targetFilePath)) {
          fs.unlinkSync(targetFilePath);
          this.logger.log(
            `[uploadThumbnail] 删除已存在的缩略图: ${targetFilePath}`
          );
        }

        // 移动文件（而不是拷贝）
        fs.renameSync(file.path, targetFilePath);
        file.path = targetFilePath; // 更新文件路径引用
        this.logger.log(
          `[uploadThumbnail] 缩略图已移动到目标位置: ${targetFilePath}`
        );
      } catch (moveError) {
        this.logger.error(
          `[uploadThumbnail] 移动文件失败: ${moveError.message}`,
          moveError.stack
        );
        return res.status(500).json({
          code: -1,
          message: '移动缩略图失败',
        });
      }

      return res.json({
        code: 0,
        message: '缩略图上传成功',
        data: {
          fileName: targetFileName,
        },
      });
    } catch (error) {
      this.logger.error(
        `[uploadThumbnail] 上传缩略图失败: ${error.message}`,
        error.stack
      );
      return res.status(500).json({
        code: -1,
        message: '上传缩略图失败',
      });
    }
  }

  /**
   * 访问非 CAD 文件（图片、文档等）
   * 从本地存储读取文件流并返回
   *
   * @param storageKey 存储键，格式: files/{userId}/{timestamp}-{filename}
   * @param res Express Response 对象
   * @returns 返回文件流或错误信息
   */
  @Get('files/:storageKey')
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
    status: 404,
    description: '文件不存在',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            code: { type: 'number', example: -1 },
            message: { type: 'string', example: '文件不存在' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            code: { type: 'number', example: -1 },
            message: { type: 'string', example: '获取文件失败' },
          },
        },
      },
    },
  })
  async getNonCadFile(
    @Param('storageKey') storageKey: string,
    @Res() res: Response
  ) {
    try {
      // 验证 storageKey 格式，防止路径遍历攻击
      if (
        !storageKey ||
        storageKey.includes('..') ||
        storageKey.includes('\\')
      ) {
        this.logger.warn(`[getNonCadFile] 无效的 storageKey: ${storageKey}`);
        return res.status(400).json({ code: -1, message: '无效的文件路径' });
      }

      // 处理存储路径：支持新旧路径格式
      let actualStorageKey = storageKey;
      if (storageKey.startsWith('files/')) {
        // 旧路径格式：files/{userId}/{timestamp}-{filename}
        // 尝试从数据库查询对应的节点，获取 fileHash
        this.logger.log(`[getNonCadFile] 检测到旧路径格式: ${storageKey}`);
        try {
          const node =
            await this.mxCadService.getFileSystemNodeByPath(storageKey);
          if (node) {
            const extension = node.extension?.toLowerCase() || '';
            actualStorageKey = `mxcad/file/${node.id}${extension}`;
            this.logger.log(
              `[getNonCadFile] 路径转换: ${storageKey} -> ${actualStorageKey}`
            );
          }
        } catch (queryError) {
          this.logger.warn(
            `[getNonCadFile] 查询节点失败，使用原路径: ${queryError.message}`
          );
        }
      }

      // 从本地存储获取文件流
      const fileStream =
        await this.storageService.getFileStream(actualStorageKey);

      // 设置响应头
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${actualStorageKey.split('/').pop()}"`
      );

      // 返回文件流
      fileStream.pipe(res);

      // 处理流错误
      fileStream.on('error', (error) => {
        this.logger.error(
          `[getNonCadFile] 文件流错误: ${error.message}`,
          error
        );
        if (!res.headersSent) {
          res.status(500).json({ code: -1, message: '获取文件失败' });
        }
      });
    } catch (error: any) {
      this.logger.error(`[getNonCadFile] 获取文件失败: ${storageKey}`, error);
      if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }
      return res.status(500).json({ code: -1, message: '获取文件失败' });
    }
  }

  /**
   * 访问 filesData 目录中的文件
   * 支持访问路径: /mxcad/filesData/YYYYMM/nodeId/nodeId.dwg.mxweb
   * 从本地存储读取文件
   *
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @returns 返回文件流或错误信息
   */
  @Get('filesData/*path')
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
    status: 404,
    description: '文件不存在',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            code: { type: 'number', example: -1 },
            message: { type: 'string', example: '文件不存在' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            code: { type: 'number', example: -1 },
            message: { type: 'string', example: '获取文件失败' },
          },
        },
      },
    },
  })
  async getFilesDataFile(@Res() res: Response, @Req() req: any) {
    // 从 req.params.path 获取完整的路径（支持多层路径）
    const pathArray = req.params.path;
    const filename = Array.isArray(pathArray)
      ? pathArray.join('/')
      : pathArray || '';
    if (!filename) {
      this.logger.error(
        `无法获取文件路径，req.params: ${JSON.stringify(req.params)}`
      );
      return res.status(400).json({ code: -1, message: '无效的文件路径' });
    }
    return this.handleFilesDataFileRequest(filename, res, req, false);
  }

  /**
   * 访问 filesData 目录中的文件 - HEAD 方法
   * 用于获取文件信息而不下载文件内容
   * 注意：HEAD 请求公开访问，因为 MxCAD 库内部发送的 HEAD 请求无法自定义请求头
   * 实际的安全性由 GET 请求和文件路径的随机性保证
   *
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @returns 返回文件头信息或错误信息
   */
  @Head('filesData/*path')
  @ApiResponse({
    status: 200,
    description: '成功获取文件信息',
  })
  @ApiResponse({
    status: 404,
    description: '文件不存在',
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
  })
  async getFilesDataFileHead(@Res() res: Response, @Req() req: any) {
    // 从 req.params.path 获取完整的路径（支持多层路径）
    const pathArray = req.params.path;
    const filename = Array.isArray(pathArray)
      ? pathArray.join('/')
      : pathArray || '';
    if (!filename) {
      this.logger.error(
        `无法获取文件路径，req.params: ${JSON.stringify(req.params)}`
      );
      return res.status(400).json({ code: -1, message: '无效的文件路径' });
    }
    return this.handleFilesDataFileRequest(filename, res, req, true);
  }

  /**
   * 处理 filesData 目录的文件请求
   * @param filename 文件名
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @param isHeadRequest 是否为 HEAD 请求
   */
  private async handleFilesDataFileRequest(
    filename: string,
    @Res() res: Response,
    @Req() req: any,
    isHeadRequest: boolean
  ) {
    try {
      // 调试日志
      this.logger.log(
        `访问 filesData 文件: ${filename}, 方法: ${isHeadRequest ? 'HEAD' : 'GET'}`
      );

      // Express 的 *filename 通配符会将路径中的 / 替换为 ,，需要先还原
      const normalizedFilename = filename.replace(/,/g, '/');

      // 检查是否请求历史版本（通过 v 参数）
      const versionParam = req.query.v as string | undefined;

      if (versionParam) {
        // 请求历史版本
        return this.handleHistoricalVersionRequest(
          normalizedFilename,
          versionParam,
          res,
          req,
          isHeadRequest
        );
      }

      // 正常请求：构建完整的文件路径: filesData/YYYYMM/nodeId/nodeId.dwg.mxweb
      const filesDataPath = this.configService.get("filesDataPath", { infer: true });
      const absoluteFilePath = path.resolve(filesDataPath, normalizedFilename);
      console.log(filesDataPath, filename, fs.existsSync(absoluteFilePath));
      this.logger.log(`尝试访问文件: ${absoluteFilePath}`);

      // 检查文件是否存在
      if (!fs.existsSync(absoluteFilePath)) {
        this.logger.error(`文件不存在: ${absoluteFilePath}`);
        return res.status(404).json({ code: -1, message: '文件不存在' });
      }

      // 获取文件信息
      const fileStats = fs.statSync(absoluteFilePath);

      if (isHeadRequest) {
        // 对于 HEAD 请求，只返回头部信息
        const contentType = this.getContentType(absoluteFilePath);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', fileStats.size);
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
        res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问
        res.end();
        return;
      }

      // GET 请求直接返回文件流
      const contentType = this.getContentType(absoluteFilePath);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileStats.size);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // 创建文件流并返回
      const fileStream = fs.createReadStream(absoluteFilePath);
      fileStream.pipe(res);

      // 监听流错误
      fileStream.on('error', (error) => {
        this.logger.error(`文件流错误: ${error.message}`, error);
        if (!res.headersSent) {
          res.status(500).json({ code: -1, message: '获取文件失败' });
        }
      });

      this.logger.log(`成功返回文件: ${absoluteFilePath}`);
    } catch (error) {
      this.logger.error(
        `获取 filesData 文件失败: ${error.message}`,
        error.stack
      );
      if (!res.headersSent) {
        res.status(500).json({ code: -1, message: '获取文件失败' });
      }
    }
  }

  /**
   * 处理历史版本文件请求
   * @param filename 文件路径
   * @param version 版本号
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @param isHeadRequest 是否为 HEAD 请求
   */
  private async handleHistoricalVersionRequest(
    filename: string,
    version: string,
    @Res() res: Response,
    @Req() req: any,
    isHeadRequest: boolean
  ) {
    try {
      this.logger.log(
        `访问历史版本文件: ${filename} v${version}, 方法: ${isHeadRequest ? 'HEAD' : 'GET'}`
      );

      // 构建完整的文件路径
      const filesDataPath = this.configService.get("filesDataPath", { infer: true });
      const absoluteFilePath = path.resolve(filesDataPath, filename);

      // 对于 HEAD 请求，直接返回本地文件信息（当前版本），不从 SVN 获取
      if (isHeadRequest) {
        this.logger.log(`HEAD 请求 - 返回本地文件信息: ${absoluteFilePath}`);

        // 检查本地文件是否存在
        if (!fs.existsSync(absoluteFilePath)) {
          this.logger.error(`本地文件不存在: ${absoluteFilePath}`);
          return res.status(404).json({ code: -1, message: '文件不存在' });
        }

        // 获取本地文件信息
        const fileStats = fs.statSync(absoluteFilePath);
        const contentType = this.getContentType(filename);

        // 对于历史版本，使用 ETag 包含版本号，确保浏览器不会错误使用缓存
        const etag = `"v${version}-${fileStats.mtime.getTime()}"`;

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', fileStats.size);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // 禁用缓存
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('ETag', etag);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end();
        return;
      }

      // GET 请求：从版本控制服务获取历史版本文件内容
      this.logger.log(
        `GET 请求 - 从 SVN 获取历史版本: ${filename} v${version}`
      );

      // 对于历史版本，忽略条件请求头，始终返回完整内容
      res.removeHeader('If-None-Match');
      res.removeHeader('If-Modified-Since');

      let buffer: Buffer;

      // 如果请求的是 .mxweb 文件，需要处理历史版本
      if (filename.endsWith('.mxweb')) {
        // 获取文件所在目录和基础文件名
        const fileDir = path.dirname(absoluteFilePath);
        const mxwebBaseName = path.basename(filename); // 如: xxx.dxf.mxweb

        // 历史版本 mxweb 文件命名：{basename}_v{revision}.mxweb
        // 例如：xxx.dxf_v78.mxweb
        const historyMxwebName = mxwebBaseName.replace(
          /\.mxweb$/,
          `_v${version}.mxweb`
        );
        const historyMxwebPath = path.join(fileDir, historyMxwebName);

        // 检查是否已有转换好的历史版本 mxweb 文件
        if (fs.existsSync(historyMxwebPath)) {
          this.logger.log(
            `历史版本 mxweb 已存在，直接返回: ${historyMxwebName}`
          );
          buffer = await fsPromises.readFile(historyMxwebPath);
        } else {
          // 没有缓存，需要从 SVN 获取 bin 文件并转换
          this.logger.log(
            `历史版本 mxweb 不存在，从 SVN 获取 .bin 分片文件并转换`
          );

          // 列出目录内容，找到所有分片 bin 文件
          const listResult =
            await this.versionControlService.listDirectoryAtRevision(
              fileDir,
              parseInt(version, 10)
            );

          if (!listResult.success || !listResult.files) {
            this.logger.error(`无法列出目录内容: ${fileDir} v${version}`);
            return res.status(404).json({
              code: -1,
              message: '历史版本目录不存在',
            });
          }

          // 筛选出匹配的分片 bin 文件：{basename}_{index}.mxweb.bin
          const binPattern = new RegExp(
            `^${mxwebBaseName.replace(/\./g, '\\.')}_\\d+\\.mxweb\\.bin$`
          );
          const binFiles = listResult.files.filter((f) => binPattern.test(f));

          if (binFiles.length === 0) {
            this.logger.error(`未找到分片 bin 文件，模式: ${binPattern}`);
            return res.status(404).json({
              code: -1,
              message: '历史版本文件不存在',
            });
          }

          this.logger.log(`找到 ${binFiles.length} 个分片 bin 文件`);

          // 创建临时目录用于存放 bin 分片文件
          const tempDir = path.join(
            os.tmpdir(),
            `mxcad-history-${version}-${Date.now()}`
          );
          await fsPromises.mkdir(tempDir, { recursive: true });

          // 获取所有分片文件并保存到临时目录（保持原文件名，转换程序会自动处理分片）
          for (const binFile of binFiles) {
            const binFilePath = path.join(fileDir, binFile);
            this.logger.log(`获取分片文件: ${binFile} v${version}`);

            const binResult =
              await this.versionControlService.getFileContentAtRevision(
                binFilePath,
                parseInt(version, 10)
              );

            if (!binResult.success || !binResult.content) {
              this.logger.error(`获取分片文件失败: ${binFile} v${version}`);
              await this.cleanupTempFiles(tempDir);
              return res.status(404).json({
                code: -1,
                message: `分片文件获取失败: ${binFile}`,
              });
            }

            // 保存分片文件到临时目录，保持原文件名
            const tempBinFile = path.join(tempDir, binFile);
            await fsPromises.writeFile(tempBinFile, binResult.content);
          }

          // 转换 bin 文件为 mxweb
          // srcpath 指向不带分片序号的 bin 文件名，转换程序会自动查找分片文件
          // 输出到节点目录，命名为历史版本格式
          const binSrcPath = path.join(tempDir, `${mxwebBaseName}.bin`);
          const conversionResult =
            await this.fileConversionService.convertBinToMxweb(
              binSrcPath,
              fileDir,
              historyMxwebName
            );

          // 清理临时目录
          await this.cleanupTempFiles(tempDir);

          if (!conversionResult.success || !conversionResult.outputPath) {
            this.logger.error(`bin→mxweb 转换失败: ${conversionResult.error}`);
            return res.status(500).json({
              code: -1,
              message: `历史版本文件转换失败: ${conversionResult.error}`,
            });
          }

          // 读取转换后的 .mxweb 文件
          buffer = await fsPromises.readFile(conversionResult.outputPath);

          this.logger.log(`成功转换并保存历史版本 mxweb: ${historyMxwebName}`);
        }
      } else {
        // 非 .mxweb 文件（如 .dwg、.json 等），直接从 SVN 获取
        const result =
          await this.versionControlService.getFileContentAtRevision(
            absoluteFilePath,
            parseInt(version, 10)
          );

        if (!result.success || !result.content) {
          this.logger.error(
            `历史版本文件不存在或读取失败: ${filename} v${version}`
          );
          return res.status(404).json({
            code: -1,
            message: result.message || '历史版本文件不存在',
          });
        }

        buffer = result.content;
        this.logger.log(`成功返回历史版本文件: ${filename} v${version}`);
      }

      // 设置响应头
      const contentType = this.getContentType(filename);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // 历史版本不缓存
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问

      // 发送文件流
      res.status(200).send(buffer);

      this.logger.log(`成功返回历史版本文件: ${filename} v${version}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `获取历史版本文件失败: ${filename} v${version}, 错误: ${err.message}`,
        err.stack
      );
      if (!res.headersSent) {
        res.status(500).json({ code: -1, message: '获取历史版本文件失败' });
      }
    }
  }

  /**
   * 清理临时文件目录
   * @param tempDir 临时目录路径
   */
  private async cleanupTempFiles(tempDir: string): Promise<void> {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
      this.logger.log(`已清理临时目录: ${tempDir}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn(`清理临时目录失败: ${tempDir}, 错误: ${err.message}`);
    }
  }

  /**
   * 根据文件扩展名获取 MIME 类型
   * @param filePath 文件路径
   * @returns MIME 类型
   */
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mxweb': 'application/octet-stream',
      '.dwg': 'application/dwg',
      '.dxf': 'application/dxf',
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.json': 'application/json',
      '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * 访问转换后的文件 (.mxweb) - GET 方法
   * 支持 MxCAD-App 访问路径: /mxcad/file/{filename}
   * 从本地存储读取文件
   *
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @returns 返回文件流或错误信息
   */
  @Get('file/*path')
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
    status: 404,
    description: '文件不存在',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            code: { type: 'number', example: -1 },
            message: { type: 'string', example: '文件不存在' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            code: { type: 'number', example: -1 },
            message: { type: 'string', example: '获取文件失败' },
          },
        },
      },
    },
  })
  async getFile(@Res() res: Response, @Req() req: any) {
    // 从 req.params.path 获取完整的路径（支持多层路径）
    // req.params.path 可能是数组，需要拼接成字符串
    const pathArray = req.params.path;
    const filename = Array.isArray(pathArray)
      ? pathArray.join('/')
      : pathArray || '';
    if (!filename) {
      this.logger.error(
        `无法获取文件路径，req.params: ${JSON.stringify(req.params)}`
      );
      return res.status(400).json({ code: -1, message: '无效的文件路径' });
    }
    return this.handleFileRequest(filename, res, req, false);
  }

  /**
   * 访问转换后的文件 (.mxweb) - HEAD 方法
   * 用于获取文件信息而不下载文件内容
   *
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @returns 返回文件头信息或错误信息
   */
  @Head('file/*path')
  @ApiResponse({
    status: 200,
    description: '成功获取文件信息',
  })
  @ApiResponse({
    status: 404,
    description: '文件不存在',
  })
  @ApiResponse({
    status: 500,
    description: '服务器内部错误',
  })
  async getFileHead(@Res() res: Response, @Req() req: any) {
    // 从 req.params.path 获取完整的路径（支持多层路径）
    // req.params.path 可能是数组，需要拼接成字符串
    const pathArray = req.params.path;
    const filename = Array.isArray(pathArray)
      ? pathArray.join('/')
      : pathArray || '';
    if (!filename) {
      this.logger.error(
        `无法获取文件路径，req.params: ${JSON.stringify(req.params)}`
      );
      return res.status(400).json({ code: -1, message: '无效的文件路径' });
    }
    return this.handleFileRequest(filename, res, req, true);
  }

  /**
   * 统一的文件请求处理方法
   * @param filename 文件名
   * @param res Express Response 对象
   * @param req Express Request 对象
   * @param isHeadRequest 是否为 HEAD 请求
   */
  private async handleFileRequest(
    filename: string,
    @Res() res: Response,
    @Req() req: any,
    isHeadRequest: boolean
  ) {
    try {
      // 对于文件访问请求，优先使用 Session 认证，如果 Session 不存在则回退到 JWT token
      // 通过文件路径查找 FileSystemNode 并验证权限

      // 调试日志
      this.logger.log(`原始 filename 参数: "${filename}"`);
      this.logger.log(
        `访问文件请求: ${filename}, 方法: ${isHeadRequest ? 'HEAD' : 'GET'}, Authorization: ${req.headers.authorization ? 'present' : 'missing'}`
      );
      this.logger.log(`Session 信息: ${JSON.stringify(req.session)}`);
      this.logger.log(`Cookies: ${JSON.stringify(req.cookies)}`);

      let userId: string;

      // 优先尝试从 Session 获取用户 ID（用于 img.src 等无法携带请求头的场景）
      if (req.session?.userId) {
        userId = req.session.userId;
        this.logger.log(`使用 Session 认证成功: ${userId}`);
      } else {
        // Session 不存在，回退到 JWT Token 认证
        try {
          userId = await this.validateTokenAndGetUserId(req);
          this.logger.log(`使用 JWT Token 认证成功: ${userId}`);
        } catch (authError) {
          this.logger.warn(`认证失败: ${authError.message}`);
          return res.status(401).json({ code: -1, message: authError.message });
        }
      }

      // Express 的 *filename 通配符会将路径中的 / 替换为 ,，需要先还原
      const normalizedFilename = filename.replace(/,/g, '/');

      // 从文件路径中提取节点 ID（格式：nodeId/filename）
      const pathParts = normalizedFilename.split('/');
      const nodeId = pathParts[0]; // 第一个部分是节点 ID
      const actualFilename =
        pathParts.length > 1
          ? pathParts.slice(1).join('/')
          : normalizedFilename;

      this.logger.log(
        `提取的nodeId: ${nodeId}, actualFilename: ${actualFilename}`
      );

      // 通过节点 ID 查找节点，验证用户是否有访问权限
      const node = await this.prisma.fileSystemNode.findFirst({
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
        },
      });

      this.logger.log(
        `查找文件节点: nodeId=${nodeId}, 找到=${node ? '是' : '否'}`
      );

      if (!node) {
        // 文件节点不存在，降级到本地文件系统查找（兼容旧文件）
        this.logger.log(
          `文件节点不存在，降级到本地文件系统: ${normalizedFilename}`
        );
      } else {
        // 检查用户是否有权限
        const permission = await this.checkFileAccessPermission(
          node.id,
          userId,
          userId
        );
        const hasPermission = !!permission;

        this.logger.log(
          `权限检查结果: userId=${userId}, hasPermission=${hasPermission}, nodeId=${nodeId}`
        );

        if (!hasPermission) {
          return res.status(401).json({
            code: -1,
            message: 'Unauthorized',
          });
        }
      }

      // 根据文件扩展名确定可能的存储路径
      const ext = path.extname(normalizedFilename).toLowerCase();
      const possiblePaths: string[] = [];

      // 对于 MxCAD 转换文件，使用 mxcad/file/ 路径
      if (ext === this.mxCadFileExt) {
        possiblePaths.push(`mxcad/file/${normalizedFilename}`);
      }
      // 对于 .jpg 缩略图文件，只尝试 mxcad/file/ 路径
      else if (ext === '.jpg') {
        possiblePaths.push(`mxcad/file/${normalizedFilename}`);
      }
      // 对于 JSON 文件
      else if (ext === '.json') {
        possiblePaths.push(`mxcad/file/${normalizedFilename}`);
        possiblePaths.push(normalizedFilename);
      }
      // 其他文件类型
      else {
        possiblePaths.push(`mxcad/file/${normalizedFilename}`);
        possiblePaths.push(normalizedFilename);
      }

      this.logger.log(`访问文件 - 尝试路径: ${possiblePaths.join(', ')}`);

      let foundStoragePath: string | null = null;

      // 尝试找到文件
      for (const mxcadPath of possiblePaths) {
        try {
          const exists = await this.storageService.fileExists(mxcadPath);
          if (exists) {
            foundStoragePath = mxcadPath;
            this.logger.log(`找到存储文件: ${mxcadPath}`);
            break;
          }
        } catch (error) {
          this.logger.log(`路径 ${mxcadPath} 不存在，尝试下一个路径`);
        }
      }

      if (foundStoragePath) {
        // 存储中存在文件
        if (isHeadRequest) {
          // 对于 HEAD 请求，获取文件信息
          try {
            const fileInfo = await this.storageService.getFileInfo(
              foundStoragePath!
            );

            if (fileInfo) {
              // 设置响应头
              res.setHeader('Content-Type', fileInfo.contentType);
              res.setHeader('Content-Length', fileInfo.contentLength);
              res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
              res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问

              // HEAD 请求只返回头部信息
              res.end();
              return;
            } else {
              throw new Error(`获取存储文件信息失败: ${normalizedFilename}`);
            }
          } catch (error) {
            this.logger.error(`获取存储文件信息失败: ${error.message}`, error);
            throw error;
          }
        } else {
          // GET 请求直接返回文件流
          try {
            this.logger.log(`准备返回文件流: ${foundStoragePath}`);
            const fileStream = await this.storageService.getFileStream(
              foundStoragePath!
            );

            // 设置响应头
            const fileInfo = await this.storageService.getFileInfo(
              foundStoragePath!
            );

            if (fileInfo) {
              res.setHeader('Content-Type', fileInfo.contentType);
              res.setHeader('Content-Length', fileInfo.contentLength);
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.setHeader('Access-Control-Allow-Origin', '*');
            }

            // 返回文件流
            this.logger.log(`开始返回文件流: ${foundStoragePath}`);

            // 监听流错误
            fileStream.on('error', (error) => {
              this.logger.error(`文件流错误: ${error.message}`, error);
              if (!res.headersSent) {
                res.status(500).json({ code: -1, message: '文件流错误' });
              }
            });

            fileStream.pipe(res);
            return;
          } catch (error) {
            this.logger.error(`获取存储文件流失败: ${error.message}`, error);
            throw error;
          }
        }
      }

      // 存储中不存在文件，返回 404
      this.logger.warn(`文件不存在: ${normalizedFilename}`);
      return res.status(404).json({
        code: -1,
        message: '文件不存在',
      });
    } catch (error) {
      this.logger.error(`访问文件失败: ${error.message}`, error);
      if (!res.headersSent) {
        res.status(500).json({
          code: -1,
          message: '访问文件失败',
        });
      }
    }
  }

  /**
   * 从请求中构建上下文信息，通过JWT验证用户身份
   * 强制要求JWT认证，确保安全性
   */
  private async buildContextFromRequest(request: any): Promise<any> {
    try {
      // 1. 必须从 Authorization header 获取 JWT token
      if (!request.headers.authorization) {
        throw new UnauthorizedException(
          '缺少Authorization header，请提供有效的JWT token'
        );
      }

      const token = request.headers.authorization.replace('Bearer ', '');

      let payload;
      try {
        payload = this.jwtService.verify(token);
      } catch (error) {
        throw new UnauthorizedException('JWT token无效或已过期');
      }

      // 2. 验证用户存在且状态正常
      const userData = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          nickname: true,
          role: true,
          status: true,
        },
      });

      if (!userData) {
        throw new UnauthorizedException('用户不存在');
      }

      if (userData.status !== 'ACTIVE') {
        throw new UnauthorizedException('用户账号已被禁用');
      }

      this.logger.log(`JWT 验证成功: ${userData.username}`);

      // 3. 从多个来源获取节点信息：
      // - POST 请求：从 request.body 获取
      // - GET/HEAD 请求：从 request.query 获取
      // nodeId 是当前文件夹或项目根目录的 FileSystemNode ID
      const nodeId = request.body?.nodeId || request.query?.nodeId;

      this.logger.log(
        `🔍 解析参数: body.nodeId=${request.body?.nodeId}, query.nodeId=${request.query?.nodeId}`
      );
      this.logger.log(`🔍 最终值: nodeId=${nodeId}`);

      // 4. 严格验证 nodeId 是否存在
      if (!nodeId) {
        throw new Error('缺少节点ID（nodeId），无法创建文件系统节点');
      }

      // 5. 构建上下文
      const context = {
        nodeId,
        userId: userData.id,
        userRole: userData.role,
      };

      this.logger.log(`构建上下文: userId=${userData.id}, nodeId=${nodeId}`);
      return context;
    } catch (error) {
      this.logger.error(`构建上下文失败: ${error.message}`, error);

      // 验证失败时抛出异常，不再返回空上下文
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('身份验证失败');
    }
  }

  /**
   * 验证 JWT token 并返回用户 ID（用于文件访问）
   * @param request Express Request 对象
   * @returns 用户 ID
   */
  private async validateTokenAndGetUserId(request: any): Promise<string> {
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('缺少Authorization header');
    }

    const token = authorization.replace('Bearer ', '');

    let payload;
    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('JWT token无效或已过期');
    }

    const userData = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, status: true },
    });

    if (!userData) {
      throw new UnauthorizedException('用户不存在');
    }

    if (userData.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户账号已被禁用');
    }

    return userData.id;
  }

  /**
   * 获取项目中的所有节点ID（递归）
   * @param projectId 项目根目录ID
   * @returns 所有节点ID数组
   */
  private async getAllNodeIdsInProject(projectId: string): Promise<string[]> {
    const nodeIds: string[] = [];

    const collectNodeIds = async (nodeId: string): Promise<void> => {
      const children = await this.prisma.fileSystemNode.findMany({
        where: { parentId: nodeId, deletedAt: null },
        select: { id: true, isFolder: true },
      });

      for (const child of children) {
        nodeIds.push(child.id);
        if (child.isFolder) {
          await collectNodeIds(child.id);
        }
      }
    };

    nodeIds.push(projectId); // 包含项目根目录本身
    await collectNodeIds(projectId);

    return nodeIds;
  }

  /**
   * 通过文件哈希值查找 FileSystemNode
   * @param fileHash 文件哈希值
   * @param projectId 项目ID（可选，如果指定则只查找该项目中的节点）
   * @returns FileSystemNode 或 null
   */
  private async getFileSystemNodeByHash(
    fileHash: string,
    projectId?: string
  ): Promise<any> {
    try {
      const where: any = {
        fileHash: fileHash,
        isFolder: false,
        deletedAt: null,
      };

      // 如果指定了 projectId，只查找该项目中的节点
      if (projectId) {
        const allNodeIds = await this.getAllNodeIdsInProject(projectId);
        where.id = { in: allNodeIds };
      }

      // 查找文件哈希匹配的文件节点
      const node = await this.prisma.fileSystemNode.findFirst({
        where,
        select: {
          id: true,
          name: true,
          ownerId: true,
          parentId: true,
          isRoot: true,
          fileHash: true,
        },
      });

      return node;
    } catch (error) {
      this.logger.error(`查找文件节点失败: ${error.message}`, error);
      return null;
    }
  }

  /**
   * 根据节点 ID 查找项目根目录
   * @param nodeId 节点 ID
   * @returns 项目根目录节点或 null
   */
  private async getProjectRootByNodeId(nodeId: string): Promise<any> {
    try {
      // 先检查当前节点是否是项目根目录
      const currentNode = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { id: true, isRoot: true, parentId: true },
      });

      if (!currentNode) {
        return null;
      }

      if (currentNode.isRoot) {
        return currentNode;
      }

      // 如果不是根目录，递归查找父节点
      if (currentNode.parentId) {
        return this.getProjectRootByNodeId(currentNode.parentId);
      }

      return null;
    } catch (error) {
      this.logger.error(`查找项目根目录失败: ${error.message}`, error);
      return null;
    }
  }

  /**
   * 检查用户是否有文件访问权限
   * @param nodeId 文件节点 ID
   * @param userId 用户 ID
   * @param checkUserId 要检查权限的用户 ID
   * @returns 是否有权限
   */
  private async checkFileAccessPermission(
    nodeId: string,
    userId: string,
    checkUserId: string
  ): Promise<boolean> {
    try {
      this.logger.log(
        `[checkFileAccessPermission] 开始检查权限: nodeId=${nodeId}, checkUserId=${checkUserId}`
      );

      const role = await this.permissionService.getNodeAccessRole(
        checkUserId,
        nodeId
      );

      const hasPermission = role !== null;
      this.logger.log(
        `[checkFileAccessPermission] 权限检查结果: ${hasPermission}, role=${role}`
      );

      return hasPermission;
    } catch (error) {
      this.logger.error(`检查文件访问权限失败: ${error.message}`, error);
      return false;
    }
  }

  /**
   * 验证文件名是否安全（防止路径遍历攻击）
   * @param fileName 文件名
   * @returns 是否安全
   */
  private validateFileName(fileName: string): boolean {
    // 检查文件名是否包含路径遍历字符
    if (
      fileName.includes('..') ||
      fileName.includes('/') ||
      fileName.includes('\\')
    ) {
      return false;
    }

    // 检查文件名是否为空
    if (!fileName || fileName.trim().length === 0) {
      return false;
    }

    // 检查文件名长度（限制为 255 字符）
    if (fileName.length > 255) {
      return false;
    }

    // 检查文件名是否包含非法字符（Windows 和 Linux 都不允许的字符）
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(fileName)) {
      return false;
    }

    // 单独检查控制字符
    for (let i = 0; i < fileName.length; i++) {
      const charCode = fileName.charCodeAt(i);
      if (charCode < 0x20 || charCode === 0x7f) {
        return false;
      }
    }

    return true;
  }

  /**
   * 验证文件大小是否在允许范围内
   * @param fileSize 文件大小（字节）
   * @param maxSize 最大文件大小（字节），默认 100MB
   * @returns 是否在允许范围内
   */
  private validateFileSize(
    fileSize: number,
    maxSize: number = 104857600
  ): boolean {
    return fileSize > 0 && fileSize <= maxSize;
  }

  /**
   * 验证文件类型是否允许
   * @param fileName 文件名
   * @param allowedExtensions 允许的文件扩展名列表
   * @returns 是否允许
   */
  private validateFileType(
    fileName: string,
    allowedExtensions: string[] = [
      '.dwg',
      '.dxf',
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.bmp',
      '.webp',
    ]
  ): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return allowedExtensions.includes(ext);
  }

  /**
   * 验证外部参照上传请求
   * @param file 上传的文件
   * @param body 请求体
   * @param methodPrefix 方法前缀（用于日志）
   * @param allowedExtensions 允许的文件扩展名列表
   * @returns 验证结果
   */
  private async validateExtReferenceUpload(
    file: Express.Multer.File | null,
    body: UploadExtReferenceDto,
    methodPrefix: string,
    allowedExtensions: string[]
  ): Promise<{
    success: boolean;
    error?: { code: number; message: string };
    preloadingData?: any;
  }> {
    // 1. 验证文件
    if (!file) {
      this.logger.warn(`[${methodPrefix}] 缺少文件`);
      return { success: false, error: { code: -1, message: '缺少文件' } };
    }

    // 2. 验证参数
    if (!body.nodeId || !body.ext_ref_file) {
      this.logger.warn(`[${methodPrefix}] 缺少必要参数`);
      return { success: false, error: { code: -1, message: '缺少必要参数' } };
    }

    // 3. 验证图纸文件是否存在
    const preloadingData = await this.mxCadService.getPreloadingData(
      body.nodeId
    );
    if (!preloadingData) {
      this.logger.warn(
        `[${methodPrefix}] 图纸文件不存在: nodeId=${body.nodeId}`
      );
      return { success: false, error: { code: -1, message: '图纸文件不存在' } };
    }

    // 4. 验证外部参照文件是否在预加载数据列表中
    const isValidReference =
      preloadingData.externalReference.includes(body.ext_ref_file) ||
      preloadingData.images.includes(body.ext_ref_file);

    if (!isValidReference) {
      this.logger.warn(
        `[${methodPrefix}] 无效的外部参照文件: ${body.ext_ref_file}`
      );
      return {
        success: false,
        error: { code: -1, message: '无效的外部参照文件' },
      };
    }

    // 5. 验证文件名安全性（防止路径遍历攻击）
    if (!this.validateFileName(body.ext_ref_file)) {
      this.logger.warn(
        `[${methodPrefix}] 文件名包含非法字符: ${body.ext_ref_file}`
      );
      return {
        success: false,
        error: { code: -1, message: '文件名包含非法字符' },
      };
    }

    // 6. 验证文件大小
    if (!this.validateFileSize(file.size)) {
      this.logger.warn(
        `[${methodPrefix}] 文件大小超出限制: ${file.size} bytes`
      );
      return {
        success: false,
        error: { code: -1, message: '文件大小超出限制（最大 100MB）' },
      };
    }

    // 7. 验证文件类型
    if (!this.validateFileType(body.ext_ref_file, allowedExtensions)) {
      this.logger.warn(
        `[${methodPrefix}] 不支持的文件类型: ${body.ext_ref_file}`
      );
      const allowedTypes = allowedExtensions.join(', ');
      return {
        success: false,
        error: { code: -1, message: `仅支持 ${allowedTypes} 文件` },
      };
    }

    return { success: true, preloadingData };
  }
}
