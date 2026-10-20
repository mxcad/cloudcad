# CloudCAD Docker 一键部署包 —— app 镜像（ADR-0074 半容器化）
#
# 与旧 docker/Dockerfile（全容器化形态，`pnpm deploy` 用）的区别：
#   - 双进程入口 docker/app-entrypoint.js（backend + nginx 前端），nginx 提供静态资源 + /api 反代
#   - 无 svn 仓库预初始化（后端 MxVersionControlProvider 启动时自动初始化）
#   - 不烘焙 mxcadAssembly（宿主 runtime/ 同路径挂载进容器；机器码绑定 + 用户可替换官方版）
#   - 不烘焙协同/转换/运维中心（宿主进程）
#   - 前端 dist 落 /app/packages/frontend/dist（nginx root，旧镜像是 /var/www/html）
#   - 烘焙离线 schema-engine（musl 变体）供 prisma CLI 离线 migrate deploy
#
# 构建：docker build -f docker/Dockerfile.app --build-arg APP_VERSION=<版本> .
# 构建上下文 = 仓库根（.dockerignore 生效）；构建机需有 runtime/prisma-engines/schema-engine-linux-musl
# variant（#441）：oss 加 --build-context implmx=<空目录>；private 加
#   --build-context implmx=<impl-mx 暂存目录（源码+dist，不含 node_modules）>
#   --build-arg IMPLMX_FILTER="--filter @cloudcad/impl-mx"（打包脚本自动拼装）

# ==================== 基础依赖阶段 ====================
FROM node:20.19.5-alpine AS base
WORKDIR /app

# 受限网络：可用 --build-arg ALPINE_MIRROR=<镜像基址> 替换官方 dl-cdn（空=官方源）。
# 基址形如 https://mirrors.tuna.tsinghua.edu.cn（替换 dl-cdn.alpinelinux.org，路径 /alpine/v3.22/... 不变）
ARG ALPINE_MIRROR
RUN [ -z "$ALPINE_MIRROR" ] || sed -i "s|https://dl-cdn.alpinelinux.org|${ALPINE_MIRROR}|g" /etc/apk/repositories

RUN apk add --no-cache python3 make g++ curl

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# 需要所有 workspace 包的 package.json（pnpm install 解析 workspace:* 依赖）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# 根 tsconfig：backend/tsconfig.json 以 extends ../../tsconfig.json 继承它（tsc 解析需要）
COPY tsconfig.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/frontend_mobile/package.json ./packages/frontend_mobile/
COPY packages/mxVersionTool/package.json ./packages/mxVersionTool/
COPY packages/db/package.json ./packages/db/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/api-sdk/package.json ./packages/api-sdk/
COPY packages/engine-exec/package.json ./packages/engine-exec/
COPY packages/platform/package.json ./packages/platform/

# 私有实现包（#441，命名上下文 implmx：private 构建传 impl-mx 暂存目录（源码 + 打包机
# 预构建 dist，不含 node_modules），oss 构建传空目录占位）。必须在 base 的 pnpm install
# 之前：private 的 lockfile 含 impl-mx importer，workspace（packages/* glob）须能看到
# packages/impl-mx/package.json，否则 frozen install 因 lockfile/workspace 不一致失败
# （与裸机 Dockerfile.linux-deploy 同机制）。
COPY --from=implmx . ./packages/impl-mx

# 受限网络：打包机可用 --build-arg NPM_REGISTRY=... 指定 npm registry 镜像（空=官方源）
ARG NPM_REGISTRY
RUN [ -z "$NPM_REGISTRY" ] || npm config set registry "$NPM_REGISTRY"

RUN pnpm install --frozen-lockfile --ignore-scripts

# mxcad-app 的 postinstall 负责把 dist/ 下所有 .gz 解压成同名 .js（运行时入口
# index.js 依赖 chunks/lib.js 等 .js 文件）。--ignore-scripts 会跳过它，导致镜像里
# node_modules/mxcad-app/dist 只剩发布态 .gz、缺 .js → 前端 closeBundle 原样拷进
# dist/mxcad-app/ → 浏览器加载 /mxcad-app/chunks/lib.js 命中 nginx try_files 的
# =404（text/html）→ ES module 被 MIME 拦截 → CAD 编辑器与文件上传全部失败。
# 故在 base 阶段显式补跑 mxcad-app 的 postinstall（纯本地解压、无网络/无平台二进制，
# 安全），并断言关键产物 lib.js 已生成，缺失即构建失败（fail-fast，不打出残包）。
RUN d=$(ls -d node_modules/.pnpm/mxcad-app@*/node_modules/mxcad-app 2>/dev/null | head -1); \
    if [ -z "$d" ]; then echo "ERROR: 未在 pnpm store 找到 mxcad-app"; exit 1; fi; \
    node "$d/postinstall.js"; \
    if [ ! -f "$d/dist/chunks/lib.js" ]; then echo "ERROR: postinstall 未生成 dist/chunks/lib.js"; exit 1; fi

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
COPY packages/db/scripts ./packages/db/scripts
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
# build:seed 用（tsc -p tsconfig.seed.json 编译 prisma/seed.ts）
COPY packages/backend/tsconfig.seed.json ./packages/backend/
COPY packages/backend/nest-cli.json ./packages/backend/
COPY packages/backend/scripts ./packages/backend/scripts
# seed.ts 源码（build:seed 的编译输入）
COPY packages/backend/prisma ./packages/backend/prisma

