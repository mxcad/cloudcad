import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ConvertFileParamsDto {
  @ApiPropertyOptional({ description: '命令类型', enum: ['print_to_pdf', 'cut_dwg'] })
  @IsOptional()
  @IsString()
  cmd?: string;

  @ApiPropertyOptional({ description: '宽度（像素）' })
  @IsOptional()
  @IsString()
  width?: string;

  @ApiPropertyOptional({ description: '高度（像素）' })
  @IsOptional()
  @IsString()
  height?: string;

  @ApiPropertyOptional({ description: '颜色策略', enum: ['mono', 'default'] })
  @IsOptional()
  @IsString()
  colorPolicy?: string;

  @ApiPropertyOptional({ description: '旋转角度' })
  @IsOptional()
  roate_angle?: number;

  @ApiPropertyOptional({ description: '视角角度' })
  @IsOptional()
  view_angle?: number;

  @ApiPropertyOptional({ description: '裁剪框点1 X' })
  @IsOptional()
  @IsString()
  bd_pt1_x?: string;

  @ApiPropertyOptional({ description: '裁剪框点1 Y' })
  @IsOptional()
  @IsString()
  bd_pt1_y?: string;

  @ApiPropertyOptional({ description: '裁剪框点2 X' })
  @IsOptional()
  @IsString()
  bd_pt2_x?: string;

  @ApiPropertyOptional({ description: '裁剪框点2 Y' })
  @IsOptional()
  @IsString()
  bd_pt2_y?: string;

  @ApiPropertyOptional({ description: '当前打开文件的 MD5' })
  @IsOptional()
  @IsString()
  open_file_md5?: string;

  @ApiPropertyOptional({ description: '布局名称' })
  @IsOptional()
  @IsString()
  layout_name?: string;

  @ApiPropertyOptional({ description: '是否创建裁剪块' })
  @IsOptional()
  @IsBoolean()
  create_clip_block?: boolean;

  @ApiProperty({ description: 'DWG/DXF 版本号（23/25/27/29/33）', required: false })
  @IsOptional()
  dwgVersion?: number;
}

export class ConvertFileDto {
  @ApiProperty({ description: 'mxweb 文件的 MD5（已通过分片上传到 uploads 目录）' })
  @IsString()
  @IsNotEmpty()
  fileHash!: string;

  @ApiProperty({ description: '目标格式', enum: ['dwg', 'dxf', 'pdf', 'mxweb'] })
  @IsString()
  @IsIn(['dwg', 'dxf', 'pdf', 'mxweb'])
  format!: 'dwg' | 'dxf' | 'pdf' | 'mxweb';

  @ApiPropertyOptional({ description: '转换参数（可选，与 mxcad-app 参数一致）', type: ConvertFileParamsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConvertFileParamsDto)
  params?: ConvertFileParamsDto;
}
