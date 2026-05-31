import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Briefcase,
  MapPinned,
  Gift,
  Building2,
  Plus,
  Star,
  Pencil,
  Trash2,
  CheckCircle2,
  PackageCheck,
} from "lucide-react";
import type { Address } from "@/lib/use-addresses";
import { rankAddresses, addressBadge } from "@/lib/address-intelligence";

type Props = {
  addresses: Address[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  onAddNew: () => void;
  eta?: string;
};

/** Choose a fitting glyph from the address type + nickname keywords. */
function iconFor(a: Address): typeof Home {
  const n = (a.nickname ?? "").toLowerCase();
  if (/gift|present/.test(n)) return Gift;
  if (/office|hq|work|company/.test(n)) return Building2;
  if (a.address_type === "home") return Home;
  if (a.address_type === "work") return Briefcase;
  return MapPinned;
}

function labelFor(a: Address): string {
  if (a.nickname?.trim()) return a.nickname.trim();
  if (a.address_type === "home") return "Home";
  if (a.address_type === "work") return "Office";
  return "Other";
}

/**
 * One-tap "Recent Addresses" rail (Amazon / Flipkart style). Horizontally
 * scrollable on mobile, grid on larger screens. Tapping a card selects it.
 */
export function SavedAddressRail({
  addresses,
  selectedId,
  onSelect,
  onEdit,
  onSetDefault,
  onDelete,
  onAddNew,
  eta,
}: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:overflow-visible sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {rankAddresses(addresses).map((a) => {
        const Icon = iconFor(a);
        const badge = addressBadge(a, addresses);
        const active = selectedId === a.id;
        return (
          <motion.button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            whileTap={{ scale: 0.98 }}
            className={`relative shrink-0 w-[80%] sm:w-auto snap-start text-left border rounded-2xl p-4 transition-all duration-300 ${
              active
                ? "border-accent bg-accent/[0.07] shadow-[0_0_0_1px_var(--color-accent),0_12px_30px_-12px_color-mix(in_oklab,var(--color-accent)_45%,transparent)]"
                : "border-white/10 hover:border-accent/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`size-6 grid place-items-center rounded-lg ${
                  active ? "bg-accent/15 text-accent" : "bg-white/[0.04] text-muted-foreground"
                }`}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-accent truncate max-w-[8rem]">
                {labelFor(a)}
              </span>
              {badge && (
                <span
                  className={`text-[9px] font-mono uppercase tracking-widest inline-flex items-center gap-1 ${
                    badge.tone === "emerald"
                      ? "text-emerald-400"
                      : badge.tone === "accent"
                        ? "text-accent"
                        : "text-muted-foreground"
                  }`}
                >
                  <Star className="size-2.5 fill-current" /> {badge.label}
                </span>
              )}
              <AnimatePresence>
                {active && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="ml-auto text-accent"
                  >
                    <CheckCircle2 className="size-4" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <p className="text-sm font-medium truncate">{a.full_name}</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ""}
              <br />
              {a.city}
              {a.state ? `, ${a.state}` : ""} {a.postal}
            </p>
            {eta && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
                <PackageCheck className="size-3" /> Delivers {eta}
              </div>
            )}
            <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(a.id);
                }}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
              >
                <Pencil className="size-2.5" /> Edit
              </span>
              {!a.is_default_shipping && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetDefault(a.id);
                  }}
                  className="inline-flex items-center gap-1 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  <Star className="size-2.5" /> Default
                </span>
              )}
              {addresses.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(a.id);
                  }}
                  className="inline-flex items-center gap-1 hover:text-destructive transition-colors cursor-pointer ml-auto"
                >
                  <Trash2 className="size-2.5" /> Delete
                </span>
              )}
            </div>
          </motion.button>
        );
      })}

      {/* Add-new tile */}
      <button
        type="button"
        onClick={onAddNew}
        className="shrink-0 w-[60%] sm:w-auto snap-start grid place-items-center gap-1.5 border border-dashed border-white/15 rounded-2xl p-4 text-muted-foreground hover:border-accent/50 hover:text-accent transition-all min-h-[7rem]"
      >
        <Plus className="size-5" />
        <span className="text-[10px] font-mono uppercase tracking-widest">Add new address</span>
      </button>
    </div>
  );
}
