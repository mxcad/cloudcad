/** Token 提取所需的 request 最小形状：Authorization header / auth_token cookie */
interface TokenRequest {
  headers?: { authorization?: string; cookie?: string };
  cookies?: { auth_token?: string };
}

export function extractTokenFromRequest(
  request: TokenRequest | null
): string | null {
  if (request?.headers?.authorization) {
    const authHeader = request.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
  }

  if (request?.cookies?.auth_token) {
    return request.cookies.auth_token;
  }

  if (request?.headers?.cookie) {
    const match = request.headers.cookie.match(/auth_token=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}
