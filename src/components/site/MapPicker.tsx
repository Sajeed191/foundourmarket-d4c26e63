import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, Search, MapPin, ArrowLeft, Check, Crosshair, AlertCircle } from "lucide-react";

export type MapPickResult = {
  lat: number;
  lng: number;
  address: Record<string, string>;
};

type Props = {
  initial?: { lat: number | null; lng: number | null };
  lowEnd?: boolean;
  onConfirm: (result: MapPickResult) => void;
  onCancel: () => void;
};

const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629]; // India centroid

async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" }, signal },
    );
    const j = await res.json();
    return (j?.address ?? {}) as Record<string, string>;
  } catch {
    return null;
  }
}

/** Build a human-readable, Flipkart-style preview from OSM address parts. */
function formatPreview(a: Record<string, string>): string[] {
  const line1 = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(" ");
  const area = a.neighbourhood || a.suburb || a.quarter || a.hamlet || "";
  const village = a.village || a.town || "";
  const city = a.city || a.municipality || a.county || "";
  const district = a.state_district || a.county || "";
  const state = a.state || "";
  const postal = a.postcode || "";
  const country = a.country || "";
  return [line1, area, village, city, district, state, postal, country].filter(
    (v, i, arr) => v && arr.indexOf(v) === i,
  );
}

/**
 * Fullscreen OpenStreetMap location picker (Leaflet). Lazy-loaded — Leaflet and
 * its CSS only download when the customer opens "Select on Map". Drag the map to
 * move the centre pin, search a place, or use GPS. A live reverse-geocoded
 * address preview updates as the pin moves, then Confirm hands the final
 * coordinates + address parts back to the form.
 */
