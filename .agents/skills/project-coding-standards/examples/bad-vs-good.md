# 正确 vs 错误 — 全栈示例

## 场景：新增一个"批量恢复回收站文件"功能

### ❌ 典型 AI 错误输出

**前端：**
```tsx
// src/pages/TrashPage.tsx — 类型定义写在组件内
function TrashPage() {
  // ❌ 前端自定义类型
  interface FileItem { id: string; name: string; status: string; }
  
  // ❌ 自己写的 Modal
  const [showBatchRestore, setShowBatchRestore] = useState(false);
  
  // ❌ 硬编码颜色和 z-index
  return (
    <div>
      <button onClick={() => setShowBatchRestore(true)}
        style={{ background: '#6366f1', color: 'white' }}>
        批量恢复
      </button>
      {showBatchRestore && (
        <div style={{ zIndex: 9999, position: 'fixed', background: 'white' }}>
          确认批量恢复选中文件？
        </div>
      )}
    </div>
  );
}
```

**后端：**
```typescript
// ❌ Controller 写业务逻辑
@Controller('trash')
export class TrashController {
  constructor(private readonly prisma: PrismaService) {}  // ❌ 直接注 Prisma
  
  @Post('batch-restore')
  async batchRestore(@Body() dto: any) {  // ❌ any 类型
    for (const id of dto.ids) {
      await this.prisma.fileSystemNode.update({
        where: { id },
        data: { fileStatus: 'COMPLETED' },  // ❌ 硬编码枚举值
      });
    }
    // ❌ 无审计日志、无事务、无异常处理
    return { ok: true };
  }
}
```

### ✅ 正确输出

**前端：**
```tsx
// src/pages/TrashPage.tsx
import type { FileNodeDto } from '@/api-sdk/types.gen';  // ✅ 自动生成的类型
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';  // ✅ 复用
import { Z_LAYERS } from '@/constants/layers';

function TrashPage() {
  const [showBatchRestore, setShowBatchRestore] = useState(false);
  
  return (
    <div>
      <button onClick={() => setShowBatchRestore(true)}
        className="bg-primary-500 text-white hover:bg-primary-600">
        批量恢复
      </button>
      <ConfirmDialog  // ✅ 复用已有组件
        open={showBatchRestore}
        title="批量恢复"
        content={`确认恢复 ${selectedCount} 个文件？`}
        onConfirm={handleBatchRestore}
        onCancel={() => setShowBatchRestore(false)}
      />
    </div>
  );
}
```

**后端：**
```typescript
// trash.controller.ts — ✅ 只做路由委托
@Controller('trash')
export class TrashController {
  constructor(
    private readonly trashService: TrashService,  // ✅ 注 Service
  ) {}

  @Post('batch-restore')
  @RequireProjectPermission(ProjectPermission.FILE_TRASH_MANAGE)
  async batchRestore(@Body() dto: BatchRestoreDto, @Req() req: AuthenticatedRequest) {
    return this.trashService.batchRestore(dto.ids, req.user.id);
  }
}

// trash.service.ts — ✅ 业务逻辑全在这里
@Injectable()
export class TrashService {
  constructor(
    private readonly fileOperationsService: FileOperationsService,
  ) {}

  async batchRestore(ids: string[], userId: string) {
    // ✅ 事务
    const results = await this.prisma.$transaction(async (tx) => {
      const restored: string[] = [];
      for (const id of ids) {
        const node = await tx.fileSystemNode.update({
          where: { id },
          data: { fileStatus: FileStatus.COMPLETED },  // ✅ 本地枚举
        });
        restored.push(node.id);
      }
      return restored;
    });
    
    // ✅ 审计日志
    this.logger.log({
      action: 'FILE_BATCH_RESTORE',
      resourceType: 'FileNode',
      resourceId: ids.join(','),
      userId,
      success: true,
      details: { count: ids.length },
    }, 'audit');
    
    return { success: true, restored: results };
  }
}
```
