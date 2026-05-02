# 数据目录集中化设计

**版本**: 1.0.0  
**日期**: 2026-03-27  
**状态**: 待实施

---

## 1. 背景

当前 CloudCAD 项目的动态数据目录分散在多个位置，用户在进行版本升级或迁移时需要备份多个目录，容易遗漏且操作繁琐。

本设计将所有动态数据目录统一集中到 `data/` 目录下，实现：

- 用户只需备份 `data/` 目录即可保留所有数据
- 部署包解压覆盖后，将 `data/` 放回即可完成升级
- 简化运维流程，降低数据丢失风险

---

## 2. 目标目录结构

```
cloudcad/
├── data/                          # 所有动态数据目录
│   ├── files/                     # CAD 文件、缩略图、mxweb（原 filesData）
│   ├── svn-repo/                  # SVN 版本控制仓库（原 svn-repo）
│   ├── uploads/                   # MxCAD 上传临时文件（原 uploads）
│   ├── temp/                      # 分片上传临时目录（原 temp）
│   ├── logs/                      # 应用日志（原 logs）
│   ├── postgres/                  # PostgreSQL 数据库文件（原 data/postgres）
│   └── redis/                     # Redis 数据文件（原 data/redis）
├── runtime/                       # 运行时程序（非数据，随部署包更新）
│   ├── windows/
│   ├── linux/
│   └── ...
├── packages/                      # 应用代码
├── docker/                        # Docker 配置
└── ...
```

### 2.1 目录说明

| 目录 | 原路径 | 新路径 | 说明 |
|------|--------|--------|------|
| 文件数据 | `filesData/` | `data/files/` | CAD 文件、mxweb 转换文件、缩略图 |
| SVN 仓库 | `svn-repo/` | `data/svn-repo/` | SVN 版本控制仓库 |
| 上传临时 | `uploads/` | `data/uploads/` | MxCAD 上传过程中的临时文件 |
| 分片临时 | `temp/` | `data/temp/` | 分片上传的临时目录 |
| 日志 | `logs/` | `data/logs/` | 应用运行日志 |
| PostgreSQL | `data/postgres/` | `data/postgres/` | 数据库数据文件 |
| Redis | `data/redis/` | `data/redis/` | 缓存数据文件 |

### 2.2 备份时可忽略的目录

以下目录在备份时可根据情况跳过：

| 目录 | 说明 |
|------|------|
| `data/temp/` | 分片上传临时文件，服务停止后可清理 |
| `data/uploads/` | 上传临时文件，服务停止后可清理 |
| `data/logs/` | 日志文件，按需备份即可 |

---

## 3. 需要修改的文件清单

### 3.1 后端配置

| 文件 | 修改内容 |
|------|----------|
| `packages/backend/src/config/configuration.ts` | 修改环境变量默认值 |
| `packages/backend/.env.example` | 更新示例值 |

### 3.2 Docker 配置

| 文件 | 修改内容 |
|------|----------|
| `docker/docker-compose.yml` | 修改卷映射，使用绑定挂载到 `./data/` |
| `docker/.dockerignore` | 更新忽略规则 |
| `docker/Dockerfile` | 如有相关路径需调整 |

### 3.3 离线部署

| 文件 | 修改内容 |
|------|----------|
| `runtime/ecosystem.config.js` | 修改数据目录路径 |
| `runtime/windows/` 目录下脚本 | 更新路径引用 |
| `runtime/linux/` 目录下脚本 | 更新路径引用 |

### 3.4 Git 配置

| 文件 | 修改内容 |
|------|----------|
| `.gitignore` | 更新忽略规则，忽略 `data/` 目录 |

### 3.5 打包脚本

| 文件 | 修改内容 |
|------|----------|
| `scripts/pack-linux-deploy.js` | 更新打包逻辑 |
| `scripts/pack-offline.js` | 更新打包逻辑 |
| 其他打包相关脚本 | 检查并更新 |

### 3.6 启动/停止脚本

| 文件 | 修改内容 |
|------|----------|
| `start.bat` / `start.ps1` / `start.sh` | 检查是否有路径引用 |
| `stop.bat` / `stop.ps1` / `stop.sh` | 检查是否有路径引用 |
| `cloudcad.bat` / `cloudcad.sh` | 检查是否有路径引用 |

---

## 4. 详细修改方案

### 4.1 后端配置 (`packages/backend/src/config/configuration.ts`)

