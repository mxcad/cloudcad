import { ApiProperty } from '@nestjs/swagger';

class NodePropertiesPermissionsDto {
  @ApiProperty({ description: '是否可编辑' })
  canEdit: boolean;

  @ApiProperty({ description: '是否可删除' })
  canDelete: boolean;

  @ApiProperty({ description: '是否可下载' })
  canDownload: boolean;
}

export class NodePropertiesDto {
  @ApiProperty({ description: '节点 ID' })
  id: string;

  @ApiProperty({ description: '节点名称' })
  name: string;

  @ApiProperty({ description: '是否为文件夹' })
  isFolder: boolean;

  @ApiProperty({ description: '文件路径', required: false })
  path?: string;

  @ApiProperty({ description: '文件大小（直接存储值）', required: false })
  size?: number;

  @ApiProperty({ description: '递归总大小（文件夹）', required: false })
  totalSize?: number;

  @ApiProperty({ description: '直接子文件夹数', required: false })
  childrenFolderCount?: number;

  @ApiProperty({ description: '直接子文件数', required: false })
  childrenFileCount?: number;

  @ApiProperty({ description: '递归总子节点数', required: false })
  totalChildrenCount?: number;

  @ApiProperty({ description: '所有者用户名', required: false })
  ownerName?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiProperty({ description: '项目 ID', required: false })
  projectId?: string;

  @ApiProperty({ description: 'MIME 类型', required: false })
  mimeType?: string;

  @ApiProperty({ description: '权限信息' })
  permissions: NodePropertiesPermissionsDto;
}
