import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

/**
 * PDF 转换参数
 */
export class PdfConversionParams {
  @ApiProperty({
    description: '输出宽度（像素）',
    required: false,
    default: '2000',
  })
  @IsOptional()
  @IsString()
  width?: string;

  @ApiProperty({
    description: '输出高度（像素）',
    required: false,
    default: '2000',
  })
  @IsOptional()
  @IsString()
  height?: string;

  @ApiProperty({
    description: '颜色策略：mono（单色）、color（彩色）',
    required: false,
    default: 'mono',
  })
  @IsOptional()
  @IsString()
  colorPolicy?: string;
}

/**
 * PDF 转换请求 DTO
 */
export class PdfConversionDto {
  @ApiProperty({
    description: '转换参数（可以是 JSON 字符串或对象）',
    required: false,
  })
  @IsOptional()
  param?: string | PdfConversionParams;
}