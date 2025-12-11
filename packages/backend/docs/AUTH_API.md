# 认证API文档

## 概述

CloudCAD认证系统提供完整的JWT双Token认证机制，支持用户注册、登录、Token刷新等功能。

## API端点

### 1. 用户注册

**POST** `/api/auth/register`

**请求体：**

```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "Password123!",
  "nickname": "用户昵称"
}
```

**响应：**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "username": "username",
    "nickname": "用户昵称",
    "avatar": null,
    "role": "USER",
    "status": "ACTIVE"
  }
}
```

### 2. 用户登录

**POST** `/api/auth/login`

**请求体：**

```json
{
  "account": "user@example.com", // 邮箱或用户名
  "password": "Password123!"
}
```

**响应：** 同注册响应

### 3. 刷新Token

**POST** `/api/auth/refresh`

**请求体：**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**响应：** 同注册响应，返回新的Token对

### 4. 用户登出

**POST** `/api/auth/logout`

**Headers：** `Authorization: Bearer <access_token>`

**响应：**

```json
{
  "message": "登出成功"
}
```

### 5. 获取用户信息

**GET** `/api/auth/profile`

**Headers：** `Authorization: Bearer <access_token>`

**响应：**

```json
{
  "id": "user_id",
  "email": "user@example.com",
  "username": "username",
  "nickname": "用户昵称",
  "avatar": null,
  "role": "USER",
  "status": "ACTIVE"
}
```

## 安全特性

### JWT双Token机制

- **Access Token**: 有效期1小时，用于API访问
- **Refresh Token**: 有效期7天，用于刷新Access Token

### 密码安全

- 使用bcrypt进行密码哈希，salt rounds = 12
- 密码强度要求：至少8位，包含大小写字母、数字和特殊字符

### 输入验证

- 邮箱格式验证
- 用户名格式验证（3-20位，字母数字下划线）
- 密码强度验证

## 错误响应

### 400 Bad Request

```json
{
  "message": "请求参数错误",
  "error": "Bad Request",
  "statusCode": 400
}
```

### 401 Unauthorized

```json
{
  "message": "账号或密码错误",
  "error": "Unauthorized",
  "statusCode": 401
}
```

### 409 Conflict

```json
{
  "message": "邮箱已被注册",
  "error": "Conflict",
  "statusCode": 409
}
```

## 测试账号

系统预置了以下测试账号：

1. **管理员账号**
   - 邮箱: `admin@cloucad.com`
   - 用户名: `admin`
   - 密码: `Admin123!`
   - 角色: `ADMIN`

2. **测试用户**
   - 邮箱: `test@cloucad.com`
   - 用户名: `testuser`
   - 密码: `Test123!`
   - 角色: `USER`

## 使用示例

### 使用curl测试

```bash
# 用户注册
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "username": "newuser",
    "password": "Password123!",
    "nickname": "新用户"
  }'

# 用户登录
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "account": "admin@cloucad.com",
    "password": "Admin123!"
  }'

# 刷新Token
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your_refresh_token_here"
  }'

# 获取用户信息
curl -X GET http://localhost:3001/api/auth/profile \
  -H "Authorization: Bearer your_access_token_here"
```

## 环境配置

确保在`.env`文件中配置以下变量：

```env
JWT_SECRET=your-jwt-secret-key-here
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
```

## 注意事项

1. 所有需要认证的API都需要在请求头中包含有效的Access Token
2. Access Token过期后，使用Refresh Token获取新的Token对
3. 建议在前端实现Token自动刷新机制
4. 生产环境中请使用强密码作为JWT密钥
