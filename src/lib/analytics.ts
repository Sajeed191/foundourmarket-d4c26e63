import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "fom_session_id";

function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let s = sessionStorage.getItem(SESSION_KEY);
  if (!s) {
    s = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, s);
  }
  return s;
}

export async function track(event: string, opts: {
  path?: string;
  productSlug?: string;
  value?: number;
  metadata?: Record<string, unknown>;
} = {}) {
  if (typeof window === "undefined") return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("analytics_events").insert({
      user_id: user?.id ?? null,
      session_id: sessionId(),
      event,
      path: opts.path ?? window.location.pathname,
      referrer: document.referrer || null,
      product_slug: opts.productSlug ?? null,
      value: opts.value ?? null,
      metadata: (opts.metadata ?? {}) as never,
    });
  } catch {
    // swallow analytics errors
  }
}

export function trackPageView(path: string) {
  track("page_view", { path });
}
