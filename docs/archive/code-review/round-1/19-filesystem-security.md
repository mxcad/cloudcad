
# 文件系统与存储安全审查报告

> **审查日期**：2026-05-08
> **审查范围**：`packages/backend/src/file-system/`、`packages/backend/src/version-control/`、`packages/svnVersionTool/`、`packages/backend/src/storage/`、`packages/backend/src/common/services/`（存储相关）
> **审查人**：AI 安全审查专家

---

## 1. 路径遍历防护

### 1.1 LocalStorageProvider.validatePath — 安全 ✅

**文件**：`packages/backend/src/storage/local-storage.provider.ts:53-118`

**分析**：
- 拒绝 `..` 和 `~` 字符（第59行）
- 拒绝绝对路径（除 `/mxcad/file/` 例外，第65行）
- 拒绝反斜杠 `\`（第71行）
- 拒绝 Windows 非法字符 `<>:"|?*`（第77行）
- 检查控制字符（第84-101行）
- 路径长度上限 1024（第106行）
- 相对路径解析后验证在 basePath 内（第111-117行）

### 1.2 FileUtils.validatePath — 安全 ✅

**文件**：`packages/backend/src/common/utils/file-utils.ts:229-269`

**分析**：
- path.normalize 后检查 `..` 和 `~`（第238行）
- 绝对路径验证在 baseDir 范围内（第243-253行）
- 拒绝 Windows 保留设备名称 CON/PRN/AUX/NUL 等（第263行）

### 1.3 FileUtils.validateFilename / sanitizeFilename — 安全 ✅

**文件**：`packages/backend/src/common/utils/file-utils.ts:277-345`

**分析**：
- 验证只允许字母数字中文等合法字符（第291行）
- 拒绝以点开头的隐藏文件（第297行）
- sanitizeFilename 移除路径遍历字符、危险字符

### 1.4 FileValidationService.sanitizeFilename — 安全 ✅

**文件**：`packages/backend/src/file-system/file-validation/file-validation.service.ts:372-437`

**分析**：
- 移除路径分隔符、控制字符（第375-379行）
- 限制文件名长度 255 字节（第382行）
- 拒绝空文件名、纯点号（第392-399行）
- 验证清理后不再包含路径字符（第420-424行）

### 1.5 ⚠️ FileDownloadExportService.downloadNodeWithFormat — 路径拼接安全问题

**文件**：`packages/backend/src/file-system/file-download/file-download-export.service.ts:243-244`
**严重程度**：中

**问题描述**：
```typescript
const conversionOptions: any = {
  srcpath: this.storageManager.getFullPath(mxwebPath).replace(/\\/g, '/'),
  ...
  outname: targetFilename,  // <-- targetFilename 来自 path.basename(originalFilename, ext) + targetExt
};
```
`targetFilename` 由用户原始文件名 + 扩展名拼接而成。虽然文件名经过了 path.basename 处理，但如果 originalFilename 中仍包含特殊字符（如中文/Unicode），传递给 `convertServerFile` 作为 `outname` 可能与预期不符。

**修复建议**：对 `outname` 使用 `sanitizeFilename` 进行额外清理。
**需要确认**：mxcad 转换服务如何处理 outname 参数？是否对文件名有特殊字符限制？

### 1.6 ⚠️ VersionControlController.getFileHistory / getFileContentAtRevision — filePath 参数直接传递

**文件**：`packages/backend/src/version-control/version-control.controller.ts:74-77, 103-108`
**严重程度**：中

**问题描述**：
Controller 层接收 Query 参数 `filePath` 后直接传递给 Service 层：
```typescript
async getFileHistory(
  @Query('projectId') projectId: string,
  @Query('filePath') filePath: string,  // <-- 无任何校验
  ...
) {
  return this.versionControlService.getFileHistory(filePath, limit);
}
```
在 Service 层 `getFileHistory`（`version-control.service.ts:627-701`）中，`filePath` 被用于：
1. 字符串前缀检查（第642行）：`filePath.startsWith('filesData/')`
2. 路径分割与重组作为 SVN URL 的一部分（第672行）

