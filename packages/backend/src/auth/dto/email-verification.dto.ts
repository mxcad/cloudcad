import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: '6位数字验证码',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class SendVerificationDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    description: '邮箱地址',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  email: string;
}

// 响应DTO
export class VerifyEmailResponseDto {
  @ApiProperty({
    description: '操作结果',
    example: '邮箱验证成功',
  })
  message: string;
}

export class SendVerificationResponseDto {
  @ApiProperty({
    description: '操作结果',
    example: '验证邮件已发送',
  })
  message: string;
}

// Swagger响应DTO
export class VerifyEmailApiResponseDto {
  @ApiProperty({ type: () => VerifyEmailResponseDto })
  code: string;
  @ApiProperty()
  message: string;
  @ApiProperty({ type: () => VerifyEmailResponseDto })
  data: VerifyEmailResponseDto;
  @ApiProperty()
  timestamp: string;
}

export class SendVerificationApiResponseDto {
  @ApiProperty({ type: () => SendVerificationResponseDto })
  code: string;
  @ApiProperty()
  message: string;
  @ApiProperty({ type: () => SendVerificationResponseDto })
  data: SendVerificationResponseDto;
  @ApiProperty()
  timestamp: string;
}
