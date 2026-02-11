# 部署指南

## 🚀 快速部署

### 生产环境一键部署

```bash
# 1. 克隆项目
git clone https://github.com/your-org/cloucad.git
cd cloudcad

# 2. 配置环境变量
cp packages/backend/.env.example packages/backend/.env

# 3. 启动生产环境
cd packages/backend
pnpm run prod
```

## 📋 环境要求

### 最低配置

- **CPU**: 2核心
- **内存**: 4GB RAM
- **存储**: 50GB SSD
- **网络**: 10Mbps带宽

### 推荐配置

- **CPU**: 4核心
- **内存**: 8GB RAM
- **存储**: 100GB SSD
- **网络**: 100Mbps带宽

### 软件依赖

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (仅开发环境)
- pnpm 8+ (仅开发环境)

## 🔧 环境配置

### 生产环境变量

```env
# packages/backend/.env
NODE_ENV=production
PORT=3001

# JWT配置 (生产环境必须修改)
JWT_SECRET=your-super-secure-jwt-secret-key-change-this
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# 数据库配置
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-secure-database-password
DB_DATABASE=cloucad
DB_SSL=false
DB_MAX_CONNECTIONS=20

# Redis配置
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# 本地文件存储配置
FILES_DATA_PATH=./filesData
FILES_NODE_LIMIT=1000
STORAGE_CLEANUP_DELAY_DAYS=30

# 文件上传配置
UPLOAD_MAX_SIZE=104857600
UPLOAD_ALLOWED_TYPES=.dwg,.dxf,.pdf,.png,.jpg,.jpeg
```

## 🏗️ 部署架构

### 生产环境架构

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │    (Nginx)      │
                    └─────────┬───────┘
                              │
                    ┌─────────▼───────┐
                    │   CloudCAD      │
                    │   Backend       │
                    │   (Port 3001)   │
                    └─────────┬───────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
    ┌───────▼──────┐  ┌───────▼──────┐  ┌──────▼──────┐
    │  PostgreSQL  │  │    Redis     │  │  本地文件系统 │
    │   (5432)     │  │   (6379)     │  │  ./filesData│
    └──────────────┘  └──────────────┘  └─────────────┘
```

## 📦 Docker 部署

### 1. 使用 Docker Compose

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 2. 单独构建镜像

```bash
# 构建后端镜像
docker build -t cloucad-backend:latest .

# 运行容器
docker run -d \
  --name cloucad-backend \
  -p 3001:3001 \
  --env-file .env \
  cloucad-backend:latest
```

### 3. 多阶段构建优化

```dockerfile
# Dockerfile (生产优化版)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:18-alpine AS production
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app
COPY package*.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
USER nodejs
EXPOSE 3001
CMD ["node", "dist/main"]
```

## 🌐 Nginx 反向代理

### 配置示例

```nginx
# /etc/nginx/sites-available/cloucad
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /var/www/cloucad/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API代理
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 文件上传大小限制
    client_max_body_size 100M;
}

# HTTPS配置
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 其他配置同上...
}
```

## 🔒 安全配置

### 1. 防火墙设置

```bash
# Ubuntu/Debian
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 2. SSL/TLS 证书

```bash
# 使用 Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. 数据库安全

```sql
-- 创建专用数据库用户
CREATE USER cloucad_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE cloucad TO cloucad_user;

-- 限制连接
ALTER USER cloucad_user CONNECTION LIMIT 20;
```

## 📊 监控与日志

### 1. 健康检查

```bash
# 系统健康检查
curl http://localhost:3001/api/health

# 数据库健康检查
curl http://localhost:3001/api/health/db

# 存储健康检查
curl http://localhost:3001/api/health/storage
```

### 2. 日志管理

```yaml
# docker-compose.yml (生产版)
services:
  backend:
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'
    volumes:
      - ./logs:/app/logs
```

### 3. 监控配置

```yaml
# docker-compose.monitoring.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - '3000:3000'
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin123
```

## 🔄 备份与恢复

### 1. 数据库备份

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
docker exec cloucad-postgres pg_dump -U postgres cloucad > $BACKUP_DIR/postgres_$DATE.sql

# 备份本地文件存储
tar -czf $BACKUP_DIR/filesData_$DATE.tar.gz ./filesData

# 清理旧备份 (保留7天)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "filesData_*" -mtime +7 -delete
```

### 2. 自动备份

```bash
# 添加到 crontab
0 2 * * * /path/to/backup.sh
```

### 3. 数据恢复

```bash
# 恢复数据库
docker exec -i cloucad-postgres psql -U postgres cloucad < backup/postgres_20240101_020000.sql

# 恢复本地文件存储
tar -xzf backup/filesData_20240101_020000.tar.gz
```

## 🚀 CI/CD 部署

### GitHub Actions 示例

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install pnpm
        run: npm install -g pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Build
        run: pnpm run build

      - name: Deploy to server
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /opt/cloucad
            git pull origin main
            pnpm install
            pnpm run build
            docker-compose down
            docker-compose up -d --build
```

## 🐛 故障排除

### 常见问题

1. **服务无法启动**

   ```bash
   # 检查端口占用
   netstat -tulpn | grep :3001

   # 检查Docker状态
   docker-compose ps

   # 查看详细日志
   docker-compose logs backend
   ```

2. **数据库连接失败**

   ```bash
   # 检查数据库容器
   docker-compose exec postgres pg_isready -U postgres

   # 测试连接
   docker-compose exec postgres psql -U postgres -d cloucad
   ```

3. **文件上传失败**

   ```bash
   # 检查本地文件系统
   ls -la filesData

   # 检查存储空间
   df -h filesData
   ```

### 性能优化

1. **数据库优化**

   ```sql
   -- 创建索引
   CREATE INDEX CONCURRENTLY idx_files_project_id ON files(project_id);

   -- 分析查询性能
   EXPLAIN ANALYZE SELECT * FROM files WHERE project_id = 'xxx';
   ```

2. **Redis优化**

   ```bash
   # 监控Redis性能
   docker-compose exec redis redis-cli --latency-history
   ```

3. **应用优化**
   ```bash
   # 启用集群模式
   docker-compose up -d --scale backend=3
   ```

## 📞 技术支持

- **文档**: https://docs.cloucad.com
- **社区**: https://community.cloucad.com
- **问题反馈**: https://github.com/your-org/cloucad/issues
- **邮件支持**: support@cloucad.com

---

💡 如需技术支持，请提供详细的错误日志和系统环境信息。
