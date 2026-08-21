import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { RefundApplicationStatus } from '../enums/billing.enum';

export class ListRefundApplicationsQueryDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: '申请状态筛选',
    enum: RefundApplicationStatus,
  })
  @IsOptional()
  @IsEnum(RefundApplicationStatus)
  status?: RefundApplicationStatus;
}
