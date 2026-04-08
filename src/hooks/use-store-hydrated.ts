"use client";

import { useEffect, useState } from "react";

import { useAppStore } from "@/stores/useAppStore";

export function useStoreHydrated() {
  const [hydrated, setHydrated] = useState(false);

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
