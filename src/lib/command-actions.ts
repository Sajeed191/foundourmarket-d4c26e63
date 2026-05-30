import type { CommandGroup, Role } from "@/lib/command-search";

export type QuickAction = {
  id: string;
  group: CommandGroup;
  icon: string;
  label: string;
  /** route to navigate to */
  to: string;
  roles: Role[];
  keywords?: string;
  /** audit action name */
  action: string;
};

const PRODUCT_ADMIN: Role[] = ["admin", "super_admin"];
const MANAGER: Role[] = ["admin", "super_admin", "manager"];
const EDITOR: Role[] = ["admin", "super_admin", "manager", "editor"];
const SUPPORT: Role[] = ["admin", "super_admin", "manager", "support"];
const WAREHOUSE: Role[] = ["admin", "super_admin", "manager", "warehouse_staff"];

export const QUICK_ACTIONS: QuickAction[] = [
  // Products
  { id: "qa-create-product", group: "Products", icon: "PackagePlus", label: "Create product", to: "/admin-products?new=1", roles: PRODUCT_ADMIN, action: "cmd_create_product", keywords: "add new product" },
  { id: "qa-manage-products", group: "Products", icon: "Package", label: "Manage products", to: "/admin-products", roles: PRODUCT_ADMIN, action: "cmd_open_products" },
  { id: "qa-adjust-pricing", group: "Products", icon: "Tag", label: "Update pricing", to: "/admin-products?view=pricing", roles: MANAGER, action: "cmd_pricing", keywords: "price" },
  // Orders
  { id: "qa-orders", group: "Orders", icon: "ShoppingBag", label: "Open orders", to: "/admin-shipments", roles: SUPPORT, action: "cmd_open_orders" },
  { id: "qa-todays-orders", group: "Orders", icon: "ShoppingBag", label: "Today's orders", to: "/admin-shipments?range=today", roles: SUPPORT, action: "cmd_today_orders", keywords: "recent today orders" },
  { id: "qa-returns", group: "Orders", icon: "RotateCcw", label: "Refunds & returns", to: "/admin-returns", roles: SUPPORT, action: "cmd_open_returns", keywords: "refund return rma" },
  // Customers
  { id: "qa-customers", group: "Customers", icon: "Users", label: "Open customers", to: "/admin-customers", roles: SUPPORT, action: "cmd_open_customers" },
  { id: "qa-cust-intel", group: "Customers", icon: "Gem", label: "Customer intelligence", to: "/admin-customer-intelligence", roles: SUPPORT, action: "cmd_cust_intel", keywords: "customer insights intelligence rfm segment churn loyal value analytics" },
  { id: "qa-cust-vip", group: "Customers", icon: "Crown", label: "VIP customers", to: "/admin-customer-intelligence?view=vip", roles: SUPPORT, action: "cmd_cust_vip", keywords: "vip top spenders best customers high value" },
  { id: "qa-cust-risk", group: "Customers", icon: "AlertTriangle", label: "At-risk customers", to: "/admin-customer-intelligence?view=risk", roles: SUPPORT, action: "cmd_cust_risk", keywords: "churn at risk leaving lost win back" },
  { id: "qa-cust-new", group: "Customers", icon: "UserPlus", label: "New customers", to: "/admin-customer-intelligence?view=new", roles: SUPPORT, action: "cmd_cust_new", keywords: "new recent signups fresh" },
  { id: "qa-cust-highvalue", group: "Customers", icon: "Gem", label: "High value customers", to: "/admin-customer-intelligence?view=high-value", roles: SUPPORT, action: "cmd_cust_highvalue", keywords: "high value big spenders ltv lifetime" },
  { id: "qa-cust-alerts", group: "Customers", icon: "Bell", label: "Customer alerts", to: "/admin-customer-intelligence?view=alerts", roles: SUPPORT, action: "cmd_cust_alerts", keywords: "customer alerts churn vip order refund" },
  { id: "qa-cust-recs", group: "Customers", icon: "Lightbulb", label: "Customer recommendations", to: "/admin-customer-intelligence?view=recommendations", roles: SUPPORT, action: "cmd_cust_recs", keywords: "recommendations promote winback suggestions" },
  // Inventory
  { id: "qa-inv-intel", group: "Inventory", icon: "Cpu", label: "Inventory intelligence", to: "/admin-inventory-intelligence", roles: WAREHOUSE, action: "cmd_inv_intel", keywords: "forecast risk predict" },
  { id: "qa-inv-risk", group: "Inventory", icon: "AlertTriangle", label: "View risk products", to: "/admin-inventory-intelligence?view=risk", roles: WAREHOUSE, action: "cmd_inv_risk", keywords: "low stock out of stock risk" },
  { id: "qa-inventory", group: "Inventory", icon: "Boxes", label: "Adjust stock", to: "/admin-inventory", roles: WAREHOUSE, action: "cmd_inventory", keywords: "stock quantity" },
  // Content / CMS
  { id: "qa-create-banner", group: "Content", icon: "Image", label: "Create banner", to: "/admin-cms?new=banner", roles: EDITOR, action: "cmd_create_banner" },
  { id: "qa-create-announcement", group: "Content", icon: "Megaphone", label: "Create announcement", to: "/admin-marketing?new=announcement", roles: EDITOR, action: "cmd_create_announcement" },
  { id: "qa-create-block", group: "Content", icon: "LayoutTemplate", label: "Create homepage block", to: "/builder", roles: EDITOR, action: "cmd_create_block", keywords: "storefront builder section" },
  { id: "qa-cms", group: "Content", icon: "Pencil", label: "Open CMS", to: "/admin-cms", roles: EDITOR, action: "cmd_open_cms" },
  // Support
  { id: "qa-support", group: "Support", icon: "LifeBuoy", label: "Open support tickets", to: "/admin-support", roles: SUPPORT, action: "cmd_open_support" },
  { id: "qa-support-unresolved", group: "Support", icon: "LifeBuoy", label: "Unresolved tickets", to: "/admin-support?status=open", roles: SUPPORT, action: "cmd_support_unresolved", keywords: "open pending tickets" },
  // Marketing
  { id: "qa-marketing", group: "Marketing", icon: "Megaphone", label: "Promotions", to: "/admin-marketing", roles: EDITOR, action: "cmd_open_marketing" },
  { id: "qa-flash-sale", group: "Marketing", icon: "Zap", label: "Launch flash sale", to: "/admin-marketing?new=flash", roles: MANAGER, action: "cmd_flash_sale", keywords: "discount sale" },
  // System
  { id: "qa-analytics", group: "System", icon: "BarChart3", label: "Analytics", to: "/admin-analytics", roles: ["admin", "super_admin", "manager", "support", "editor", "fulfillment", "warehouse_staff"], action: "cmd_analytics" },
  { id: "qa-financial", group: "System", icon: "Wallet", label: "Financial dashboard", to: "/admin-financial", roles: MANAGER, action: "cmd_financial", keywords: "revenue money" },
  { id: "qa-activity", group: "System", icon: "Activity", label: "Activity log", to: "/admin-activity", roles: ["admin", "super_admin"], action: "cmd_activity_log", keywords: "audit" },
  { id: "qa-dashboard", group: "System", icon: "LayoutDashboard", label: "Dashboard", to: "/admin", roles: ["admin", "super_admin", "manager", "support", "editor", "fulfillment", "warehouse_staff"], action: "cmd_dashboard" },
];

