import { useEffect, useState } from "react";
import { api, type StudioInfo } from "./api";

let cached: Promise<StudioInfo> | null = null;

/** Studio settings (time zone, hours), fetched once per page load. */
export function useStudio() {
  const [studio, setStudio] = useState<StudioInfo | null>(null);
  useEffect(() => {
    cached ??= api.config().catch((err) => {
      cached = null;
      throw err;
    });
    let alive = true;
    cached.then((s) => alive && setStudio(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return studio;
}
