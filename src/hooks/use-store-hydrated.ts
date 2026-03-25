"use client";

import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/useAppStore";

function getInitialHydrationState() {
  if (typeof window === "undefined") {
    return false;
  }

  return useAppStore.persist?.hasHydrated() ?? false;
}

export function useStoreHydrated() {
  const [hydrated, setHydrated] = useState(getInitialHydrationState);

  useEffect(() => {
    const persistApi = useAppStore.persist;

    if (!persistApi) {
      setHydrated(true);
      return;
    }

    const unsubscribeHydrate = persistApi.onHydrate(() => setHydrated(false));
    const unsubscribeFinishHydration = persistApi.onFinishHydration(() => setHydrated(true));

    setHydrated(persistApi.hasHydrated());

    return () => {
      unsubscribeHydrate();
      unsubscribeFinishHydration();
    };
  }, []);

  return hydrated;
}
