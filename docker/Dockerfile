# 梦想网页CAD实时协同平台 统一构建 Dockerfile (优化版 v2)
# 利用 Docker 缓存层，大幅提升构建速度

# ==================== 基础依赖阶段 ====================
FROM node:20.19.5-alpine AS base
WORKDIR /app

# 安装系统依赖（单独一层，利用缓存）
RUN apk add --no-cache python3 make g++ curl dumb-init subversion

# 安装 pnpm（单独一层）
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# 先复制依赖描述文件（利用缓存：代码改动不影响依赖层）
# 需要所有 workspace 包的 package.json（pnpm install 解析 workspace:* 依赖）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./ 
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/frontend_mobile/package.json ./packages/frontend_mobile/
COPY packages/mxVersionTool/package.json ./packages/mxVersionTool/
COPY packages/db/package.json ./packages/db/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/api-sdk/package.json ./packages/api-sdk/
COPY packages/config-service/package.json ./packages/config-service/
COPY packages/engine-exec/package.json ./packages/engine-exec/

# 安装所有依赖（单独一层，代码改动不会触发重新安装）
# --ignore-scripts 跳过其他包的 postinstall，避免本地依赖问题
RUN pnpm install --frozen-lockfile --ignore-scripts

# 单独运行 mxcad-app postinstall 解压 .gz 文件
# pnpm 使用符号链接，需要用 find 定位实际路径
RUN find node_modules -name "postinstall.js" -path "*mxcad-app*" -exec node {} \; || true

# 复制 Prisma schema（单一源在 db 包，用于生成 Prisma Client）
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/prisma.config.ts ./packages/db/
COPY packages/backend/prisma.config.ts ./packages/backend/

# 生成 Prisma Client（backend config 指向 ../db/prisma/schema.prisma）
RUN pnpm --filter backend exec prisma generate

# ==================== 后端构建阶段 ====================
FROM base AS backend-builder
WORKDIR /app

# 复制 mxVersionTool 源代码（后端依赖此包）
COPY packages/mxVersionTool ./packages/mxVersionTool

