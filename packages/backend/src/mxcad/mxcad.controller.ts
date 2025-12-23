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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { ApiTags, ApiConsumes, ApiResponse, ApiBody } from '@nestjs/swagger';
import { MxCadService } from './mxcad.service';
import { ChunkExistDto } from './dto/chunk-exist.dto';
import { FileExistDto } from './dto/file-exist.dto';
import { ConvertDto } from './dto/convert.dto';
import { DatabaseService } from '../database/database.service';
import { TzDto } from './dto/tz.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('MxCAD 文件上传与转换')
@Controller('mxcad')
@Public()
export class MxCadController {
  private readonly logger = new Logger(MxCadController.name);

  constructor(
    private readonly mxCadService: MxCadService,
    private readonly prisma: DatabaseService,
  ) {}

  /**
   * 检查分片是否存在
   */
  @Post('files/chunkisExist')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: '检查分片是否存在' })
  async checkChunkExist(@Body() dto: ChunkExistDto, @Req() request: any, @Res() res: Response) {
    // 构建上下文
    const context = this.buildContextFromRequest(request);
    const result = await this.mxCadService.checkChunkExist(
      dto.chunk,
      dto.fileHash,
      dto.size,
      dto.chunks,
      dto.fileName,
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
  async checkFileExist(@Body() dto: FileExistDto, @Req() request: any, @Res() res: Response) {
    // 构建上下文
    const context = this.buildContextFromRequest(request);
    const result = await this.mxCadService.checkFileExist(dto.filename, dto.fileHash, context);
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
        projectId: {
          type: 'string',
          description: '项目ID（用于文件系统关联）',
        },
        parentId: {
          type: 'string',
          description: '父文件夹ID（用于文件系统关联）',
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
    // 添加调试日志
    console.log('[MxCadController] uploadFile - body:', body);
    
    if (!file) {
      return res.json({ ret: 'errorparam' });
    }

    if (!body.hash || !body.name || !body.size) {
      return res.json({ ret: 'errorparam' });
    }

    if (body.chunk !== undefined && body.chunks === undefined) {
      return res.json({ ret: 'errorparam' });
    }

    // 构建上下文 - 直接从前端传递的参数中获取
    const context = {
      projectId: body.mxcadProjectId || body.projectId,
      parentId: body.mxcadParentId || body.parentId,
      userId: body.mxcadUserId,
      userRole: body.mxcadUserRole,
    };

    console.log('[MxCadController] 构建的上下文:', context);
    
    if (body.chunk !== undefined) {
      // 分片上传 - 手动处理文件移动
      console.log('[MxCadController] 执行分片上传逻辑');
      try {
        const fs = require('fs');
        const path = require('path');
        
        // 获取临时目录路径
        const tempPath = process.env.MXCAD_TEMP_PATH || path.join(process.cwd(), 'temp');
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
        fs.renameSync(file.path, chunkFilePath);
        
        // 调用合并逻辑（带权限验证）
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
    } else if (body.chunks !== undefined && !file) {
      // 完成请求（没有文件，只有 chunks 信息）
      console.log('[MxCadController] 执行完成请求逻辑');
      try {
        const result = await this.mxCadService.mergeChunksWithPermission(
          body.hash,
          body.name,
          parseInt(body.size, 10),
          parseInt(body.chunks, 10),
          context
        );
        console.log('[MxCadController] mergeChunksWithPermission 结果:', result);
        return res.json(result);
      } catch (error) {
        this.mxCadService.logError(`文件合并失败: ${error.message}`, error);
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
  async testUploadFile(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
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
        return res.json({ code: 12, message: "param error" });
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
  async uploadAndConvert(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    if (!file) {
      return res.json({ code: -1, message: "缺少文件" });
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
      return res.json({ code: -1, message: "catch error" });
    }
  }

  /**
   * 保存 MXWEB 到服务器
   */
  @Post('savemxweb')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '保存 MXWEB 到服务器' })
  async saveMxweb(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    if (!file) {
      return res.json({ code: -1, message: "缺少文件" });
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
  async saveDwg(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    if (!file) {
      return res.json({ ret: 'failed', code: -1, message: "缺少文件" });
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
      return res.json({ ret: 'failed', code: -1, message: "catch error" });
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
      return res.json({ ret: 'failed', code: -1, message: "缺少文件" });
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
        return res.json({ ret: 'failed', code: -1, message: "参数格式错误" });
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
      return res.json({ ret: 'failed', code: -1, message: "catch error" });
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
      return res.json({ ret: 'failed', code: -1, message: "缺少文件" });
    }

    if (!body.param) {
      return res.json({ ret: 'failed', code: -1, message: "param error" });
    }

    let param;
    try {
      if (typeof body.param === 'string') {
        param = JSON.parse(body.param);
      } else {
        param = body.param;
      }
    } catch (error) {
      return res.json({ ret: 'failed', code: -1, message: "param error" });
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
      return res.json({ ret: 'failed', code: -1, message: "catch error" });
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
      return res.json({ ret: 'failed', code: -1, message: "缺少文件" });
    }

    if (!body.param) {
      return res.json({ ret: 'failed', code: -1, message: "param error" });
    }

    let param;
    try {
      if (typeof body.param === 'string') {
        param = JSON.parse(body.param);
      } else {
        param = body.param;
      }
    } catch (error) {
      return res.json({ ret: 'failed', code: -1, message: "param error" });
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
      return res.json({ ret: 'failed', code: -1, message: "catch error" });
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
      return res.json({ ret: 'failed', code: -1, message: "缺少文件" });
    }

    if (!body.param) {
      return res.json({ ret: 'failed', code: -1, message: "param error" });
    }

    let param;
    try {
      if (typeof body.param === 'string') {
        param = JSON.parse(body.param);
      } else {
        param = body.param;
      }
    } catch (error) {
      return res.json({ ret: 'failed', code: -1, message: "param error" });
    }

    const inputFile = file.path.replace(/\\/g, '/');
    const outputFile = `${file.filename}.mxweb`;
    
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
      return res.json({ ret: 'failed', code: -1, message: "catch error" });
    }
  }

  /**
   * 上传外部参照 DWG
   */
  @Post('up_ext_reference_dwg')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '上传外部参照 DWG' })
  async uploadExtReferenceDwg(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { src_dwgfile_hash: string; ext_ref_file: string },
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ code: -1, message: '缺少文件' });
    }

    if (!body.src_dwgfile_hash || !body.ext_ref_file) {
      return res.json({ code: -1, message: '缺少必要参数' });
    }

    const inputFile = file.path.replace(/\\/g, '/');
    const param = {
      srcpath: inputFile,
    };

    const result = await this.mxCadService.convertServerFile(param);
    
    // 复制转换后的文件到指定目录
    try {
      const fs = require('fs');
      const path = require('path');
      const uploadPath = process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
      const hashDir = path.join(uploadPath, body.src_dwgfile_hash);
      
      if (!fs.existsSync(hashDir)) {
        fs.mkdirSync(hashDir, { recursive: true });
      }
      
      const sourceFile = inputFile + (process.env.MXCAD_FILE_EXT || '.mxweb');
      const targetFile = path.join(hashDir, body.ext_ref_file + (process.env.MXCAD_FILE_EXT || '.mxweb'));
      
      if (fs.existsSync(sourceFile)) {
        fs.copyFileSync(sourceFile, targetFile);
      }
    } catch (error) {
      return res.json({ code: -1, message: 'catch error' });
    }

    return res.json(result);
  }

  /**
   * 上传外部参照图片
   */
  @Post('up_ext_reference_image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '上传外部参照图片' })
  async uploadExtReferenceImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { src_dwgfile_hash: string; ext_ref_file: string },
    @Res() res: Response
  ) {
    if (!file) {
      return res.json({ code: -1, message: '缺少文件' });
    }

    if (!body.src_dwgfile_hash || !body.ext_ref_file) {
      return res.json({ code: -1, message: '缺少必要参数' });
    }

    try {
      const fs = require('fs');
      const path = require('path');
      const uploadPath = process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
      const hashDir = path.join(uploadPath, body.src_dwgfile_hash);
      
      if (!fs.existsSync(hashDir)) {
        fs.mkdirSync(hashDir, { recursive: true });
      }
      
      const targetFile = path.join(hashDir, body.ext_ref_file);
      fs.copyFileSync(file.path, targetFile);
      
      return res.json({ code: 0, message: 'ok' });
    } catch (error) {
      return res.json({ code: -1, message: 'catch error' });
    }
  }

  /**
   * 上传图片
   */
  @Post('up_image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: '上传图片' })
  async uploadImage(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
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
   * 访问转换后的文件 (.mxweb)
   * 支持 MxCAD-App 访问路径: /mxcad/file/{filename}
   * 优先从 MinIO 读取，失败时降级到本地文件系统
   * 支持 GET 和 HEAD 请求方法
   * 
   * @param filename 文件名，例如: 53c2fbd5c71f81794af465cc02a845e2.dwg.mxweb
   * @param res Express Response 对象
   * @returns 返回文件流或错误信息
   */
  @Get('file/:filename')
  @Head('file/:filename')
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
            message: { type: 'string', example: '访问文件失败' },
          },
        },
      },
    },
  })
  async getFile(@Param('filename') filename: string, @Res() res: Response, @Req() req: any) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // 检查请求方法
      const isHeadRequest = req.method === 'HEAD';
      
      // 从文件名中提取哈希值（处理 .dwg.mxweb 和 .mxweb 格式）
      let fileHash = filename;
      if (filename.endsWith('.dwg.mxweb')) {
        fileHash = filename.replace('.dwg.mxweb', '');
      } else if (filename.endsWith('.mxweb')) {
        fileHash = filename.replace('.mxweb', '');
      }
      
      // 尝试多种文件名格式（直接在 mxcad/file/ 路径下）：
      const possiblePaths = [
        // 1. 原始文件名（直接存储）
        `mxcad/file/${filename}`,
        // 2. 添加 .dwg 前缀（如果文件名是 .mxweb）
        filename.endsWith('.mxweb') && !filename.includes('.dwg') 
          ? `mxcad/file/${fileHash}.dwg.mxweb`
          : null,
        // 3. 其他可能的文件名变体
        filename.endsWith('.mxweb') 
          ? `mxcad/file/${fileHash}.dwg.mxweb`
          : null,
      ].filter(path => path !== null);
      
      this.logger.log(`访问文件 - 哈希: ${fileHash}, 文件名: ${filename}`);
      
      let minioUrl: string | null = null;
      
      // 尝试获取文件 URL
      for (const mxcadPath of possiblePaths) {
        try {
          const url = await this.mxCadService['minioSyncService'].getFileUrl(mxcadPath);
          if (url) {
            minioUrl = url;
            this.logger.log(`找到 MinIO 文件: ${mxcadPath}`);
            break;
          }
        } catch (error) {
          this.logger.log(`路径 ${mxcadPath} 不存在，尝试下一个路径`);
        }
      }
      
      if (minioUrl) {
        // MinIO 中存在文件，重定向到预签名 URL
        return res.redirect(302, minioUrl);
      }
      
      // MinIO 中不存在，降级到本地文件系统
      this.mxCadService.logWarn(`MinIO 文件不存在，降级到本地文件系统: ${filename}`);
      
      // 获取文件搜索路径列表，与参考代码保持一致
      const uploadPath = process.env.MXCAD_UPLOAD_PATH || path.join(process.cwd(), 'uploads');
      const resFilePath: string[] = [uploadPath];
      
      // 如果配置了静态资源目录，也添加到搜索路径中
      const staticResDirs = process.env.MXCAD_STATIC_RES_DIRS ? 
        process.env.MXCAD_STATIC_RES_DIRS.split(',') : [];
      
      staticResDirs.forEach(dir => {
        const staticMxCadResDir = path.join(dir, 'mxcad_res');
        if (fs.existsSync(staticMxCadResDir)) {
          resFilePath.push(staticMxCadResDir);
        }
      });
      
      let foundFilePath = '';
      
      // 在所有路径中查找文件
      for (let i = 0; i < resFilePath.length; i++) {
        const currentPath = path.join(resFilePath[i], filename);
        if (fs.existsSync(currentPath)) {
          foundFilePath = currentPath;
          break;
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
      
      // 设置响应头，与参考代码保持一致
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'application/octet-stream';
      
      // 根据文件扩展名设置适当的 Content-Type
      switch (ext) {
        case '.mxweb':
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
        case '.pdf':
          contentType = 'application/pdf';
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
   * 从请求中构建上下文信息
   */
  private buildContextFromRequest(request: any): any {
    // 优先从请求体中获取 MxCAD-App 传递的参数
    if (request.body) {
      return {
        projectId: request.body.mxcadProjectId || request.body.projectId,
        parentId: request.body.mxcadParentId || request.body.parentId,
        userId: request.body.mxcadUserId,
        userRole: request.body.mxcadUserRole,
      };
    }

    // 如果没有请求体，尝试其他方式（用于文件访问等场景）
    return {
      projectId: undefined,
      parentId: undefined,
      userId: undefined,
      userRole: undefined,
    };
  }
}