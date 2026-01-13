import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
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
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FontsService } from './fonts.service';
import { UploadFontDto, DeleteFontDto, FontUploadTarget } from './dto/font.dto';

/**
 * 字体管理控制器
 * 仅管理员可访问
 */
@ApiTags('字体管理')
@ApiBearerAuth()
@Controller('font-management')
@UseGuards(JwtAuthGuard)
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
        `[uploadFont] req.files: ${(req as any).files ? '存在' : '不存在'}`
      );
      this.logger.log(
        `[uploadFont] req.file: ${(req as any).file ? '存在' : '不存在'}`
      );

      // 验证管理员权限
      this.validateAdminAccess(req);

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
    enum: FontUploadTarget,
    required: false,
    description: '删除目标',
  })
  async deleteFont(
    @Req() req: Request,
    @Param('fileName') fileName: string,
    @Query() deleteFontDto: DeleteFontDto
  ) {
    try {
      // 验证管理员权限
      this.validateAdminAccess(req);

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
  async downloadFont(
    @Req() req: Request,
    res: Response,
    @Param('fileName') fileName: string,
    @Query('location') location: 'backend' | 'frontend'
  ) {
    try {
      // 验证管理员权限
      this.validateAdminAccess(req);

      const result = await this.fontsService.downloadFont(fileName, location);

      // 设置响应头
      res.download(result.path, result.fileName, (error) => {
        if (error) {
          this.logger.error(`下载字体失败: ${error.message}`, error.stack);
          if (!res.headersSent) {
            res.status(500).json({
              code: 'ERROR',
              message: '下载字体失败',
              timestamp: new Date().toISOString(),
            });
          }
        }
      });
    } catch (error) {
      this.logger.error(`下载字体失败: ${error.message}`, error.stack);
      if (!res.headersSent) {
        throw error;
      }
    }
  }

  /**
   * 验证管理员权限
   */
  private validateAdminAccess(req: Request): void {
    const user = (req as any).user;
    if (!user || user.role !== 'ADMIN') {
      throw new BadRequestException('仅管理员可访问此功能');
    }
  }
}
