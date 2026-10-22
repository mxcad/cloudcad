import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

/**
 * 覆盖保存图纸库/图块库文件 DTO
 *
 * file 必须带 class-validator 装饰器——全局 CustomValidationPipe 开了
 * whitelist + forbidNonWhitelisted，@ApiProperty 一条约束都不注册，
 * 零约束 DTO 会被判「未白名单属性」直接 400（见 Gitea #470）。
 * 写法对齐仓库既有范例 upload-files.dto.ts。
 */
export class SaveLibraryNodeDto {
  @ApiProperty({
    description: '要保存的文件',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  file?: Express.Multer.File;
}
