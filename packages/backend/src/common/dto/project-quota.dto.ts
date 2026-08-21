import { ApiProperty } from '@nestjs/swagger';

export class ProjectQuotaDto {
  @ApiProperty({ description: '项目 ID' })
  projectId: string;

  @ApiProperty({ description: '已使用空间（字节），仅计源文件大小' })
  used: number;

  @ApiProperty({ description: '项目上传上限（字节），根据 VIP 等级决定' })
  limit: number;

  @ApiProperty({ description: '剩余空间（字节）' })
  remaining: number;
}