# 复制 db / contracts / engine-exec 源码（backend 的 prebuild 会在容器内构建这三个包）
COPY packages/db/src ./packages/db/src
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/prisma.config.ts ./packages/db/
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/contracts/src ./packages/contracts/src
COPY packages/contracts/tsconfig.json ./packages/contracts/
# engine-exec 的 TS 源文件在包根目录（无 src/），4 个根文件只互相引用，不依赖 test/。
# 不能拷 test/：.dockerignore 的 `**/*.test.ts` 会排除其全部文件，COPY 目录会报
# "no source files were specified" 直接中断构建（tsc 少编译 test 不影响运行时产物）。
COPY packages/engine-exec/*.ts ./packages/engine-exec/
COPY packages/engine-exec/tsconfig.json ./packages/engine-exec/

# 复制后端源代码（只有代码改动才会触发此层重建）
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/tsconfig.build.json ./packages/backend/
COPY packages/backend/nest-cli.json ./packages/backend/
COPY packages/backend/scripts ./packages/backend/scripts

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

# 复制 api-sdk 源码（前端 import @cloudcad/api-sdk，exports 指向 src）
COPY packages/api-sdk ./packages/api-sdk

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

# 构建参数（移动端继承前端阶段的 VITE_API_BASE_URL）
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# 复制移动端源代码（.dockerignore 排除 node_modules/.env/.vscode 等）
COPY packages/frontend_mobile ./packages/frontend_mobile

# 构建移动端
WORKDIR /app/packages/frontend_mobile
RUN pnpm run build

# 合并移动端 dist 到前端 dist（同域名部署）
WORKDIR /app
RUN MOBILE_PATH=$(node -e "const c=JSON.parse(require('fs').readFileSync('packages/frontend/public/ini/myServerConfig.json','utf8'));process.stdout.write(c.mobileAccessPath||'mxcad_mobile')") && \
    mkdir -p packages/frontend/dist/$MOBILE_PATH && \
    cp -r packages/frontend_mobile/dist/* packages/frontend/dist/$MOBILE_PATH/ && \
    echo "Merged mobile dist at packages/frontend/dist/$MOBILE_PATH"

# ==================== 生产镜像 ====================
FROM node:20.19.5-alpine AS production
WORKDIR /app

# 安装运行时依赖（单独一层）
RUN apk add --no-cache dumb-init curl subversion nginx netcat-openbsd openssl

# 启用 pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# 复制依赖描述文件（复用缓存）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/mxVersionTool/package.json ./packages/mxVersionTool/
COPY packages/db/package.json ./packages/db/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/engine-exec/package.json ./packages/engine-exec/

# 复制 Prisma schema 和 migrations（生产迁移需要）
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/prisma.config.ts ./packages/db/
COPY packages/backend/prisma ./packages/backend/prisma
COPY packages/backend/prisma.config.ts ./packages/backend/

# 安装生产依赖 + Prisma CLI（用于 migrate deploy）
# 本镜像 filter = backend 运行时依赖闭包（含 mx-version-tool；不跑 3100 故不含 conversion-service）
# 离线部署包 filter 见 pack-offline.js getDeployStoreInstallFilter（含 conversion-service、不含 mx-version-tool）——两者口径不同，勿互抄
RUN pnpm install --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec --frozen-lockfile --ignore-scripts

# 生成 Prisma Client
RUN pnpm --filter backend exec prisma generate

# 移除 devDependencies 减小镜像体积（保留 prisma CLI）
RUN pnpm --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec --frozen-lockfile --prod || \
    pnpm install --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec --frozen-lockfile --prod

# 重新安装 prisma 和 tsx（migrate deploy 需要）
# 必须钉死精确版本：原写法 `add prisma@^7.1.0 tsx`（tsx 完全无版本）在构建期实时解析
# registry，解析结果随时间漂移且无人记录，导致同一 tag 的镜像不可复现。
RUN pnpm --filter backend add prisma@7.8.0 tsx@4.22.4 --ignore-scripts

# 复制 mxVersionTool 源代码
COPY packages/mxVersionTool ./packages/mxVersionTool

# 复制构建产物（只有构建结果变化才会更新）
# backend dist + @cloudcad/db / @cloudcad/contracts / @cloudcad/engine-exec 的 dist
# （backend 运行时 require 这三个包；漏 engine-exec 会在加载转换服务时 MODULE_NOT_FOUND）
COPY --from=backend-builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=backend-builder /app/packages/db/dist ./packages/db/dist
COPY --from=backend-builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=backend-builder /app/packages/engine-exec/dist ./packages/engine-exec/dist
# frontend/dist 已包含合并后的移动端 dist（路径由 myServerConfig.json 的 mobileAccessPath 控制）
COPY --from=frontend-builder /app/packages/frontend/dist /var/www/html

# 复制 mxcadassembly (Linux 运行时)
COPY runtime/linux/mxcad ./runtime/linux/mxcad

# 复制协同服务管理脚本
COPY runtime/scripts/cooperate-manager.js ./runtime/scripts/cooperate-manager.js

# 复制 nginx 配置模板（#408 公网 TLS：entrypoint 按 TLS 证书是否落位二选一渲染到 http.d/default.conf）
COPY docker/nginx/nginx.conf /etc/nginx/templates/default.conf
COPY docker/nginx/nginx-tls.conf /etc/nginx/templates/default-tls.conf

# 创建数据目录并设置权限（统一在 /app/data/ 下）
RUN mkdir -p /app/data/files /app/data/logs /app/data/svn-repo /app/data/uploads /app/data/temp /run/nginx /etc/nginx/certs && \
    adduser -D -h /home/cloudcad cloudcad && \
    mkdir -p /home/cloudcad && chown cloudcad:cloudcad /home/cloudcad && \
    chown -R cloudcad:cloudcad /app/data && \
    chmod -R 700 /app/data

# 安装 su-exec（用于降权运行服务进程）
RUN apk add --no-cache su-exec

# 暴露端口（443 用于 #408 公网 TLS，证书落位后启用）
EXPOSE 80 443 3001 3000

# 健康检查（增加超时时间，适应启动较慢的场景）
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:3001/api/health/live || exit 1

# 启动脚本
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/docker-entrypoint.sh"]
