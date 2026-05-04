# 全链路集成测试分析与缺口报告

**报告时间**: 2026-05-03
**分析范围**: `d:\project\cloudcad\packages\backend`

---

## 一、测试框架概览

| 配置项 | 详情 |
|--------|------|
| 框架 | Jest + ts-jest |
| 测试环境 | Node.js |
| 测试路径 | `<rootDir>/src` 和 `<rootDir>/test` |
| 测试匹配规则 | `**/*.spec.ts` |
| 超时设置 | 30秒 |
| Mock策略 | clearMocks + restoreMocks + resetMocks |

---

## 二、现有测试文件清单

### 2.1 单元测试文件 (spec.ts) - 共 14 个

| 文件路径 | 覆盖Service |
|---------|-----------|
| `src/auth/auth-facade.service.spec.ts` | AuthFacadeService |
| `src/file-operations/file-operations.service.spec.ts` | FileOperationsService |
| `src/file-operations/project-crud.service.spec.ts` | ProjectCrudService |
| `src/file-system/file-system.service.spec.ts` | FileSystemService |
| `src/file-system/file-tree/file-tree.service.spec.ts` | FileTreeService |
| `src/file-system/file-validation/file-validation.service.spec.ts` | FileValidationService |
| `src/file-system/search/search.service.spec.ts` | SearchService |
| `src/mxcad/conversion/file-conversion.service.spec.ts` | FileConversionService |
| `src/mxcad/core/mxcad.service.spec.ts` | MxcadService |
| `src/mxcad/core/mxcad.controller.spec.ts` | MxcadController |
| `src/mxcad/node/filesystem-node.service.spec.ts` | FileSystemNodeService |
| `src/version-control/version-control.service.spec.ts` | VersionControlService |

### 2.2 集成测试文件 (integration.spec.ts) - 共 22 个

| 文件路径 | 描述 |
|---------|------|
| `test/integration/workflow-1-upload-convert-open.integration.spec.ts` | 链路1: 上传→转换→打开 |
| `test/integration/workflow-2-save-svn-version.integration.spec.ts` | 链路2: 保存→SVN→版本历史→回滚 |
| `test/integration/workflow-3-delete-recycle-permanent.integration.spec.ts` | 链路3: 删除→回收站→恢复→彻底删除 |
| `test/integration/cad-upload-convert.integration.spec.ts` | CAD上传转换 |
| `test/integration/cad-save-version.integration.spec.ts` | CAD保存版本 |
| `test/integration/file-delete-recycle.integration.spec.ts` | 文件删除回收 |
| `test/integration/project-lifecycle.integration.spec.ts` | 项目生命周期 |
| `test/integration/project-member.integration.spec.ts` | 项目成员 |
| `test/integration/auth-registration-login.integration.spec.ts` | 注册登录 |
| `test/integration/auth-token-refresh.integration.spec.ts` | Token刷新 |
| `test/integration/permission-allocation-cache.integration.spec.ts` | 权限分配缓存 |
| `test/integration/project-archive-restore.integration.spec.ts` | 项目归档恢复 |
| `test/integration/storage-quota-full.integration.spec.ts` | 存储配额 |
| `test/integration/system-permission-allocation.integration.spec.ts` | 系统权限分配 |
| `test/integration/user-deactivation-restore.integration.spec.ts` | 用户停用恢复 |
| `test/integration/user-password-change.integration.spec.ts` | 密码修改 |
| `test/integration/project-creation-quota.integration.spec.ts` | 项目创建配额 |
| `test/integration/cad-concurrent-save-optimistic-lock.integration.spec.ts` | 并发保存乐观锁 |
| `test/integration/cad-save-as-duplicate-version-chain.integration.spec.ts` | 另存重复版本链 |
| `test/integration/file-operations-crud.integration.spec.ts` | 文件操作CRUD |
| `test/integration/cad-external-ref.integration.spec.ts` | CAD外部引用 |
| `test/integration/project-ownership-transfer.integration.spec.ts` | 项目所有权转移 |

