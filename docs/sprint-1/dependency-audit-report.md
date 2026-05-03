# Backend 依赖审计报告

**审计日期：** 2026-05-02
**审计范围：** `packages/backend/package.json` 与 `packages/backend/src/` 源码

---

## 摘要

| 分类 | 数量 |
|------|------|
| 生产依赖总数 | 42 |
| 框架必需依赖 | 25 |
| 可替换依赖 | 9 |
| 废弃依赖（未使用） | 6 |
| 可选依赖 | 2 |

---

## 详细依赖清单

| 依赖名 | 当前版本 | 用途分类 | 是否可替换 | 备注 |
|-------|---------|---------|----------|------|
| @nestjs/common | ^11.0.1 | NestJS核心框架 | **否** | 框架核心，提供装饰器、依赖注入等基础能力 |
| @nestjs/core | ^11.0.1 | NestJS核心框架 | **否** | 框架核心，NestFactory等 |
| @nestjs/platform-express | ^11.1.9 | Express适配器 | **否** | NestJS与Express的集成适配器 |
| @nestjs/config | ^4.0.2 | 配置管理 | **否** | 环境变量配置管理 |
| @nestjs/jwt | ^11.0.2 | JWT认证 | **否** | JWT令牌生成与验证 |
| @nestjs/passport | ^11.0.5 | Passport集成 | **否** | Passport策略集成模块 |
| @nestjs/schedule | ^6.1.0 | 定时任务 | **否** | Cron定时任务调度 |
| @nestjs/swagger | ^11.2.3 | API文档 | **是** | 可替换为其他API文档方案（如Scalar） |
| @nestjs/terminus | ^11.0.0 | 健康检查 | **可选** | 微服务健康检查，端到端健康探测 |
| @nestjs/throttler | ^6.5.0 | 限流 | **是** | API限流，可替换为nginx限流或自实现 |
| express | ^5.2.1 | Web框架 | **否** | NestJS底层Web框架 |
| express-session | ^1.18.2 | 会话管理 | **否** | Redis会话存储依赖 |
| passport | ^0.7.0 | 认证框架 | **否** | 多策略认证框架基础 |
| passport-jwt | ^4.0.1 | JWT策略 | **否** | Passport的JWT认证策略 |
| @prisma/client | ^7.1.0 | 数据库ORM | **否** | Prisma ORM客户端 |
| @prisma/adapter-pg | ^7.1.0 | PostgreSQL适配器 | **否** | Prisma与PostgreSQL的适配器 |
| prisma | ^7.1.0 | 数据库迁移 | **否** | Prisma CLI工具 |
| ioredis | ^5.8.2 | Redis客户端 | **否** | Redis缓存与会话存储 |
| redis | ^5.10.0 | Redis客户端 | **否** | connect-redis依赖 |
| @nestjs-modules/ioredis | ^2.0.2 | NestJS Redis模块 | **否** | Redis模块的NestJS集成 |
| connect-redis | ^9.0.0 | Redis会话存储 | **否** | express-session的Redis存储适配器 |
| class-validator | ^0.14.3 | DTO验证 | **否** | 请求数据验证 |
| class-transformer | ^0.5.1 | DTO转换 | **否** | 请求/响应数据转换 |
| multer | ^2.0.2 | 文件上传 | **否** | multipart/form-data处理 |
| archiver | ^7.0.1 | 文件压缩 | **否** | 文件批量下载压缩 |
| handlebars | ^4.7.8 | 模板引擎 | **否** | 邮件模板渲染 |
| @nestjs-modules/mailer | ^2.0.2 | 邮件模块 | **可替换** | 可替换为nodemailer直接使用或其他邮件服务 |
| nodemailer | ^7.0.11 | 邮件发送 | **可替换** | 邮件发送，可替换为SendGrid/AWS SES等 |
| bcryptjs | ^3.0.3 | 密码加密 | **可替换** | 密码哈希，可替换为argon2等 |
| rxjs | ^7.8.1 | 响应式编程 | **否** | NestJS异步响应式编程依赖 |
| reflect-metadata | ^0.2.2 | 装饰器元数据 | **否** | TypeScript装饰器元数据反射 |
| http-proxy-middleware | ^3.0.5 | 代理中间件 | **否** | 开发环境API代理 |
| @cloudcad/svn-version-tool | workspace:* | SVN版本控制 | **否** | SVN版本控制工具集成 |
| @alicloud/dysmsapi20170525 | ^4.5.0 | 阿里云短信 | **可替换** | 短信验证码，可替换为腾讯云/华为云等 |
| @alicloud/openapi-client | ^0.4.15 | 阿里云API客户端 | **可替换** | 阿里云SDK，可替换其他短信服务商 |
| @alicloud/tea-util | ^1.4.11 | 阿里云工具库 | **可替换** | 阿里云SDK依赖，可替换 |
| tencentcloud-sdk-nodejs | ^4.1.207 | 腾讯云短信 | **可替换** | 短信验证码，可替换为阿里云/华为云等 |
| @css-inline/css-inline | ^0.20.0 | CSS内联 | **废弃** | 源码中无任何引用 |
| @paralleldrive/cuid2 | ^3.0.4 | ID生成器 | **废弃** | 源码中无任何引用 |
| graphmatch | ^1.1.1 | 图匹配算法 | **废弃** | 源码中无任何引用 |
| is-unicode-supported | ^2.1.0 | Unicode检测 | **废弃** | 源码中无任何引用 |
| uuid | ^13.0.0 | UUID生成 | **废弃** | 源码中无任何引用 |

