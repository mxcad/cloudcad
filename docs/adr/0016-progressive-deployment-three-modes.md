# Progressive deployment: embedded / standalone / cloud FaaS
**Status**: accepted

CloudCAD serves both TOB (on-prem single-server) and TOC (public cloud) customers from the same codebase. Rather than maintaining separate "enterprise" and "cloud" products, every new infrastructure service offers three deployment modes via a configuration switch.

| Mode | Service layout | Dependencies |
|------|---------------|-------------|
| **Embedded** | Storage + workflow bundled into the backend NestJS process | None (single binary) |
| **Standalone** | Separate HTTP processes for storage + workflow, optional Redis | Redis, Docker (for container Workers) |
| **Cloud FaaS** | Backend only; storage is a managed service, workflow delegates to Huawei/AWS/Azure FaaS | Cloud provider account |

The interface behind each service (`IFunctionExecutor`, `IStorageProvider`) is identical across modes — only the adapter changes. This guarantees that TOB customers can start with a single `.exe` and scale to a cluster later, while TOC customers get full elasticity from day one without code changes.

**Considered Options**

- **Always standalone.** Pro: single architecture. Con: every small TOB deployment needs Redis + Docker — overkill for 5 users.
- **Always embedded.** Pro: simplest for small deployments. Con: cannot scale; forces customers to migrate to a different product when they grow.
- **Feature-flag hacks.** Pro: no abstraction overhead. Con: `if (cloud)` checks scattered everywhere; each new integration tests four combinations.
- **Interface adapter per mode (selected).** Pro: clean seam, single codebase, each mode independently tested. Con: three implementations per interface — but most implementations are thin (10-30 lines wrapping a client SDK or local method call).

**Consequences**
- Every new infrastructure-adjacent module must define an `IFoo` interface and at least two implementations (local + remote) upfront
- The backend's dependency-injection layer (NestJS `forRoot()`) selects the mode at bootstrap time
- CI runs unit tests for all three modes; integration tests skip cloud FaaS (requires live credentials)
- Existing modules (auth providers, storage providers) already follow this pattern — this ADR codifies it as a project-wide rule

### 模式选择机制

通过 NestJS `DynamicModule.forRoot()` 静态工厂选择实现：

```typescript
// StorageModule.forRoot() 示例
static forRoot(config: StorageConfig): DynamicModule {
  const provider = config.mode === 'standalone'
    ? HttpStorageProvider
    : LocalFileStorageProvider;
  return {
    module: StorageModule,
    providers: [{ provide: STORAGE_PROVIDER, useClass: provider }],
  };
}
```

### 环境变量约定

| 模式 | 关键环境变量 |
|------|-------------|
| Embedded | 无额外依赖，`STORAGE_MODE=embedded`（默认），`FUNCTION_EXECUTOR=process-pool`（默认） |
| Standalone | `STORAGE_MODE=standalone`，`STORAGE_SERVICE_URL=...`，`FUNCTION_EXECUTOR=conversion-service`，`CONVERSION_SERVICE_URL=...`，`QUEUE_DRIVER=redis` |
| Cloud FaaS | `FUNCTION_EXECUTOR=cloud-faas`，`CLOUD_FAAS_PROVIDER=huawei\|aliyun\|aws`，Storage 一般为 standalone 或托管服务 |

### 演进路径

Embedded → Standalone → Cloud FaaS 是渐进式升级路径，不是三选一。客户可以从单机起步，随规模增长逐步解耦，无需更换产品。
