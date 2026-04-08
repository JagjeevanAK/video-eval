"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import GoogleAuthScreen from "@/screens/GoogleAuthScreen";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { isPublicRoute, isKnownRoute } from "@/lib/publicRoutes";
import { useAppStore } from "@/stores/useAppStore";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const hydrated = useStoreHydrated();
  const isAuthenticated = useAppStore((state) => state.auth.isAuthenticated);
  const isPublic = isPublicRoute(pathname);
  const isKnown = isKnownRoute(pathname);

  if (isPublic || !isKnown) {
    return <>{children}</>;
  }

  if (!hydrated) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isAuthenticated) {
    return <GoogleAuthScreen />;
  }

  return <>{children}</>;
}
