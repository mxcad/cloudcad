import { ApiProperty } from '@nestjs/swagger';
import { Permission, RoleCategory } from '../../common/enums/permissions.enum';

export class RoleDto {
  @ApiProperty({ description: '角色 ID' })
  id: string;

  @ApiProperty({ description: '角色名称' })
  name: string;

  @ApiProperty({ description: '角色描述', required: false })
  description?: string;

  @ApiProperty({ description: '角色类别', enum: RoleCategory })
  category: RoleCategory;

  @ApiProperty({ description: '角色级别（用于权限继承）' })
  level: number;

  @ApiProperty({ description: '是否为系统角色（不可删除）' })
  isSystem: boolean;

  @ApiProperty({ description: '权限列表', type: [String] })
  permissions: Permission[];

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}
