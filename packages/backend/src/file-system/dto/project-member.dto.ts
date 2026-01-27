import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * 添加项目成员 DTO
 */
export class AddProjectMemberDto {
  @ApiProperty({ description: '用户 ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: '角色 ID' })
  @IsString()
  @IsNotEmpty()
  roleId: string;
}

/**
 * 更新项目成员 DTO
 */
export class UpdateProjectMemberDto {
  @ApiProperty({ description: '角色 ID' })
  @IsString()
  @IsNotEmpty()
  roleId: string;
}

/**
 * 批量添加项目成员 DTO
 */
export class BatchAddProjectMembersDto {
  @ApiProperty({ description: '成员列表', type: [AddProjectMemberDto] })
  @IsArray()
  @IsNotEmpty({ each: true })
  members: AddProjectMemberDto[];
}

/**
 * 批量更新项目成员 DTO
 */
export class BatchUpdateProjectMembersDto {
  @ApiProperty({ description: '成员列表' })
  @IsArray()
  @IsNotEmpty({ each: true })
  updates: Array<{
    userId: string;
    roleId: string;
  }>;
}