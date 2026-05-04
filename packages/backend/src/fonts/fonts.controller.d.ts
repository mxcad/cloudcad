import { StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { FontsService } from './fonts.service';
import { UploadFontDto, DeleteFontDto } from './dto/font.dto';
/**
 * 字体管理控制器
 */
export declare class FontsController {
    private readonly fontsService;
    private readonly logger;
    constructor(fontsService: FontsService);
    /**
     * 获取字体列表（返回所有数据，由前端处理分页、筛选、排序）
     */
    getFonts(location?: 'backend' | 'frontend'): Promise<{
        code: string;
        message: string;
        data: import("./fonts.service").FontInfo[];
        timestamp: string;
    }>;
    /**
     * 上传字体文件
     */
    uploadFont(file: Express.Multer.File, uploadFontDto: UploadFontDto, req: Request): Promise<{
        code: string;
        message: string;
        data: import("./fonts.service").FontInfo;
        timestamp: string;
    }>;
    /**
     * 删除字体文件
     */
    deleteFont(req: Request, fileName: string, deleteFontDto: DeleteFontDto): Promise<{
        code: string;
        message: string;
        timestamp: string;
    }>;
    /**
     * 下载字体文件
     */
    downloadFont(req: Request, fileName: string, location: 'backend' | 'frontend'): Promise<StreamableFile>;
}
//# sourceMappingURL=fonts.controller.d.ts.map