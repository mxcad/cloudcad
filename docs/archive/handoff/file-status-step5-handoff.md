# FileStatus 状态机 — Step 5：Conversion 模块状态追踪

> **状态**：待实施 | **前置依赖**：`feat(backend): 引入 FileStatus 生命周期状态机`（commit `f9ff37a5`）

## 背景

FileStatus 状态机（Steps 1-4）已实现：
- `FileStatusStateMachine` 定义了 5 状态转换表（UPLOADING → PROCESSING → COMPLETED/FAILED ↔ DELETED）
- `file-operations.service.ts` 的删除/恢复操作已集成状态机校验
- Prisma schema 添加了 `@default(COMPLETED)`
- `NodeUtils.canPerformOperation` 支持 null fileStatus + PROCESSING 保护

**但 UPLOADING / PROCESSING / FAILED 三个状态在后端从未被设置**——它们只在枚举定义中存在，conversion 模块完全没有引用 FileStatus。

## 问题

当前上传流程在 conversion 模块中：

```
1. 分片上传 → 临时目录
2. 合并分片 → 临时文件（FileMergeService）
3. convertFile() 格式转换（此时还没有 FileNode！）
4. 转换成功 → 创建 FileNode（fileStatus = COMPLETED）
5. 转换失败 → 清理临时文件，返回错误（不创建节点）
```

**核心矛盾**：状态机设计要求节点在转换前创建（UPLOADING），但当前架构在转换成功后才创建节点。转换期间没有 FileNode 可追踪。

## 目标

重构上传链路，使 FileNode 创建时机前移到转换之前：

```
1. 分片上传 → 临时目录
2. 合并分片 → 临时文件
3. 创建 FileNode（fileStatus = UPLOADING）           ← 提前创建
4. convertFile() → UPLOADING → PROCESSING           ← 状态转换
5. 转换成功 → PROCESSING → COMPLETED                 ← 状态转换
6. 转换失败 → PROCESSING → FAILED → 系统删除节点      ← 状态转换 + 清理
```

**FAILED 的设计决策**（已确认）：
- FAILED 是内部瞬态，系统自动删除节点
- 用户看到的是"上传失败/转换失败"错误提示，不会看到 FAILED 节点

## 涉及文件

### 必须修改（3 个调用点）

| 文件 | 说明 |
|------|------|
| `src/mxcad/upload/file-merge.service.ts` | 合并分片后 convertFile，需在 convertFile 前创建 UPLOADING 节点 |
| `src/mxcad/upload/file-conversion-upload.service.ts` | 直接上传+转换，同样需要提前创建节点 |
| `src/public-file/public-file.service.ts` | 公共文件转换，也需要提前创建节点 |

### 发现的关键信息

`file-merge.service.ts:158` 是主调用路径：

```typescript
// 当前流程（line 140-188）
const mergeResult = await this.fileSystemService.mergeChunks({...});
// merge 成功后
const { isOk, ret } = await this.fileConversionService.convertFile({...});
// 转换成功后创建节点
if (context && context.userId && context.nodeId) {
    const parentNode = await this.fileSystemServiceMain.getNode(context.nodeId);
    // ... 创建节点，fileStatus 默认 COMPLETED
}
```

`convertFile()` 本身不接收 nodeId——它只处理文件路径转换。状态追踪需要由调用方在 convertFile 前后执行。

### 需要新增

`FileStatusStateMachine` 已定义合法转换：
- `UPLOADING → PROCESSING`（转换开始前）
- `PROCESSING → COMPLETED`（转换成功）
- `PROCESSING → FAILED`（转换失败）
- `FAILED → DELETED`（系统自动删除）

## 实施要点

1. **节点创建时机**：在 convertFile 之前创建 FileNode（fileStatus = UPLOADING），需要处理：
   - 节点创建后如果转换失败，必须删除节点（FAILED → DELETED）
   - 转换失败时还需清理已创建的物理文件/目录
   
2. **状态转换调用**：
   ```typescript
   // 转换前
   await prisma.fileSystemNode.update({
       where: { id: fileNode.id },
       data: { fileStatus: FileStatus.PROCESSING }
   });
   // 需要在更新前调用 FileStatusStateMachine.validateTransition
   
   // 转换成功
   await prisma.fileSystemNode.update({
       where: { id: fileNode.id },
       data: { fileStatus: FileStatus.COMPLETED }
   });
   
   // 转换失败
   // 第一步：标记 FAILED
   // 第二步：调用 file-operations 的删除逻辑（或直接软删除）
   ```

3. **事务安全**：节点创建 + 状态更新需要在同一个请求上下文中处理，确保失败时能正确回滚。

4. **向后兼容**：现有的非上传创建路径（文件夹、另存为）不受影响，依然直接创建 COMPLETED 节点。

## 相关状态

| 项目 | 值 |
|------|-----|
| 分支 | `refactor/circular-deps` |
| 状态机 commit | `f9ff37a5` |
| migration commit | `44ec59d9` |
| 状态机文件 | `src/file-system/file-status/file-status-state-machine.ts` |
| 枚举定义 | `src/common/enums/file-status.enum.ts` |
