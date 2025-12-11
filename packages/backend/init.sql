-- 创建数据库扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(25) PRIMARY KEY DEFAULT ('user_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    avatar VARCHAR(500),
    role VARCHAR(20) DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建项目表
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(25) PRIMARY KEY DEFAULT ('proj_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建项目成员表
CREATE TABLE IF NOT EXISTS project_members (
    id VARCHAR(25) PRIMARY KEY DEFAULT ('pmem_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    project_id VARCHAR(25) REFERENCES projects(id) ON DELETE CASCADE,
    user_id VARCHAR(25) REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
);

-- 创建文件表
CREATE TABLE IF NOT EXISTS files (
    id VARCHAR(25) PRIMARY KEY DEFAULT ('file_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size INTEGER NOT NULL,
    path VARCHAR(500) NOT NULL,
    hash VARCHAR(64),
    project_id VARCHAR(25) REFERENCES projects(id) ON DELETE SET NULL,
    creator_id VARCHAR(25) REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PROCESSING', 'DELETED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建文件访问权限表
CREATE TABLE IF NOT EXISTS file_accesses (
    id VARCHAR(25) PRIMARY KEY DEFAULT ('facc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    file_id VARCHAR(25) REFERENCES files(id) ON DELETE CASCADE,
    user_id VARCHAR(25) REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'VIEWER' CHECK (role IN ('OWNER', 'EDITOR', 'VIEWER')),
    UNIQUE(file_id, user_id)
);

-- 创建资产表
CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(25) PRIMARY KEY DEFAULT ('asset_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('BLOCK', 'SYMBOL', 'TEMPLATE', 'MATERIAL')),
    category VARCHAR(100) NOT NULL,
    description TEXT,
    path VARCHAR(500) NOT NULL,
    thumbnail VARCHAR(500),
    tags TEXT[],
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建字体表
CREATE TABLE IF NOT EXISTS fonts (
    id VARCHAR(25) PRIMARY KEY DEFAULT ('font_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    name VARCHAR(255) NOT NULL,
    family VARCHAR(100) NOT NULL,
    style VARCHAR(50) NOT NULL,
    weight VARCHAR(50) NOT NULL,
    path VARCHAR(500) NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DELETED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_creator_id ON files(creator_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
CREATE INDEX IF NOT EXISTS idx_file_accesses_file_id ON file_accesses(file_id);
CREATE INDEX IF NOT EXISTS idx_file_accesses_user_id ON file_accesses(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_fonts_family ON fonts(family);
CREATE INDEX IF NOT EXISTS idx_fonts_status ON fonts(status);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加更新时间触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fonts_updated_at BEFORE UPDATE ON fonts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认管理员用户（密码: admin123）
INSERT INTO users (email, username, password, nickname, role) 
VALUES ('admin@cloucad.com', 'admin', '$2b$10$example.hash.here', '系统管理员', 'ADMIN')
ON CONFLICT (email) DO NOTHING;

COMMIT;