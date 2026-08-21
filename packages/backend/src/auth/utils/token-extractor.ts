export function extractTokenFromRequest(request: any): string | null {
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
