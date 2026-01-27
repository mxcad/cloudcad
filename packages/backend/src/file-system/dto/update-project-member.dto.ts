import { ApiProperty } from '@nestjs/swagger';

export class UpdateProjectMemberDto {
  @ApiProperty({ description: '项目角色ID' })
  roleId: string;
}