但 **没有任何路径遍历攻击防护**。攻击者可构造 `filePath=../../etc/passwd` 来遍历 SVN 仓库路径。

**修复建议**：
1. Controller 层添加 DTO 校验，使用 `@IsString()` + `@Matches(/^[a-zA-Z0-9_\/\.\-]+$/)` 限制合法字符
2. Service 层对 `filePath` 调用 `FileUtils.validatePath` 进行路径安全验证
3. 确保最终组装的 SVN URL 在 `svnRepoPath` 范围内

### 1.7 ⚠️ VersionControlService.rollbackToRevision — path 变量引用错误

**文件**：`packages/backend/src/version-control/version-control.service.ts:767, 776, 787, 794`
**严重程度**：高

**问题描述**：
```typescript
async rollbackToRevision(filePath: string, revision: string | number, ...) {
  const targetPath = path.join(this.filesDataPath, filePath);  // 第767行
  await svnUpdateAsync(targetPath, String(revision), null);
  // ...
  const result = await svnCommitAsync([targetPath], rollbackMessage, ...);
  this.logger.log(`回滚成功: ${path} to r${revision}`);  // 第787行: 使用了未定义的 path 变量
  return { success: true, message: '回滚成功', data: result };
}
catch (error) {
  this.logger.error(`回滚失败: ${path} to r${revision}, ...`);  // 第794行: 同样使用了未定义的 path
```
第787行和794行的 `path` 变量未定义（正确应为 `filePath` 或 `targetPath`），这表明代码未经充分测试。如果是 `path` 模块的全局引用，将导致日志输出 `[object Object]`，但更严重的是说明 `rollbackToRevision` 功能可能从未被验证过。

**修复建议**：将 `path` 替换为 `filePath` 或 `targetPath`，并添加单元测试覆盖。

---

## 2. 文件类型校验

### 2.1 FileValidationService.validateFileType — 安全但存在绕过风险

**文件**：`packages/backend/src/file-system/file-validation/file-validation.service.ts:107-144`
**严重程度**：中

**问题描述**：
- 扩展名校验使用 `file.originalname.split('.').pop()` 获取最后的扩展名（第108行）
  - **潜在绕过**：文件名 `evil.exe.dwg` 的扩展名会被识别为 `.dwg` 从而绕过允许列表
  - 虽然有 MIME 类型校验（第127-138行），但 `application/octet-stream` 被额外放行
- MIME 类型验证放行 `octet-stream`（第130行），使得任何二进制文件的 MIME 都能通过
  - 攻击者上传 `.exe.dwg` 文件，浏览器可能发送 `application/octet-stream` MIME 类型，通过校验

**修复建议**：
1. 对扩展名进行严格校验：检查 `originalname` 是否只包含一个扩展名（不允许双扩展名伎俩）
2. `application/octet-stream` 不应该无条件放行，至少应结合扩展名进行严格匹配
3. 使用已知的 DWG/DXF 标准 MIME 类型列表，而非仅依赖浏览器报告的类型

### 2.2 FileValidationService.validateFileMagicNumber — DWG 魔数不正确 ✅ 已修复 (f0229591)

**文件**：`packages/backend/src/file-system/file-validation/file-validation.service.ts:58-59`
**严重程度**：高

**修复状态**: ✅ 已修复 — commit `f0229591`: tighten DWG/DXF magic number validation

**问题描述**：
```typescript
{
  extension: '.dwg',
  mimeType: 'application/acad',
  maxSize: 0,
  enabled: true,
  magicNumbers: [0x41, 0x43, 0x31, 0x30], // DWG 文件魔数
}
```
定义的魔数是 `0xAC10`（即 "AC10"），但标准 DWG 文件的魔数是 "AC10" 的前 4 字节 + 版本标识。标准的 DWG 文件头部前 6 字节根据版本不同可能为 "AC1021"、"AC1024"、"AC1027"、"AC1032" 等。

