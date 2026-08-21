# 保存流程使用 per-save backup + auto-restore 保证原子性

保存 mxweb 文件时必须保证三步（写 mxweb、generateBinFiles、SVN commit）要么全部成功，要么全部回滚。当前代码缺少回滚机制，且 DB updatedAt 在中间步骤就提前更新。

**Status**: accepted

## 流程

```
saveMxwebFile(nodeId, file):

  Step 1  前置校验（文件存在、节点存在、.mxweb 后缀、乐观锁）

  Step 2  备份当前 targetPath → targetPath.backup.{timestamp}

  Step 3  写入新 mxweb → targetPath
          同时写入最新版 → nodeId.mxweb

  Step 4  generateBinFiles(targetPath, nodeName)
            ├─ 成功 → 继续 Step 5
            └─ 失败 → 恢复: backupPath → targetPath, nodeId.mxweb 回退
                       | 删除 backupPath
                       → return { success: false }

  Step 5  SVN commitNodeDirectory(nodeDir)
            ├─ 成功 → 继续 Step 6
            └─ 失败 → 恢复: backupPath → targetPath
                       | SVN revert 工作副本
                       | nodeId.mxweb 回退
                       | 删除 backupPath
                       → return { success: false }

  Step 6  删除 backupPath
          更新 DB (updatedAt, fileHash)
          → return { success: true, path }
```

## 关键约束

- **DB updatedAt 必须在最后一步更新**，不在中间——DB 状态代表"已确认持久化"的版本
- **每保存一次就备份一次**，不是仅第一次备份——备份文件名带时间戳，不会相互覆盖
- **SVN commit 失败时必须回滚**——不返回 `success: true`，不让用户以为保存成功
- **nodeId.mxweb 和 targetPath 必须同时回滚**——两者构成一致的最新视图

## 替代方案考虑

1. **暂存区 + 后移动**（先写到 staging path，全部成功后再移到 targetPath）——被拒绝。SVN 工作目录需要文件已在 targetPath 位置才能 commit，后移动会让 SVN 看到 delete+add 而非 modify。

2. **异步队列**（保存即时返回，后处理异步）——被拒绝。SVN commit 是"保存成功"的必要条件，用户必须等到版本提交完成。

3. **FileStatus.SAVING 状态机**——未被采用。backup/restore 机制已能保证原子性，不需要额外的 DB 状态字段让查询变复杂。如果未来需要后台恢复任务，可再引入。