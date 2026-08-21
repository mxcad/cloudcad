import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserStatus } from '../../common/enums/user-status.enum';

export class UpdateUserStatusDto {
  @ApiProperty({
    description: '用户状态',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsEnum(UserStatus)
  status: UserStatus;
}