WORKDIR /app/packages/backend
RUN pnpm run build

# ==================== 前端构建阶段 ====================
FROM base AS frontend-builder
WORKDIR /app

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY tsconfig.json ./
COPY swagger_json.json ./
# platform 是纯源码包（main 指向 src/index.ts，无 build 步骤，vite 直接编译 TS）
COPY packages/platform/src ./packages/platform/src
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

# 移动端源码：此处置 WORKDIR 仍是 /app/packages/frontend（PC 构建遗留），相对路径 COPY
# 目的地会解析到嵌套的 packages/frontend/packages/frontend_mobile，而移动端构建的
# WORKDIR /app/packages/frontend_mobile 指向 base 阶段目录（只有 node_modules+package.json）
# → vite 报 "Could not resolve entry module index.html"。故一律用绝对路径：
COPY packages/frontend_mobile /tmp/fm_src
RUN cp -a /tmp/fm_src/. /app/packages/frontend_mobile/ && \
    test -f /app/packages/frontend_mobile/index.html && \
    test -f /app/packages/frontend_mobile/vite.config.ts && \
    test -d /app/packages/frontend_mobile/src && \
    rm -rf /tmp/fm_src

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

# production 是全新 FROM，不继承 base 的 apk 镜像配置，须在此重设（同 NPM_REGISTRY 口径）
ARG ALPINE_MIRROR
RUN [ -z "$ALPINE_MIRROR" ] || sed -i "s|https://dl-cdn.alpinelinux.org|${ALPINE_MIRROR}|g" /etc/apk/repositories

# subversion：后端版本控制走 svn CLI；curl：容器健康检查；
# nginx：前端静态资源 + /api 反代（替代裸机 serve-static.js 的 node 服务，见 ADR-0074）
RUN apk add --no-cache subversion curl nginx

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/mxVersionTool/package.json ./packages/mxVersionTool/
COPY packages/db/package.json ./packages/db/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/engine-exec/package.json ./packages/engine-exec/

# production 是全新 FROM，不继承 base 的 /root/.npmrc，registry 镜像须在此重设
ARG NPM_REGISTRY
RUN [ -z "$NPM_REGISTRY" ] || npm config set registry "$NPM_REGISTRY"

# Prisma schema 和 migrations（生产迁移需要）
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/prisma.config.ts ./packages/db/
COPY packages/backend/prisma ./packages/backend/prisma
COPY packages/backend/prisma.config.ts ./packages/backend/

# 私有实现包（#441，命名上下文 implmx：private 构建传 impl-mx 暂存目录（源码 + 打包机
# 预构建的 dist，不含 node_modules），oss 构建传空目录占位）。仅生产阶段需要：backend
# 源码不 import impl-mx（base/backend-builder 阶段不受影响），运行时经 IMPL 环境变量
# require /app/packages/impl-mx/dist（auth.module.ts 的 resolveAuthImplPath）；
# private 的 .env 由打包生成 IMPL=1。
COPY --from=implmx . ./packages/impl-mx

# 生产依赖（backend 运行时依赖闭包；不跑 3100 故不含 conversion-service——转换服务是宿主进程）。
# IMPLMX_FILTER：private 构建传 "--filter @cloudcad/impl-mx"（安装 impl-mx 运行时依赖），
# oss 为空（命名上下文为空目录，无 package.json 不进 workspace）。
# install / prisma generate / prod 裁剪 / 补装 prisma+tsx 全部合并进同一层，末尾同层删除
# pnpm 缓存与 store：Docker 分层下「跨层 rm」只加 whiteout、不减体积（被删文件仍占下层空间），
# 必须与创建缓存的 install 同层才能真瘦身（省 /root/.cache ~370M + store 独享部分）。运行时只跑
# node dist/main.js，不读 /root/.cache、/root/.local；node_modules 与 store 硬链接，删 store 后数据
# 不丢。对下次构建零影响：production 全新 FROM node:alpine，缓存本就不跨构建复用。
# 补装的 prisma/tsx 必须钉死精确版本：实时解析 registry 会随时间漂移，导致同一 tag 镜像不可复现。
ARG IMPLMX_FILTER=
RUN pnpm install --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec ${IMPLMX_FILTER} --frozen-lockfile --ignore-scripts \
    && pnpm --filter backend exec prisma generate \
    && (pnpm --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec ${IMPLMX_FILTER} --frozen-lockfile --prod \
        || pnpm install --filter backend --filter @cloudcad/mx-version-tool --filter @cloudcad/db --filter @cloudcad/contracts --filter @cloudcad/engine-exec ${IMPLMX_FILTER} --frozen-lockfile --prod) \
    && pnpm --filter backend add prisma@7.8.0 tsx@4.22.4 --ignore-scripts \
    && rm -rf /root/.cache /root/.local

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

# 前端静态服务改由 nginx 提供（/api 反代 + SPA 回退 + 移动端路径 + cooperate 引擎文件），
# 替代裸机 serve-static.js 的 node 服务。模板占位符由入口 app-entrypoint.js 启动时渲染。
COPY docker/nginx/nginx-app.conf.template /app/nginx/nginx-app.conf.template

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
