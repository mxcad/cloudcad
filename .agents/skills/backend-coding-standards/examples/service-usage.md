# Service 正确用法示例

## ❌ 错误 — Controller 写业务逻辑

```typescript
@Controller('files')
export class FileController {
  constructor(
    private readonly prisma: PrismaService,  // ❌ Controller 直接注入 Prisma
  ) {}

  @Post('delete')
  async deleteFile(@Body() dto: DeleteFileDto) {
    // ❌ 业务逻辑全部写在 Controller 中
    const node = await this.prisma.fileSystemNode.findUnique({ where: { id: dto.nodeId } });
    if (!node) throw new NotFoundException('文件不存在');
    if (node.fileStatus !== 'COMPLETED') throw new BadRequestException('文件状态异常');
    
    await this.prisma.fileSystemNode.update({
      where: { id: dto.nodeId },
      data: { fileStatus: 'DELETED', deletedAt: new Date() },
    });
    
    // ❌ 没有审计日志
    return { success: true };
  }
}
```

## ✅ 正确 — Controller 路由委托 + Service 业务逻辑

```typescript
// file.controller.ts
@Controller('files')
export class FileController {
  constructor(
    private readonly fileService: FileService,  // ✅ 注入 Service
  ) {}

  @Post('delete')
  async deleteFile(@Body() dto: DeleteFileDto, @Req() req: AuthenticatedRequest) {
    return this.fileService.deleteFile(dto.nodeId, req.user.id);
    // ✅ Controller 只做：提取参数 → 调用 Service → 返回结果
  }
}

// file.service.ts
@Injectable()
export class FileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileTreeService: FileTreeService,
  ) {}

  async deleteFile(nodeId: string, userId: string): Promise<{ success: boolean }> {
    // ✅ 业务逻辑在 Service 中
    const node = await this.fileTreeService.getNode(nodeId);  // 子 Service 会抛异常
    
    if (node.fileStatus !== FileStatus.COMPLETED) {
      throw new BadRequestException('文件状态异常');
    }
    
    await this.prisma.fileSystemNode.update({
      where: { id: nodeId },
      data: { fileStatus: FileStatus.DELETED, deletedAt: new Date() },
    });
    
    // ✅ 审计日志
    this.logger.log({
      action: 'FILE_DELETE',
      resourceType: 'FileNode',
      resourceId: nodeId,
      userId,
      success: true,
    }, 'audit');
    
    return { success: true };
  }
}
```

## ❌ 错误 — 返回 null 表示未找到

```typescript
async findUser(id: string): Promise<User | null> {
  return this.prisma.user.findUnique({ where: { id } });
  // 调用方必须判空，容易遗漏
}

// 调用方
const user = await this.findUser(id);
console.log(user.email); // 💥 可能 null.email
```

## ✅ 正确 — 抛异常

```typescript
async findUser(id: string): Promise<User> {
  const user = await this.prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundException(`User ${id} not found`);
  return user;
}

// 调用方 — 类型安全
const user = await this.findUser(id);
console.log(user.email); // ✅ 类型保证非空
```

## ❌ 错误 — 不使用事务

```typescript
const node = await this.prisma.fileSystemNode.create({ data: nodeData });
// 如果下面这步失败，上面的 node 已成孤儿数据
await this.prisma.versionRecord.create({ data: { nodeId: node.id, ... } });
```

## ✅ 正确 — 包裹事务

```typescript
await this.prisma.$transaction(async (tx) => {
  const node = await tx.fileSystemNode.create({ data: nodeData });
  await tx.versionRecord.create({ data: { nodeId: node.id, ... } });
});
```
