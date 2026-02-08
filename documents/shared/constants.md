# 常量与配置（Shared）

## 环境变量

### 后端环境变量（packages/backend/.env）

**应用配置**：
- `PORT`: 3001
- `NODE_ENV`: development/production

**JWT 配置**：
- `JWT_SECRET`: JWT 密钥
- `JWT_EXPIRES_IN`: 1h
- `JWT_REFRESH_EXPIRES_IN`: 7d

**数据库配置**：
- `DB_HOST`: localhost
- `DB_PORT`: 5432
- `DB_USERNAME`: postgres
- `DB_PASSWORD`: password
- `DB_DATABASE`: cloucad
- `DB_MAX_CONNECTIONS`: 20

**Redis 配置**：
- `REDIS_HOST`: localhost
- `REDIS_PORT`: 6379
- `REDIS_DB`: 0

**本地存储配置**：
- `FILES_DATA_PATH`: ../filesData
- `FILES_NODE_LIMIT`: 300000
- `STORAGE_CLEANUP_DELAY_DAYS`: 30

**磁盘监控配置**：
- `DISK_WARNING_THRESHOLD`: 21474836480 (20GB)
- `DISK_CRITICAL_THRESHOLD`: 10737418240 (10GB)

**MxCAD 配置**：
- `MXCAD_ASSEMBLY_PATH`: 转换工具路径
- `MXCAD_UPLOAD_PATH`: ../uploads
- `MXCAD_TEMP_PATH`: ../temp
- `MXCAD_FILE_EXT`: .mxweb

### 前端环境变量（packages/frontend/.env.local）

- `VITE_API_BASE_URL`: http://localhost:3001/api
- `VITE_APP_NAME`: CloudCAD

## 文件上传配置

```typescript
FILE_UPLOAD_CONFIG = {
  allowedExtensions: ['.dwg', '.dxf', '.pdf', '.png', '.jpg', '.jpeg'],
  maxFileSize: 104857600, // 100MB
  maxFilesPerUpload: 10,
  blockedExtensions: ['.exe', '.bat', '.sh', '.cmd', '.ps1', '.scr', '.vbs'],
}
```

## 存储配置

- 单目录最大节点数：300,000
- 子目录数量：最多 100 个
- 软删除延迟：30 天
- 物理删除延迟：30 天（软删除后）

## 缓存配置

- 权限缓存 TTL：5-10 分钟
- 角色缓存 TTL：10 分钟
- 项目权限缓存 TTL：5 分钟
- Redis 缓存 TTL：可配置

## 并发控制

- 最大并发上传数：5
- 文件锁超时：可配置

## 服务地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3000 |
| 后端 API | http://localhost:3001 |
| API 文档 | http://localhost:3001/api/docs |
| 数据库 | localhost:5432 |
| Redis | localhost:6379 |