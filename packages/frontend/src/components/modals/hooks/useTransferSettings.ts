import { useCallback } from 'react';
import { projectControllerUpdateTransferSettings } from '@/api-sdk';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { ProjectPermission } from '@/constants/permissions';
import { getErrorMessage } from '@/utils/errorHandler';
import type { TransferSettings } from '@/types/filesystem';

/** 跨项目转移 6 域字段（后端 UpdateTransferSettingsDto 仅接受这些字段） */
const TRANSFER_KEYS: (keyof TransferSettings)[] = [
  'transferOutToProject',
  'transferOutToPersonalSpace',
  'transferOutToLibrary',
  'transferInFromProject',
  'transferInFromPersonalSpace',
  'transferInFromLibrary',
];

/**
 * 仅提取跨项目转移字段。
 * 调用方可能误传整个 FileSystemNode（其 extends TransferSettings），
 * 若原样发送会触发后端 DTO 的 forbidNonWhitelisted → "请求参数验证失败"。
 */
function pickTransferSettings(value: TransferSettings): TransferSettings {
  const result: TransferSettings = {};
  for (const key of TRANSFER_KEYS) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  return result;
}

/**
 * 跨项目转移设置（ProjectModal 设置区块的数据源 + 保存器）
 *
 * - canManage：PROJECT_TRANSFER_MANAGE 权限位（悲观加载，未加载=false）
 * - save：调 PUT projects/:projectId/transfer-settings（部分更新），成功/失败 toast
 */
export function useTransferSettings(projectId?: string) {
  const permissionQuery = useProjectPermissions(projectId ?? '', {
    permissions: [ProjectPermission.PROJECT_TRANSFER_MANAGE],
  });
  const canManage =
    !!projectId && permissionQuery.check(ProjectPermission.PROJECT_TRANSFER_MANAGE);

  const save = useCallback(
    async (settings: TransferSettings) => {
      if (!projectId) return;
      try {
        // throwOnError: 失败时 SDK 直接抛错（该端点无 4xx 响应类型，不走 result.error）
        await projectControllerUpdateTransferSettings({
          path: { projectId },
          body: pickTransferSettings(settings),
          throwOnError: true,
        });
      } catch (error) {
        throw new Error(getErrorMessage(error));
      }
    },
    [projectId]
  );

  return { canManage, save };
}

