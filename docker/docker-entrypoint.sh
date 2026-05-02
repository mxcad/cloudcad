#!/bin/sh
set -e

echo "=== CloudCAD 启动脚本 v2 ==="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo "${RED}[ERROR]${NC} $1"
}

# ==================== 环境检查 ====================

# 检查必要的环境变量
check_env() {
    local missing=0
    
    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL 未设置"
        missing=1
    fi
    
    if [ -z "$JWT_SECRET" ]; then
        log_error "JWT_SECRET 未设置"
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        log_error "缺少必要的环境变量，请检查配置"
        exit 1
    fi
    
    log_info "环境变量检查通过"
}

# ==================== SVN 初始化 ====================

init_svn() {
    local svn_repo_path="${SVN_REPO_PATH:-/app/data/svn-repo}"
    local files_data_path="${FILES_DATA_PATH:-/app/data/files}"
    
    log_info "检查 SVN 仓库..."
    
    # 创建 SVN 仓库（如果不存在）
    if [ ! -d "$svn_repo_path/db" ]; then
        log_info "初始化 SVN 仓库: $svn_repo_path"
        svnadmin create "$svn_repo_path" 2>/dev/null || {
            log_warn "SVN 仓库创建失败或已存在"
        }
    else
        log_info "SVN 仓库已存在: $svn_repo_path"
    fi
    
    # 开发模式：修复 SVN 工作副本 URL
    if [ "${DEV_MODE:-false}" = "true" ] || [ "${NODE_ENV:-production}" = "development" ]; then
        log_info "开发模式：检查 SVN 工作副本..."
        
        local svn_dir="$files_data_path/.svn"
        
        if [ -d "$svn_dir" ]; then
            log_info "检测到 SVN 工作副本，检查 URL 配置..."
            
            local current_url=$(svn info "$files_data_path" 2>/dev/null | grep "^Repository Root:" | cut -d' ' -f3- || echo "")
            local correct_url="file://$svn_repo_path"
            
            if [ -n "$current_url" ] && [ "$current_url" != "$correct_url" ]; then
                log_info "SVN URL 需要重定向: $current_url -> $correct_url"
                svn switch --relocate "$current_url" "$correct_url" "$files_data_path" 2>/dev/null || {
                    log_warn "URL 重定向失败，删除 .svn 目录重新初始化..."
                    rm -rf "$svn_dir"
                }
                log_info "SVN URL 重定向完成"
            else
                log_info "SVN URL 配置正确: $correct_url"
            fi
        fi
    fi
}

# ==================== 数据库等待 ====================

wait_for_db() {
    local host="${DB_HOST:-postgres}"
    local port="${DB_PORT:-5432}"
    local max_attempts="${DB_WAIT_ATTEMPTS:-30}"
    local attempt=0
    
    log_info "等待数据库连接 ($host:$port)..."
    
    while [ $attempt -lt $max_attempts ]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            log_info "数据库已就绪"
            return 0
        fi
        attempt=$((attempt + 1))
        log_info "数据库未就绪，等待... ($attempt/$max_attempts)"
        sleep 2
    done
    
    log_error "数据库连接超时"
    return 1
}

# ==================== Redis 等待 ====================

wait_for_redis() {
    local host="${REDIS_HOST:-redis}"
    local port="${REDIS_PORT:-6379}"
    local max_attempts="${REDIS_WAIT_ATTEMPTS:-30}"
    local attempt=0
    
    log_info "等待 Redis 连接 ($host:$port)..."
    
    while [ $attempt -lt $max_attempts ]; do
        if nc -z "$host" "$port" 2>/dev/null; then
            log_info "Redis 已就绪"
            return 0
        fi
        attempt=$((attempt + 1))
        log_info "Redis 未就绪，等待... ($attempt/$max_attempts)"
        sleep 2
    done
    
    log_error "Redis 连接超时"
    return 1
}

# ==================== 数据库迁移 ====================

run_migrations() {
    log_info "运行数据库迁移..."
    cd /app/apps/backend

    # 确保 prisma.config.ts 可以读取环境变量
    export DATABASE_URL="${DATABASE_URL}"

    # 检查是否存在 migrations 目录且有迁移文件
    local has_migrations=false
    if [ -d "prisma/migrations" ]; then
        # 检查是否有实际的迁移文件（不只是目录存在）
        if [ "$(find prisma/migrations -name '*.sql' 2>/dev/null | wc -l)" -gt 0 ]; then
            has_migrations=true
        fi
    fi

    if [ "$has_migrations" = "true" ]; then
        # 有迁移文件，使用 migrate deploy
        log_info "检测到迁移文件，执行 migrate deploy..."
        
        # 显示迁移开始时间
        local start_time=$(date +%s)
        log_info "┌─ 数据库迁移开始 ──────────────────────────────┐"
        
        # 检查数据库大小
        if command -v psql >/dev/null 2>&1; then
            local db_size=$(psql -t -c "SELECT pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null | tr -d '[:space:]')
            if [ -n "$db_size" ]; then
                log_info "│  数据库大小: $db_size"
            fi
        fi
        
        # 执行迁移
        npx prisma migrate deploy --schema=prisma/schema.prisma 2>&1 | while IFS= read -r line; do
            log_info "│  $line"
        done
        
        local exit_code=${PIPESTATUS[0]}
        local end_time=$(date +%s)
        local elapsed=$((end_time - start_time))
        
        if [ $exit_code -ne 0 ]; then
            log_error "│  ❌ 迁移失败 (耗时: ${elapsed}s)"
            log_error "└───────────────────────────────────────────────────┘"
            log_error "数据库迁移失败"
            return 1
        fi
        
        log_info "│  ✅ 迁移成功 (耗时: ${elapsed}s)"
        log_info "└───────────────────────────────────────────────────┘"
    else
        # 没有迁移文件，使用 db push 同步 schema
        log_info "无迁移文件，使用 db push 同步数据库结构..."
        npx prisma db push --accept-data-loss || {
            log_error "数据库同步失败"
            return 1
        }
    fi

    log_info "数据库迁移完成"
}

# ==================== 启动 Nginx ====================

start_nginx() {
    log_info "启动 Nginx..."
    
    # 测试配置
    nginx -t 2>/dev/null || {
        log_error "Nginx 配置检查失败"
        return 1
    }
    
    nginx
    log_info "Nginx 已启动"
}

# ==================== 启动协同服务 ====================

start_cooperate() {
    local cooperate_script="/app/runtime/scripts/cooperate-manager.js"
    
    if [ -f "$cooperate_script" ]; then
        log_info "启动协同服务..."
        cd /app/runtime/scripts
        node cooperate-manager.js &
        log_info "协同服务已启动"
    else
        log_warn "协同服务脚本不存在: $cooperate_script"
    fi
}

# ==================== 主流程 ====================

main() {
    log_info "开始启动流程..."
    
    # 1. 环境检查
    check_env
    
    # 2. SVN 初始化
    init_svn
    
    # 3. 等待依赖服务
    wait_for_db || exit 1
    wait_for_redis || exit 1
    
    # 4. 数据库迁移
    run_migrations || exit 1
    
    # 5. 启动 Nginx
    start_nginx || exit 1
    
    # 6. 启动协同服务（后台）
    start_cooperate
    
    # 7. 启动后端服务
    log_info "启动后端服务..."
    cd /app/apps/backend
    exec node dist/src/main.js
}

# 执行主流程
main
