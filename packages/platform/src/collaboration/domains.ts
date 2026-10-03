/**
 * 协同编辑域名白名单判定（跨端共用）。
 *
 * 准入四条：纯函数、不绑框架、不绑端（hostname 由调用方传入，不读 window）、
 * 重复已成立——PC SidebarContainer 有一份同名实现，移动端此前完全没有校验，
 * 收进这里后两端共用一份。
 *
 * 语义：白名单为空 = 不限制（运行时配置 collaborationDomains 默认值就是空串，
 * 绝大多数部署走这条路径）。全空白 / 只剩逗号的脏值同样按「不限制」处理——
 * 否则管理员多敲一个逗号就会把全网协同拦死且难以自查。
 */
export function isCollaborationAllowed(
  domains: string,
  hostname: string,
): boolean {
  const list = domains.trim();
  if (!list) return true;
  const allowed = list
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  if (allowed.length === 0) return true;
  return allowed.includes(hostname.toLowerCase());
}
