import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiResponseDto } from '../../common/dto/api-response.dto';

export class RegisterDto {
  @ApiProperty({
    description: '用户邮箱',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  email: string;

  @ApiProperty({
    type: String,
    description: '用户名',
    example: 'username',
    minLength: 3,
    maxLength: 20,
    pattern: '^[a-zA-Z0-9_]+$',
  })
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(3, { message: '用户名至少3个字符' })
  @MaxLength(20, { message: '用户名最多20个字符' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: '用户名只能包含字母、数字和下划线',
  })
  username: string;

  @ApiProperty({
    type: String,
    description: '密码',
    example: 'password123',
    minLength: 8,
    maxLength: 50,
  })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(50, { message: '密码最多50个字符' })
  password: string;

  @ApiProperty({
    description: '昵称',
    example: '用户昵称',
    required: false,
    maxLength: 50,
  })
  @IsOptional()
  @IsString({ message: '昵称必须是字符串' })
  @MaxLength(50, { message: '昵称最多50个字符' })
  nickname?: string;
}

export class LoginDto {
  @ApiProperty({
    description: '邮箱或用户名',
    example: 'user@example.com',
  })
  @IsString({ message: '登录账号必须是字符串' })
  @IsNotEmpty({ message: '登录账号不能为空' })
  account: string;

  @ApiProperty({
    description: '密码',
    example: 'Password123!',
  })
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: '刷新Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString({ message: '刷新Token必须是字符串' })
  @IsNotEmpty({ message: '刷新Token不能为空' })
  refreshToken: string;
}

export class UserDto {
  @ApiProperty({
    description: '用户ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: '用户邮箱',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: '用户名',
    example: 'username',
  })
  username: string;

  @ApiProperty({
    description: '昵称',
    example: '用户昵称',
    required: false,
  })
  nickname?: string;

  @ApiProperty({
    description: '头像URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  avatar?: string;

  @ApiProperty({
    description: '用户角色',
    type: 'object',
    properties: {
      id: { type: 'string', example: 'clxxxxxxx' },
      name: { type: 'string', enum: ['ADMIN', 'USER'], example: 'USER' },
      description: {
        type: 'string',
        example: '普通用户，基础权限',
        nullable: true,
      },
      isSystem: { type: 'boolean', example: true },
      permissions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { permission: { type: 'string' } },
        },
      },
    },
  })
  role: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: Array<{ permission: string }>;
  };

  @ApiProperty({
    description: '用户状态',
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
    example: 'ACTIVE',
  })
  status: string;
}

export class AuthResponseDto {
  @ApiProperty({
    description: '访问Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: '刷新Token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: '用户信息',
    type: () => UserDto,
  })
  user: UserDto;
}

export class AuthApiResponseDto extends ApiResponseDto<AuthResponseDto> {
  @ApiProperty({
    description: '认证响应数据',
    type: () => AuthResponseDto,
  })
  declare data: AuthResponseDto;
}
