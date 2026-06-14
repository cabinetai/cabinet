export function normalizeVirtualPath(value: string): string {
  return value
    .replace(/[\\/]+/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}
