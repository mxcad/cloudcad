import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateProjectRoleDto {
  @ApiProperty({
    description: '项目 ID（系统角色不需要）',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ description: '角色名称', example: '项目经理' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: '角色描述',
    example: '负责项目管理',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: '权限列表',
    example: ['PROJECT_UPDATE', 'PROJECT_DELETE', 'FILE_CREATE'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}