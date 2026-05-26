import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ShoppingBag, Package, Users, BarChart3, Megaphone,
  FileText, Truck, RotateCcw, Pencil, Activity, Wallet, Globe, Search,
  Boxes, Loader2, ShieldAlert, Menu, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Role = "admin" | "super_admin" | "manager" | "support" | "fulfillment" | "warehouse_staff" | "editor";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin-analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin-financial", label: "Financial", icon: Wallet, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-traffic", label: "Traffic", icon: Globe, roles: ["admin", "super_admin", "manager"] },
    ],
  },
  {
    group: "Operations",
    items: [
      { to: "/admin-shipments", label: "Shipments", icon: Truck, roles: ["admin", "super_admin", "manager", "fulfillment", "warehouse_staff"] },
      { to: "/admin-returns", label: "Returns", icon: RotateCcw, roles: ["admin", "super_admin", "manager", "support"] },
      { to: "/admin-inventory", label: "Inventory", icon: Boxes, roles: ["admin", "super_admin", "manager", "warehouse_staff"] },
    ],
  },
  {
    group: "Customers",
    items: [
      { to: "/admin-customers", label: "Customers", icon: Users, roles: ["admin", "super_admin", "manager", "support"] },
    ],
  },
  {
    group: "Catalog",
    items: [
      { to: "/admin?tab=products", label: "Products", icon: Package },
      { to: "/admin?tab=categories", label: "Categories", icon: Boxes },
    ],
  },
  {
    group: "Marketing",
    items: [
      { to: "/admin-marketing", label: "Promotions", icon: Megaphone, roles: ["admin", "super_admin", "manager", "editor"] },
      { to: "/admin-search", label: "Search trends", icon: Search, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin?tab=subscribers", label: "Subscribers", icon: ShoppingBag },
    ],
  },
  {
    group: "Content",
    items: [
      { to: "/admin-cms", label: "CMS", icon: Pencil, roles: ["admin", "super_admin", "editor"] },
    ],
  },
  {
    group: "Insights",
    items: [
      { to: "/admin-reports", label: "Reports", icon: FileText, roles: ["admin", "super_admin", "manager"] },
      { to: "/admin-activity", label: "Activity log", icon: Activity, roles: ["admin", "super_admin"] },
    ],
  },
];

export function useAdminRoles() {
  const { user, loading } = useAuth();
  const [roles, setRoles] = useState<Role[] | null>(null);
  useEffect(() => {
    if (!user) { setRoles(null); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .then(({ data }) => setRoles((data?.map((r) => r.role as Role)) ?? []));
  }, [user]);
  return { user, loading, roles };
}

export function AdminShell({
  title, subtitle, actions, children, allow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  allow?: Role[];
}) {
  const { user, loading, roles } = useAdminRoles();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);
  useEffect(() => { setOpen(false); }, [path]);

  if (loading || roles === null) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const allowedDefault: Role[] = ["admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff", "editor"];
  const required = allow ?? allowedDefault;
  const hasAccess = roles.some((r) => required.includes(r));

  if (!hasAccess) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6">
        <div className="text-center max-w-md">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <ShieldAlert className="size-5 text-accent" />
          </div>
          <h1 className="text-2xl font-display font-semibold mb-2">Access restricted</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Signed in as <span className="text-foreground">{user?.email}</span>. You need one of: {required.join(", ")}.
          </p>
          <code className="block text-left text-[11px] bg-card border border-border rounded-xl p-4 font-mono text-muted-foreground overflow-x-auto">
            insert into user_roles (user_id, role) values ('{user?.id}', 'admin');
          </code>
          <Link to="/" className="inline-block mt-6 text-xs uppercase tracking-widest text-accent">← Back to shop</Link>
        </div>
      </div>
    );
  }

  function isActive(to: string) {
    const [base] = to.split("?");
    return path === base;
  }

  function visibleItem(it: NavItem) {
    if (!it.roles) return true;
    return roles!.some((r) => it.roles!.includes(r));
  }

  return (
    <div className="min-h-screen flex w-full">
      {/* Sidebar */}
      <aside className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transform transition-transform lg:transform-none ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} h-screen overflow-y-auto`}>
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <Link to="/" className="font-display text-base tracking-tight">FoundOurMarket™</Link>
          <button onClick={() => setOpen(false)} className="lg:hidden size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <nav className="px-3 py-4 space-y-6">
          {NAV.map((g) => {
            const items = g.items.filter(visibleItem);
            if (!items.length) return null;
            return (
              <div key={g.group}>
                <p className="px-3 mb-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{g.group}</p>
                <ul className="space-y-0.5">
                  {items.map((it) => {
                    const active = isActive(it.to);
                    return (
                      <li key={it.to}>
                        <Link
                          to={it.to as string}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            active ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.03]"
                          }`}
                        >
                          <it.icon className="size-4 shrink-0" />
                          <span className="truncate">{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="px-5 py-4 mt-2 border-t border-border">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Signed in</p>
          <p className="text-xs truncate">{user?.email}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {roles.map((r) => (
              <span key={r} className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent/10 text-accent">{r}</span>
            ))}
          </div>
        </div>
      </aside>

      {open && <button onClick={() => setOpen(false)} className="lg:hidden fixed inset-0 z-30 bg-black/60" aria-label="Close menu" />}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="px-5 lg:px-10 h-14 flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="lg:hidden size-9 grid place-items-center rounded-full hover:bg-white/5 border border-border"><Menu className="size-4" /></button>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Operator</p>
              <h1 className="text-base md:text-lg font-display font-semibold truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">{actions}</div>
          </div>
          {subtitle && <p className="px-5 lg:px-10 pb-3 text-xs text-muted-foreground">{subtitle}</p>}
        </header>
        <main className="flex-1 px-5 lg:px-10 py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function logActivity(action: string, entity_type?: string, entity_id?: string, metadata?: Record<string, unknown>) {
  supabase.from("admin_activity_logs").insert({
    action,
    entity_type: entity_type ?? null,
    entity_id: entity_id ?? null,
    metadata: (metadata ?? {}) as never,
  }).then(() => {}, () => {});
}
