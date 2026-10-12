# CloudCAD Docker 一键部署包 —— app 镜像（ADR-0074 半容器化）
#
# 与旧 docker/Dockerfile（全容器化形态，`pnpm deploy` 用）的区别：
#   - 双进程入口 docker/app-entrypoint.js（backend + serve-static 前端），无 nginx/dumb-init
#   - 无 svn 仓库预初始化（后端 MxVersionControlProvider 启动时自动初始化）
#   - 不烘焙 mxcadAssembly（宿主 runtime/ 同路径挂载进容器；机器码绑定 + 用户可替换官方版）
#   - 不烘焙协同/转换/运维中心（宿主进程）
#   - 前端 dist 落 /app/packages/frontend/dist（serve-static.js 默认目录，旧镜像是 /var/www/html）
#   - 烘焙离线 schema-engine（musl 变体）供 prisma CLI 离线 migrate deploy
#
# 构建：docker build -f docker/Dockerfile.app --build-arg APP_VERSION=<版本> .
# 构建上下文 = 仓库根（.dockerignore 生效）；构建机需有 runtime/prisma-engines/schema-engine-linux-musl

# ==================== 基础依赖阶段 ====================
FROM node:20.19.5-alpine AS base
WORKDIR /app

RUN apk add --no-cache python3 make g++ curl

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# 需要所有 workspace 包的 package.json（pnpm install 解析 workspace:* 依赖）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/frontend_mobile/package.json ./packages/frontend_mobile/
COPY packages/mxVersionTool/package.json ./packages/mxVersionTool/
COPY packages/db/package.json ./packages/db/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/api-sdk/package.json ./packages/api-sdk/
COPY packages/engine-exec/package.json ./packages/engine-exec/

RUN pnpm install --frozen-lockfile --ignore-scripts

# 复制 Prisma schema（单一源在 db 包，用于生成 Prisma Client）
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/prisma.config.ts ./packages/db/
COPY packages/backend/prisma.config.ts ./packages/backend/

RUN pnpm --filter backend exec prisma generate

# ==================== 后端构建阶段 ====================
FROM base AS backend-builder
WORKDIR /app

COPY packages/mxVersionTool ./packages/mxVersionTool

# db / contracts / engine-exec 源码（backend 的 prebuild 会在容器内构建这三个包）
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

COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/tsconfig.build.json ./packages/backend/
COPY packages/backend/nest-cli.json ./packages/backend/
COPY packages/backend/scripts ./packages/backend/scripts

WORKDIR /app/packages/backend
RUN pnpm run build

# ==================== 前端构建阶段 ====================
FROM base AS frontend-builder
WORKDIR /app

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY tsconfig.json ./
COPY swagger_json.json ./
COPY packages/api-sdk ./packages/api-sdk
COPY packages/frontend/src ./packages/frontend/src
COPY packages/frontend/public ./packages/frontend/public
COPY packages/frontend/index.html ./packages/frontend/
COPY packages/frontend/vite.config.ts ./packages/frontend/
COPY packages/frontend/tsconfig.json ./packages/frontend/
COPY packages/frontend/vite-env.d.ts ./packages/frontend/
COPY packages/frontend/metadata.json ./packages/frontend/

WORKDIR /app/packages/frontend
RUN pnpm run build

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY packages/frontend_mobile ./packages/frontend_mobile

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

# subversion：后端版本控制走 svn CLI；curl：容器健康检查
RUN apk add --no-cache subversion curl

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/mxVersionTool/package.json ./packages/mxVersionTool/
COPY packages/db/package.json ./packages/db/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/engine-exec/package.json ./packages/engine-exec/

# Prisma schema 和 migrations（生产迁移需要）
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/prisma.config.ts ./packages/db/
COPY packages/backend/prisma ./packages/backend/prisma
COPY packages/backend/prisma.config.ts ./packages/backend/

# 生产依赖（backend 运行时依赖闭包；不跑 3100 故不含 conversion-service——转换服务是宿主进程）
RUN pnpm install --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec --frozen-lockfile --ignore-scripts

RUN pnpm --filter backend exec prisma generate

RUN pnpm --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec --frozen-lockfile --prod || \
    pnpm install --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec --frozen-lockfile --prod

# 重新安装 prisma 和 tsx（migrate deploy 需要；tsx 加载 prisma.config.ts）
# 必须钉死精确版本：实时解析 registry 会随时间漂移，导致同一 tag 的镜像不可复现（同旧镜像口径）
RUN pnpm --filter backend add prisma@7.8.0 tsx@4.22.4 --ignore-scripts

COPY packages/mxVersionTool ./packages/mxVersionTool

# 构建产物（backend dist + @cloudcad/db / @cloudcad/contracts / @cloudcad/engine-exec 的 dist）
COPY --from=backend-builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=backend-builder /app/packages/db/dist ./packages/db/dist
COPY --from=backend-builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=backend-builder /app/packages/engine-exec/dist ./packages/engine-exec/dist
# frontend/dist 已包含合并后的移动端 dist（路径由 myServerConfig.json 的 mobileAccessPath 控制）
COPY --from=frontend-builder /app/packages/frontend/dist ./packages/frontend/dist

# 离线 schema-engine 二进制（musl 变体，alpine 基础镜像匹配；构建机需已预置该文件）
COPY runtime/prisma-engines/schema-engine-linux-musl /app/prisma-engines/schema-engine
RUN chmod +x /app/prisma-engines/schema-engine

# 前端静态服务（与裸机形态同一脚本：/api 反代 + SPA 回退 + 移动端路径）
COPY runtime/scripts/serve-static.js ./runtime/scripts/serve-static.js

# 入口 + 版本烙入
COPY docker/app-entrypoint.js /app/app-entrypoint.js
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
RUN echo "${APP_VERSION}" > /app/VERSION

# 数据目录（同路径挂载点；宿主 start.sh 已建，容器内兜底）
RUN mkdir -p /app/data

# 健康检查（端口跟随容器环境 PORT，compose env_file 注入）
HEALTHCHECK --interval=15s --timeout=10s --start-period=90s --retries=10 \
    CMD curl -fs "http://localhost:${PORT:-3001}/api/health/live" || exit 1

ENTRYPOINT ["node", "/app/app-entrypoint.js"]