---

## 废弃依赖详情

以下依赖已在 `package.json` 中声明，但在源码中没有任何 import 或 require 引用：

| 依赖名 | 版本 | 建议操作 |
|-------|------|---------|
| @css-inline/css-inline | ^0.20.0 | **建议移除** |
| @paralleldrive/cuid2 | ^3.0.4 | **建议移除** |
| graphmatch | ^1.1.1 | **建议移除** |
| is-unicode-supported | ^2.1.0 | **建议移除** |
| uuid | ^13.0.0 | **建议移除** |
| @nestjs/throttler | ^6.5.0 | **建议移除**（限流功能未使用） |

---

## 可替换依赖说明

以下依赖虽被使用，但属于可替换的外部服务依赖：

| 类别 | 依赖 | 替代方案 |
|------|------|---------|
| **短信服务** | @alicloud/dysmsapi20170525, @alicloud/openapi-client, @alicloud/tea-util, tencentcloud-sdk-nodejs | 腾讯云、华为云、SendGrid、Twilio |
| **邮件服务** | nodemailer, @nestjs-modules/mailer, handlebars | AWS SES、SendGrid、Resend |
| **密码加密** | bcryptjs | argon2、scrypt、PBKDF2 |
| **限流** | @nestjs/throttler | nginx限流、API网关限流、自实现令牌桶 |
| **API文档** | @nestjs/swagger | Scalar、RapiDoc、Stoplight |

---

## 框架必需依赖（不可替换）

以下依赖为NestJS框架核心或系统运行必需：

| 依赖 | 原因 |
|------|------|
| @nestjs/common, @nestjs/core, @nestjs/platform-express | NestJS框架核心 |
| express | 底层Web框架 |
| rxjs, reflect-metadata | TypeScript装饰器与响应式编程 |
| @nestjs/config | 环境配置管理 |
| @nestjs/jwt, @nestjs/passport, passport, passport-jwt | JWT身份认证体系 |
| @prisma/client, @prisma/adapter-pg, prisma | 数据库ORM与迁移 |
| ioredis, redis, @nestjs-modules/ioredis, connect-redis | 缓存与会话存储 |
| express-session | 会话管理 |
| class-validator, class-transformer | DTO验证与转换 |
| multer | 文件上传处理 |
| @nestjs/schedule | 定时任务调度 |
| @cloudcad/svn-version-tool | SVN版本控制集成 |
| archiver | 文件批量导出压缩 |
| handlebars | 邮件模板渲染 |
| http-proxy-middleware | API代理中间件 |

---

## 建议

1. **立即移除废弃依赖**（6个）
   ```bash
   pnpm remove @css-inline/css-inline @paralleldrive/cuid2 graphmatch is-unicode-supported uuid @nestjs/throttler
   ```

2. **考虑移除的可替换依赖**（如不使用对应功能）
   - 如不使用短信功能，可移除：@alicloud/dysmsapi20170525, @alicloud/openapi-client, @alicloud/tea-util, tencentcloud-sdk-nodejs
   - 如使用其他邮件服务，可移除nodemailer

3. **依赖版本建议**
   - 大部分依赖已使用最新稳定版本，建议保持
   - bcryptjs ^3.0.3 可考虑升级或替换为argon2
