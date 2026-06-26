export function sanitizeFileName(name: string): string {
  return name.replace(/[\x00-\x1F\x7F<>:"/\\|?*]/g, '');
}
