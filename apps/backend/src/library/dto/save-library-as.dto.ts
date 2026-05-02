import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

/**
 * 图块/图纸另存为到库的 DTO
 * 与普通的 SaveMxwebAsDto 不同，库的 save-as 不需要 targetType、projectId、format 等字段
 */
export class SaveLibraryAsDto {
  @ApiProperty({
    description: 'mxweb 文件',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  file?: Express.Multer.File;

  @ApiProperty({
    description: '目标父节点ID',
  })
  @IsString()
  targetParentId: string;

  @ApiProperty({
    description: '文件名（不含扩展名）',
    required: false,
  })
  @IsString()
  @IsOptional()
  fileName?: string;
}
