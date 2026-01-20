import {
  Controller,
  Post,
  Get,
  Head,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpStatus,
  HttpCode,
  Param,
  Res,
  Req,
  Logger,
  UseGuards,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import {
  ApiTags,
  ApiConsumes,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MxCadService } from './mxcad.service';
import { ConvertDto } from './dto/convert.dto';
import { DatabaseService } from '../database/database.service';
import { TzDto } from './dto/tz.dto';
import { PreloadingDataDto } from './dto/preloading-data.dto';
import { UploadExtReferenceDto } from './dto/upload-ext-reference.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { MinioSyncService } from './minio-sync.service';

@ApiTags('MxCAD 文件上传与转换')
@Controller('mxcad')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MxCadController {
  private readonly logger = new Logger(MxCadController.name);
  private readonly mxCadFileExt: string;

  constructor(
    private readonly mxCadService: MxCadService,
    private readonly prisma: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly minioSyncService: MinioSyncService
  ) {
    this.mxCadFileExt = this.configService.get('MXCAD_FILE_EXT') || '.mxweb';
  }

  @Get('test')
  @ApiResponse({
    status: 200,
    description: '测试端点',
  })
  async test(@Req() req: any) {
    this.logger.log(`[Test Endpoint] Called`);
    this.logger.log(`[Test Endpoint] Session: ${JSON.stringify(req.session)}`);
    this.logger.log(`[Test Endpoint] User: ${JSON.stringify(req.user)}`);
    return { message: 'OK', session: req.session, user: req.user };
  }

  /**
   * 检查分片是否存在
   */
  @Post('files/chunkisExist')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '检查分片是否存在' })
  async checkChunkExist(
    @Body() body: any,
    @Req() request: any,
    @Res() res: Response
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
    return res.json(result);
  }

  /**
   * 检查文件是否存在
   */
  @Post('files/fileisExist')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '检查文件是否存在' })
  async checkFileExist(
    @Body() body: any,
    @Req() request: any,
    @Res() res: Response
  ) {
    const context = await this.buildContextFromRequest(request);
    const result = await this.mxCadService.checkFileExist(
      body.filename,
      body.fileHash,
      context
    );
    return res.json(result);
  }

  /**
   * 检查图纸状态
   */
  @Post('files/tz')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '检查图纸状态' })
  async checkTzStatus(@Body() dto: TzDto, @Res() res: Response) {
    const result = await this.mxCadService.checkTzStatus(dto.fileHash);
    return res.json(result);
  }

  /**
   * 获取外部参照预加载数据
   *
   * @param fileHash 文件哈希值
   * @returns 预加载数据
   * @throws NotFoundException 预加载数据不存在时抛出异常
   */
  @Get('file/:hash/preloading')
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
    @Param('hash') fileHash: string
  ): Promise<PreloadingDataDto> {
    this.logger.debug(`[getPreloadingData] 请求参数: fileHash=${fileHash}`);

    const data = await this.mxCadService.getPreloadingData(fileHash);

    if (!data) {
      this.logger.warn(`[getPreloadingData] 预加载数据不存在: ${fileHash}`);
      throw new NotFoundException('预加载数据不存在');
    }

    this.logger.debug(`[getPreloadingData] 成功返回预加载数据: ${fileHash}`);
    return data;
  }

  /**
   * 检查外部参照文件是否存在
   *
   * @param fileHash 源图纸文件的哈希值
   * @param body 请求体，包含 fileName 字段
   * @returns 文件是否存在
   */
  @Post('file/:hash/check-reference')
  @ApiResponse({
    status: 200,
    description: '成功检查文件存在性',
    schema: {
      type: 'object',
      properties: {
        exists: { type: 'boolean', description: '文件是否存在' },
      },
    },
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
    @Param('hash') fileHash: string,
    @Body() body: { fileName: string },
    @Res() res: Response
  ) {
    this.logger.log(
      `[checkExternalReference] 请求参数: fileHash=${fileHash}, fileName=${body.fileName}`
    );

    // 验证参数
    if (!body.fileName) {
      return res
        .status(400)
        .json({ code: -1, message: '缺少必要参数: fileName' });
    }

    const exists = await this.mxCadService.checkExternalReferenceExists(
      fileHash,
      body.fileName
    );

    this.logger.log(`[checkExternalReference] 检查结果: ${exists}`);

    return res.json({ exists });
  }

  /**
   * 获取文件的外部参照统计信息
   * @param fileHash 文件哈希值
   * @returns 外部参照统计信息
   */
  @Get('file/:hash/external-references')
  @ApiResponse({
    status: 200,
    description: '成功获取外部参照统计信息',
    schema: {
      type: 'object',
      properties: {
        hasMissing: { type: 'boolean', description: '是否有缺失的外部参照' },
        missingCount: { type: 'number', description: '缺失的外部参照数量' },
        totalCount: { type: 'number', description: '总外部参照数量' },
        references: { type: 'array', description: '外部参照列表' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: '文件不存在',
  })
  async getExternalReferences(
    @Param('hash') fileHash: string,
    @Res() res: Response
  ) {
    this.logger.log(`[getExternalReferences] 请求参数: fileHash=${fileHash}`);

    try {
      const stats = await this.mxCadService.getExternalReferenceStats(fileHash);

      this.logger.log(
        `[getExternalReferences] 检查结果: 缺失=${stats.missingCount}, 总数=${stats.totalCount}`
      );

      return res.json(stats);
    } catch (error) {
      this.logger.error(`[getExternalReferences] 获取失败: ${error.message}`);
      return res
        .status(500)
        .json({ code: -1, message: '获取外部参照信息失败' });
    }
  }

  /**
   * 手动刷新文件的外部参照信息
   * @param fileHash 文件哈希值
   * @returns 刷新结果
   */
  @Post('file/:hash/refresh-external-references')
  @ApiResponse({
    status: 200,
    description: '刷新成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: '刷新成功' },
        stats: { type: 'object', description: '外部参照统计信息' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: '刷新失败',
  })
  async refreshExternalReferences(
    @Param('hash') fileHash: string,
    @Res() res: Response
  ) {
    this.logger.log(
      `[refreshExternalReferences] 请求参数: fileHash=${fileHash}`
    );

    try {
      const stats = await this.mxCadService.getExternalReferenceStats(fileHash);
      await this.mxCadService.updateExternalReferenceInfo(fileHash, stats);

      this.logger.log(`[refreshExternalReferences] 刷新成功: ${fileHash}`);

      return res.json({
        code: 0,
        message: '刷新成功',
        stats,
      });
    } catch (error) {
      this.logger.error(
        `[refreshExternalReferences] 刷新失败: ${error.message}`
      );
      return res.status(500).json({ code: -1, message: '刷新失败' });
    }
  }

  /**
   * 上传文件（支持分片）
   */
  @Post('files/uploadFiles')
  @UseInterceptors(FileInterceptor('file'))
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
  @ApiResponse({ status: 200, description: '上传文件' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Req() request: any,
    @Res() res: Response
  ) {
    // 检查是否为合并请求（没有文件，只有 chunks 信息）
    const isMergeRequest = !file && body.chunks !== undefined;

    // 合并请求不需要检查 file，但需要检查必要参数
    if (!isMergeRequest && !file) {
      return res.json({ ret: 'errorparam' });
    }

    if (!body.hash || !body.name || !body.size) {
      return res.json({ ret: 'errorparam' });
    }

    if (body.chunk !== undefined && body.chunks === undefined) {
      return res.json({ ret: 'errorparam' });
    }

    // 构建上下文 - 从JWT token验证用户身份
    const context = await this.buildContextFromRequest(request);

    // 优先处理合并请求（没有文件，有 chunks 信息）
    if (isMergeRequest) {
      try {
        const result = await this.mxCadService.mergeChunksWithPermission(
          body.hash,
          body.name,
          parseInt(body.size, 10),
          parseInt(body.chunks, 10),
          context,
          body.src_dwgfile_hash // 外部参照上传时的源图纸哈希
        );
        return res.json(result);
      } catch (error) {
        this.mxCadService.logError(`文件合并失败: ${error.message}`, error);
        return res.json({ ret: 'convertFileError' });
      }
    }

    if (body.chunk !== undefined) {
      // 分片上传 - 手动处理文件移动
      try {
        // 获取临时目录路径
        const tempPath =
          process.env.MXCAD_TEMP_PATH || path.join(process.cwd(), 'temp');
        const chunkDir = path.join(tempPath, `chunk_${body.hash}`);

        // 确保目录存在
        if (!fs.existsSync(chunkDir)) {
          fs.mkdirSync(chunkDir, { recursive: true });
        }

        // 移动文件到正确的位置并重命名
        const chunkFileName = `${body.chunk}_${body.hash}`;
        const chunkFilePath = path.join(chunkDir, chunkFileName);

        // 如果文件已经存在，删除它
        if (fs.existsSync(chunkFilePath)) {
          fs.unlinkSync(chunkFilePath);
        }

        // 移动文件
        if (!fs.existsSync(file.path)) {
          return res.json({ ret: 'errorparam' });
        }

        fs.renameSync(file.path, chunkFilePath);

        const result = await this.mxCadService.uploadChunkWithPermission(
          body.hash,
          body.name,
          parseInt(body.size, 10),
          parseInt(body.chunk, 10),
          parseInt(body.chunks, 10),
          context
        );
        return res.json(result);
      } catch (error) {
        this.mxCadService.logError(`分片文件处理失败: ${error.message}`, error);
        return res.json({ ret: 'convertFileError' });
      }
    } else {
      // 完整文件上传（带权限验证）
      const result = await this.mxCadService.uploadAndConvertFileWithPermission(
        file.path,
        body.hash,
        body.name,
        parseInt(body.size, 10),
        context
      );
      return res.json(result);
    }
  }

  /**
   * 测试上传文件
   */
  @Post('files/testupfile')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '测试上传文件' })
  async testUploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ ret: 'errorparam' });
    }
    return res.send('ok');
  }

  /**
   * 转换服务器文件
   */
  @Post('convert')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '转换服务器文件' })
  async convertServerFile(@Body() dto: ConvertDto, @Res() res: Response) {
    let param = dto.param;
    if (typeof param === 'string') {
      try {
        param = JSON.parse(param);
      } catch (error) {
        return res.json({ code: 12, message: 'param error' });
      }
    }

    const result = await this.mxCadService.convertServerFile(param);
    return res.json(result);
  }

  /**
   * 上传并转换文件（不支持断点续传）
   */
  @Post('upfile')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '上传并转换文件' })
  async uploadAndConvert(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ code: -1, message: '缺少文件' });
    }

    const param = {
      srcpath: file.path.replace(/\\/g, '/'),
    };

    const result = await this.mxCadService.convertServerFile(param);

    try {
      // 添加文件名到返回结果，与参考代码保持一致
      const fileName = file.path.substring(file.path.lastIndexOf('/') + 1);
      if (result) {
        result.filename = fileName;
      }
      return res.json(result);
    } catch (e) {
      return res.json({ code: -1, message: 'catch error' });
    }
  }

  /**
   * 保存 MXWEB 到服务器
   */
  @Post('savemxweb')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '保存 MXWEB 到服务器' })
  async saveMxweb(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ code: -1, message: '缺少文件' });
    }

    return res.json({
      code: 0,
      file: file.filename,
      ret: 'ok',
    });
  }

  /**
   * 保存 DWG 到服务器
   */
  @Post('savedwg')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '保存 DWG 到服务器' })
  async saveDwg(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ ret: 'failed', code: -1, message: '缺少文件' });
    }

    const inputFile = file.path.replace(/\\/g, '/');
    const outputFile = `${file.filename}.dwg`;

    const param = {
      srcpath: inputFile,
      outname: outputFile,
    };

    const result = await this.mxCadService.convertServerFile(param);

    try {
      result.file = outputFile;
      if (result.code === 0) {
        result.ret = 'ok';
      } else {
        result.ret = 'failed';
      }
      return res.json(result);
    } catch (e) {
      return res.json({ ret: 'failed', code: -1, message: 'catch error' });
    }
  }

  /**
   * 保存 PDF 到服务器
   */
  @Post('savepdf')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '保存 PDF 到服务器' })
  async savePdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ ret: 'failed', code: -1, message: '缺少文件' });
    }

    let param: any = {
      width: '2000',
      height: '2000',
      colorPolicy: 'mono',
    };

    if (body.param) {
      try {
        if (typeof body.param === 'string') {
          const parsedParam = JSON.parse(body.param);
          param = { ...param, ...parsedParam };
        } else if (typeof body.param === 'object') {
          param = { ...param, ...body.param };
        }
      } catch (error) {
        return res.json({ ret: 'failed', code: -1, message: '参数格式错误' });
      }
    }

    const inputFile = file.path.replace(/\\/g, '/');
    const outputFile = `${file.filename}.pdf`;

    param.srcpath = inputFile;
    param.outname = outputFile;

    const result = await this.mxCadService.convertServerFile(param);

    try {
      result.file = outputFile;
      if (result.code === 0) {
        result.ret = 'ok';
      } else {
        result.ret = 'failed';
      }
      return res.json(result);
    } catch (e) {
      return res.json({ ret: 'failed', code: -1, message: 'catch error' });
    }
  }

  /**
   * 打印为 PDF
   */
  @Post('print_to_pdf')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '打印为 PDF' })
  async printToPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { param: string },
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ ret: 'failed', code: -1, message: '缺少文件' });
    }

    if (!body.param) {
      return res.json({ ret: 'failed', code: -1, message: 'param error' });
    }

    let param;
    try {
      if (typeof body.param === 'string') {
        param = JSON.parse(body.param);
      } else {
        param = body.param;
      }
    } catch (error) {
      return res.json({ ret: 'failed', code: -1, message: 'param error' });
    }

    const inputFile = file.path.replace(/\\/g, '/');
    const outputFile = `${file.filename}.pdf`;

    param.cmd = 'print_to_pdf';
    param.srcpath = inputFile;
    param.outname = outputFile;
    if (!param.colorPolicy) {
      param.colorPolicy = 'mono';
    }

    const result = await this.mxCadService.convertServerFile(param);

    try {
      result.file = outputFile;
      if (result.code === 0) {
        result.ret = 'ok';
      } else {
        result.ret = 'failed';
      }
      return res.json(result);
    } catch (e) {
      return res.json({ ret: 'failed', code: -1, message: 'catch error' });
    }
  }

  /**
   * 裁剪 DWG
   */
  @Post('cut_dwg')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '裁剪 DWG' })
  async cutDwg(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { param: string },
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ ret: 'failed', code: -1, message: '缺少文件' });
    }

    if (!body.param) {
      return res.json({ ret: 'failed', code: -1, message: 'param error' });
    }

    let param;
    try {
      if (typeof body.param === 'string') {
        param = JSON.parse(body.param);
      } else {
        param = body.param;
      }
    } catch (error) {
      return res.json({ ret: 'failed', code: -1, message: 'param error' });
    }

    const inputFile = file.path.replace(/\\/g, '/');
    const outputFile = `${file.filename}.dwg`;

    param.srcpath = inputFile;
    param.outname = outputFile;

    const result = await this.mxCadService.convertServerFile(param);

    try {
      result.file = outputFile;
      if (result.code === 0) {
        result.ret = 'ok';
      } else {
        result.ret = 'failed';
      }
      return res.json(result);
    } catch (e) {
      return res.json({ ret: 'failed', code: -1, message: 'catch error' });
    }
  }

  /**
   * 裁剪 MXWEB
   */
  @Post('cut_mxweb')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '裁剪 MXWEB' })
  async cutMxweb(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { param: string },
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ ret: 'failed', code: -1, message: '缺少文件' });
    }

    if (!body.param) {
      return res.json({ ret: 'failed', code: -1, message: 'param error' });
    }

    let param;
    try {
      if (typeof body.param === 'string') {
        param = JSON.parse(body.param);
      } else {
        param = body.param;
      }
    } catch (error) {
      return res.json({ ret: 'failed', code: -1, message: 'param error' });
    }

    const inputFile = file.path.replace(/\\/g, '/');
    const outputFile = `${file.filename}${this.mxCadFileExt}`;
    param.srcpath = inputFile;
    param.outname = outputFile;

    const result = await this.mxCadService.convertServerFile(param);

    try {
      result.file = outputFile;
      if (result.code === 0) {
        result.ret = 'ok';
      } else {
        result.ret = 'failed';
      }
      return res.json(result);
    } catch (e) {
      return res.json({ ret: 'failed', code: -1, message: 'catch error' });
    }
  }

  /**
   * 上传外部参照 DWG
   *
   * 复用现有的上传方法（/mxcad/files/uploadFiles），上传完成后将转换后的文件
   * 拷贝到源图纸的 hash 目录并重命名。
   */
  @Post('up_ext_reference_dwg')
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
    @Req() request: any,
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

    // 验证用户权限
    let sourceNode: any = null;
    try {
      const userId = await this.validateTokenAndGetUserId(request);
      this.logger.log(`[uploadExtReferenceDwg] 用户ID: ${userId}`);

      // 检查用户是否有权限访问该图纸（全局查找，不限制项目）
      const node = await this.getFileSystemNodeByHash(body.src_dwgfile_hash);
      if (!node) {
        this.logger.warn(
          `[uploadExtReferenceDwg] 未找到源图纸: ${body.src_dwgfile_hash}`
        );
        return res.json({ code: -1, message: '未找到源图纸' });
      }

      // 检查用户对任何一个具有相同 fileHash 的节点是否有权限
      const allNodes = await this.prisma.fileSystemNode.findMany({
        where: {
          fileHash: body.src_dwgfile_hash,
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

      let hasPermission = false;
      let authorizedNode: any = null;

      for (const n of allNodes) {
        const permission = await this.checkFileAccessPermission(
          n.id,
          userId,
          userId
        );
        if (permission) {
          hasPermission = true;
          authorizedNode = n;
          break;
        }
      }

      if (!hasPermission) {
        this.logger.warn(
          `[uploadExtReferenceDwg] 用户 ${userId} 无权限访问图纸 ${body.src_dwgfile_hash}`
        );
        return res.json({ code: -1, message: '无权限访问该图纸' });
      }

      // 保存授权的节点，供后续使用
      sourceNode = authorizedNode;
      this.logger.log(
        `[uploadExtReferenceDwg] 用户有权限访问图纸: ${sourceNode.name} (ID: ${sourceNode.id})`
      );
    } catch (authError) {
      this.logger.warn(
        `[uploadExtReferenceDwg] 权限验证失败: ${authError.message}`
      );
      return res.json({ code: -1, message: '权限验证失败' });
    }

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
    const nodeId =
      sourceNode?.parentId || sourceNode?.id || 'external-reference';

    this.logger.log(
      `[uploadExtReferenceDwg] 外部参照文件将存储在目录: ${nodeId} (源图纸: ${sourceNode?.name})`
    );

    // 构建上下文（外部参照上传）
    const context = {
      nodeId: nodeId, // 使用源图纸所在目录
      userId: await this.validateTokenAndGetUserId(request),
      userRole: 'USER',
      srcDwgFileHash: body.src_dwgfile_hash, // 源图纸哈希
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
        await this.mxCadService.updateExternalReferenceAfterUpload(
          body.src_dwgfile_hash
        );
        this.logger.log(
          `[uploadExtReferenceDwg] 外部参照信息已更新: ${body.src_dwgfile_hash}`
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
    @Req() request: any,
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

      // 检查用户是否有权限访问该图纸（全局查找，不限制项目）
      const node = await this.getFileSystemNodeByHash(body.src_dwgfile_hash);
      if (!node) {
        this.logger.warn(
          `[uploadExtReferenceImage] 未找到源图纸: ${body.src_dwgfile_hash}`
        );
        return res.json({ code: -1, message: '未找到源图纸' });
      }

      // 检查用户对任何一个具有相同 fileHash 的节点是否有权限
      const allNodes = await this.prisma.fileSystemNode.findMany({
        where: {
          fileHash: body.src_dwgfile_hash,
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

      let hasPermission = false;
      let authorizedNode: any = null;

      for (const n of allNodes) {
        const permission = await this.checkFileAccessPermission(
          n.id,
          userId,
          userId
        );
        if (permission) {
          hasPermission = true;
          authorizedNode = n;
          break;
        }
      }

      if (!hasPermission) {
        this.logger.warn(
          `[uploadExtReferenceImage] 用户 ${userId} 无权限访问图纸 ${body.src_dwgfile_hash}`
        );
        return res.json({ code: -1, message: '无权限访问该图纸' });
      }

      // 保存授权的节点，供后续使用
      sourceNode = authorizedNode;
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

    // 外部参照文件应该创建在源图纸所在目录中
    // 如果源图纸在项目根目录，则使用项目根目录
    // 否则使用源图纸的父节点（图纸所在目录）
    const nodeId =
      sourceNode?.parentId || sourceNode?.id || 'external-reference';

    this.logger.log(
      `[uploadExtReferenceImage] 外部参照文件将存储在目录: ${nodeId} (源图纸: ${sourceNode?.name})`
    );

    // 构建上下文（外部参照上传）
    const context = {
      nodeId: nodeId, // 使用源图纸所在目录
      userId: await this.validateTokenAndGetUserId(request),
      userRole: 'USER',
      srcDwgFileHash: body.src_dwgfile_hash, // 源图纸哈希
      isImage: true, // 图片文件
    };

    // 复用现有的上传逻辑
    const result = await this.mxCadService.uploadAndConvertFileWithPermission(
      file.path,
      fileHash,
      body.ext_ref_file,
      file.size,
      context
    );

    // 统一返回格式：与参考代码保持一致
    if (result.ret === 'ok' || result.ret === 'fileAlreadyExist') {
      // 更新源图纸的外部参照信息
      try {
        await this.mxCadService.updateExternalReferenceAfterUpload(
          body.src_dwgfile_hash
        );
        this.logger.log(
          `[uploadExtReferenceImage] 外部参照信息已更新: ${body.src_dwgfile_hash}`
        );
      } catch (updateError) {
        this.logger.error(
          `[uploadExtReferenceImage] 更新外部参照信息失败: ${updateError.message}`,
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
   * 查询缩略图是否存在
   *
   * 查询逻辑：通过文件 ID 获取 fileHash，先检查 MinIO 中是否存在缩略图，如果不存在则检查本地文件系统
   * 缩略图文件名格式：{hash}.{图片后缀}
   *
   * @param nodeId 文件系统节点 ID
   * @returns 缩略图是否存在
   */
  @Get('thumbnail/:nodeId')
  @ApiResponse({
    status: 200,
    description: '查询成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'ok' },
        exists: { type: 'boolean', description: '缩略图是否存在' },
      },
    },
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
      // 通过 nodeId 查询 fileHash
      const node =
        await this.mxCadService.getFileSystemNodeByNodeId(nodeId);

      if (!node || !node.fileHash) {
        return res.status(404).json({
          code: -1,
          message: '文件不存在或没有 fileHash',
        });
      }

      const fileHash = node.fileHash;
      this.logger.log(
        `[checkThumbnail] 获取到 fileHash: ${fileHash}`
      );

      const result = await this.mxCadService.checkThumbnailExists(fileHash);

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
   * 通过 nodeId 获取 fileHash，上传到本地和 MinIO 相同的位置，并重命名为 {hash}.{图片后缀}
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
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: 'ok' },
        data: {
          type: 'object',
          properties: {
            fileName: { type: 'string', description: '文件名' },
          },
        },
      },
    },
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

    try {
      // 通过 nodeId 查询 fileHash
      const node =
        await this.mxCadService.getFileSystemNodeByNodeId(nodeId);

      if (!node || !node.fileHash) {
        return res.status(404).json({
          code: -1,
          message: '文件不存在或没有 fileHash',
        });
      }

      const fileHash = node.fileHash;
      this.logger.log(`[uploadThumbnail] 获取到 fileHash: ${fileHash}`);

      const result = await this.mxCadService.uploadThumbnail(
        fileHash,
        file.path
      );

      if (result.success) {
        return res.json({
          code: 0,
          message: result.message,
          data: {
            fileName: result.fileName,
          },
        });
      } else {
        return res.status(500).json({
          code: -1,
          message: result.message,
        });
      }
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
   * 上传图片
   */
  @Post('up_image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '上传图片' })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ code: -1, message: '缺少文件' });
    }

    // 直接返回原始文件名，与参考代码保持一致
    const fileName = file.filename;

    try {
      return res.json({
        code: 0,
        message: 'ok',
        file: fileName,
      });
    } catch (error) {
      return res.json({ code: -1, message: 'catch error' });
    }
  }

  /**
   * 访问非 CAD 文件（图片、文档等）
   * 从 MinIO 读取文件流并返回
   *
   * @param storageKey MinIO 存储键，格式: files/{userId}/{timestamp}-{filename}
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
          if (node && node.fileHash) {
            actualStorageKey = `mxcad/file/${node.fileHash}/${node.name}`;
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

      // 从 MinIO 获取文件流
      const fileStream =
        await this.minioSyncService.getFileStream(actualStorageKey);

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
   * 访问转换后的文件 (.mxweb) - GET 方法
   * 支持 MxCAD-App 访问路径: /mxcad/file/{filename}
   * 优先从 MinIO 读取，失败时降级到本地文件系统
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

      // 从文件路径中提取哈希值（可能是完整路径如: hash/filename 或直接是 filename）
      const pathParts = normalizedFilename.split('/');
      const fileHash = pathParts[0]; // 第一个部分是哈希值
      const actualFilename =
        pathParts.length > 1
          ? pathParts.slice(1).join('/')
          : normalizedFilename;

      this.logger.log(
        `提取的fileHash: ${fileHash}, actualFilename: ${actualFilename}`
      );

      // 通过哈希值查找所有具有相同 fileHash 的节点，验证用户是否有访问权限
      const allNodes = await this.prisma.fileSystemNode.findMany({
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
        `查找文件节点: hash=${fileHash}, 找到=${allNodes.length}个节点`
      );

      if (allNodes.length === 0) {
        // 文件节点不存在，降级到本地文件系统查找（兼容旧文件）
        this.logger.log(
          `文件节点不存在，降级到本地文件系统: ${normalizedFilename}`
        );
      } else {
        // 检查用户对任何一个节点是否有权限
        let hasPermission = false;
        let authorizedNodeId: string | null = null;

        for (const node of allNodes) {
          const permission = await this.checkFileAccessPermission(
            node.id,
            userId,
            userId
          );
          if (permission) {
            hasPermission = true;
            authorizedNodeId = node.id;
            break;
          }
        }

        this.logger.log(
          `权限检查结果: userId=${userId}, hasPermission=${hasPermission}, authorizedNodeId=${authorizedNodeId}`
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
      // 对于图片文件，可能在 mxcad_res 目录下或根据哈希值查找
      else if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        possiblePaths.push(`mxcad/res/${normalizedFilename}`);
        possiblePaths.push(`mxcad/images/${normalizedFilename}`);
        // 也支持直接文件名
        possiblePaths.push(normalizedFilename);
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

      let foundMinioPath: string | null = null;

      // 尝试找到文件
      for (const mxcadPath of possiblePaths) {
        try {
          const exists =
            await this.mxCadService['minioSyncService'].fileExists(mxcadPath);
          if (exists) {
            foundMinioPath = mxcadPath;
            this.logger.log(`找到 MinIO 文件: ${mxcadPath}`);
            break;
          }
        } catch (error) {
          this.logger.log(`路径 ${mxcadPath} 不存在，尝试下一个路径`);
        }
      }

      if (foundMinioPath) {
        // MinIO 中存在文件
        if (isHeadRequest) {
          // 对于 HEAD 请求，直接使用 MinIO SDK 获取文件信息
          // MinIO 的预签名 GET URL 不支持 HEAD 请求
          try {
            const fileInfo = await this.mxCadService[
              'minioSyncService'
            ].getFileInfo(foundMinioPath!);

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
              // 获取文件信息失败，降级到本地文件系统
              this.mxCadService.logWarn(
                `获取 MinIO 文件信息失败，降级到本地文件系统: ${normalizedFilename}`
              );
            }
          } catch (error) {
            this.mxCadService.logError(
              `获取 MinIO 文件信息失败: ${error.message}`,
              error
            );
            // 如果获取文件信息失败，降级到本地文件系统
          }
        } else {
          // GET 请求直接返回文件流
          try {
            this.logger.log(`准备返回文件流: ${foundMinioPath}`);
            const fileStream = await this.mxCadService[
              'minioSyncService'
            ].getFileStream(foundMinioPath!);

            // 设置响应头
            const fileInfo = await this.mxCadService[
              'minioSyncService'
            ].getFileInfo(foundMinioPath!);

            if (fileInfo) {
              res.setHeader('Content-Type', fileInfo.contentType);
              res.setHeader('Content-Length', fileInfo.contentLength);
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.setHeader('Access-Control-Allow-Origin', '*');
            }

            // 返回文件流
            this.logger.log(`开始返回文件流: ${foundMinioPath}`);

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
            this.logger.error(`获取 MinIO 文件流失败: ${error.message}`, error);
            // 如果获取文件流失败，降级到本地文件系统
          }
        }
      }

      // MinIO 中不存在，降级到本地文件系统
      this.mxCadService.logWarn(
        `MinIO 文件不存在，降级到本地文件系统: ${normalizedFilename}`
      );

      // 获取文件搜索路径列表
      const uploadPath =
        process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
      const resFilePath: string[] = [uploadPath];

      // 如果配置了静态资源目录，也添加到搜索路径中
      const staticResDirs = process.env.MXCAD_STATIC_RES_DIRS
        ? process.env.MXCAD_STATIC_RES_DIRS.split(',')
        : [];

      staticResDirs.forEach((dir) => {
        const staticMxCadResDir = path.join(dir, 'mxcad_res');
        if (fs.existsSync(staticMxCadResDir)) {
          resFilePath.push(staticMxCadResDir);
        }
      });

      let foundFilePath = '';

      // 在所有路径中查找文件
      for (let i = 0; i < resFilePath.length; i++) {
        // 直接查找
        const directPath = path.join(resFilePath[i], normalizedFilename);
        if (fs.existsSync(directPath)) {
          foundFilePath = directPath;
          break;
        }

        // 对于图片和资源文件，可能在哈希值命名的子目录中
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.json'].includes(ext)) {
          // 从 normalizedFilename 中提取哈希值（如果包含路径）
          const parts = normalizedFilename.split('/');
          const hash = parts[0];
          const shortName =
            parts.length > 1 ? parts.slice(1).join('/') : normalizedFilename;

          // 在哈希值命名的目录中查找
          const hashDirPath = path.join(resFilePath[i], hash);
          if (
            fs.existsSync(hashDirPath) &&
            fs.statSync(hashDirPath).isDirectory()
          ) {
            const fileInHashDir = path.join(hashDirPath, shortName);
            if (fs.existsSync(fileInHashDir)) {
              foundFilePath = fileInHashDir;
              break;
            }
          }
        }
      }

      // 如果没有找到文件
      if (!foundFilePath) {
        return res.status(404).json({
          code: -1,
          message: '文件不存在',
        });
      }

      // 获取文件状态
      const stats = fs.statSync(foundFilePath);

      // 设置响应头，与参考代码保持一致（ext 已在上面声明）
      let contentType = 'application/octet-stream';

      // 根据文件扩展名设置适当的 Content-Type
      switch (ext) {
        case this.mxCadFileExt:
          contentType = 'application/octet-stream';
          break;
        case '.dwg':
          contentType = 'application/octet-stream';
          break;
        case '.dxf':
          contentType = 'application/octet-stream';
          break;
        case '.json':
          contentType = 'application/json';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.gif':
          contentType = 'image/gif';
          break;
        case '.webp':
          contentType = 'image/webp';
          break;
        case '.svg':
          contentType = 'image/svg+xml';
          break;
        case '.bmp':
          contentType = 'image/bmp';
          break;
        case '.pdf':
          contentType = 'application/pdf';
          break;
        case '.xml':
          contentType = 'application/xml';
          break;
        case '.txt':
          contentType = 'text/plain';
          break;
        case '.css':
          contentType = 'text/css';
          break;
        case '.js':
          contentType = 'application/javascript';
          break;
        case '.html':
        case '.htm':
          contentType = 'text/html';
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
      res.setHeader('Access-Control-Allow-Origin', '*'); // 允许跨域访问

      // 如果是 HEAD 请求，只返回头部信息，不发送文件内容
      if (isHeadRequest) {
        res.end();
        return;
      }

      // 创建文件流并发送（仅对 GET 请求）
      const fileStream = fs.createReadStream(foundFilePath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        this.mxCadService.logError(`读取文件失败: ${error.message}`, error);
        if (!res.headersSent) {
          res.status(500).json({
            code: -1,
            message: '读取文件失败',
          });
        }
      });
    } catch (error) {
      this.mxCadService.logError(`访问文件失败: ${error.message}`, error);
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

      // 获取节点信息
      const node = await this.prisma.fileSystemNode.findUnique({
        where: { id: nodeId },
        select: { ownerId: true, parentId: true, isRoot: true },
      });

      if (!node) {
        this.logger.warn(`[checkFileAccessPermission] 节点不存在: ${nodeId}`);
        return false;
      }

      this.logger.log(
        `[checkFileAccessPermission] 节点信息: ownerId=${node.ownerId}, parentId=${node.parentId}, isRoot=${node.isRoot}`
      );

      // 文件所有者有权限
      if (node.ownerId === checkUserId) {
        this.logger.log(`[checkFileAccessPermission] 用户是文件所有者，有权限`);
        return true;
      }

      this.logger.log(
        `[checkFileAccessPermission] 用户不是文件所有者，检查直接访问权限`
      );

      // 检查是否有文件访问权限
      const access = await this.prisma.fileAccess.findFirst({
        where: {
          nodeId: nodeId,
          userId: checkUserId,
        },
      });

      if (access) {
        this.logger.log(`[checkFileAccessPermission] 用户有直接访问权限`);
        return true;
      }

      this.logger.log(
        `[checkFileAccessPermission] 用户没有直接访问权限，检查项目根目录权限`
      );

      // 检查是否有项目根目录的访问权限
      const projectRoot = await this.getProjectRootByNodeId(nodeId);
      if (projectRoot) {
        this.logger.log(
          `[checkFileAccessPermission] 找到项目根目录: ${projectRoot.id}`
        );
        const projectAccess = await this.prisma.fileAccess.findFirst({
          where: {
            nodeId: projectRoot.id,
            userId: checkUserId,
          },
        });

        if (projectAccess) {
          this.logger.log(
            `[checkFileAccessPermission] 用户有项目根目录访问权限`
          );
          return true;
        } else {
          this.logger.log(
            `[checkFileAccessPermission] 用户没有项目根目录访问权限`
          );
        }
      } else {
        this.logger.log(`[checkFileAccessPermission] 未找到项目根目录`);
      }

      this.logger.warn(
        `[checkFileAccessPermission] 用户 ${checkUserId} 没有任何访问权限`
      );
      return false;
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
    if (!body.src_dwgfile_hash || !body.ext_ref_file) {
      this.logger.warn(`[${methodPrefix}] 缺少必要参数`);
      return { success: false, error: { code: -1, message: '缺少必要参数' } };
    }

    // 3. 验证图纸文件是否存在
    const preloadingData = await this.mxCadService.getPreloadingData(
      body.src_dwgfile_hash
    );
    if (!preloadingData) {
      this.logger.warn(
        `[${methodPrefix}] 图纸文件不存在: ${body.src_dwgfile_hash}`
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
