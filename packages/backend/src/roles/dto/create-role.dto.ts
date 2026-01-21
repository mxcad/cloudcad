import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Permission } from '../../common/enums/permissions.enum';

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
    description: '权限列表',
    example: [Permission.PROJECT_CREATE, Permission.FILE_READ],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  permissions: Permission[];
}
