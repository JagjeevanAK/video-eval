"use client";

import type { ReactNode } from "react";
import GoogleAuthScreen from "@/screens/GoogleAuthScreen";
import { useStoreHydrated } from "@/hooks/use-store-hydrated";
import { useAppStore } from "@/stores/useAppStore";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const hydrated = useStoreHydrated();
  const isAuthenticated = useAppStore((state) => state.auth.isAuthenticated);

  if (!hydrated) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isAuthenticated) {
    return <GoogleAuthScreen />;
  }

  return <>{children}</>;
}
