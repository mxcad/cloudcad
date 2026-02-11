# API 文档

## 基础信息

- **Base URL**: `http://localhost:3001/api`
- **认证方式**: Bearer Token (JWT)
- **内容类型**: `application/json`

## 认证

### 获取访问令牌

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@cloucad.com",
  "password": "password123"
}
```

**响应:**

```json
{
  "code": "SUCCESS",
  "message": "登录成功",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user_1234567890",
      "email": "admin@cloucad.com",
      "username": "admin",
      "nickname": "管理员",
      "role": "ADMIN"
    }
  }
}
```

### 刷新令牌

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 用户管理

### 获取用户列表

```http
GET /users?page=1&limit=10&search=keyword
Authorization: Bearer {token}
```

**响应:**

```json
{
  "code": "SUCCESS",
  "message": "获取用户列表成功",
  "data": {
    "users": [
      {
        "id": "user_1234567890",
        "email": "user@example.com",
        "username": "username",
        "nickname": "用户昵称",
        "avatar": "http://example.com/avatar.jpg",
        "role": "USER",
        "status": "ACTIVE",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 10
  }
}
```

### 创建用户

```http
POST /users
Authorization: Bearer {token}
Content-Type: application/json

{
  "email": "newuser@example.com",
  "username": "newuser",
  "password": "password123",
  "nickname": "新用户",
  "role": "USER"
}
```

### 更新用户

```http
PUT /users/{userId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "nickname": "更新昵称",
  "avatar": "http://example.com/new-avatar.jpg"
}
```

### 删除用户

```http
DELETE /users/{userId}
Authorization: Bearer {token}
```

## 项目管理

### 获取项目列表

```http
GET /projects?page=1&limit=10&status=ACTIVE
Authorization: Bearer {token}
```

**响应:**

```json
{
  "code": "SUCCESS",
  "message": "获取项目列表成功",
  "data": {
    "projects": [
      {
        "id": "proj_1234567890",
        "name": "示例项目",
        "description": "项目描述",
        "status": "ACTIVE",
        "memberCount": 5,
        "fileCount": 23,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 10
  }
}
```

### 创建项目

```http
POST /projects
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "新项目",
  "description": "项目描述"
}
```

### 获取项目详情

```http
GET /projects/{projectId}
Authorization: Bearer {token}
```

### 项目成员管理

```http
# 添加成员
POST /projects/{projectId}/members
Authorization: Bearer {token}
Content-Type: application/json

{
  "userId": "user_1234567890",
  "role": "MEMBER"
}

# 移除成员
DELETE /projects/{projectId}/members/{userId}
Authorization: Bearer {token}
```

## 文件管理

### 上传文件

```http
POST /files/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [binary data]
projectId: proj_1234567890 (optional)
```

**响应:**

```json
{
  "code": "SUCCESS",
  "message": "文件上传成功",
  "data": {
    "id": "file_1234567890",
    "name": "drawing.dwg",
    "originalName": "my-drawing.dwg",
    "mimeType": "application/dwg",
    "size": 1048576,
    "url": "http://localhost:9000/cloucad/file_1234567890",
    "status": "ACTIVE",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 获取文件列表

```http
GET /files?projectId=proj_1234567890&page=1&limit=20
Authorization: Bearer {token}
```

### 下载文件

```http
GET /files/{fileId}/download
Authorization: Bearer {token}
```

### 转换文件

```http
POST /files/{fileId}/convert
Authorization: Bearer {token}
Content-Type: application/json

{
  "format": "mxweb",
  "options": {
    "quality": "high",
    "compress": true
  }
}
```

### 删除文件

```http
DELETE /files/{fileId}
Authorization: Bearer {token}
```

## 资产库管理

### 获取图块列表

```http
GET /assets/blocks?category=door&page=1&limit=20
Authorization: Bearer {token}
```

### 上传图块

```http
POST /assets/blocks
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [binary data]
name: "单开门"
category: "door"
tags: ["门", "室内", "单开"]
description: "标准单开门图块"
```

### 获取字体列表

```http
GET /fonts?family=Arial&style=regular
Authorization: Bearer {token}
```

### 上传字体

```http
POST /fonts
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [binary data]
name: "Arial Regular"
family: "Arial"
style: "regular"
weight: "400"
```

## 分享管理

### 创建分享链接

```http
POST /shares
Authorization: Bearer {token}
Content-Type: application/json

{
  "fileId": "file_1234567890",
  "expiresIn": 86400,
  "password": "optional_password",
  "permissions": ["view", "download"]
}
```

**响应:**

```json
{
  "code": "SUCCESS",
  "message": "分享链接创建成功",
  "data": {
    "id": "share_1234567890",
    "url": "http://localhost:3001/share/share_1234567890",
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "password": "optional_password"
  }
}
```

### 访问分享

```http
GET /share/{shareId}
Authorization: Bearer {token} (可选，如果设置了密码)
```

## 健康检查

### 系统健康检查

```http
GET /health
```

**响应:**

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up",
      "message": "数据库连接正常"
    },
    "storage": {
      "status": "up",
      "message": "本地文件存储正常"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 错误响应格式

所有错误响应都遵循统一格式：

```json
{
  "code": "ERROR_CODE",
  "message": "错误描述",
  "errors": [
    {
      "field": "email",
      "message": "邮箱格式不正确"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/users",
  "method": "POST"
}
```

### 常见错误码

| 错误码                  | HTTP状态码 | 描述             |
| ----------------------- | ---------- | ---------------- |
| `VALIDATION_ERROR`      | 400        | 请求参数验证失败 |
| `UNAUTHORIZED`          | 401        | 未授权访问       |
| `FORBIDDEN`             | 403        | 权限不足         |
| `NOT_FOUND`             | 404        | 资源不存在       |
| `CONFLICT`              | 409        | 资源冲突         |
| `INTERNAL_SERVER_ERROR` | 500        | 服务器内部错误   |

## 限流规则

- **登录接口**: 每分钟最多 5 次请求
- **文件上传**: 每分钟最多 10 次请求
- **其他接口**: 每分钟最多 100 次请求

## SDK 示例

### JavaScript/TypeScript

```typescript
// 安装: npm install axios
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// 添加请求拦截器
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 登录
const login = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

// 获取用户列表
const getUsers = async (page = 1, limit = 10) => {
  const response = await api.get('/users', { params: { page, limit } });
  return response.data;
};
```

### Python

```python
import requests

class CloudCADAPI:
    def __init__(self, base_url="http://localhost:3001/api"):
        self.base_url = base_url
        self.token = None

    def login(self, email, password):
        response = requests.post(
            f"{self.base_url}/auth/login",
            json={"email": email, "password": password}
        )
        data = response.json()
        self.token = data['data']['accessToken']
        return data

    def get_headers(self):
        return {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }

    def get_users(self, page=1, limit=10):
        response = requests.get(
            f"{self.base_url}/users",
            headers=self.get_headers(),
            params={'page': page, 'limit': limit}
        )
        return response.json()

# 使用示例
api = CloudCADAPI()
api.login('admin@cloucad.com', 'password123')
users = api.get_users()
```

---

📖 更多详细信息请参考在线文档: http://localhost:3001/api/docs
