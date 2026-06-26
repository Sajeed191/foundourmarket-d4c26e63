import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, Search, MapPin, X, Check, Crosshair } from "lucide-react";

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

async function reverseGeocode(lat: number, lng: number): Promise<Record<string, string>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    const j = await res.json();
    return (j?.address ?? {}) as Record<string, string>;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fullscreen OpenStreetMap location picker (Leaflet). Lazy-loaded — Leaflet and
 * its CSS only download when the customer opens "Select on Map". Drag the map to
 * move the centre pin, search a place, or use GPS, then Confirm.
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
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    map.on("move", () => {
      const c = map.getCenter();
      setCenter([c.lat, c.lng]);
    });
    mapRef.current = map;
    // Ensure correct sizing after the overlay paints.
    setTimeout(() => map.invalidateSize(), 80);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flyTo = (lat: number, lng: number) => {
    mapRef.current?.setView([lat, lng], 16, { animate: !lowEnd });
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
    const address = await reverseGeocode(lat, lng);
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
              placeholder="Search area, street, landmark…"
              className="w-full h-11 pl-10 pr-4 rounded-2xl bg-background border border-border text-sm outline-none focus:border-accent"
            />
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
          <MapPin className="size-9 text-accent drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] fill-accent/20" />
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

      {/* Footer */}
      <div className="p-3 border-t border-border bg-card/95 backdrop-blur space-y-2">
        <p className="text-[11px] text-muted-foreground text-center">
          Move the map to position the pin on your exact location
        </p>
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
            className="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold h-12 rounded-2xl text-[11px] uppercase tracking-widest hover:brightness-110 disabled:opacity-60 shadow-[0_0_30px_-8px_var(--color-accent)]"
          >
            {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirm location
          </button>
        </div>
      </div>
    </div>
  );
}