---

## 三、三条链路详细分析

### 3.1 链路1: 上传 → 转换 → 打开

#### 涉及Service层
```
ChunkUploadManagerService
    → FileMergeService.mergeConvertFile()
        → FileConversionService.convertFile()
        → StorageManager.allocateNodeStorage()
        → FileSystemServiceMain.createFileNode()
        → VersionControlService.commitNodeDirectory()
```

#### 涉及外部依赖（需要Mock）

| 依赖 | Mock方式 | 现状 |
|------|----------|------|
| FileConversionService | jest.mock | 已Mock |
| StorageManager | jest.mock | 已Mock |
| FileSystemService (MxFileSystemService) | jest.mock | 已Mock |
| FileSystemService (Main) | jest.mock | 已Mock |
| VersionControlService | jest.mock | 已Mock |
| DatabaseService (Prisma) | jest.mock | 已Mock |
| CacheManagerService | jest.mock | 已Mock |
| ThumbnailGenerationService | jest.mock | 已Mock |
| StorageService | jest.mock | 已Mock |
| ExternalRefService | jest.mock | 已Mock |
| @cloudcad/svn-version-tool | jest.mock | 已Mock |
| @cloudcad/conversion-engine | jest.mock | 已Mock |

#### 现有测试覆盖场景

| 场景 | 测试文件 | 覆盖状态 |
|------|---------|---------|
| 正常上传→转换→打开 | workflow-1 | **已覆盖** |
| 空文件上传 | workflow-1 (S2) | **已覆盖** |
| 转换引擎失败 | workflow-1 (S3) | **已覆盖** |
| Chunk目录缺失 | workflow-1 (S4) | **已覆盖** |
| 文件已存在(秒传) | workflow-1 (S5) | **已覆盖** |
| 大文件上传(100MB) | workflow-1 (S6) | **已覆盖** |
| 图纸库文件上传(跳过SVN) | workflow-1 (S7) | **已覆盖** |
| MXWeb文件直传 | workflow-1 (S8) | **已覆盖** |
| 父节点不存在 | workflow-1 (S9) | **已覆盖** |
| 并发上传检测 | workflow-1 (S10) | **已覆盖** |
| 上传后版本历史可查 | cad-save-version | 部分覆盖 |
| 上传后打开文件 | - | **缺失** |

#### 缺口分析 - 链路1

| 优先级 | 缺失场景 | 说明 |
|--------|---------|------|
| P0 | **打开文件完整性验证** | 上传后能否正确打开MXWeb文件，无验证 |
| P1 | **缩略图生成流程** | 缩略图生成后能否正确显示，无验证 |
| P1 | **外部参照文件处理** | 上传DWG后外部参照是否正确关联，无验证 |
| P2 | **权限检查流程** | 上传时权限不足场景未覆盖 |

---

### 3.2 链路2: 保存 → SVN提交 → 版本历史 → 回滚

#### 涉及Service层
```
SaveAsService.saveMxwebAs()
    → FileConversionService.convertFile()
    → StorageManager.allocateNodeStorage()
    → FileSystemServiceMain.createFileNode()
    → VersionControlService.commitNodeDirectory()
    → VersionControlService.getFileHistory()
    → VersionControlService.rollbackToRevision()
```

#### 涉及外部依赖（需要Mock）

| 依赖 | Mock方式 | 现状 |
|------|----------|------|
| FileConversionService | jest.mock | 已Mock |
| StorageManager | jest.mock | 已Mock |
| FileSystemService | jest.mock | 已Mock |
| FileSystemNodeService | jest.mock | 已Mock |
| FileSystemPermissionService | jest.mock | 已Mock |
| VersionControlService | jest.mock | 已Mock |
| DatabaseService | jest.mock | 已Mock |
| @cloudcad/svn-version-tool | jest.mock | 已Mock |
| RateLimiter | jest.mock | 已Mock |

