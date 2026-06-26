import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, Search, MapPin, X, Check, Crosshair, AlertCircle } from "lucide-react";

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
        lastAddress.current = {};
        return;
      }
      lastAddress.current = a;
      setPreviewLines(formatPreview(a));
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

  return (
    <div className="fixed inset-0 z-[2100] flex flex-col bg-background">
      {/* Search bar */}
      <div className="relative z-[2200] p-3 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="grid place-items-center size-11 rounded-2xl border border-border text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="size-5" />
          </button>
          <form onSubmit={runSearch} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search city, village, street, landmark, PIN…"
              className="w-full h-11 pl-10 pr-10 rounded-2xl bg-background border border-border text-sm outline-none focus:border-accent"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
            )}
          </form>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 max-h-56 overflow-auto rounded-2xl border border-border bg-card divide-y divide-border">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    flyTo(r.lat, r.lng);
                    setResults([]);
                    setQ(r.name.split(",")[0] ?? r.name);
                  }}
                  className="w-full text-left px-3 py-3 text-xs hover:bg-white/5 flex items-start gap-2"
                >
                  <MapPin className="size-3.5 mt-0.5 text-accent shrink-0" />
                  <span className="line-clamp-2">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div ref={mapEl} className="absolute inset-0" />
        {/* Fixed centre pin */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full z-[1000]">
          <MapPin
            className={`size-9 text-accent fill-accent/20 ${lowEnd ? "" : "drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"}`}
          />
        </div>
        <button
          type="button"
          onClick={locateMe}
          aria-label="Use my location"
          className="absolute right-4 bottom-4 z-[1000] grid place-items-center size-12 rounded-full bg-card border border-accent/40 text-accent shadow-lg"
        >
          <Crosshair className="size-5" />
        </button>
      </div>

      {/* Footer — bottom sheet with live preview + confirm */}
      <div
        className={`p-4 border-t border-border bg-card rounded-t-3xl -mt-4 relative z-[1100] space-y-3 ${lowEnd ? "" : "backdrop-blur shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.5)]"}`}
      >
        {/* Selected address preview */}
        <div className="rounded-2xl border border-border bg-background/60 p-3 min-h-[64px]">
          <div className="flex items-start gap-2">
            <MapPin className="size-4 mt-0.5 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                Selected address
              </p>
              {previewLoading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Finding address…
                </p>
              ) : previewError ? (
                <p className="text-xs text-amber-500/90 flex items-start gap-1.5">
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                  Unable to fetch address. You can still confirm this location.
                </p>
              ) : previewLines.length > 0 ? (
                <p className="text-xs leading-relaxed text-foreground line-clamp-3">
                  {previewLines.join(", ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Move the map to position the pin on your exact location.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 h-12 rounded-2xl text-[11px] uppercase tracking-widest border border-border hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={confirming}
            className={`flex-1 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold h-12 rounded-2xl text-[11px] uppercase tracking-widest hover:brightness-110 disabled:opacity-60 ${lowEnd ? "" : "shadow-[0_0_30px_-8px_var(--color-accent)]"}`}
          >
            {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirm location
          </button>
        </div>
      </div>
    </div>
  );
}
