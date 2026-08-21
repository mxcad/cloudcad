# 缩略图 `<img>` 标签请求审计报告

> 审计日期: 2026-05-02
> 项目: CloudCAD

---

## 1. 前端 `<img>` 标签使用情况

### 1.1 Thumbnail 组件 (`packages/frontend/src/components/file-item/Thumbnail.tsx`)

**用途**: 显示文件的缩略图或图标

**关键代码**:
```tsx
<img
  src={thumbnailSrc}
  alt={node.name}
  className={`w-full h-full transition-all duration-200 rounded-lg ${
    galleryMode ? 'object-cover bg-black' : 'object-contain bg-slate-50'
  }`}
  style={{
    width: size,
    height: size
  }}
  onError={() => setImageLoadError(true)}
  onClick={(e) => {
    // 图库模式下不打开图片预览，让点击事件冒泡到父组件处理（打开CAD编辑器）
    if (!galleryMode && onPreview) {
      e.stopPropagation();
      onPreview(previewSrc);
    }
  }}
/>
```

**缩略图来源**:
- `thumbnailSrc` 通过 `useMemo` 计算：
  ```typescript
  const thumbnailSrc = useMemo(
    () => (isImage ? getThumbnailUrl(node) : getCadThumbnailUrl(node)),
    [isImage, node]
  );
  ```
- `previewSrc` 用于图片预览：
  ```typescript
  const previewSrc = useMemo(
    () => (isImage ? getOriginalFileUrl(node) : thumbnailSrc),
    [isImage, node, thumbnailSrc]
  );
  ```

### 1.2 ImagePreviewModal 组件 (`packages/frontend/src/components/modals/ImagePreviewModal.tsx`)

**用途**: 全屏预览图片

**关键代码**:
```tsx
<img
  src={src}
  alt={alt}
  style={{
    transform: `scale(${scale}) rotate(${rotation}deg)`,
    transition: 'transform 0.2s ease-out',
    maxWidth: '90vw',
    maxHeight: '80vh',
  }}
  className="object-contain cursor-zoom-in"
  onClick={(e) => {
    e.stopPropagation();
    handleZoomIn();
  }}
/>
```

**图片来源**:
- `src` 属性来自外部传入，通常是 `getThumbnailUrl(node)`、`getCadThumbnailUrl(node)` 或 `getOriginalFileUrl(node)` 的返回值

---

## 2. 前端 URL 生成工具 (`packages/frontend/src/utils/fileUtils.ts`)

### 2.1 getThumbnailUrl - 获取图片文件缩略图

```typescript
export const getThumbnailUrl = (node: FileSystemNode): string => {
  if (!node.id) return '';

  // 判断是否是图片文件
  const extension = node.extension?.toLowerCase() || '';
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
  if (!imageExtensions.includes(extension)) {
    return '';
  }

  // 使用后端代理 URL（通过 Session 认证）
  return `${API_BASE_URL}/v1/file-system/nodes/${node.id}/thumbnail`;
};
```

**URL 格式**: `${API_BASE_URL}/v1/file-system/nodes/${nodeId}/thumbnail`

### 2.2 getCadThumbnailUrl - 获取 CAD 文件缩略图

```typescript
export const getCadThumbnailUrl = (node: FileSystemNode): string => {
  if (!node.id) return '';

  const extension = node.extension?.toLowerCase() || '';
  const cadExtensions = ['.dwg', '.dxf', '.mxweb', '.mxwbe'];
  if (!cadExtensions.includes(extension)) {
    return '';
  }

  return `${API_BASE_URL}/v1/file-system/nodes/${node.id}/thumbnail`;
};
```

**URL 格式**: `${API_BASE_URL}/v1/file-system/nodes/${nodeId}/thumbnail`

### 2.3 getOriginalFileUrl - 获取原图/预览 URL

```typescript
export const getOriginalFileUrl = (node: FileSystemNode): string => {
  if (!node.id) return '';

  // CAD 文件使用缩略图路径预览
  const extension = node.extension?.toLowerCase() || '';
  const cadExtensions = ['.dwg', '.dxf', '.mxweb', '.mxwbe'];
  if (cadExtensions.includes(extension)) {
    return `${API_BASE_URL}/v1/file-system/nodes/${node.id}/thumbnail`;
  }

  // 图片文件返回原图下载链接
  return `${API_BASE_URL}/v1/file-system/nodes/${node.id}/download`;
};
```

**URL 格式**:
- CAD 文件: `${API_BASE_URL}/v1/file-system/nodes/${nodeId}/thumbnail`
- 图片文件: `${API_BASE_URL}/v1/file-system/nodes/${nodeId}/download`

---

## 3. 后端缩略图端点

### 3.1 FileSystemController 中的端点 (`packages/backend/src/file-system/file-system.controller.ts`)

**端点路径**: `GET /v1/file-system/nodes/:nodeId/thumbnail`

**Guard 配置**:
```typescript
@Get('nodes/:nodeId/thumbnail')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: '获取文件节点缩略图' })
@ApiProduces('image/jpeg')
async getThumbnail(
  @Param('nodeId') nodeId: string,
  @Request() req: ExpressRequest,
  @Res() res: Response
) {
  // ... 实现代码
}
```

**权限检查逻辑**:
1. 获取用户 ID
2. 获取节点信息
3. 检查是否是资源库节点
4. 资源库节点: 检查系统权限
   - 绘图库: `SystemPermission.LIBRARY_DRAWING_MANAGE`
   - 图块库: `SystemPermission.LIBRARY_BLOCK_MANAGE`
5. 非资源库节点: 检查文件访问权限

**响应**:
- 成功: 200 OK + 图片流
- 缩略图不存在: 204 No Content
- 未登录: 401 Unauthorized
- 无权限: 403 Forbidden
- 节点不存在: 404 Not Found

### 3.2 MxcadController 中的相关端点

MxcadController 中没有专门的缩略图端点，但提供了以下相关功能:
- `/v1/mxcad/filesData/*path`: 访问 filesData 目录中的文件 (受 `MixedAuthGuard` 保护)
- 上传缩略图相关 DTO 定义 (但未在 Controller 中发现直接使用)

---

## 4. 总结

### 4.1 缩略图请求流程

```
前端 <img src="...">
  ↓
fileUtils.getThumbnailUrl(node) 或 getCadThumbnailUrl(node)
  ↓
${API_BASE_URL}/v1/file-system/nodes/${nodeId}/thumbnail
  ↓
FileSystemController.getThumbnail()
  ↓
权限检查 (JwtAuthGuard + 业务逻辑权限检查)
  ↓
返回图片流或错误
```

### 4.2 关键点

1. **统一接口**: 图片文件和 CAD 文件都使用同一个端点 `/v1/file-system/nodes/:nodeId/thumbnail` 获取缩略图
2. **认证方式**: 使用 JWT 认证 (JwtAuthGuard)
3. **权限分层**:
   - 资源库节点: 检查系统权限
   - 项目文件节点: 检查文件访问权限
4. **原图访问**: 图片文件的原图通过 `/v1/file-system/nodes/:nodeId/download` 端点访问 (需要 `ProjectPermission.FILE_DOWNLOAD` 权限)
5. **错误处理**: Thumbnail 组件有 `onError` 回调，加载失败时显示文件图标

### 4.3 安全考虑

✅ 所有缩略图请求都经过认证  
✅ 资源库和项目文件有不同的权限检查逻辑  
✅ 图片预览使用 download 端点，有独立的下载权限控制  
