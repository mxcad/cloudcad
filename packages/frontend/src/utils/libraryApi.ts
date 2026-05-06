/**
 * 图书馆 API 工具函数
 * 用于 SDK 尚未覆盖的端点（删除操作）
 * TODO: 后端添加对应 SDK 端点后迁移到 @/api-sdk
 */
import { client } from '@/api-sdk/client.gen';

const LIBRARY_API = '/api/v1/library';

export const deleteDrawingNode = (nodeId: string, permanently: boolean = true) =>
  client.delete(`${LIBRARY_API}/drawing/nodes/${nodeId}`, {
    query: { permanently },
  });

export const deleteBlockNode = (nodeId: string, permanently: boolean = true) =>
  client.delete(`${LIBRARY_API}/block/nodes/${nodeId}`, {
    query: { permanently },
  });
