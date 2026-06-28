import { useEffect, useState } from "react";
import { getActiveBisectTest, getBisectOverrideEnabled, getFlag, subscribe, type DebugFlag } from "./debug-flags";

/** React hook for a debug flag. Re-renders when toggled in the panel. */
export function useFlag(flag: DebugFlag): boolean {
  const [value, setValue] = useState(() => getFlag(flag));
  useEffect(() => subscribe(() => setValue(getFlag(flag))), [flag]);
  return value;
}

export function useActiveBisectTest(): string | null {
  const [value, setValue] = useState(() => getActiveBisectTest());
  useEffect(() => subscribe(() => setValue(getActiveBisectTest())), []);
  return value;
}

export function useBisectOverrideEnabled(): boolean {
  const [value, setValue] = useState(() => getBisectOverrideEnabled());
  useEffect(() => subscribe(() => setValue(getBisectOverrideEnabled())), []);
  return value;
}
