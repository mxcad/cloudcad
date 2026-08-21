# CloudCAD 三模式迁移指南

## 三种模式概述

| 模式 | 架构 | 依赖 | 适用场景 |
|------|------|------|---------|
| **嵌入式** (默认) | 单进程，所有功能在 NestJS 后端内 | 无 (单二进制) | 小型部署 (1-50 用户) |
| **独立服务** | 3 个独立进程 (backend + storage-service + conversion-service) | Redis (队列), 可选 Docker | 中型部署 (50-5000 用户) |
| **云 FaaS** | 后端 + 云函数 (转换在云上执行) | 云账号 (华为/AWS/阿里) | 弹性需求 / 无需管理转换服务器 |

## 迁移路径

```
嵌入式 ──→ 独立服务 ──→ 云 FaaS
  │                        │
  └────────────────────────┘ (直接迁移，不经过独立服务)
```

---

## 1. 嵌入式 → 独立服务

### 前置条件

- PostgreSQL 15+, Redis 7+
- Node.js 20 LTS
- mxcadassembly (Linux) 或 mxcadassembly.exe (Windows)

### 步骤

#### Step 1: 部署 storage-service

```bash
# 启动存储服务
cd packages/storage-service
STORAGE_SERVICE_PORT=3200 \
FILES_DATA_PATH=/path/to/filesData \
BACKEND_JWT_SECRET=<same-as-backend> \
node server.js
```

#### Step 2: 部署 conversion-service

```bash
# 启动转换服务
cd packages/conversion-service
CONVERSION_SERVICE_PORT=3100 \
node server.js
```

#### Step 3: 切换后端配置

```bash
# 修改后端 .env 或环境变量
STORAGE_MODE=standalone
STORAGE_SERVICE_URL=http://localhost:3200
FUNCTION_EXECUTOR=conversion-service
CONVERSION_SERVICE_URL=http://localhost:3100
```

#### Step 4: 验证

```bash
# 检查健康状态
curl http://localhost:3001/api/health/live
curl http://localhost:3200/health
curl http://localhost:3100/health

# 上传 DWG 测试完整流程
curl -X POST http://localhost:3001/api/mxcad/files/uploadFiles ...
```

#### 回滚

```bash
# 恢复嵌入式配置
STORAGE_MODE=embedded
FUNCTION_EXECUTOR=process-pool
# 重启后端即可
```

---

## 2. 独立服务 → 云 FaaS

### 前置条件

- 华为 / 阿里云 / AWS 账号
- 已部署的 storage-service (文件存储仍需本地)
- mxcadassembly 打包为云函数

### 步骤

#### Step 1: 打包转换函数

```bash
# 创建函数包
mkdir function-pkg
cp runtime/linux/mxcad/mxcadassembly function-pkg/
cp packages/conversion-service/mxcad/runner.js function-pkg/converter.js
cd function-pkg
zip -j function.zip mxcadassembly converter.js
```

#### Step 2: 部署到云

```bash
# 华为
bash deploy/faas/deploy-huawei.sh

# 或阿里云
bash deploy/faas/deploy-aliyun.sh

# 或 AWS
bash deploy/faas/deploy-aws.sh
```

#### Step 3: 切换后端配置

```bash
FUNCTION_EXECUTOR=cloud-faas
CLOUD_FAAS_PROVIDER=huawei  # 或 aliyun / aws
HUAWEI_FUNCTIONGRAPH_ENDPOINT=https://xxx.functiongraph.com
HUAWEI_AK=xxx
HUAWEI_SK=xxx
```

#### Step 4: 验证

```bash
# 触发转换测试
curl -X POST http://localhost:3001/mxcad/conversion/nodes/<nodeId>/convert

# 查询状态
curl http://localhost:3001/mxcad/conversion/nodes/<nodeId>/status
```

---

## 3. 直接迁移：嵌入式 → 云 FaaS

对于直接上云的场景，不需要经过独立服务阶段：

```bash
# 存储保持 embedded（本地）
STORAGE_MODE=embedded

# 转换在云上
FUNCTION_EXECUTOR=cloud-faas
CLOUD_FAAS_PROVIDER=huawei
HUAWEI_FUNCTIONGRAPH_ENDPOINT=...
HUAWEI_AK=...
HUAWEI_SK=...
```

---

## 配置参考

### 环境变量速查

| 变量 | 嵌入式 | 独立服务 | 云 FaaS |
|------|--------|---------|---------|
| `STORAGE_MODE` | `embedded` | `standalone` | `embedded` |
| `STORAGE_SERVICE_URL` | - | `http://...:3200` | - |
| `FUNCTION_EXECUTOR` | `process-pool` | `conversion-service` | `cloud-faas` |
| `CONVERSION_SERVICE_URL` | - | `http://...:3100` | - |
| `CLOUD_FAAS_PROVIDER` | - | - | `huawei`/`aliyun`/`aws` |

### 资源需求

| 服务 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| 后端 (embedded) | 2-4 核 | 4-8 GB | 视文件量 |
| storage-service | 1-2 核 | 1-2 GB | 视文件量 |
| conversion-service | 2-4 核 | 2-4 GB | 10 GB (日志) |
| PostgreSQL | 2-4 核 | 4-8 GB | 10-50 GB |
| Redis | 1 核 | 1 GB | 5 GB |

---

## 注意事项

1. **文件路径**: storage-service 使用 `FILES_DATA_PATH` 与后端保持一致。迁移时需确保数据目录可共享（NFS / 同一宿主机的绑定挂载）。
2. **文件不存在**: 如文件返回 404，检查 `FILES_DATA_PATH` 配置和路径嵌套层级（不允许 `..` / `~`）。
3. **SVN**: 当前 SVN 操作仅在嵌入式模式下完整支持。独立模式下 svnCommit/svnHistory 通过 storage-service 代理，需确保存储节点可执行 SVN 命令。
4. **JWT 密钥**: storage-service 的 `BACKEND_JWT_SECRET` 必须与后端的 `JWT_SECRET` 一致，否则上传令牌验证失败。
