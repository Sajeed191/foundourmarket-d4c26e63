import { useEffect, useState } from "react";
import { getFlag, subscribe, type DebugFlag } from "./debug-flags";

/** React hook for a debug flag. Re-renders when toggled in the panel. */
export function useFlag(flag: DebugFlag): boolean {
  const [value, setValue] = useState(() => getFlag(flag));
  useEffect(() => subscribe(() => setValue(getFlag(flag))), [flag]);
  return value;
}
