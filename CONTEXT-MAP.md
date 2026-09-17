# Context Map

## Contexts

- [Global (CloudCAD)](./CONTEXT.md) — 全局领域术语（图纸、文件节点、权限、角色、存储服务、转换服务等），适用于全仓库
- [API Server](./packages/backend/CONTEXT.md) — 服务端业务逻辑：认证、文件系统、权限、计费、协同协调、存储抽象
- [Editor](./packages/frontend/CONTEXT.md) — CAD 编辑器前端 UI，有 PC（React 19）和移动端 H5（Vue 3）两种实现
- [Config Center](./packages/config-service/CONTEXT.md) — 部署配置管理面板（.env / ini / 品牌 / PM2 编排）
- [Storage Service](./packages/storage-service/) — 统一文件管理层（`data/`），含 SVN 目录组分片、多节点路由、CDN/ESA 缓存回源（暂无独立 CONTEXT.md）
- [Conversion Service](./packages/conversion-service/) — 转换引擎托管运行时，三模式部署（嵌入式/自托管/云 FaaS）（暂无独立 CONTEXT.md）
- [Engine Exec](./packages/engine-exec/) — mxcadAssembly 引擎执行层（单一 spawn/杀树/超时语义，backend 与 conversion-service 共用）（暂无独立 CONTEXT.md）
- [Contracts](./packages/contracts/CONTEXT.md) — 跨包 DI token + TypeScript 接口契约
- [DB](./packages/db/CONTEXT.md) — 数据库 schema 单一源 + 共享 Prisma Client（@cloudcad/db）
- [Impl MX](./packages/impl-mx/CONTEXT.md) — 私有 MX 官方实现包，通过 `IMPL` 环境变量动态加载

## Relationships

- **Editor → API Server**: 通过 HTTP API 消费认证、文件、权限、计费等能力
- **API Server → Storage Service**: 通过预签 Token 进行文件上传下载；委托 SVN 操作（版本历史、提交）
- **API Server → Conversion Service**: 上传摄入（`drawing-ingest.service`）与批量下载（`conversion-runner`）经统一任务层 `IFunctionExecutor` 委托转换；自托管模式下 API Server 通过 `ConversionServiceClient` 调其 HTTP API（非 health 路由需内部服务密钥），嵌入式模式下则不调用独立服务、直接由进程池执行
- **API Server / Conversion Service → Engine Exec**: 进程内 spawn 与远端 worker 共用 `@cloudcad/engine-exec` 的引擎参数装配（`buildEngineParams`）与输出解析（`parseEngineOutput`），两级参数契约的唯一翻译点
- **API Server → Storage Service**: 转换产物落盘后由存储服务提交 SVN（版本历史）；嵌入式模式另经 `packages/mxVersionTool`（SVN CLI 包装器）做文件版本控制
- **Config Center → API Server**: 直接读写 `packages/backend/.env`；通过 PM2 编排其进程生命周期
- **Config Center → Editor**: 写入前端 `ini` 配置文件和品牌资产
- **Impl MX → Contracts**: 消费 `@cloudcad/contracts` 中的 DI token 和接口类型
- **Impl MX → API Server**: 通过 `IMPL` 环境变量动态加载，`createAuthProviders()` 注册 Provider 到 NestJS DI
- **API Server / Contracts / Impl MX → DB**: 数据层类型统一从 `@cloudcad/db` 获取（schema 单一源，migration 归 API Server）
