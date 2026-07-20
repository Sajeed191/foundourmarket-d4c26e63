// Gatekeeper: keeps the AI Shopping Assistant fully lazy until the user
// actually asks for it. Listens for the `fom:ai:open` window event with a
// tiny handler; the ~30KB assistant chunk only downloads after the first
// open request. Re-opens after close are instant (chunk already cached).
import { Suspense, useEffect, useState } from "react";
import { onAiOpen } from "@/lib/ai-shopping/events";
import { lazyWithRetry } from "@/lib/chunk-recovery";

const AiShoppingAssistant = lazyWithRetry(() =>
  import("@/components/chat/AiShoppingAssistant").then((m) => ({ default: m.AiShoppingAssistant })),
);

export function AiShoppingMount() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => onAiOpen(() => setLoaded(true)), []);
  if (!loaded) return null;
  return (
    <Suspense fallback={null}>
      <AiShoppingAssistant />
    </Suspense>
  );
}

export default AiShoppingMount;
