# 配置管理

CloudCAD 采用三层配置体系。

## 配置层级

| 层级 | 来源 | 用途 | 变更方式 |
|------|------|------|---------|
| 环境变量 | `process.env` | 部署时固定值 | 需重启 |
| 运行时配置 | `RuntimeConfig`（DB） | 动态开关 | 管理后台实时调整 |
| 部署配置 | `config-service` 包 | 多环境部署 | config-service |

## 环境变量关键项

| 变量 | config key | 用途 |
|------|-----------|------|
| `JWT_SECRET` | `jwt.secret` | JWT 签名密钥 |
| `DATABASE_URL` | - | PostgreSQL 连接 |
| `REDIS_HOST` | - | Redis 连接 |
| `DB_PASSWORD` | - | 数据库密码 |
| `MXCAD_ASSEMBLY_PATH` | - | CAD 引擎路径 |
| `FILES_DATA_PATH` | - | 文件存储路径 |
| `SVN_REPO_PATH` | - | SVN 仓库路径 |

## 运行时配置

```typescript
// 读取运行时配置
import { RuntimeConfigService } from '../common/services/runtime-config.service';

const allowRegister = await this.runtimeConfig.get('allowRegister');
const requireEmailVerification = await this.runtimeConfig.get('requireEmailVerification');
```

## 关键约定

- `jwt.secret` 通过 `ConfigService.get('jwt.secret')` 读取
- 禁止直接用 `'JWT_SECRET'` 作为 config key
- 环境变量在 `.env` 中定义，不提交到 Git
- 运行时配置通过管理后台页面修改，修改后立即生效

## 详细文档

- 配置管理完整规范：`.agents/skills/config-management/SKILL.md`
