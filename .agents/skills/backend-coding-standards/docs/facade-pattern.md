# Façade 模式使用规则

`FileSystemService` 已按 ADR 0002 重构为 Façade。新增文件操作相关逻辑时，必须遵守此分层。

## 架构

```
外部消费者（library/, mxcad/, file-download/）
        │
        ▼
  FileSystemService (Façade)
        │ 只做委托，不编排逻辑
        ▼
  子 Service（直接调用）
  ├── ProjectCrudService
  ├── FileOperationsService
  ├── FileTreeService
  ├── FileDownloadExportService
  ├── StorageInfoService
  ├── ProjectMemberService
  └── SearchService
```

## 规则

### ✅ 外部消费者 → Façade

```typescript
// library/library.service.ts
@Injectable()
export class LibraryService {
  constructor(
    private readonly fileSystemService: FileSystemService,  // ✅ 走 Façade
  ) {}

  async saveDrawing(nodeId: string, data: Buffer) {
    return this.fileSystemService.saveMxweb(nodeId, data);
  }
}
```

### ✅ Controller 内部逻辑 → 子 Service

```typescript
// file-system/file-system.controller.ts
@Controller('file-system')
export class FileSystemController {
  constructor(
    private readonly fileOperationsService: FileOperationsService,  // ✅ 直接注入
    private readonly fileTreeService: FileTreeService,              // ✅ 直接注入
  ) {}

  @Post('move')
  async moveFile(@Body() dto: MoveFileDto) {
    // 业务编排逻辑在 Controller 中（简单场景）
    const node = await this.fileTreeService.getNode(dto.nodeId);
    return this.fileOperationsService.move(node, dto.targetId);
  }
}
```

### ❌ 外部消费者不要跳过 Façade

```typescript
// ❌ 错误 — library 直接注入子 Service
@Injectable()
export class LibraryService {
  constructor(
    private readonly fileOperationsService: FileOperationsService,  // ❌ 绕过 Façade
  ) {}
}
```

### ❌ Façade 不要编排业务逻辑

```typescript
// ❌ 错误 — Façade 中编排了条件判断
async saveFile(nodeId: string, data: Buffer, targetType: string) {
  if (targetType === 'library') {
    // 不应该在 Façade 中写分支逻辑
    return this.libraryService.save(nodeId, data);
  }
  return this.fileOperationsService.save(nodeId, data);
}

// ✅ 正确 — 调用方自己决定走哪个服务
```

## 子 Service 职责速查

| 子 Service | 职责 | 典型方法 |
|-----------|------|---------|
| `ProjectCrudService` | 项目 CRUD、文件夹、项目成员 | createProject, deleteProject, createFolder |
| `FileOperationsService` | 文件操作 | move, copy, delete, update |
| `FileTreeService` | 树导航 | getChildren, getNode, getCategoryTree |
| `FileDownloadExportService` | 下载、导出 | download, exportDwg, exportDxf |
| `StorageInfoService` | 存储配额 | getQuota, checkQuota |
| `ProjectMemberService` | 成员管理 | addMember, removeMember, changeRole |
| `SearchService` | 搜索 | search |

## ADR 参考

详见 ADR 0002 — 解耦 file-operations 模块：`docs/adr/0002-decouple-file-operations-module.md`
