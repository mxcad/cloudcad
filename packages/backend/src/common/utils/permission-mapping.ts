import { NodeType } from '@cloudcad/db';
import { SystemPermission } from '../enums/permissions.enum';

/**
 * 资源库「归属根类型 → 所需系统管理权限」映射（单一事实源）。
 *
 * 图纸库需 LIBRARY_DRAWING_MANAGE，图块库需 LIBRARY_BLOCK_MANAGE。
 * 入参应为资源库根类型（LIBRARY_DRAWING / LIBRARY_BLOCK）；非图纸库一律按图块库处理，
 * 与各调用点既有三元语义一致。放 Layer1 common 供各层（guard / file-system /
 * ownership / mxcad / batch-download）共同消费，避免 7 份内联副本各自漂移
 * （历史缺陷：node-trash 曾用字符串字面量、guard 曾走 projectId 字段捷径）。
 */
export function getLibrarySystemPermission(
  rootNodeType: NodeType | string,
): SystemPermission {
  return rootNodeType === NodeType.LIBRARY_DRAWING
    ? SystemPermission.LIBRARY_DRAWING_MANAGE
    : SystemPermission.LIBRARY_BLOCK_MANAGE;
}

/**
 * 资源库 key（'drawing' | 'block'）→ 所需系统管理权限（单一事实源）。
 * 与 getLibrarySystemPermission 互为 NodeType 与字符串 key 两种入参形态。
 * undefined 按图块库处理，与调用点既有 `=== 'drawing' ? 图纸 : 图块` 三元一致。
 */
export function getLibrarySystemPermissionByKey(
  key: 'drawing' | 'block' | undefined,
): SystemPermission {
  return key === 'drawing'
    ? SystemPermission.LIBRARY_DRAWING_MANAGE
    : SystemPermission.LIBRARY_BLOCK_MANAGE;
}
