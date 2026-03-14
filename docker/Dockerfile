# CloudCAD 统一构建 Dockerfile (优化版 v2)
# 利用 Docker 缓存层，大幅提升构建速度

# ==================== 基础依赖阶段 ====================
FROM node:20.19.5-alpine AS base
WORKDIR /app

# 安装系统依赖（单独一层，利用缓存）
RUN apk add --no-cache python3 make g++ curl dumb-init subversion

# 安装 pnpm（单独一层）
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 先复制依赖描述文件（利用缓存：代码改动不影响依赖层）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./ 
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/svnVersionTool/package.json ./packages/svnVersionTool/

# 安装所有依赖（单独一层，代码改动不会触发重新安装）
# --ignore-scripts 跳过其他包的 postinstall，避免本地依赖问题
RUN pnpm install --frozen-lockfile --ignore-scripts

# 单独运行 mxcad-app postinstall 解压 .gz 文件
# pnpm 使用符号链接，需要用 find 定位实际路径
RUN find node_modules -name "postinstall.js" -path "*mxcad-app*" -exec node {} \; || true

# 复制 Prisma schema（用于生成 Prisma Client）
COPY packages/backend/prisma ./packages/backend/prisma
COPY packages/backend/prisma.config.ts ./packages/backend/

# 生成 Prisma Client
RUN pnpm --filter backend exec prisma generate

# ==================== 后端构建阶段 ====================
FROM base AS backend-builder
WORKDIR /app

# 复制 svnVersionTool 源代码（后端依赖此包）
COPY packages/svnVersionTool ./packages/svnVersionTool

# 复制后端源代码（只有代码改动才会触发此层重建）
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/tsconfig.build.json ./packages/backend/
COPY packages/backend/nest-cli.json ./packages/backend/

# 构建后端
WORKDIR /app/packages/backend
RUN pnpm run build

# ==================== 前端构建阶段 ====================
FROM base AS frontend-builder
WORKDIR /app

# 构建参数 - API 地址
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# 复制根目录 tsconfig.json (前端 tsconfig 继承自它)
COPY tsconfig.json ./

# 复制 swagger JSON 文件（前端 API 客户端依赖）
COPY swagger_json.json ./

# 复制前端源代码（只有代码改动才会触发此层重建）
COPY packages/frontend/src ./packages/frontend/src
COPY packages/frontend/public ./packages/frontend/public
COPY packages/frontend/index.html ./packages/frontend/
COPY packages/frontend/vite.config.ts ./packages/frontend/
COPY packages/frontend/tsconfig.json ./packages/frontend/
COPY packages/frontend/vite-env.d.ts ./packages/frontend/
COPY packages/frontend/types.ts ./packages/frontend/
COPY packages/frontend/metadata.json ./packages/frontend/

# 构建前端
WORKDIR /app/packages/frontend
RUN pnpm run build

# ==================== 生产镜像 ====================
FROM node:20.19.5-alpine AS production
WORKDIR /app

# 安装运行时依赖（单独一层）
RUN apk add --no-cache dumb-init curl subversion nginx netcat-openbsd openssl

# 启用 pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 复制依赖描述文件（复用缓存）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/svnVersionTool/package.json ./packages/svnVersionTool/

# 复制 Prisma schema 和 migrations（生产迁移需要）
COPY packages/backend/prisma ./packages/backend/prisma
COPY packages/backend/prisma.config.ts ./packages/backend/

# 安装生产依赖 + Prisma CLI（用于 migrate deploy）
RUN pnpm install --filter backend --filter @cloudcad/svn-version-tool --frozen-lockfile --ignore-scripts

# 生成 Prisma Client
RUN pnpm --filter backend exec prisma generate

# 移除 devDependencies 减小镜像体积（保留 prisma CLI）
RUN pnpm --filter backend --filter @cloudcad/svn-version-tool --frozen-lockfile --prod || \
    pnpm install --filter backend --filter @cloudcad/svn-version-tool --frozen-lockfile --prod

# 重新安装 prisma 和 tsx（migrate deploy 需要）
RUN pnpm --filter backend add prisma@^7.1.0 tsx --ignore-scripts

# 复制 svnVersionTool 源代码
COPY packages/svnVersionTool ./packages/svnVersionTool

# 复制构建产物（只有构建结果变化才会更新）
COPY --from=backend-builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=frontend-builder /app/packages/frontend/dist /var/www/html

# 复制 mxcadassembly (Linux 运行时)
COPY runtime/linux/mxcad ./runtime/linux/mxcad

# 复制协同服务管理脚本
COPY runtime/scripts/cooperate-manager.js ./runtime/scripts/cooperate-manager.js

# 复制 nginx 配置
COPY docker/nginx/nginx.conf /etc/nginx/http.d/default.conf

# 创建必要目录并设置权限
RUN mkdir -p /app/filesData /app/logs /app/svn-repo /app/uploads /app/temp /run/nginx && \
    chmod -R 755 /app/filesData /app/logs /app/svn-repo /app/uploads /app/temp

# 暴露端口
EXPOSE 80 3001 3000

# 健康检查（增加超时时间，适应启动较慢的场景）
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:3001/api/health/live || exit 1

# 启动脚本
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/docker-entrypoint.sh"]