当前魔数只有 4 字节 `[0x41, 0x43, 0x31, 0x30]`，虽然可以通过 `validateMagicNumberDeep` 的滑动窗口匹配（第230-250行，前16字节内匹配），但这是过于宽泛的匹配：
- 任何在前16字节内包含 "AC10" 字符串的文件都会通过校验
- DWG R15 之前的版本（AC1009、AC1012 等）的前4字节确实是 "AC10"，但后续版本是 "AC10" + 版本号

**修复建议**：
1. 确认需要支持的所有 DWG 版本，列出完整的前 6 字节魔数列表
2. 将魔数改为 6 字节匹配：`[0x41, 0x43, 0x31, 0x30, 0x??, 0x??]`（AC10 后跟版本号）
3. **需要用户确认**：是否支持 DWG R14 及更早版本（魔数不同）？

### 2.3 FileValidationService.validateFileMagicNumber — DXF 魔数过于宽松

**文件**：`packages/backend/src/file-system/file-validation/file-validation.service.ts:64-66`
**严重程度**：中

**问题描述**：
```typescript
{
  extension: '.dxf',
  mimeType: 'application/dxf',
  magicNumbers: [0x30, 0x0d, 0x0a], // DXF 文件通常以数字开头
}
```
定义为 `0 回车 换行`（即 "\r\n" 前的 "0"），这在很多文本文件中都是可能的。DXF 文件的正确魔数检测应该是查找前几行中的特定结构标记（如 $ACADVER 等），而不仅是一个数字开头。

**修复建议**：增强 DXF 检测逻辑，检查文件头是否包含 DXF 特定标记 `$ACADVER` 或至少 `0\r\nSECTION`。

### 2.4 ⚠️ validateDwgFileStructure — 版本标识未检测到仅记录警告

**文件**：`packages/backend/src/file-system/file-validation/file-validation.service.ts:287-327`
**严重程度**：低

**问题描述**：
```typescript
if (!hasVersionMarker) {
  this.logger.warn('DWG 文件缺少版本标识，可能不是有效的 DWG 文件');
}
```
当 DWG 版本标识未匹配时，仅记录警告而非拒绝文件。这是有意为之（保护兼容未知版本），但如果魔数校检已通过，深度验证应起到辅助确认作用。

**修复建议**：考虑对未知版本标识的 DWG 设置 `fileStatus = UNKNOWN` 标记，供管理员审核。
**需要用户确认**：是否需要严格限制 DWG 版本白名单？

### 2.5 ⚠️ DXF 标记匹配存在误判风险

**文件**：`packages/backend/src/file-system/file-validation/file-validation.service.ts:339-346`
**严重程度**：低

**问题描述**：
```typescript
const dxfMarkers = ['0', 'SECTION', '2', 'HEADER', 'ENDSEC'];
const hasDxfMarkers = dxfMarkers.some((marker) => headerText.includes(marker));
```
`some` 检查只要前100字节中包含任一标记即通过。字符 '0'、'2' 出现在大量非 DXF 文本中。应使用 `every` 或结构化检查确保文件确实是 DXF 格式。

**修复建议**：改为检查 DXF 的结构化格式，如检查行首的 `0\r\nSECTION\r\n2\r\nHEADER` 模式。

---

## 3. 文件大小限制

### 3.1 Multer 上传大小限制 — 500MB 固定上限 ⚠️

**文件**：`packages/backend/src/config/configuration.ts:138`
**严重程度**：低

**分析**：
- Multer 使用 `memoryStorage`（public-file.module.ts:26-28），文件全部读入内存
- 500MB 固定上限对大文件上传存在内存压力风险
- 业务层通过 `maxFileSize` 运行时配置（默认100MB）进行精确限制

**修复建议**：对于超大文件（> 100MB），考虑使用磁盘临时存储替代 memoryStorage。

### 3.2 FileValidationService.validateFileSize — 运行时动态限制 ✅

**文件**：`packages/backend/src/file-system/file-validation/file-validation.service.ts:150-157`

