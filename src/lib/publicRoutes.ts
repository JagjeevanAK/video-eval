const PUBLIC_ROUTES = new Set(["/", "/privacy", "/terms"]);

const KNOWN_ROUTE_PREFIXES = ["/dashboard", "/create", "/room", "/settings", "/api"];

export function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  return PUBLIC_ROUTES.has(pathname);
}

export function isKnownRoute(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  if (PUBLIC_ROUTES.has(pathname)) {
    return true;
  }

  return KNOWN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
