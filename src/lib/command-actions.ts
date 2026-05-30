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
  // Customer ↔ Marketing Integration
  { id: "qa-cust-marketing", group: "Customers", icon: "Megaphone", label: "Customer marketing", to: "/admin-customer-intelligence?view=marketing", roles: EDITOR, action: "cmd_cust_marketing", keywords: "customer marketing targeting audiences segments campaign audience engine" },
  { id: "qa-cust-audiences", group: "Customers", icon: "Users", label: "Audience analytics", to: "/admin-customer-intelligence?view=audiences", roles: EDITOR, action: "cmd_cust_audiences", keywords: "audience analytics audiences segments revenue profit growth retention reachable" },
  { id: "qa-cust-scores", group: "Customers", icon: "Gauge", label: "Customer marketing scores", to: "/admin-customer-intelligence?view=marketing", roles: EDITOR, action: "cmd_cust_scores", keywords: "customer marketing scores loyalty retention engagement spend churn referral" },
  { id: "qa-aud-vip", group: "Customers", icon: "Crown", label: "Show VIP audience", to: "/admin-customer-intelligence?view=vip", roles: EDITOR, action: "cmd_aud_vip", keywords: "vip audience top spenders best customers segment" },
  { id: "qa-aud-loyal", group: "Customers", icon: "Repeat", label: "Show loyal audience", to: "/admin-customer-intelligence?view=loyal", roles: EDITOR, action: "cmd_aud_loyal", keywords: "loyal customers repeat buyers audience segment" },
  { id: "qa-aud-atrisk", group: "Customers", icon: "AlertTriangle", label: "Show at-risk audience", to: "/admin-customer-intelligence?view=atrisk", roles: EDITOR, action: "cmd_aud_atrisk", keywords: "at risk churn audience leaving win back segment" },
  { id: "qa-aud-dormant", group: "Customers", icon: "Moon", label: "Show dormant audience", to: "/admin-customer-intelligence?view=dormant", roles: EDITOR, action: "cmd_aud_dormant", keywords: "dormant lapsed inactive audience reactivate segment" },
  { id: "qa-aud-highvalue", group: "Customers", icon: "Gem", label: "Show high-value audience", to: "/admin-customer-intelligence?view=highvalue", roles: EDITOR, action: "cmd_aud_highvalue", keywords: "high value big spenders ltv audience segment" },
  { id: "qa-cust-vip-campaign", group: "Customers", icon: "Crown", label: "Create VIP campaign", to: "/admin-customer-intelligence?view=vip", roles: EDITOR, action: "cmd_cust_vip_campaign", keywords: "create vip campaign reward audience" },
  { id: "qa-cust-loyalty-campaign", group: "Customers", icon: "Heart", label: "Create loyalty campaign", to: "/admin-customer-intelligence?view=loyal", roles: EDITOR, action: "cmd_cust_loyalty_campaign", keywords: "create loyalty campaign loyal repeat audience" },
  { id: "qa-cust-winback-campaign", group: "Customers", icon: "RotateCcw", label: "Create winback campaign", to: "/admin-customer-intelligence?view=atrisk", roles: EDITOR, action: "cmd_cust_winback_campaign", keywords: "create winback campaign at risk churn audience" },
  { id: "qa-cust-retention-campaign", group: "Customers", icon: "Gem", label: "Create retention campaign", to: "/admin-customer-intelligence?view=highvalue", roles: EDITOR, action: "cmd_cust_retention_campaign", keywords: "create retention campaign high value protect audience" },
  { id: "qa-cust-reactivation-campaign", group: "Customers", icon: "Moon", label: "Create reactivation campaign", to: "/admin-customer-intelligence?view=dormant", roles: EDITOR, action: "cmd_cust_reactivation_campaign", keywords: "create reactivation campaign dormant lapsed revive audience" },
  // Inventory
  { id: "qa-inv-intel", group: "Inventory", icon: "Cpu", label: "Inventory intelligence", to: "/admin-inventory-intelligence", roles: WAREHOUSE, action: "cmd_inv_intel", keywords: "forecast risk predict" },
  { id: "qa-inv-risk", group: "Inventory", icon: "AlertTriangle", label: "View risk products", to: "/admin-inventory-intelligence?view=risk", roles: WAREHOUSE, action: "cmd_inv_risk", keywords: "low stock out of stock risk" },
  { id: "qa-inventory", group: "Inventory", icon: "Boxes", label: "Adjust stock", to: "/admin-inventory", roles: WAREHOUSE, action: "cmd_inventory", keywords: "stock quantity" },
  { id: "qa-inv-opps", group: "Inventory", icon: "Megaphone", label: "Inventory marketing opportunities", to: "/admin-inventory-intelligence?view=opportunities", roles: MANAGER, action: "cmd_inv_opps", keywords: "inventory marketing opportunities clearance overstock bestseller promote score" },
  { id: "qa-inv-clearance", group: "Inventory", icon: "ArrowDownRight", label: "Create clearance campaign", to: "/admin-inventory-intelligence?view=opportunities", roles: MANAGER, action: "cmd_inv_clearance", keywords: "clearance dead inventory discount campaign clear stock" },
  { id: "qa-inv-overstock", group: "Inventory", icon: "Layers", label: "Create overstock campaign", to: "/admin-inventory-intelligence?view=opportunities", roles: MANAGER, action: "cmd_inv_overstock", keywords: "overstock excess inventory bundle campaign" },
  { id: "qa-inv-back", group: "Inventory", icon: "Rocket", label: "Create back-in-stock campaign", to: "/admin-inventory-intelligence?view=opportunities", roles: MANAGER, action: "cmd_inv_back", keywords: "back in stock restock waitlist campaign" },
  { id: "qa-inv-score", group: "Inventory", icon: "Gauge", label: "Inventory marketing score", to: "/admin-inventory-intelligence?view=opportunities", roles: MANAGER, action: "cmd_inv_score", keywords: "inventory marketing score promotion clearance demand velocity margin" },
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
  { id: "qa-mkt-auto", group: "Marketing", icon: "Zap", label: "Marketing automation", to: "/admin-marketing-automation", roles: EDITOR, action: "cmd_mkt_auto", keywords: "automation campaign roi engine" },
  { id: "qa-mkt-create", group: "Marketing", icon: "Rocket", label: "Create campaign", to: "/admin-marketing-automation?action=create", roles: EDITOR, action: "cmd_mkt_create", keywords: "new campaign promotion launch" },
  { id: "qa-mkt-vip", group: "Marketing", icon: "Crown", label: "Create VIP campaign", to: "/admin-marketing-automation?action=create&template=vip_rewards", roles: EDITOR, action: "cmd_mkt_vip", keywords: "vip rewards campaign" },
  { id: "qa-mkt-clearance", group: "Marketing", icon: "Boxes", label: "Create clearance campaign", to: "/admin-marketing-automation?action=create&template=clearance", roles: EDITOR, action: "cmd_mkt_clearance", keywords: "clearance discount inventory sale" },
  { id: "qa-mkt-winback", group: "Marketing", icon: "Users", label: "Create winback campaign", to: "/admin-marketing-automation?action=create&template=winback", roles: EDITOR, action: "cmd_mkt_winback", keywords: "winback re-engage dormant lapsed" },
  { id: "qa-mkt-lowstock", group: "Marketing", icon: "AlertTriangle", label: "Create low-stock campaign", to: "/admin-marketing-automation?action=create&template=low_stock", roles: EDITOR, action: "cmd_mkt_lowstock", keywords: "low stock inventory clearance reorder campaign" },
  { id: "qa-mkt-roi", group: "Marketing", icon: "BarChart3", label: "Show campaign ROI", to: "/admin-marketing-automation?action=analytics", roles: EDITOR, action: "cmd_mkt_roi", keywords: "campaign roi return profit revenue performance" },
  { id: "qa-mkt-alerts", group: "Marketing", icon: "AlertTriangle", label: "Show campaign alerts", to: "/admin-marketing-automation?action=analytics", roles: EDITOR, action: "cmd_mkt_alerts", keywords: "campaign alerts underperforming overperforming warning" },
  { id: "qa-mkt-top", group: "Marketing", icon: "Rocket", label: "Show top campaigns", to: "/admin-marketing-automation?action=analytics", roles: EDITOR, action: "cmd_mkt_top", keywords: "top best campaigns performance leaderboard" },
  { id: "qa-mkt-health", group: "Marketing", icon: "Activity", label: "Automation health", to: "/admin-marketing-automation?tab=automations", roles: EDITOR, action: "cmd_mkt_health", keywords: "automation health rules status active" },
  { id: "qa-mkt-analytics", group: "Marketing", icon: "BarChart3", label: "Campaign analytics", to: "/admin-marketing-automation?action=analytics", roles: EDITOR, action: "cmd_mkt_analytics", keywords: "campaign analytics roi performance revenue" },
  // Acquisition Intelligence (P2-B)
  { id: "qa-acq-open", group: "Marketing", icon: "Target", label: "Open Acquisition Intelligence", to: "/admin-acquisition-intelligence", roles: EDITOR, action: "cmd_acq_open", keywords: "acquisition intelligence cac roas cpa attribution channel source customer acquisition cost return on ad spend" },
  { id: "qa-seo-open", group: "Marketing", icon: "Search", label: "Open SEO Intelligence", to: "/admin-seo-intelligence", roles: EDITOR, action: "cmd_seo_open", keywords: "seo search console rankings keywords metadata broken links sitemap ctr organic traffic index coverage revenue per keyword" },
  { id: "qa-acq-cac", group: "Marketing", icon: "DollarSign", label: "Show CAC", to: "/admin-acquisition-intelligence", roles: EDITOR, action: "cmd_acq_cac", keywords: "cac customer acquisition cost how much to acquire customer spend per customer" },
  { id: "qa-acq-roas", group: "Marketing", icon: "TrendingUp", label: "Show ROAS", to: "/admin-acquisition-intelligence", roles: EDITOR, action: "cmd_acq_roas", keywords: "roas return on ad spend revenue per spend ad efficiency" },
  { id: "qa-acq-attribution", group: "Marketing", icon: "GitBranch", label: "Show Attribution", to: "/admin-acquisition-intelligence?view=attribution", roles: EDITOR, action: "cmd_acq_attr", keywords: "attribution first touch last touch linear time decay multi touch model comparison" },
  { id: "qa-acq-best", group: "Marketing", icon: "Rocket", label: "Best Campaigns", to: "/admin-acquisition-intelligence?view=opportunities", roles: EDITOR, action: "cmd_acq_best", keywords: "best campaigns top roas winners scale highest return" },
  { id: "qa-acq-worst", group: "Marketing", icon: "TrendingDown", label: "Worst Campaigns", to: "/admin-acquisition-intelligence?view=opportunities", roles: EDITOR, action: "cmd_acq_worst", keywords: "worst campaigns low roas losing money pause underperforming" },
  { id: "qa-acq-opps", group: "Marketing", icon: "Lightbulb", label: "Acquisition Opportunities", to: "/admin-acquisition-intelligence?view=opportunities", roles: EDITOR, action: "cmd_acq_opps", keywords: "acquisition opportunities recommendations hidden winners high spend low return cac sources growing declining channels" },
  // Product ↔ Marketing
  { id: "qa-prod-marketing", group: "Marketing", icon: "Megaphone", label: "Product marketing", to: "/admin-products?view=marketing", roles: EDITOR, action: "cmd_prod_marketing", keywords: "product marketing campaign promote feature flash sale product analytics" },
  { id: "qa-prod-promote", group: "Marketing", icon: "Rocket", label: "Launch promotion for product", to: "/admin-products?view=marketing", roles: EDITOR, action: "cmd_prod_promote", keywords: "launch promotion product promote campaign" },
  { id: "qa-prod-campaigns", group: "Marketing", icon: "Target", label: "Show product campaigns", to: "/admin-products?view=marketing", roles: EDITOR, action: "cmd_prod_campaigns", keywords: "product campaigns which campaigns use product marketing" },
  { id: "qa-prod-feature", group: "Marketing", icon: "Star", label: "Feature product", to: "/admin-products?view=marketing", roles: EDITOR, action: "cmd_prod_feature", keywords: "feature product homepage featured spotlight" },
  // System
  { id: "qa-analytics", group: "System", icon: "BarChart3", label: "Analytics", to: "/admin-analytics", roles: ["admin", "super_admin", "manager", "support", "editor", "fulfillment", "warehouse_staff"], action: "cmd_analytics" },
  { id: "qa-financial", group: "System", icon: "Wallet", label: "Financial dashboard", to: "/admin-financial", roles: MANAGER, action: "cmd_financial", keywords: "revenue money" },
  // Financial ↔ Marketing Integration
  { id: "qa-fin-marketing", group: "System", icon: "Megaphone", label: "Open Financial Marketing", to: "/admin-financial?view=marketing", roles: MANAGER, action: "cmd_fin_marketing", keywords: "financial marketing profit driven roi roas margin efficiency campaign profitability" },
  { id: "qa-fin-profit", group: "System", icon: "Wallet", label: "Show Profit Intelligence", to: "/admin-financial?view=profit", roles: MANAGER, action: "cmd_fin_profit", keywords: "profit intelligence net contribution margin analytics marketing profit" },
  { id: "qa-fin-campaigns", group: "System", icon: "BarChart3", label: "Show Campaign Profitability", to: "/admin-financial?view=campaigns", roles: MANAGER, action: "cmd_fin_campaigns", keywords: "campaign profitability roi roas margin profit per campaign" },
  { id: "qa-fin-products", group: "System", icon: "Boxes", label: "Show Product Profitability", to: "/admin-financial?view=products", roles: MANAGER, action: "cmd_fin_products", keywords: "product profitability highest lowest margin profit contribution" },
  { id: "qa-fin-customers", group: "System", icon: "Users", label: "Show Customer Profitability", to: "/admin-financial?view=customers", roles: MANAGER, action: "cmd_fin_customers", keywords: "customer profitability vip profitable segments profit contribution" },
  { id: "qa-fin-regions", group: "System", icon: "Activity", label: "Show Regional Profitability", to: "/admin-financial?view=regions", roles: MANAGER, action: "cmd_fin_regions", keywords: "regional profitability region margin roi india international" },
  { id: "qa-fin-margin-risk", group: "System", icon: "AlertTriangle", label: "Show Margin Risks", to: "/admin-financial?view=alerts", roles: MANAGER, action: "cmd_fin_margin_risk", keywords: "margin risk collapse negative margin analysis alerts" },
  { id: "qa-fin-roi-alerts", group: "System", icon: "AlertTriangle", label: "Show ROI Alerts", to: "/admin-financial?view=alerts", roles: MANAGER, action: "cmd_fin_roi_alerts", keywords: "roi alerts negative roi campaign loss profit alerts" },
  { id: "qa-fin-opportunities", group: "System", icon: "Lightbulb", label: "Show Profit Opportunities", to: "/admin-financial?view=recommendations", roles: MANAGER, action: "cmd_fin_opportunities", keywords: "profit opportunities recommendations scale winners feature high margin" },
  { id: "qa-fin-executive", group: "System", icon: "Crown", label: "Show Executive Summary", to: "/admin-financial?view=profit", roles: MANAGER, action: "cmd_fin_executive", keywords: "executive summary overview revenue profit margin roi top product customer campaign risk opportunity kpi" },
  { id: "qa-fin-top-campaigns", group: "System", icon: "Megaphone", label: "Show Top Campaigns", to: "/admin-financial?view=campaigns", roles: MANAGER, action: "cmd_fin_top_campaigns", keywords: "top campaigns best performing winner roi roas profit" },
  { id: "qa-fin-top-products", group: "System", icon: "Boxes", label: "Show Top Products", to: "/admin-financial?view=products", roles: MANAGER, action: "cmd_fin_top_products", keywords: "top products most profitable highest margin best sellers profit" },
  { id: "qa-fin-top-customers", group: "System", icon: "Users", label: "Show Top Customers", to: "/admin-financial?view=customers", roles: MANAGER, action: "cmd_fin_top_customers", keywords: "top customers most profitable vip segments profit contribution" },
  { id: "qa-fin-scale", group: "System", icon: "BarChart3", label: "Scale Winning Campaign", to: "/admin-financial?view=campaigns", roles: MANAGER, action: "cmd_fin_scale", keywords: "scale winning campaign increase budget roi profit" },
  { id: "qa-fin-pause", group: "System", icon: "AlertTriangle", label: "Pause Losing Campaign", to: "/admin-financial?view=campaigns", roles: MANAGER, action: "cmd_fin_pause", keywords: "pause losing campaign negative roi stop budget" },
  { id: "qa-fin-launch", group: "System", icon: "Megaphone", label: "Launch Profit Campaign", to: "/admin-financial?view=recommendations", roles: MANAGER, action: "cmd_fin_launch", keywords: "launch profit campaign high margin vip retention" },
  // Executive Business Intelligence
  { id: "qa-exec-open", group: "System", icon: "Crown", label: "Open Executive Dashboard", to: "/admin-executive", roles: MANAGER, action: "cmd_exec_open", keywords: "executive dashboard ceo owner board business intelligence overview command center" },
  { id: "qa-exec-health", group: "System", icon: "HeartPulse", label: "Show Business Health", to: "/admin-executive?view=health", roles: MANAGER, action: "cmd_exec_health", keywords: "business health company health score risk band overall" },
  { id: "qa-exec-risks", group: "System", icon: "AlertTriangle", label: "Show Executive Risks", to: "/admin-executive?view=risks", roles: MANAGER, action: "cmd_exec_risks", keywords: "executive business risks critical threats margin collapse churn crisis" },
  { id: "qa-exec-opportunities", group: "System", icon: "Sparkles", label: "Show Executive Opportunities", to: "/admin-executive?view=opportunities", roles: MANAGER, action: "cmd_exec_opportunities", keywords: "executive business opportunities growth scale winners revenue upside" },
  { id: "qa-exec-insights", group: "System", icon: "Lightbulb", label: "Show Executive Insights", to: "/admin-executive?view=insights", roles: MANAGER, action: "cmd_exec_insights", keywords: "executive ai insights what happened why what to do confidence" },
  { id: "qa-exec-profit", group: "System", icon: "TrendingUp", label: "Show Profit Drivers", to: "/admin-executive?view=profit", roles: MANAGER, action: "cmd_exec_profit", keywords: "profit drivers top products categories campaigns segments regions" },
  { id: "qa-exec-loss", group: "System", icon: "TrendingDown", label: "Show Loss Drivers", to: "/admin-executive?view=loss", roles: MANAGER, action: "cmd_exec_loss", keywords: "loss drivers worst products campaigns refund support inventory loss" },
  { id: "qa-exec-regions", group: "System", icon: "Globe", label: "Show Regional Intelligence", to: "/admin-executive?view=regions", roles: MANAGER, action: "cmd_exec_regions", keywords: "regional intelligence region revenue profit margin geography zones" },
  { id: "qa-exec-timeline", group: "System", icon: "Activity", label: "Show Executive Timeline", to: "/admin-executive?view=timeline", roles: MANAGER, action: "cmd_exec_timeline", keywords: "executive timeline events orders returns admin activity feed" },
  { id: "qa-exec-snapshot", group: "System", icon: "Gauge", label: "Show Business Snapshot", to: "/admin-executive?view=snapshot", roles: MANAGER, action: "cmd_exec_snapshot", keywords: "business snapshot today revenue profit orders new customers refunds" },
  // AI Commerce Operations Assistant
  { id: "qa-ai-open", group: "System", icon: "Sparkles", label: "Open AI Operations", to: "/admin-ai-operations", roles: MANAGER, action: "cmd_ai_open", keywords: "ai operations assistant commerce recommendations business recommendations operational layer" },
  { id: "qa-ai-critical", group: "System", icon: "AlertTriangle", label: "Show Critical Actions", to: "/admin-ai-operations?view=critical", roles: MANAGER, action: "cmd_ai_critical", keywords: "ai critical actions urgent must do priority emergency" },
  { id: "qa-ai-risks", group: "System", icon: "AlertTriangle", label: "Show AI Risks", to: "/admin-ai-operations?view=risks", roles: MANAGER, action: "cmd_ai_risks", keywords: "ai risks alerts threats warnings problems" },
  { id: "qa-ai-opportunities", group: "System", icon: "Sparkles", label: "Show AI Opportunities", to: "/admin-ai-operations?view=opportunities", roles: MANAGER, action: "cmd_ai_opportunities", keywords: "ai opportunities profit growth upside recommendations" },
  { id: "qa-ai-profit", group: "System", icon: "TrendingUp", label: "Show Profit Opportunities", to: "/admin-ai-operations?view=profit", roles: MANAGER, action: "cmd_ai_profit", keywords: "ai profit opportunities margin high margin scale winners" },
  { id: "qa-ai-growth", group: "System", icon: "Sparkles", label: "Show Growth Opportunities", to: "/admin-ai-operations?view=growth", roles: MANAGER, action: "cmd_ai_growth", keywords: "ai growth opportunities scale spend expand revenue" },
  { id: "qa-ai-briefing", group: "System", icon: "FileText", label: "Generate Executive Briefing", to: "/admin-ai-operations?view=briefing", roles: MANAGER, action: "cmd_ai_briefing", keywords: "executive daily briefing summary what happened changed" },
  { id: "qa-ai-weekly", group: "System", icon: "Activity", label: "Generate Weekly Report", to: "/admin-ai-operations?view=weekly", roles: MANAGER, action: "cmd_ai_weekly", keywords: "weekly report executive growth profit customer inventory marketing" },
  { id: "qa-ai-inventory", group: "System", icon: "Boxes", label: "Show Inventory Recommendations", to: "/admin-ai-operations?view=assistants", roles: MANAGER, action: "cmd_ai_inventory", keywords: "ai inventory recommendations restock clearance overstock assistant" },
  { id: "qa-ai-customer", group: "System", icon: "Users", label: "Show Customer Recommendations", to: "/admin-ai-operations?view=assistants", roles: MANAGER, action: "cmd_ai_customer", keywords: "ai customer recommendations churn vip retention assistant" },
  { id: "qa-ai-marketing", group: "System", icon: "Megaphone", label: "Show Marketing Recommendations", to: "/admin-ai-operations?view=assistants", roles: MANAGER, action: "cmd_ai_marketing", keywords: "ai marketing recommendations campaign scale pause assistant" },
  { id: "qa-ai-financial", group: "System", icon: "Wallet", label: "Show Financial Recommendations", to: "/admin-ai-operations?view=assistants", roles: MANAGER, action: "cmd_ai_financial", keywords: "ai financial recommendations margin roi profit assistant" },
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
  // Customer ↔ Marketing natural language (before generic customer + campaign blocks)
  if (s.includes("winback") || s.includes("win back") || s.includes("win-back")) return "qa-cust-winback-campaign";
  if (s.includes("reactivation") || s.includes("reactivate") || (s.includes("dormant") && s.includes("campaign"))) return "qa-cust-reactivation-campaign";
  if (s.includes("retention") && (s.includes("campaign") || s.includes("customer"))) return "qa-cust-retention-campaign";
  if (s.includes("churn") && s.includes("opportunit")) return "qa-aud-atrisk";
  if (s.includes("audience") && (s.includes("analytic") || s.includes("revenue") || s.includes("insight"))) return "qa-cust-audiences";
  if (s.includes("customer") && (s.includes("audience") || s.includes("targeting") || s.includes("target"))) return "qa-cust-audiences";
  if (s.includes("customer") && s.includes("marketing")) return "qa-cust-marketing";
  if (s.includes("vip") && s.includes("audience")) return "qa-aud-vip";
  if (s.includes("loyal") && (s.includes("audience") || s.includes("customer"))) return "qa-aud-loyal";
  if ((s.includes("high value") || s.includes("high-value")) && s.includes("customer")) return "qa-aud-highvalue";
  if (s.includes("vip")) return "qa-cust-vip";
  if (s.includes("churn") || (s.includes("at risk") && s.includes("customer")) || s.includes("at-risk")) return "qa-cust-risk";
  if ((s.includes("high value") || s.includes("high-value") || s.includes("big spender")) && !s.includes("product")) return "qa-cust-highvalue";
  if (s.includes("new customer")) return "qa-cust-new";
  if (s.includes("loyal") || s.includes("customer insight") || s.includes("customer intelligence")) return "qa-cust-intel";
  // Inventory ↔ Marketing natural language (before generic campaign block)
  if ((s.includes("inventory") || s.includes("stock")) && (s.includes("opportunit") || s.includes("marketing"))) return "qa-inv-opps";
  if (s.includes("inventory") && s.includes("score")) return "qa-inv-score";
  if ((s.includes("clearance") || (s.includes("dead") && s.includes("inventory"))) && (s.includes("create") || s.includes("campaign") || s.includes("launch"))) return "qa-inv-clearance";
  if (s.includes("overstock")) return "qa-inv-overstock";
  if ((s.includes("back in stock") || s.includes("back-in-stock") || s.includes("restock")) && (s.includes("campaign") || s.includes("create") || s.includes("launch"))) return "qa-inv-back";
  if (s.includes("refund") || s.includes("return")) return "qa-returns";
  // Product ↔ Marketing natural language (check before generic campaign block)
  if (s.includes("product") && (s.includes("campaign") || s.includes("marketing") || s.includes("promotion") || s.includes("promote"))) {
    if (s.includes("feature")) return "qa-prod-feature";
    if (s.includes("campaign")) return "qa-prod-campaigns";
    if (s.includes("launch") || s.includes("promot")) return "qa-prod-promote";
    return "qa-prod-marketing";
  }
  if (s.includes("feature") && s.includes("product")) return "qa-prod-feature";
  // AI Operations natural language (before executive/financial blocks)
  if (s.includes("ai operation") || s.includes("ai assistant") || (s.includes("ai") && s.includes("recommendation")) || s.includes("business recommendation")) return "qa-ai-open";
  if (s.includes("critical action")) return "qa-ai-critical";
  if (s.includes("executive briefing") || (s.includes("daily") && s.includes("briefing"))) return "qa-ai-briefing";
  if (s.includes("weekly report")) return "qa-ai-weekly";
  if (s.includes("growth opportunit")) return "qa-ai-growth";
  if (s.includes("profit opportunit")) return "qa-ai-profit";
  if (s.includes("inventory recommendation")) return "qa-ai-inventory";
  if (s.includes("customer recommendation")) return "qa-ai-customer";
  if (s.includes("marketing recommendation")) return "qa-ai-marketing";
  if (s.includes("financial recommendation")) return "qa-ai-financial";
  // Executive Business Intelligence natural language (before financial executive block)
  if (s.includes("ceo") || s.includes("owner dashboard") || (s.includes("executive") && s.includes("dashboard"))) return "qa-exec-open";
  if ((s.includes("business") || s.includes("company")) && s.includes("health")) return "qa-exec-health";
  if ((s.includes("business") || s.includes("company")) && s.includes("risk")) return "qa-exec-risks";
  if ((s.includes("business") || s.includes("company")) && s.includes("opportunit")) return "qa-exec-opportunities";
  if (s.includes("profit") && s.includes("driver")) return "qa-exec-profit";
  if (s.includes("loss") && s.includes("driver")) return "qa-exec-loss";
  if (s.includes("executive") && s.includes("insight")) return "qa-exec-insights";
  if (s.includes("executive") && s.includes("timeline")) return "qa-exec-timeline";
  if (s.includes("regional") && s.includes("intelligence")) return "qa-exec-regions";
  if (s.includes("executive") && s.includes("summary")) return "qa-exec-open";
  // Financial ↔ Marketing natural language (before generic campaign + financial blocks)
  if (s.includes("executive") || (s.includes("summary") && (s.includes("profit") || s.includes("revenue") || s.includes("overview")))) return "qa-fin-executive";
  if (s.includes("top") && s.includes("campaign")) return "qa-fin-top-campaigns";
  if (s.includes("top") && s.includes("product")) return "qa-fin-top-products";
  if (s.includes("top") && s.includes("customer")) return "qa-fin-top-customers";
  if (s.includes("profit") && (s.includes("intelligence") || s.includes("opportunit"))) return s.includes("opportunit") ? "qa-fin-opportunities" : "qa-fin-profit";
  if (s.includes("marketing") && s.includes("profit")) return "qa-fin-marketing";
  if (s.includes("marketing") && s.includes("efficiency")) return "qa-fin-marketing";
  if (s.includes("financial") && s.includes("marketing")) return "qa-fin-marketing";
  if (s.includes("campaign") && (s.includes("profitab") || (s.includes("margin")))) return "qa-fin-campaigns";
  if (s.includes("campaign") && (s.includes("roas"))) return "qa-fin-campaigns";
  if (s.includes("campaign") && s.includes("roi") && s.includes("profit")) return "qa-fin-campaigns";
  if (s.includes("scale") && (s.includes("winning") || s.includes("winner")) && s.includes("campaign")) return "qa-fin-scale";
  if (s.includes("pause") && (s.includes("losing") || s.includes("loser")) && s.includes("campaign")) return "qa-fin-pause";
  if (s.includes("margin") && (s.includes("analysis") || s.includes("risk"))) return s.includes("risk") ? "qa-fin-margin-risk" : "qa-fin-profit";

  // Marketing automation natural language
  if (s.includes("campaign") || s.includes("automation")) {
    const make = s.includes("create") || s.includes("new") || s.includes("launch") || s.includes("make");
    if (make && s.includes("vip")) return "qa-mkt-vip";
    if (make && (s.includes("winback") || s.includes("win back") || s.includes("win-back") || s.includes("dormant") || s.includes("lapsed"))) return "qa-mkt-winback";
    if (make && s.includes("clearance")) return "qa-mkt-clearance";
    if (make && (s.includes("low stock") || s.includes("low-stock") || s.includes("lowstock"))) return "qa-mkt-lowstock";
    if (make) return "qa-mkt-create";
    if (s.includes("roi")) return "qa-mkt-roi";
    if (s.includes("alert")) return "qa-mkt-alerts";
    if (s.includes("top") || s.includes("best")) return "qa-mkt-top";
    if (s.includes("health") || s.includes("automation")) return "qa-mkt-health";
    return "qa-mkt-auto";
  }
  if (test("revenue") || test("financial") || test("money")) return "qa-financial";
  return null;
}
