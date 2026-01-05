-- 创建测试用户
-- 密码都是 'Test123!' 的 bcrypt 哈希值

-- 管理员用户
INSERT INTO users (id, email, username, password, nickname, role, status, "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt")
VALUES (
  'cloucad-admin-001',
  'admin@cloucad.com',
  'admin',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYJWvJvZQ9i',
  '系统管理员',
  'ADMIN',
  'ACTIVE',
  true,
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- 测试用户
INSERT INTO users (id, email, username, password, nickname, role, status, "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt")
VALUES (
  'cloucad-user-001',
  'test@cloucad.com',
  'testuser',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYJWvJvZQ9i',
  '测试用户',
  'USER',
  'ACTIVE',
  true,
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- 张三
INSERT INTO users (id, email, username, password, nickname, role, status, "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt")
VALUES (
  'cloucad-user-002',
  'zhangsan@cloucad.com',
  'zhangsan',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYJWvJvZQ9i',
  '张三',
  'USER',
  'ACTIVE',
  true,
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- 李四
INSERT INTO users (id, email, username, password, nickname, role, status, "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt")
VALUES (
  'cloucad-user-003',
  'lisi@cloucad.com',
  'lisi',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYJWvJvZQ9i',
  '李四',
  'USER',
  'ACTIVE',
  true,
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- 王五
INSERT INTO users (id, email, username, password, nickname, role, status, "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt")
VALUES (
  'cloucad-user-004',
  'wangwu@cloucad.com',
  'wangwu',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYJWvJvZQ9i',
  '王五',
  'USER',
  'ACTIVE',
  true,
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- 赵六
INSERT INTO users (id, email, username, password, nickname, role, status, "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt")
VALUES (
  'cloucad-user-005',
  'zhaoliu@cloucad.com',
  'zhaoliu',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYJWvJvZQ9i',
  '赵六',
  'USER',
  'ACTIVE',
  true,
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- 钱七
INSERT INTO users (id, email, username, password, nickname, role, status, "emailVerified", "emailVerifiedAt", "createdAt", "updatedAt")
VALUES (
  'cloucad-user-006',
  'qianqi@cloucad.com',
  'qianqi',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYJWvJvZQ9i',
  '钱七',
  'USER',
  'ACTIVE',
  true,
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- 显示插入的用户
SELECT id, email, username, nickname, role, status, "emailVerified" FROM users ORDER BY "createdAt";