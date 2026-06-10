import { ApiProperty } from '@nestjs/swagger';

export class ParentContextDto {
  @ApiProperty({ description: '父节点 ID' })
  parentId: string;

  @ApiProperty({ description: '目标文件在父目录中的页码' })
  pageNumber: number;

  @ApiProperty({ description: '目标文件在该页中的位置（从 1 开始）' })
  positionInPage: number;

  @ApiProperty({ description: '父目录总页数' })
  totalPages: number;

  @ApiProperty({ description: '父目录总节点数' })
  total: number;
}
