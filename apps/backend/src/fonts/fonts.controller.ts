///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Logger,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// 扩展 Request 类型以包含 Multer 文件属性
interface RequestWithFiles extends Request {
  files?: Express.Multer.File[];
  file?: Express.Multer.File;
}
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SystemPermission } from '../common/enums/permissions.enum';
import { FontsService } from './fonts.service';
import { UploadFontDto, DeleteFontDto, FontUploadTarget } from './dto/font.dto';

/**
 * 字体管理控制器
 */
@ApiTags('字体管理')
@ApiBearerAuth()
@Controller('v1/font-management')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FontsController {
  private readonly logger = new Logger(FontsController.name);

  constructor(private readonly fontsService: FontsService) {}

  /**
   * 获取字体列表（返回所有数据，由前端处理分页、筛选、排序）
   */
  @Get()
  @ApiOperation({
    summary: '获取字体列表',
    description: '获取所有字体文件，前端负责分页、筛选和排序',
  })
  @ApiQuery({
    name: 'location',
    enum: ['backend', 'frontend'],
    required: false,
    description: '字体位置：backend 或 frontend，不指定则返回全部',
  })
  @RequirePermissions([SystemPermission.SYSTEM_FONT_READ])
  async getFonts(@Query('location') location?: 'backend' | 'frontend') {
    try {
      const result = await this.fontsService.getFonts(location);
      return {
        code: 'SUCCESS',
        message: '获取字体列表成功',
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`获取字体列表失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 上传字体文件
   */
  @Post('upload')
  @ApiOperation({
    summary: '上传字体文件',
    description: '上传字体文件到指定目录',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @RequirePermissions([SystemPermission.SYSTEM_FONT_UPLOAD])
  async uploadFont(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadFontDto: UploadFontDto,
    @Req() req: Request
  ) {
    try {
      this.logger.log(`[uploadFont] 收到上传请求`);
      this.logger.log(`[uploadFont] 文件对象: ${file ? '存在' : '不存在'}`);
      this.logger.log(`[uploadFont] target: ${uploadFontDto?.target}`);
      this.logger.log(
        `[uploadFont] req.files: ${(req as RequestWithFiles).files ? '存在' : '不存在'}`
      );
      this.logger.log(
        `[uploadFont] req.file: ${(req as RequestWithFiles).file ? '存在' : '不存在'}`
      );

      const target = uploadFontDto.target || FontUploadTarget.BOTH;

      const result = await this.fontsService.uploadFont(file, target);

      return {
        code: 'SUCCESS',
        message: result.message,
        data: result.font,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`上传字体失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 删除字体文件
   */
  @Delete(':fileName')
  @ApiOperation({
    summary: '删除字体文件',
    description: '从指定目录删除字体文件',
  })
  @ApiQuery({
    name: 'target',
    enum: Object.values(FontUploadTarget),
    enumName: 'FontUploadTarget',
    required: false,
    description: '删除目标',
  })
  @RequirePermissions([SystemPermission.SYSTEM_FONT_DELETE])
  async deleteFont(
    @Req() req: Request,
    @Param('fileName') fileName: string,
    @Query() deleteFontDto: DeleteFontDto
  ) {
    try {
      const target = deleteFontDto.target || FontUploadTarget.BOTH;

      const result = await this.fontsService.deleteFont(fileName, target);

      return {
        code: 'SUCCESS',
        message: result.message,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`删除字体失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 下载字体文件
   */
  @Get('download/:fileName')
  @ApiOperation({
    summary: '下载字体文件',
    description: '下载指定位置的字体文件',
  })
  @ApiQuery({
    name: 'location',
    enum: ['backend', 'frontend'],
    required: true,
    description: '下载位置',
  })
  @Header('Content-Type', 'application/octet-stream')
  @RequirePermissions([SystemPermission.SYSTEM_FONT_DOWNLOAD])
  async downloadFont(
    @Req() req: Request,
    @Param('fileName') fileName: string,
    @Query('location') location: 'backend' | 'frontend'
  ) {
    const result = await this.fontsService.downloadFont(fileName, location);

    // 设置 Content-Disposition 响应头
    return new StreamableFile(result.stream, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${encodeURIComponent(result.fileName)}"`,
    });
  }
}
