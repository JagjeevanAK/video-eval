const PUBLIC_ROUTES = new Set(["/", "/privacy", "/terms"]);

export function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  return PUBLIC_ROUTES.has(pathname);
}
