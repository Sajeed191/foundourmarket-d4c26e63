/** Client-side Razorpay Checkout script loader + types. */

export type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string; backdrop_color?: string };
  method?: Record<string, boolean>;
  customer_id?: string;
  save?: 0 | 1;

  /**
   * Checkout display configuration. Lets us reorder payment blocks and
   * prioritize UPI (Intent + Collect/VPA + QR) above the default blocks.
   * See https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/customize/checkout-display/
   */
  config?: {
    display?: {
      blocks?: Record<
        string,
        {
          name: string;
          instruments: Array<{
            method: string;
            flows?: string[];
            apps?: string[];
            issuers?: string[];
            banks?: string[];
            wallets?: string[];
            types?: string[];
          }>;
        }
      >;
      sequence?: string[];
      preferences?: { show_default_blocks?: boolean };
    };
  };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void; escape?: boolean; backdropclose?: boolean };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, cb: (resp: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loadPromise: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Razorpay) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay")));
      if (window.Razorpay) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Razorpay. Check your network."));
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

export function openRazorpay(options: RazorpayOptions): RazorpayInstance {
  if (!window.Razorpay) throw new Error("Razorpay not loaded");
  const rzp = new window.Razorpay(options);
  return rzp;
}
