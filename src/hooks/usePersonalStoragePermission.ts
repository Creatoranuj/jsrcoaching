import { useCallback, useEffect, useState } from "react";
import { safeGet, safeSet, safeRemove } from "../lib/storage";

const KEY = "nb_personal_lib_allowed";

export function usePersonalStoragePermission() {
  const [allowed, setAllowed] = useState<boolean>(() => safeGet(KEY) === "1");

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setAllowed(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const allow = useCallback(() => {
    safeSet(KEY, "1");
    setAllowed(true);
  }, []);

  const revoke = useCallback(() => {
    safeRemove(KEY);
    setAllowed(false);
  }, []);

  return { allowed, allow, revoke };
}