#### 现有测试覆盖场景

| 场景 | 测试文件 | 覆盖状态 |
|------|---------|---------|
| 保存到项目空间→SVN提交 | workflow-2 (S1), cad-save-version | **已覆盖** |
| 保存到个人空间→SVN提交 | workflow-2 (S2) | **已覆盖** |
| SVN提交失败不影响保存 | workflow-2 (S4) | **已覆盖** |
| 获取版本历史 | workflow-2 (S5), cad-save-version | **已覆盖** |
| 多次提交版本历史递增 | workflow-2 (S6), cad-save-version | **已覆盖** |
| 图纸库保存跳过SVN | workflow-2 (S7) | **已覆盖** |
| 回滚到指定版本 | workflow-2 (S8) | **已覆盖** |
| 获取指定版本的档案内容 | workflow-2 (S9) | **已覆盖** |
| 大文件保存(50MB) | workflow-2 (S10) | **已覆盖** |
| 同名文件自动重命名 | - | **缺失** |
| 保存后打开验证 | - | **缺失** |
| 回滚后文件一致性验证 | - | **缺失** |

#### 缺口分析 - 链路2

| 优先级 | 缺失场景 | 说明 |
|--------|---------|------|
| P0 | **同名文件冲突处理** | save-as时同名文件是否正确重命名，无验证 |
| P1 | **回滚后文件完整性** | 回滚后文件内容是否与历史版本一致 |
| P1 | **版本冲突检测** | 并发保存同一文件时的版本冲突 |
| P2 | **保存取消流程** | 用户取消保存时的临时文件清理 |

---

### 3.3 链路3: 删除 → 引用计数 → 回收站 → 恢复 → 彻底删除

#### 涉及Service层
```
FileOperationsService.deleteNode()
    → 检查引用计数 (fileHash count)
    → 软删除 (deletedAt, fileStatus=DELETED)
    → StorageInfoService.invalidateQuotaCache()

FileOperationsService.restoreNode()
    → 检查父节点是否存在
    → 恢复 (deletedAt=null, fileStatus=COMPLETED)
    → 配额缓存刷新

FileOperationsService.permanentlyDeleteNode()
    → 检查引用计数
    → 物理文件删除
    → SVN标记删除
    → 数据库记录删除
```

#### 涉及外部依赖（需要Mock）

| 依赖 | Mock方式 | 现状 |
|------|----------|------|
| DatabaseService | jest.mock | 已Mock |
| StorageManager | jest.mock | 已Mock |
| VersionControlService | jest.mock | 已Mock |
| StorageInfoService | jest.mock | 已Mock |
| FileTreeService | jest.mock | 已Mock |
| StorageProvider (IStorageProvider) | jest.mock | 已Mock |
| ProjectPermissionService | jest.mock | 已Mock |
| PermissionService | jest.mock | 已Mock |

#### 现有测试覆盖场景

| 场景 | 测试文件 | 覆盖状态 |
|------|---------|---------|
| 删除文件→移至回收站 | workflow-3 (S1), file-delete-recycle | **已覆盖** |
| 多引用hash→删除一个 | workflow-3 (S2), file-delete-recycle | **已覆盖** |
| 零引用→软删除不删物理文件 | workflow-3 (S3) | **已覆盖** |
| 恢复文件 | workflow-3 (S4), file-delete-recycle | **已覆盖** |
| 最后引用删除→物理文件删除 | workflow-3 (S5) | **已覆盖** |
| 删除文件夹(含子文件) | workflow-3 (S6) | **已覆盖** |
| 删除不存在的文件 | workflow-3 (S7) | **已覆盖** |
| 恢复时同名冲突 | workflow-3 (S8) | **已覆盖** |
| 查看回收站内容 | workflow-3 (S9) | **已覆盖** |
| 完整引用计数流程 | workflow-3 (S10) | **已覆盖** |
| 彻底删除流程 | - | **缺失** |
| 回收站自动清理(过期) | - | **缺失** |
| 删除后配额正确扣减 | - | **缺失** |

