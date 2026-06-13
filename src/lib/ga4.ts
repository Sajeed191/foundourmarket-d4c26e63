const MEASUREMENT_ID = "G-V7TKPZHMHQ";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

/** Call gtag safely — browser-only, silent if the script hasn't loaded yet. */
function gtag(...args: unknown[]) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag(...args);
}

let ga4Loaded = false;
/**
 * Lazily inject the gtag.js script + config AFTER first paint / on idle.
 * Keeping Google Analytics off the critical path removes its main-thread cost
 * during initial load (lower TBT, faster FCP/LCP). Safe to call repeatedly.
 */
export function loadGa4() {
  if (typeof window === "undefined" || ga4Loaded) return;
  ga4Loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(s);
}


/** Track a SPA page_view after the initial config page_view. */
export function ga4PageView(path: string, title?: string) {
  gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: path,
    page_title: title ?? document.title,
    send_to: MEASUREMENT_ID,
  });
}

export type GA4Item = {
  item_id: string;
  item_name: string;
  price: number;
  quantity?: number;
  item_category?: string;
  item_brand?: string;
};

/** view_item — product detail page. */
export function ga4ViewItem(item: GA4Item, currency: string) {
  gtag("event", "view_item", {
    currency,
    value: item.price,
    items: [item],
    send_to: MEASUREMENT_ID,
  });
}

/** add_to_cart — when a product is added to the cart. */
export function ga4AddToCart(item: GA4Item, currency: string) {
  const qty = item.quantity ?? 1;
  gtag("event", "add_to_cart", {
    currency,
    value: (item.price ?? 0) * qty,
    items: [{ ...item, quantity: qty }],
    send_to: MEASUREMENT_ID,
  });
}

/** begin_checkout — when the user clicks to proceed to payment. */
export function ga4BeginCheckout(items: GA4Item[], currency: string, value: number) {
  gtag("event", "begin_checkout", {
    currency,
    value,
    items: items.map((i) => ({ ...i, quantity: i.quantity ?? 1 })),
    send_to: MEASUREMENT_ID,
  });
}

/** purchase — on successful order placement. */
export function ga4Purchase(params: {
  transaction_id: string;
  value: number;
  currency: string;
  items: GA4Item[];
  tax?: number;
  shipping?: number;
}) {
  gtag("event", "purchase", {
    transaction_id: params.transaction_id,
    value: params.value,
    currency: params.currency,
    tax: params.tax ?? 0,
    shipping: params.shipping ?? 0,
    items: params.items.map((i) => ({ ...i, quantity: i.quantity ?? 1 })),
    send_to: MEASUREMENT_ID,
  });
}
