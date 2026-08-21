import { ApiProperty } from '@nestjs/swagger';

/**
 * 覆盖保存图纸库/图块库文件 DTO
 */
export class SaveLibraryNodeDto {
  @ApiProperty({
    description: '要保存的文件',
    type: 'string',
    format: 'binary',
  })
  file?: Express.Multer.File;
}
