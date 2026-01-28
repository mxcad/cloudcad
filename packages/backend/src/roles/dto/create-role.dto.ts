import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { RoleCategory } from '../../common/enums/permissions.enum';

export class CreateRoleDto {
  @ApiProperty({ description: '角色名称', example: '设计主管' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: '角色描述',
    example: '负责设计团队的管理工作',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string;

  @ApiProperty({
    description: '角色类别',
    enum: RoleCategory,
    example: RoleCategory.CUSTOM,
    required: false,
  })
  @IsEnum(RoleCategory)
  @IsOptional()
  category?: RoleCategory;

  @ApiProperty({
    description: '角色级别（用于权限继承）',
    example: 50,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  level?: number;

  @ApiProperty({
    description: '权限列表（数据库存储格式：大写）',
    example: ['SYSTEM_USER_READ', 'SYSTEM_ROLE_READ', 'SYSTEM_FONT_READ'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  permissions: string[];
}