**分析**：通过 RuntimeConfigService 获取动态配置的 maxFileSize（默认100MB），实现灵活大小限制。

### 3.3 ZIP 压缩下载限制 — 多层防护 ✅

**文件**：`packages/backend/src/file-system/file-download/file-download-export.service.ts:35-43`

**分析**：配置了 zipMaxTotalSize、zipMaxFileCount、zipMaxDepth、zipMaxSingleFileSize 多项限制。在 `addFilesToArchive` 方法（第378-480行）中实施。

---

## 4. 临时文件清理

### 4.1 ⚠️ cleanupTempFiles — 未实现（TODO）

**文件**：`packages/backend/src/common/services/storage-cleanup.service.ts:271-277`
**严重程度**：高

**问题描述**：
```typescript
private async cleanupTempFiles(): Promise<void> {
  // TODO: 实现临时文件清理逻辑
  this.logger.log('临时文件清理功能尚未实现');
}
```
这是 `cleanupExpiredTrash` 方法调用的临时文件清理功能，但 **完全未实现**。这意味着：
1. 上传失败的残留文件不会被清理
2. 孤立文件（数据库中已无记录但物理文件仍存在）不会被清理
3. 磁盘空间可能被无效文件逐渐占满

**修复建议**：实现临时文件扫描与清理逻辑：
- 扫描 `filesDataPath` 下的所有节点目录
- 检查对应的数据库节点是否存在
- 删除孤立目录
- 设置合理的过期时间（如7天）

### 4.2 ⚠️ 格式转换临时文件清理 — 依赖事件监听器

**文件**：`packages/backend/src/file-system/file-download/file-download-export.service.ts:283-302`
**严重程度**：中

**问题描述**：
```typescript
convertedStream.on('end', async () => {
  await this.storageService.deleteFile(targetRelativePath);
});
convertedStream.on('error', async () => {
  await this.storageService.deleteFile(targetRelativePath);
});
```
临时转换文件（如 DWG→PDF 或 DWG→DXF）的清理依赖 `stream.on('end')` 和 `stream.on('error')` 事件。如果进程崩溃或流被异常中断，临时文件将残留。

**修复建议**：
1. 添加进程退出钩子进行兜底清理
2. 在定时任务中清理超过一定时间的转换临时文件
3. 考虑使用临时目录（如 `tmp/`）存放转换文件，便于集中清理

### 4.3 StorageCleanupScheduler — 定时清理正常 ✅

**文件**：`packages/backend/src/common/schedulers/storage-cleanup.scheduler.ts:32-66`

**分析**：每天凌晨3点清理过期存储文件（30天），凌晨4点清理回收站（90天），每周清理过期锁文件。

---

## 5. 访问控制

### 5.1 FileDownloadHandlerService.handleDownload — 权限校验已委托 ✅

**文件**：`packages/backend/src/file-system/file-download/file-download-handler.service.ts:42-153`

**分析**：
- 下载通过 `FileDownloadExportService.downloadNode` 委派，该服务内部调用 `permissionService.getNodeAccessRole` 校验权限
- `checkFileAccess` 使用 `getNodeAccessRole` 检查用户在节点上的角色
- Controller 层使用 `@RequireProjectPermission(ProjectPermission.FILE_DOWNLOAD)` 全局守卫

### 5.2 FileSystemPermissionService.getNodeAccessRole — 权限检查链路 ✅

**文件**：`packages/backend/src/file-system/file-permission/file-system-permission.service.ts:96-152`

**分析**：
- 公共资源库节点返回 `VIEWER` 角色（允许任何人访问，第112-114行）
- 项目所有者返回 `OWNER` 角色（第129-135行）
- 项目成员通过 projectMember 关联表查询角色（第138-149行）
- 非成员返回 null

### 5.3 缩略图访问 — OptionalAuth 权限控制 ✅

**文件**：`packages/backend/src/file-system/file-system.controller.ts:528-616`

