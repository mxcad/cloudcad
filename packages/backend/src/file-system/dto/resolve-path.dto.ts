import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ResolvePathDto {
  @ApiProperty({
    description: '面包屑路径（如 "项目A > 文件夹1 > 子文件夹"）',
    required: true,
  })
  @IsString()
  path: string;

  @ApiProperty({
    description: '项目 ID。个人空间模式不需要传此参数，使用 userId 自动定位',
    required: false,
  })
  @IsOptional()
  @IsString()
  projectId?: string;
}
