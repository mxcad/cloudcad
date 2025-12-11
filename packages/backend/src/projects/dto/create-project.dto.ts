import { ApiProperty } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称', example: 'My Project' })
  @IsString()
  name: string;

  @ApiProperty({ description: '项目描述', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ 
    description: '项目状态', 
    enum: ProjectStatus, 
    required: false,
    default: ProjectStatus.ACTIVE 
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus = ProjectStatus.ACTIVE;
}
