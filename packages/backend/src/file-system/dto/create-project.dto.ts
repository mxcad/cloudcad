import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, Length } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称', example: 'CAD图纸项目' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ description: '项目描述', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
