import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Package, PackagePlus, Tag, ShoppingBag, RotateCcw, Users, Cpu, AlertTriangle, Boxes,
  Image as ImageIcon, Megaphone, LayoutTemplate, Pencil, LifeBuoy, Zap, BarChart3, Wallet,
  Activity, LayoutDashboard, FileText, Loader2, Sparkles, Clock, Pin, PinOff, Search, ArrowRight,
  Gem, Crown, UserPlus, Bell, Lightbulb, Play, Pause, ShieldAlert, ShieldCheck, Wrench,
  type LucideIcon,
} from "lucide-react";
import { useCommandCenter, pushRecentSearch, getRecentSearches, pushRecentAction, getRecentActions, getPinned, togglePinned, type RecentAction } from "@/lib/command-center";
import { useStaffRoles } from "@/lib/use-admin";
import { searchAll, type SearchResult, type Role } from "@/lib/command-search";
import { actionsForRoles, interpretNaturalLanguage, QUICK_ACTIONS } from "@/lib/command-actions";
import { automationCommandsForRoles, type AutomationCommand } from "@/lib/command-automation-actions";
import { logActivity } from "@/components/admin/AdminShell";

const ICONS: Record<string, LucideIcon> = {
  Package, PackagePlus, Tag, ShoppingBag, RotateCcw, Users, Cpu, AlertTriangle, Boxes,
  Image: ImageIcon, Megaphone, LayoutTemplate, Pencil, LifeBuoy, Zap, BarChart3, Wallet,
  Activity, LayoutDashboard, FileText, Gem, Crown, UserPlus, Bell, Lightbulb,
  Play, Pause, ShieldAlert, ShieldCheck, Wrench,
};

function Icon({ name, className }: { name?: string; className?: string }) {
  const C = (name && ICONS[name]) || ArrowRight;
  return <C className={className} />;
}

const GROUP_ORDER = ["Products", "Orders", "Customers", "Inventory", "Content", "Marketing", "Support", "System"] as const;

