/**
 * 角色权限判定——跨端共享的纯判定。
 *
 * 判定「用户角色权限集合」是否包含任一目标权限码。权限集合里每个条目可能是
 * 权限码字符串，也可能是 `{ permission: string }` 包装对象（两种形态在同一
 * 响应里混排），判定必须两者都认。
 *
 * 过去这份判定逐字节存在三处：PC `services/mxcadManager/saveDefaults.ts` 的
 * `hasLibraryPermission`、移动端 `composables/useSave.ts` 的 `checkLibraryPermission`、
 * 移动端 `composables/useUser.ts` 的 `hasPermission`。
 * 这里收敛为唯一判定；会话存储的读取（各端自己的 localStorage / user ref）
 * 与「该查哪几个权限码」的语义留在各端。
 */
export function hasAnyPermission(
  permissions: unknown,
  codes: readonly string[]
): boolean {
  if (!Array.isArray(permissions)) return false;
  for (const item of permissions) {
    const code =
      typeof item === 'string'
        ? item
        : (item as { permission?: unknown } | null)?.permission;
    if (typeof code === 'string' && codes.includes(code)) return true;
  }
  return false;
}
