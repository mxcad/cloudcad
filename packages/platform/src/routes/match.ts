/**
 * 轻量路径 pattern 匹配器。
 *
 * 支持 `:paramName` 占位。刻意不引入 path-to-regexp 这类依赖：这个包要能被
 * 任何端（含未来 App / Electron）以纯源码方式消费，零依赖是硬要求。
 *
 * 返回值保持 URL 编码原样，是否 decode 由调用方决定——两端的路径参数目前是
 * UUID / 数字 ID，不含需解码字符。
 */

export type PathSegment = string | { param: string };

/** 编译 pattern：`/projects/:projectId/files` → ['projects', { param: 'projectId' }, 'files'] */
export function compilePathPattern(pattern: string): PathSegment[] {
  return pattern
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) =>
      segment.startsWith(':') ? { param: segment.slice(1) } : segment
    );
}

/** 拆分 pathname 为段（保留原始编码） */
export function splitPathname(pathname: string): string[] {
  return pathname.split('/').filter((segment) => segment.length > 0);
}

/**
 * 匹配 pathname。命中返回参数表，未命中返回 null。
 *
 * 段数必须完全相等才算命中——`/projects/1/files` 不会命中 `/projects/:id`。
 */
export function matchPathPattern(
  pattern: PathSegment[],
  pathname: string
): Record<string, string> | null {
  const segments = splitPathname(pathname);
  if (segments.length !== pattern.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const expected = pattern[i];
    const actual = segments[i];
    if (actual === undefined) return null;

    if (typeof expected === 'object') {
      params[expected.param] = actual;
    } else if (expected !== actual) {
      return null;
    }
  }

  return params;
}

/**
 * 渲染 pattern 为具体路径。缺失参数用空串占位，调用方应在调用前校验齐全。
 */
export function renderPathPattern(
  pattern: PathSegment[],
  params: Record<string, string>
): string {
  const segments = pattern.map((segment) =>
    typeof segment === 'object' ? params[segment.param] ?? '' : segment
  );
  return `/${segments.join('/')}`;
}