export function AdminCommandCenter() {
  const { open, setOpen } = useCommandCenter();
  const { roles } = useStaffRoles();
  const nav = useNavigate();
  // Navigate to any path, splitting an optional query string into typed search.
  const go = (raw: string) => {
    const [pathname, qs] = raw.split("?");
    const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
    (nav as (opts: { to: string; search?: Record<string, string> }) => void)({ to: pathname, search });
  };
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pinned, setPinned] = useState<RecentAction[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const quickActions = useMemo(() => actionsForRoles(roles), [roles]);

  useEffect(() => {
    if (open) {
      setPinned(getPinned());
      setRecents(getRecentSearches());
      setRecentActions(getRecentActions());
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced DB-backed search
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const r = await searchAll(q, roles as Set<Role>);
      setResults(r);
      setSearching(false);
    }, 220);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [query, roles]);

  function runAction(a: { id?: string; label: string; to?: string; icon?: string; action?: string; meta?: Record<string, unknown> }) {
    if (!a.to) return;
    pushRecentAction({ id: a.id ?? a.to, label: a.label, to: a.to, icon: a.icon });
    if (a.action) logActivity(a.action, "command", a.id, a.meta);
    else logActivity("cmd_navigate", "command", a.id ?? a.to, { label: a.label });
    setOpen(false);
    go(a.to);
  }

  function runSearchResult(r: SearchResult) {
    pushRecentSearch(query);
    pushRecentAction({ id: r.id, label: r.title, to: r.to, icon: r.icon });
    logActivity("cmd_open_result", (r.meta?.kind as string) ?? r.group, r.id, { title: r.title });
    setOpen(false);
    go(r.to);
  }

  function onPin(e: React.MouseEvent, a: RecentAction) {
    e.stopPropagation();
    setPinned(togglePinned(a));
  }

  // Natural-language suggestion
  const nlActionId = query.trim().length > 3 ? interpretNaturalLanguage(query) : null;
  const nlAction = nlActionId ? QUICK_ACTIONS.find((a) => a.id === nlActionId && a.roles.some((r) => roles.has(r as Role))) : null;

  // Filter quick actions by typed query (client fuzzy on labels)
  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickActions;
    return quickActions.filter((a) => `${a.label} ${a.keywords ?? ""}`.toLowerCase().includes(q));
  }, [quickActions, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.group) ?? [];
      arr.push(r);
      map.set(r.group, arr);
    }
    return GROUP_ORDER.map((g) => [g, map.get(g) ?? []] as const).filter(([, arr]) => arr.length);
  }, [results]);

  const showIdle = query.trim().length < 2;
  const pinnedIds = new Set(pinned.map((p) => p.id));

  // UX gate only — every action/route is still RLS + role protected server-side.
  if (roles.size === 0) return null;



  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 max-w-2xl gap-0 top-[12%] translate-y-0 sm:top-[15%]">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search products, orders, customers, actions… or ask anything"
            autoFocus
          />
          <CommandList className="max-h-[60vh]">
            {searching && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Searching…
              </div>
            )}

            {!searching && !showIdle && grouped.length === 0 && filteredActions.length === 0 && !nlAction && (
              <CommandEmpty>No results for “{query}”.</CommandEmpty>
            )}

            {nlAction && (
              <CommandGroup heading="Smart suggestion">
                <CommandItem value={`nl-${nlAction.id}`} onSelect={() => runAction(nlAction)} className="gap-3">
                  <Sparkles className="size-4 text-accent" />
                  <span className="flex-1">{nlAction.label}</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-accent">AI</span>
                </CommandItem>
              </CommandGroup>
            )}

            {/* IDLE STATE — recents, pinned, all quick actions */}
            {showIdle && (
              <>
                {pinned.length > 0 && (
                  <CommandGroup heading="Pinned">
                    {pinned.map((p) => (
                      <CommandItem key={p.id} value={`pin-${p.id}`} onSelect={() => runAction(p)} className="gap-3">
                        <Icon name={p.icon} className="size-4 text-accent" />
                        <span className="flex-1 truncate">{p.label}</span>
                        <button onClick={(e) => onPin(e, p)} className="text-accent/70 hover:text-accent"><PinOff className="size-3.5" /></button>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {recentActions.length > 0 && (
                  <CommandGroup heading="Recent">
                    {recentActions.slice(0, 5).map((a) => (
                      <CommandItem key={`ra-${a.id}`} value={`ra-${a.id}`} onSelect={() => runAction(a)} className="gap-3">
                        <Clock className="size-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{a.label}</span>
                        <button onClick={(e) => onPin(e, a)} className="text-muted-foreground hover:text-accent">
                          {pinnedIds.has(a.id) ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                        </button>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {recents.length > 0 && (
                  <CommandGroup heading="Recent searches">
                    {recents.slice(0, 5).map((t) => (
                      <CommandItem key={`rs-${t}`} value={`rs-${t}`} onSelect={() => setQuery(t)} className="gap-3">
                        <Search className="size-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{t}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}

            {/* DB search results grouped */}
            {grouped.map(([group, arr]) => (
              <CommandGroup key={group} heading={group}>
                {arr.map((r) => (
                  <CommandItem key={r.id} value={r.id} onSelect={() => runSearchResult(r)} className="gap-3">
                    <Icon name={r.icon} className="size-4 text-muted-foreground" />
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="truncate text-sm">{r.title}</span>
                      {r.subtitle && <span className="truncate text-[11px] text-muted-foreground">{r.subtitle}</span>}
                    </span>
                    <button onClick={(e) => onPin(e, { id: r.id, label: r.title, to: r.to, icon: r.icon })} className="text-muted-foreground hover:text-accent">
                      {pinnedIds.has(r.id) ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {(grouped.length > 0 || nlAction) && filteredActions.length > 0 && <CommandSeparator />}

            {/* Quick actions */}
            {filteredActions.length > 0 && (
              <CommandGroup heading="Quick actions">
                {filteredActions.map((a) => (
                  <CommandItem key={a.id} value={a.id} onSelect={() => runAction(a)} className="gap-3">
                    <Icon name={a.icon} className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{a.label}</span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">{a.group}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span className="flex items-center gap-1.5"><Sparkles className="size-3 text-accent" /> Command Center</span>
            <span className="hidden sm:flex items-center gap-2">
              <kbd className="rounded bg-muted px-1.5 py-0.5">↑↓</kbd> navigate
              <kbd className="rounded bg-muted px-1.5 py-0.5">↵</kbd> open
              <kbd className="rounded bg-muted px-1.5 py-0.5">esc</kbd> close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
