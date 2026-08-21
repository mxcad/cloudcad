export function parseCADEditorRoute(pathname: string): string | null {
  const match = pathname.match(/^\/cad-editor\/([^/]+)$/);
  return match?.[1] ?? null;
}

export function isHomeRoute(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/cad-editor';
}
