# 认证系统（Auth）

**文件位置**：`packages/backend/src/auth/`

## 概述

JWT 双 Token 认证系统，支持 Session 兼容，提供邮箱验证和密码重置功能。

## 核心组件

- **JwtStrategy**: JWT 策略，验证 Access Token
- **LocalStrategy**: 本地策略，验证用户名密码
- **AuthService**: 认证服务，处理登录、注册、刷新令牌
- **AuthController**: 认证控制器，提供 API 接口
- **JwtAuthGuard**: JWT 守卫，保护需要认证的路由

## Token 机制

| Token 类型 | 有效期 | 用途 |
|-----------|--------|------|
| Access Token | 1 小时 | API 访问 |
| Refresh Token | 7 天 | 刷新 Access Token |
| Token 黑名单 | - | 登出时将 Token 加入 Redis 黑名单 |

## Session 支持

- 集成 express-session: 1.18.2
- 24 小时有效期，httpOnly 安全设置
- 兼容 MxCAD-App 传统 Session 认证

## 登录后跳转

使用 React Router location.state 保存重定向路径，登录成功后自动跳转回原页面。

## 相关服务

- PermissionService: 权限检查
- RolesService: 角色管理
- CacheService: 缓存管理