**修改前**:
```typescript
filesDataPath: this.resolvePath(process.env.FILES_DATA_PATH || 'filesData'),
svnRepoPath: this.resolvePath(process.env.SVN_REPO_PATH || 'svn-repo'),
mxcadUploadPath: this.resolvePath(process.env.MXCAD_UPLOAD_PATH || 'uploads'),
mxcadTempPath: this.resolvePath(process.env.MXCAD_TEMP_PATH || 'temp'),
```

**修改后**:
```typescript
filesDataPath: this.resolvePath(process.env.FILES_DATA_PATH || 'data/files'),
svnRepoPath: this.resolvePath(process.env.SVN_REPO_PATH || 'data/svn-repo'),
mxcadUploadPath: this.resolvePath(process.env.MXCAD_UPLOAD_PATH || 'data/uploads'),
mxcadTempPath: this.resolvePath(process.env.MXCAD_TEMP_PATH || 'data/temp'),
```

### 4.2 Docker 配置 (`docker/docker-compose.yml`)

**修改前** (命名卷):
```yaml
volumes:
  postgres_data:
  redis_data:
  files_data:
  svn_repo:
  uploads:
  temp:
  logs:
```

**修改后** (绑定挂载):
```yaml
volumes:
  - ./data/postgres:/var/lib/postgresql/data
  - ./data/redis:/data
  - ./data/files:/app/data/files
  - ./data/svn-repo:/app/data/svn-repo
  - ./data/uploads:/app/data/uploads
  - ./data/temp:/app/data/temp
  - ./data/logs:/app/data/logs
```

### 4.3 Git 忽略配置 (`.gitignore`)

**修改前**:
```gitignore
# 数据目录
filesData/
svn-repo/
uploads/
temp/
logs/
data/
```

**修改后**:
```gitignore
# 数据目录
data/
```

### 4.4 Docker 忽略配置 (`docker/.dockerignore`)

**修改前**:
```dockerignore
filesData/
svn-repo/
uploads/
temp/
logs/
data/
```

**修改后**:
```dockerignore
data/
```

### 4.5 环境变量示例 (`packages/backend/.env.example`)

**修改前**:
```env
# 文件存储路径
FILES_DATA_PATH=filesData
SVN_REPO_PATH=svn-repo
MXCAD_UPLOAD_PATH=uploads
MXCAD_TEMP_PATH=temp
```

**修改后**:
```env
# 文件存储路径（默认在 data/ 目录下）
FILES_DATA_PATH=data/files
SVN_REPO_PATH=data/svn-repo
MXCAD_UPLOAD_PATH=data/uploads
MXCAD_TEMP_PATH=data/temp
```

---

## 5. 用户操作流程

### 5.1 升级部署流程

```bash
# 1. 停止服务
./stop.sh

# 2. 备份数据目录
cp -r data/ ../cloudcad-backup/

# 3. 解压新版本部署包（覆盖旧文件）
unzip cloudcad-v2.0.0.zip

# 4. 恢复数据目录
cp -r ../cloudcad-backup/data/ ./

# 5. 启动服务
./start.sh
```

### 5.2 Docker 部署流程

```bash
# 1. 停止容器
docker-compose down

# 2. 备份数据目录
cp -r data/ ../cloudcad-backup/

# 3. 更新部署包
# ... 解压新版本 ...

# 4. 恢复数据目录
cp -r ../cloudcad-backup/data/ ./

# 5. 启动容器
docker-compose up -d
```

---

## 6. 注意事项

1. **首次部署**: 新部署时 `data/` 目录会自动创建，无需手动创建

2. **目录权限**: 确保 `data/` 目录及其子目录对应用进程有读写权限

3. **磁盘空间**: `data/files/` 目录会随使用增长，需确保磁盘空间充足

4. **备份建议**: 
   - 生产环境建议定期备份 `data/files/` 和 `data/postgres/`
   - 可使用增量备份减少备份时间和存储空间

5. **运行时程序**: `runtime/` 目录包含转换程序，随部署包更新，**不**属于数据目录

---

## 7. 验证清单

实施完成后，需验证：

- [ ] 新部署时 `data/` 目录自动创建
- [ ] 文件上传后存储在 `data/files/` 下
- [ ] SVN 操作后仓库在 `data/svn-repo/` 下
- [ ] 日志输出到 `data/logs/` 下
- [ ] Docker 部署数据持久化正常
- [ ] 离线部署数据目录正确
- [ ] `.gitignore` 正确忽略 `data/` 目录
- [ ] 打包脚本不包含 `data/` 目录

---

## 8. 变更历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-03-27 | 初始设计 |
