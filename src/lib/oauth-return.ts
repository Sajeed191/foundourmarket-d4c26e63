import { supabase } from "@/integrations/supabase/client";

const AUTH_KEYS = [
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "provider_token",
  "provider_refresh_token",
  "code",
  "state",
  "type",
  "error",
  "error_description",
] as const;

function mergedAuthParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const merged = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  hash.forEach((value, key) => {
    if (!merged.has(key)) merged.set(key, value);
  });
  return merged;
}

function stripAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  AUTH_KEYS.forEach((key) => url.searchParams.delete(key));
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (AUTH_KEYS.some((key) => hash.has(key))) url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function hasStoredCodeVerifier() {
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.endsWith("-code-verifier") && window.localStorage.getItem(key)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function hasOAuthReturnParams() {
  const params = mergedAuthParams();
  return AUTH_KEYS.some((key) => params.has(key));
}

async function withOAuthTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OAuth session exchange timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function completeOAuthReturn(
  timeoutMs = 12_000,
): Promise<{ completed: boolean; error?: string }> {
  if (typeof window === "undefined") return { completed: false };

  const params = mergedAuthParams();
  const providerError = params.get("error");
  if (providerError) {
    stripAuthParamsFromUrl();
    return { completed: false, error: params.get("error_description") ?? providerError };
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const code = params.get("code");

  if (accessToken && refreshToken) {
    const { error } = await withOAuthTimeout(
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
      timeoutMs,
    ).catch((err: unknown) => ({ error: err instanceof Error ? err : new Error(String(err)) }));
    stripAuthParamsFromUrl();
    return error ? { completed: false, error: error.message } : { completed: true };
  }

  if (code && hasStoredCodeVerifier()) {
    const { error } = await withOAuthTimeout(
      supabase.auth.exchangeCodeForSession(code),
      timeoutMs,
    ).catch((err: unknown) => ({ error: err instanceof Error ? err : new Error(String(err)) }));
    stripAuthParamsFromUrl();
    return error ? { completed: false, error: error.message } : { completed: true };
  }

  if (code) {
    // The hosted OAuth broker can return a transient `code` that is not a
    // Supabase PKCE code. Exchanging it without the matching verifier causes a
    // 400 and sends users back to the sign-in screen, so ignore it safely.
    stripAuthParamsFromUrl();
    return { completed: false };
  }

  return { completed: false };
}
