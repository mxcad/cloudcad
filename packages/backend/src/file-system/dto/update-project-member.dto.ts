import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateProjectMemberDto {
  @ApiProperty({ description: '项目角色ID', required: false })
  @IsString()
  @IsOptional()
  projectRoleId?: string;

  @ApiProperty({
    description: '角色ID（兼容字段，与 projectRoleId 相同）',
    required: false,
  })
  @IsString()
  @IsOptional()
  roleId?: string;
}