**分析**：
- 使用 `@OptionalAuth()` 允许未登录访问（第528行）
- 但未登录用户只能访问公共资源库，项目文件需要登录校验（第551-581行）
- 项目文件通过 `checkFileAccess` 校验权限（第573-576行）

### 5.4 ⚠️ 下载接口依赖 downloadNode 内部权限校验

**文件**：`packages/backend/src/file-system/file-system.controller.ts:646-648`
**严重程度**：低

**问题描述**：
```typescript
@RequireProjectPermission(ProjectPermission.FILE_DOWNLOAD)
async downloadNode(...)
```
Controller 层使用 `RequireProjectPermission(FILE_DOWNLOAD)` 全局守卫，但 `FILE_DOWNLOAD` 守卫是如何从 `nodeId` 参数推算出 `projectId` 的？需要查看 `RequireProjectPermissionGuard` 的实现确认。

**修复建议**：验证 `RequireProjectPermissionGuard` 正确地将请求中的 `nodeId` 映射为 `projectId` 进行权限检查。

---

## 6. SVN 仓库安全

### 6.1 VersionControlService.commitNodeDirectory — directoryPath 无路径校验

**文件**：`packages/backend/src/version-control/version-control.service.ts:355-491`
**严重程度**：中

**问题描述**：
`commitNodeDirectory` 参数 `nodeDirectory` 直接用于 `path.relative(filesDataRoot, nodeDirectory)` 和 `svnAddAsync([currentPath], ...)` 调用。虽然有 `path.relative` 的隐式约束（如果 `nodeDirectory` 不在 `filesDataRoot` 下，relative 会返回带 `../` 的路径），但没有显式的路径安全校验。

**修复建议**：
1. 在方法入口对 `nodeDirectory` 调用 `FileUtils.validatePath` 校验
2. 验证 `path.relative` 的结果是否以 `..` 开头

### 6.2 VersionControlService.deleteNodeDirectory — 同上

**文件**：`packages/backend/src/version-control/version-control.service.ts:550-584`
**严重程度**：中

**问题描述**：与 commitNodeDirectory 类似，`nodeDirectory` 直接用于 SVN delete 操作，无路径校验。

**修复建议**：添加路径安全校验。

### 6.3 ⚠️ VersionControlService.commitNodeDirectory 中的 svnCommit — 跨项目污染风险

**文件**：`packages/backend/src/version-control/version-control.service.ts:384-443`
**严重程度**：低

**问题描述**：
`commitNodeDirectory` 逐层提交中间目录。这个设计存在 SVN 跨节点污染风险：如果目录 A 和目录 B 共享同一个上层目录，A 的 `svn add` 可能会误将 B 的文件也加入版本控制。
但实际上由于磁盘上文件是按 `nodeId` 隔离的，此风险较低。

### 6.4 ⚠️ SVN commit message JSON 注入

**文件**：`packages/backend/src/version-control/version-control.service.ts:446-453`
**严重程度**：低

**问题描述**：
commit message 是 JSON 格式。如果 `userName` 包含特殊字符（如双引号、换行符），JSON.stringify 会自动转义，所以不存在注入风险。但 SVN 日志消息中能看到这些 JSON 数据。

**修复建议**：对 `userName` 和 `message` 进行长度限制（如 1024 字符），防止超级长的提交消息导致 SVN 命令执行异常。

### 6.5 SVN 子进程调用 — 无参数注入风险（但需验证）

**文件**：`packages/backend/src/version-control/version-control.service.ts:20-32`
**严重程度**：⚠️ 需要确认

**分析**：
SVN 命令通过 `@cloudcad/svn-version-tool` 包中的 `svnadd` 等函数调用，这些函数接受独立参数（路径、消息、用户名、密码）而非拼接命令字符串。参数注入风险极低，但需要确认 `@cloudcad/svn-version-tool` 内部实现是否使用 `child_process.exec`（拼接命令）还是 `child_process.spawn`（参数数组）。

**需要确认**：`svn-version-tool` 包的内部实现方式。如果是 `exec` 拼接，存在命令注入风险。

