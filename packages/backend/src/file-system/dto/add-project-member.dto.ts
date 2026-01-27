import { ApiProperty } from '@nestjs/swagger';

export class AddProjectMemberDto {
  @ApiProperty({ description: '用户ID' })
  userId: string;

  @ApiProperty({ description: '项目角色ID' })
  roleId: string;
}
