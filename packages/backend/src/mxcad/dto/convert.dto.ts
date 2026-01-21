import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class ConvertParamDto {
  @ApiProperty({ description: '源文件路径' })
  @IsString()
  srcpath: string;

  @ApiProperty({ description: '输出 JPG 参数', required: false })
  @IsOptional()
  @IsString()
  outjpg?: string;

  @ApiProperty({ description: '是否异步', required: false })
  @IsOptional()
  @IsString()
  async?: string;

  @ApiProperty({ description: '异步结果回调 URL', required: false })
  @IsOptional()
  @IsString()
  resultposturl?: string;

  @ApiProperty({ description: '追踪 ID', required: false })
  @IsOptional()
  @IsString()
  traceid?: string;
}

export class ConvertDto {
  @ApiProperty({ description: '转换参数' })
  @IsObject()
  param: ConvertParamDto | string;
}