export function actionsForRoles(roles: Set<Role>): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => a.roles.some((r) => roles.has(r)));
}

/**
 * Lightweight natural-language interpreter. Maps free-form phrases like
 * "find products low on stock" or "show today's orders" to a matching
 * quick action. Returns the action id, or null when no confident match.
 */
export function interpretNaturalLanguage(q: string): string | null {
  const s = q.toLowerCase();
  const test = (...kw: string[]) => kw.every((k) => s.includes(k)) || kw.some((k) => s.includes(k) && kw.length === 1);
  if ((s.includes("low") || s.includes("risk") || s.includes("run out")) && (s.includes("stock") || s.includes("product") || s.includes("inventory")))
    return "qa-inv-risk";
  if (s.includes("today") && s.includes("order")) return "qa-todays-orders";
  if (s.includes("unresolved") || (s.includes("open") && s.includes("ticket")) || (s.includes("support") && s.includes("ticket")))
    return "qa-support-unresolved";
  if (s.includes("highest") && (s.includes("revenue") || s.includes("selling"))) return "qa-financial";
  if ((s.includes("create") || s.includes("new") || s.includes("make")) && s.includes("banner")) return "qa-create-banner";
  if ((s.includes("create") || s.includes("new")) && s.includes("announcement")) return "qa-create-announcement";
  if ((s.includes("create") || s.includes("new") || s.includes("launch")) && (s.includes("flash") || s.includes("sale"))) return "qa-flash-sale";
  if ((s.includes("create") || s.includes("new") || s.includes("add")) && s.includes("product")) return "qa-create-product";
  if (s.includes("forecast") || s.includes("predict")) return "qa-inv-intel";
  if (s.includes("vip")) return "qa-cust-vip";
  if (s.includes("churn") || (s.includes("at risk") && s.includes("customer")) || s.includes("at-risk")) return "qa-cust-risk";
  if ((s.includes("high value") || s.includes("high-value") || s.includes("big spender")) && !s.includes("product")) return "qa-cust-highvalue";
  if (s.includes("new customer")) return "qa-cust-new";
  if (s.includes("loyal") || s.includes("customer insight") || s.includes("customer intelligence")) return "qa-cust-intel";
  if (s.includes("refund") || s.includes("return")) return "qa-returns";
  if (test("revenue") || test("financial") || test("money")) return "qa-financial";
  return null;
}