### 6.6 SVN 文件路径中的 commitNodeDirectory 逐层提交逻辑复杂

**文件**：`packages/backend/src/version-control/version-control.service.ts:387-443`
**严重程度**：低

**问题描述**：
逐层 `svn add` 和 `svn commit` 中间目录的逻辑，可能导致多个并发请求之间的 SVN 冲突。由于 SVN 使用的是 `file:///` 协议访问本地仓库，并发 add/commit 可能导致 "out of date" 错误。

**修复建议**：考虑对整个 commitNodeDirectory 操作使用分布式锁。

---

## 7. CAD 文件解析安全

### 7.1 ⚠️ mxcad 黑盒转换 — 输入验证后传给外部服务

**文件**：`packages/backend/src/file-system/file-download/file-download-export.service.ts:260-261`
**严重程度**：中

**问题描述**：
```typescript
const mxCadService = await this.getMxCadServiceInstance();
const result = await mxCadService.convertServerFile(conversionOptions);
```
`conversionOptions.srcpath` 使用的是 `storageManager.getFullPath(mxwebPath)` 的结果，路径已通过 `LocalStorageProvider.getAbsolutePath` → `validatePath` 安全校验。
但 `outname`（由原始文件名拼接而成）和 pdfParams（width/height/colorPolicy）直接来自用户请求参数（controller.ts:718-720），虽然经过了 `query.width || "2000"` 的默认值处理，但没有进行范围限制。

**需要用户确认**：
1. mxcad 的 `convertServerFile` 方法是否有宽度/高度的上限？过大的 width/height 设置可能导致内存溢出
2. mxcad 转换服务运行在独立进程还是同进程？如果是同进程，OOM 会影响整个服务
3. mxcad 解析 DWG/DXF 时是否有文件大小上限？

### 7.2 ⚠️ mxwebPath 拼接到 srcpath 未做路径转义

**文件**：`packages/backend/src/file-system/file-download/file-download-export.service.ts:211-244`
**严重程度**：低

**问题描述**：mxwebPath 是 `node.path`（数据库字段），经过 `storageManager.getFullPath` → `validatePath` 验证才传给 mxcad，路径安全。但 `replace(/\\/g, '/')` 是为了跨平台兼容，如果有特殊构造的路径可能绕过此步骤。

### 7.3 ⚠️ FileValidationService 魔数校验在读文件前先用了 readFileSync 读取整个文件

**文件**：`packages/backend/src/file-system/file-validation/file-validation.service.ts:177`
**严重程度**：低

**问题描述**：
```typescript
const buffer = readFileSync(filePath, { encoding: null }) as Buffer;
```
在 `validateFileMagicNumber` 中使用了 `readFileSync` 读取**整个文件**到内存，虽然前面已经做了文件大小校验（`validateFileSize`），但如果校验逻辑被绕过，超大文件可能导致 OOM。

**修复建议**：改为只读取前 1024 字节：`readFileSync(filePath).slice(0, 1024)` 或使用 fs.open + Buffer.alloc 只读取文件头。

---

## 总结表格