#### 缺口分析 - 链路3

| 优先级 | 缺失场景 | 说明 |
|--------|---------|------|
| P0 | **彻底删除后物理文件验证** | permanentlyDelete后存储是否真正释放 |
| P1 | **回收站过期自动清理** | 30天过期文件的自动清理流程 |
| P1 | **配额扣减准确性** | 删除/恢复后配额计算是否正确 |
| P2 | **批量删除性能** | 大量文件删除的事务处理 |

---

## 四、Mock配置分析

### 4.1 mocks-setup.ts 全局Mock

```typescript
jest.mock('@cloudcad/svn-version-tool', () => svnMockObj);
jest.mock('@cloudcad/conversion-engine', () => ({ ProcessRunnerService: jest.fn() }));
jest.mock('../../src/common/concurrency/rate-limiter', () => ({ RateLimiter: ... }));
jest.mock('fs', () => { ... }); // 文件系统Mock
```

### 4.2 SVN Mock实现

测试使用自定义的SVN Mock系统：
- `installSvn(name, fn)` - 安装特定行为
- `svnOk(result)` - 返回成功的Mock
- 支持12种SVN操作：svnCheckout, svnAdd, svnCommit, svnDelete, svnadminCreate, svnImport, svnLog, svnCat, svnList, svnPropset, svnUpdate, svnCleanup

---

## 五、测试缺口总报告

### 5.1 已覆盖场景统计

| 链路 | 已有测试场景 | 缺失场景 | 覆盖率 |
|------|------------|---------|--------|
| 链路1: 上传→转换→打开 | 10 | 4 | 71% |
| 链路2: 保存→SVN→版本→回滚 | 10 | 4 | 71% |
| 链路3: 删除→回收站→恢复→彻底删除 | 10 | 4 | 71% |
| **总计** | **30** | **12** | **71%** |

### 5.2 缺失场景优先级排序

#### P0 - 核心链路完整性 (4项)

| 优先级 | 链路 | 缺失场景 |
|--------|------|---------|
| P0 | 链路1 | 打开文件完整性验证 |
| P0 | 链路2 | 同名文件冲突处理 |
| P0 | 链路3 | 彻底删除后物理文件验证 |
| P0 | 链路2 | 回滚后文件一致性验证 |

#### P1 - 业务关键场景 (6项)

| 优先级 | 链路 | 缺失场景 |
|--------|------|---------|
| P1 | 链路1 | 缩略图生成流程验证 |
| P1 | 链路1 | 外部参照文件关联验证 |
| P1 | 链路2 | 版本冲突检测 |
| P1 | 链路3 | 回收站过期自动清理 |
| P1 | 链路3 | 配额扣减准确性 |
| P1 | 链路2 | 保存后打开验证 |

#### P2 - 边界情况 (2项)

| 优先级 | 链路 | 缺失场景 |
|--------|------|---------|
| P2 | 链路1 | 上传权限不足场景 |
| P2 | 链路2 | 保存取消流程 |

---

## 六、建议测试补充项

### 6.1 高优先级补充测试

1. **链路1 - 补充打开验证**
   - 上传后通过nodeId打开文件
   - 验证文件路径、缩略图、转换状态

2. **链路2 - 补充同名冲突测试**
   - save-as时文件名已存在
   - 验证自动重命名逻辑

3. **链路3 - 补充彻底删除验证**
   - permanentlyDelete后验证存储Provider.deleteAll被调用
   - 验证引用计数为0时物理文件被删除

### 6.2 Mock优化建议

当前Mock配置已较完善，但建议：
- 增加SVN错误场景的Mock行为（如网络超时、权限错误）
- 增加转换引擎返回非0 code的Mock
- 增加存储配额超限的Mock场景

---

**报告人**: Trea