export default function MapPicker({ initial, lowEnd, onConfirm, onCancel }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [center, setCenter] = useState<[number, number]>([
    initial?.lat ?? DEFAULT_CENTER[0],
    initial?.lng ?? DEFAULT_CENTER[1],
  ]);

  // Live preview state.
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const [previewMeta, setPreviewMeta] = useState<{ pin: string; city: string; state: string }>({
    pin: "",
    city: "",
    state: "",
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const previewAbort = useRef<AbortController | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAddress = useRef<Record<string, string>>({});

  // Debounced live reverse geocode whenever the pin (map centre) settles.
  const refreshPreview = useCallback((lat: number, lng: number) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      previewAbort.current?.abort();
      const controller = new AbortController();
      previewAbort.current = controller;
      const timer = setTimeout(() => controller.abort(), 6000);
      setPreviewLoading(true);
      setPreviewError(false);
      const a = await reverseGeocode(lat, lng, controller.signal);
      clearTimeout(timer);
      if (controller.signal.aborted) return;
      setPreviewLoading(false);
      if (a === null) {
        setPreviewError(true);
        setPreviewLines([]);
        setPreviewMeta({ pin: "", city: "", state: "" });
        lastAddress.current = {};
        return;
      }
      lastAddress.current = a;
      setPreviewLines(formatPreview(a));
      setPreviewMeta({
        pin: a.postcode || "",
        city: a.city || a.town || a.village || a.municipality || a.county || "",
        state: a.state || "",
      });
    }, 600);
  }, []);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const hasInitial = typeof initial?.lat === "number" && typeof initial?.lng === "number";
    const map = L.map(mapEl.current, {
      center,
      zoom: hasInitial ? 16 : 5,
      zoomControl: true,
      attributionControl: true,
      fadeAnimation: !lowEnd,
      zoomAnimation: !lowEnd,
      markerZoomAnimation: !lowEnd,
      inertia: !lowEnd,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    map.on("move", () => {
      const c = map.getCenter();
      setCenter([c.lat, c.lng]);
    });
    // Reverse geocode only once movement stops (cheaper + avoids rate limits).
    map.on("moveend", () => {
      const c = map.getCenter();
      refreshPreview(c.lat, c.lng);
    });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 80);
    // Initial preview for the starting position.
    if (hasInitial) refreshPreview(center[0], center[1]);
    return () => {
      // Destroy the map + cancel in-flight work — no memory leaks.
      previewAbort.current?.abort();
      if (previewTimer.current) clearTimeout(previewTimer.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll + close on Escape while the fullscreen picker is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flyTo = (lat: number, lng: number) => {
    mapRef.current?.setView([lat, lng], 16, { animate: !lowEnd });
    refreshPreview(lat, lng);
  };

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(term)}`,
        { headers: { Accept: "application/json" } },
      );
      const j = (await res.json()) as { display_name: string; lat: string; lon: string }[];
      setResults(
        (j ?? []).map((r) => ({ name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) })),
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => flyTo(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 5000 },
    );
  };

  const confirm = async () => {
    setConfirming(true);
    const [lat, lng] = center;
    // Use the freshest cached preview address if present; otherwise fetch once.
    let address = lastAddress.current;
    if (!address || Object.keys(address).length === 0) {
      const a = await reverseGeocode(lat, lng);
      address = a ?? {};
    }
    onConfirm({ lat, lng, address });
  };

  // ---- Draggable bottom sheet with snap points (25% / 50% / 90%) ----
  const SNAPS = [25, 50, 90] as const;
  const regionRef = useRef<HTMLDivElement | null>(null);
  const [snap, setSnap] = useState<number>(45); // current sheet height as % of region
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startY: number; startPct: number; regionH: number } | null>(null);

  // Keep Leaflet sized correctly whenever the sheet height changes.
  useEffect(() => {
    if (!mapRef.current) return;
    const id = setTimeout(() => mapRef.current?.invalidateSize(), dragging ? 0 : 220);
    return () => clearTimeout(id);
  }, [snap, dragging]);

  const nearestSnap = (pct: number) => {
    let best: number = SNAPS[0];
    let bestDist = Infinity;
    for (const s of SNAPS) {
      const d = Math.abs(s - pct);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  };

  const onHandleDown = (e: React.PointerEvent) => {
    const regionH = regionRef.current?.clientHeight ?? window.innerHeight;
    dragState.current = { startY: e.clientY, startPct: snap, regionH };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds) return;
    const deltaPct = ((ds.startY - e.clientY) / ds.regionH) * 100;
    const next = Math.min(90, Math.max(25, ds.startPct + deltaPct));
    setSnap(next);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    dragState.current = null;
    setDragging(false);
    setSnap((cur) => nearestSnap(cur));
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };


  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col bg-background"
      style={{ height: "100dvh" }}
      role="dialog"
      aria-modal="true"
      aria-label="Select delivery location on map"
    >
      {/* Top bar — back, title, search */}
      <div
        className="relative z-[2200] shrink-0 border-b border-border bg-card/95 px-3 pb-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Back"
            className="grid size-12 shrink-0 place-items-center rounded-2xl border border-border text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold">Select delivery location</h2>
        </div>
        <form onSubmit={runSearch} className="relative mt-2.5">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search address"
            placeholder="Search city, village, street, landmark, PIN…"
            className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-10 text-sm outline-none focus:border-accent"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </form>
        {results.length > 0 && (
          <ul className="absolute inset-x-3 z-[2300] mt-2 max-h-64 divide-y divide-border overflow-auto rounded-2xl border border-border bg-card shadow-xl">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    flyTo(r.lat, r.lng);
                    setResults([]);
                    setQ(r.name.split(",")[0] ?? r.name);
                  }}
                  className="flex w-full items-start gap-2 px-3 py-3 text-left text-xs hover:bg-white/5"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-accent" />
                  <span className="line-clamp-2">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Region: map fills the area; the draggable sheet overlays the bottom */}
      <div ref={regionRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={mapEl} className="absolute inset-0" />
        {/* Fixed centre pin */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full">
          <MapPin
            className={`size-9 fill-accent/20 text-accent ${lowEnd ? "" : "drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"}`}
          />
        </div>
        {/* Locate-me — floats just above the sheet */}
        <button
          type="button"
          onClick={locateMe}
          aria-label="Use my current location"
          className="absolute right-4 z-[1200] grid size-12 place-items-center rounded-full border border-accent/40 bg-card text-accent shadow-lg"
          style={{
            bottom: `calc(${snap}% + 1rem)`,
            transition: dragging ? "none" : "bottom 0.2s ease",
          }}
        >
          <Crosshair className="size-5" />
        </button>

        {/* Draggable bottom sheet */}
        <div
          className={`absolute inset-x-0 bottom-0 z-[1300] flex flex-col rounded-t-3xl border-t border-border bg-card ${lowEnd ? "" : "backdrop-blur shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.5)]"}`}
          style={{
            height: `${snap}%`,
            transition: dragging ? "none" : "height 0.2s ease",
          }}
        >
          {/* Drag handle */}
          <div
            className="shrink-0 cursor-grab touch-none px-4 pb-1 pt-3 active:cursor-grabbing"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            role="separator"
            aria-label="Drag to resize"
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-border" aria-hidden />
          </div>

          {/* Scrollable content */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-3">
            <div className="rounded-2xl border border-border bg-background/60 p-3">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    Selected address
                  </p>
                  {previewLoading ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> Finding address…
                    </p>
                  ) : previewError ? (
                    <p className="flex items-start gap-1.5 text-xs text-amber-500/90">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      Unable to fetch address. You can still confirm this location.
                    </p>
                  ) : previewLines.length > 0 ? (
                    <>
                      <p className="text-xs leading-relaxed text-foreground">
                        {previewLines.join(", ")}
                      </p>
                      {(previewMeta.city || previewMeta.state || previewMeta.pin) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {previewMeta.city && (
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                              {previewMeta.city}
                            </span>
                          )}
                          {previewMeta.state && (
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                              {previewMeta.state}
                            </span>
                          )}
                          {previewMeta.pin && (
                            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                              PIN {previewMeta.pin}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Move the map to position the pin on your exact location.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky footer — Confirm always visible, clears nav + safe area */}
          <div
            className="shrink-0 border-t border-border bg-card px-4 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
          >
            <button
              type="button"
              onClick={confirm}
              disabled={confirming}
              className={`inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[12px] font-bold uppercase tracking-widest text-accent-foreground hover:brightness-110 disabled:opacity-60 ${lowEnd ? "" : "shadow-[0_0_30px_-8px_var(--color-accent)]"}`}
            >
              {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Confirm this location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
