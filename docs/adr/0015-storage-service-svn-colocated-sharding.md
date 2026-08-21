# Storage service with SVN-colocated sharding
**Status**: accepted

File storage is tightly coupled to SVN — the working copy lives at `data/files/.svn/` and every file write triggers `mx add` + `mx commit`. This rules out using plain S3/MinIO as a drop-in replacement.

We are building a unified **Storage Service** that owns all `data/` directories (`files/`, `uploads/`, `exports/`, `conversion/`) and exposes a single HTTP gateway. Key design decisions:

- **Sharding by directory group.** Nodes are assigned whole month directories (`YYYYMM`, `YYYYMM_1`, etc.). A node owns its SVN working copy + repository. `FileSystemNode.path` stays unchanged (`YYYYMM/nodeId/file.mxweb`); the storage service maintains a routing table mapping directory prefixes to nodes.
- **SVN operations proxied through the storage service.** The storage service provides `/v1/svn/*` endpoints; the backend and workflow service never touch SVN directly.
- **Backward-compatible for small deployments.** A single node has no routing table — the storage service is just a thin HTTP layer over the local filesystem.

**Considered Options**

- **MinIO / S3 object store.** Pro: proven distributed storage. Con: incompatible with SVN working copy semantics; would require decoupling version control from storage (months of work, risky).
- **NFS shared mount.** Pro: simple, all nodes see the same filesystem. Con: SVN file:// protocol does not work reliably over NFS; contention on lock files; single point of failure.
- **Directory-group sharding (selected).** Pro: reuses existing `YYYYMM_N` overflow mechanism, each node's SVN is self-contained, zero migration for existing data. Con: cross-node ZIP downloads need streaming aggregation.

**Consequences**
- All file access goes through the storage service — it becomes the sole CDN/ESA origin
- `StorageModule.forRoot({ mode: 'embedded' | 'standalone' })` mirrors the workflow service's progressive deployment
- Existing `FlydriveStorageProvider` / `LocalStorageProvider` implementations are replaced by an HTTP client to the storage service (embedded mode keeps the local-filesystem path)
- **SVN self-initialization.** Each storage node initializes its own SVN repository and working copy on startup (`mxadmin create` + `mx checkout`/`mx import`), identical to current `MxVersionControlProvider.onModuleInit()` logic. No dependency on the backend for SVN bootstrapping.
- **Inter-node trust via shared secret.** All cross-node internal requests (streaming reads for batch download, SVN proxy forwarding) authenticate with `STORAGE_INTERNAL_SECRET` — a pre-shared key set at deployment time. No public-key infrastructure or per-node certificates required.

### IStorageProvider 接口设计

> 注（#273/#274 后更新）：该草样中的 `svnCommit/svnHistory/svnCat` 已从存储接口拆出——`IStorageProvider`（token `'IStorageProvider'`）现为纯存储接口（read/write/delete/exists/copy/move/listAll/deleteAll/getMetaData/getUrl/copyFromFs），SVN 能力由 `IVersionControl`（`VERSION_CONTROL_TOKEN`，`version-control/` 模块）承担。下方代码块保留为决策时的历史草样。

```typescript
interface IStorageProvider {
  read(path: string): Promise<Readable>;
  write(path: string, contents: Buffer | Readable): Promise<void>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  svnCommit(path: string, message: string): Promise<CommitResult>;
  svnHistory(path: string): Promise<HistoryEntry[]>;
  svnCat(path: string, revision: number): Promise<Readable>;
}
```

### 上传预签名 Token 流程

上传不直接调 Storage Service API，而是通过预签名 JWT Token 鉴权：

```
1. 客户端请求上传 → Backend 校验认证 + 配额 + 创建 FileSystemNode
2. Backend 签发 JWT Token（含 userId, nodeId, path, 过期时间）
3. 客户端 PUT 文件到 Storage Service（Token 放在 Authorization header）
4. Storage Service 本地校验 JWT（共享 secret，不查询 DB）
5. 校验通过后写入 data/uploads/
6. 若为 DWG/DXF → Storage Service 发出事件 → Function Workflow 转换
```

Token 是自包含的（self-contained），Storage Service 无需查数据库即可验证。共享 secret 通过 `STORAGE_INTERNAL_SECRET` 环境变量配置。

### 缓存策略

**URL 突变即缓存失效（Cache invalidation by URL mutation）**。所有文件 URL 携带 `?t=updatedAt&v=version` 参数：

```
/data/files/202607/nodeId/file.mxweb?t=2026-07-28T12:00:00Z&v=3
```

三层缓存：
- **L1（浏览器）**：`Cache-Control: private, max-age=3600`，URL 变化时浏览器自动请求新版本
- **L2（Nginx/CDN）**：URL 作为缓存 key，无显式 PURGE 操作。文件更新时 updatedAt 变化 → URL 变化 → 新 key
- **L3（Storage Service 内存 LRU）**：仅缓存 <10MB 的热门文件，LRU eviction，可配置上限

**不需要显式缓存失效操作**——URL 变化本身就是失效机制。`FileSystemNode.updatedAt` 在每次保存时更新，触发下游消费方获取新 URL。

### API 契约（Standalone 模式）

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/v1/files/{path}` | 读文件 |
| PUT | `/v1/files/{path}` | 写文件 |
| DELETE | `/v1/files/{path}` | 删文件 |
| POST | `/v1/files/upload` | 预签名 Token 上传 |
| POST | `/v1/svn/commit` | SVN 提交 |
| GET | `/v1/svn/history` | SVN 历史 |
| GET | `/v1/svn/cat` | 指定版本文件内容 |

### Configuration

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `STORAGE_MODE` | `embedded` | 部署模式：`embedded` / `standalone` |
| `STORAGE_SERVICE_URL` | — | Storage 服务地址（standalone 模式） |
| `STORAGE_NODE_ROUTING` | — | 多节点路由表 |
| `STORAGE_INTERNAL_SECRET` | — | 节点间共享 secret |
| `CACHE_LRU_MAX_SIZE_MB` | `100` | L3 LRU 缓存上限(MB) |
| `CACHE_LRU_MAX_FILES` | `1000` | L3 LRU 最大文件数 |
