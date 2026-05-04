/**
 * Tus 上传协议模块
 *
 * 基于 @tus/server 实现标准 tus 协议的分片上传服务。
 * 替换原有的 MxcadChunkModule + MxcadUploadModule 自定义分片逻辑。
 *
 * tus 协议端点：
 *   POST   /api/v1/files              — 创建上传会话
 *   PATCH  /api/v1/files/:id          — 上传分片数据
 *   HEAD   /api/v1/files/:id          — 检查上传状态
 *   DELETE /api/v1/files/:id          — 取消上传
 *
 * 事件处理:
 *   onUploadFinish — 上传完成后触发文件转换和节点创建
 */
export declare class TusModule {
}
//# sourceMappingURL=tus.module.d.ts.map