| # | 问题 | 文件:行号 | 严重程度 | 状态 | 需要用户确认 |
|---|------|-----------|----------|------|-------------|
| 1.5 | downloadNodeWithFormat outname 未清理 | file-download-export.service.ts:243-244 | 中 | 待修复 | ✅ mxcad 对 outname 的限制 |
| 1.6 | VersionControlController filePath 无校验 | version-control.controller.ts:74-77 | 中 | 待修复 | 否 |
| 1.7 | rollbackToRevision path 变量未定义 | version-control.service.ts:787,794 | 高 | 待修复（Bug） | 否 |
| 2.1 | 双扩展名绕过 + octet-stream 放行 | file-validation.service.ts:108,130 | 中 | 待修复 | 否 |
| 2.2 | DWG 魔数缺少完整版本校验 | file-validation.service.ts:58-59 | 高 | 待修复 | ✅ 支持的 DWG 版本范围 |
| 2.3 | DXF 魔数过于宽松 | file-validation.service.ts:65 | 中 | 待修复 | 否 |
| 2.4 | DWG 版本只警告不拒绝 | file-validation.service.ts:287-327 | 低 | 待讨论 | ✅ 是否需要版本白名单 |
| 2.5 | DXF 标记匹配用 some 而非 every | file-validation.service.ts:339-346 | 低 | 待修复 | 否 |
| 3.1 | 500MB Multer 内存上限 | configuration.ts:138 | 低 | 改进建议 | 否 |
| 4.1 | 临时文件清理功能完全未实现 | storage-cleanup.service.ts:271-277 | 高 | 待修复（TODO） | 否 |
| 4.2 | 转换临时文件仅依赖 stream 事件 | file-download-export.service.ts:283-302 | 中 | 待改进 | 否 |
| 5.4 | FILE_DOWNLOAD 守卫的 projectId 映射 | file-system.controller.ts:646 | 低 | 待验证 | 否 |
| 6.1 | commitNodeDirectory 无路径安全校验 | version-control.service.ts:355 | 中 | 待修复 | 否 |
| 6.2 | deleteNodeDirectory 无路径安全校验 | version-control.service.ts:550 | 中 | 待修复 | 否 |
| 6.5 | SVN 子进程调用需确认内部实现 | version-control.service.ts:20-32 | 低 | 待确认 | ✅ svn-version-tool 是用 spawn 还是 exec |
| 7.1 | mxcad 转换参数无范围限制 | file-download-export.service.ts:260 | 中 | 待确认 | ✅ width/height 上限、OOM 防护 |
| 7.3 | readFileSync 读取整个文件做魔数校验 | file-validation.service.ts:177 | 低 | 改进建议 | 否 |

**状态汇总**：
- 🔴 高风险：3 个（1.7、2.2、4.1）
- 🟡 中风险：9 个（1.5、1.6、2.1、2.3、4.2、6.1、6.2、7.1）
- 🟢 低风险：6 个（2.4、2.5、3.1、5.4、6.5、7.3）

**需要用户确认的事项**：
1. mxcad 转换服务的 `convertServerFile` 对 outname 参数的特殊字符限制？（问题 1.5）
2. 支持的 DWG 版本完整范围？（特别是 R14 及更早版本）（问题 2.2）
3. 是否需要严格 DWG 版本白名单？（问题 2.4）
4. `@cloudcad/svn-version-tool` 包内部使用 `child_process.exec` 还是 `spawn`？（问题 6.5）
5. mxcad 转换服务的 width/height 上限？是否有 OOM 防护？（问题 7.1）

---

## 审查结论

**整体安全性评价：中等偏上（6.5/10）**

**优点**：
- 路径遍历防护实现了多层防御（LocalStorageProvider → FileUtils → FileValidationService）
- 访问控制通过 RBAC + project permission 系统实现，权限点覆盖了主要的 CRUD 操作
- 文件大小限制在多个层面（Multer、业务层、ZIP 压缩）都有配置
- 定时清理任务已建立框架（过期存储 30 天、回收站 90 天）

**主要缺陷**：
- **临时文件清理完全未实现**（`cleanupTempFiles` 是 TODO）
- **DWG 魔数校验过于宽泛**，仅匹配 4 字节且使用滑动窗口
- **VersionControlController 的 filePath 参数无任何校验**，存在路径遍历风险
- **rollbackToRevision 存在变量引用 Bug**（未定义的 `path` 变量）
- **MIME 类型校验放行 octet-stream**，可被轻易绕过

**建议优先修复**：
1. 修复 rollbackToRevision 中的变量 Bug（问题 1.7）
2. 为 VersionControlController 添加 filePath 参数校验（问题 1.6）
3. 实现临时文件清理功能（问题 4.1）
4. 收紧 DWG 魔数校验（问题 2.2）
5. 移除 octet-stream MIME 的无条件放行（问题 2.1）
