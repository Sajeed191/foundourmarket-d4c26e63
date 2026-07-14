/**
 * Variant Intelligence — Catalog Intelligence 2.0, Phase 3.
 *
 * Evaluates a product's variant set across four dimensions:
 *   • Matrix health   — missing options, duplicates, orphans, broken parent/child
 *   • Pricing         — anomalies, gaps, impossible prices vs. peer variants
 *   • Inventory       — out-of-stock, hidden purchasables, missing stock
 *   • Presentation    — missing images, single reused image, missing swatches
 *
 * Deterministic, explainable, modular. Returns the canonical
 * IntelligenceModule contract so the Marketplace AI Assistant can consume it
 * exactly like every other subsystem. Never mutates the listing.
 */
import {
  statusFromScore,
  type Evidence,
  type IntelligenceModule,
  type PotentialImpact,
} from "./intelligence-module";

export type VariantRecord = {
  id?: string | null;
  title?: string | null;
  option1?: string | null; // typically color
  option2?: string | null; // typically size
  option3?: string | null;
  sku?: string | null;
  price?: number | null;
  compare_price?: number | null;
  stock?: number | null;
  is_active?: boolean | null;
  image_url?: string | null;
  swatch_color?: string | null;
};

export type VariantInput = {
  slug?: string;
  productName?: string | null;
  productPrice?: number | null;
  productImage?: string | null;
  variants: VariantRecord[];
};

export type VariantIntelligence = IntelligenceModule & {
  total: number;
  matrix: {
    optionAxes: string[];
    duplicates: number;
    orphans: number;
    brokenChildren: number;
    missingCombinations: string[];
  };
  pricing: {
    median: number | null;
    outliers: { title: string; price: number }[];
    priceless: number;
  };
  inventory: {
    outOfStock: number;
    hiddenPurchasable: number;
    missingStock: number;
  };
  presentation: {
    missingImages: number;
    singleImageReused: boolean;
    missingSwatches: number;
    brokenOptionNames: number;
  };
};

const clamp = (n: number) => Math.max(0, Math.min(100, n));

function variantLabel(v: VariantRecord): string {
  return (
    v.title?.trim() ||
    [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") ||
    v.sku?.trim() ||
    "Variant"
  );
}

function normOpt(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function analyzeMatrix(variants: VariantRecord[]) {
  const axis1 = new Set<string>();
  const axis2 = new Set<string>();
  const axis3 = new Set<string>();
  const sigs = new Map<string, number>();

  for (const v of variants) {
    if (v.option1) axis1.add(normOpt(v.option1));
    if (v.option2) axis2.add(normOpt(v.option2));
    if (v.option3) axis3.add(normOpt(v.option3));
    const sig = [normOpt(v.option1), normOpt(v.option2), normOpt(v.option3)].join("|");
    sigs.set(sig, (sigs.get(sig) ?? 0) + 1);
  }

  let duplicates = 0;
  for (const count of sigs.values()) if (count > 1) duplicates += count - 1;

  const missingCombinations: string[] = [];
  if (axis1.size > 0 && axis2.size > 0) {
    const expected = axis1.size * axis2.size;
    if (sigs.size < expected) {
      for (const a of axis1) {
        for (const b of axis2) {
          const sig = axis3.size > 0
            ? Array.from(axis3).map((c) => `${a}|${b}|${c}`)
            : [`${a}|${b}|`];
          for (const s of sig) {
            if (!sigs.has(s)) {
              const label = s.split("|").filter(Boolean).join(" / ");
              if (label && missingCombinations.length < 5) missingCombinations.push(label);
            }
          }
        }
      }
    }
  }

  // Orphans: variants with no options and no meaningful title.
  const orphans = variants.filter(
    (v) => !v.option1 && !v.option2 && !v.option3 && !v.title?.trim(),
  ).length;

  // Broken children: missing price AND missing sku AND missing stock.
  const brokenChildren = variants.filter(
    (v) => (v.price == null || v.price <= 0) && !v.sku?.trim() && (v.stock == null),
  ).length;

  return {
    optionAxes: [
      axis1.size > 0 ? `Option 1 (${axis1.size})` : "",
      axis2.size > 0 ? `Option 2 (${axis2.size})` : "",
      axis3.size > 0 ? `Option 3 (${axis3.size})` : "",
    ].filter(Boolean),
    duplicates,
    orphans,
    brokenChildren,
    missingCombinations,
  };
}

function analyzePricing(variants: VariantRecord[]) {
  const prices = variants
    .map((v) => (v.price != null && v.price > 0 ? v.price : null))
    .filter((p): p is number => p != null);
  const med = median(prices);
  const priceless = variants.filter((v) => v.price == null || v.price <= 0).length;

  const outliers: { title: string; price: number }[] = [];
  if (med != null && prices.length >= 3) {
    for (const v of variants) {
      if (v.price != null && v.price > 0) {
        const ratio = v.price / med;
        if (ratio < 0.4 || ratio > 2.5) {
          outliers.push({ title: variantLabel(v), price: v.price });
        }
      }
    }
  }
  return { median: med, outliers, priceless };
}

function analyzeInventory(variants: VariantRecord[]) {
  const outOfStock = variants.filter((v) => v.stock != null && v.stock <= 0).length;
  const hiddenPurchasable = variants.filter(
    (v) => v.is_active === false && v.stock != null && v.stock > 0,
  ).length;
  const missingStock = variants.filter((v) => v.stock == null).length;
  return { outOfStock, hiddenPurchasable, missingStock };
}

function analyzePresentation(input: VariantInput) {
  const { variants, productImage } = input;
  const missingImages = variants.filter((v) => !v.image_url?.trim()).length;
  const uniqueImages = new Set(
    variants.map((v) => (v.image_url?.trim() || productImage || "").trim()).filter(Boolean),
  );
  const singleImageReused = variants.length >= 3 && uniqueImages.size <= 1;
  // Swatches only meaningful when option1 is colour-like AND variants have color option.
  const hasColorAxis = variants.some((v) => !!v.option1);
  const missingSwatches = hasColorAxis
    ? variants.filter((v) => v.option1 && !v.swatch_color?.trim()).length
    : 0;
  const brokenOptionNames = variants.filter(
    (v) =>
      (v.option1 && v.option1.trim().length < 1) ||
      (v.option2 && v.option2.trim().length < 1),
  ).length;
  return { missingImages, singleImageReused, missingSwatches, brokenOptionNames };
}

export function analyzeVariantIntelligence(input: VariantInput): VariantIntelligence {
  const { variants } = input;
  const total = variants.length;

  // Zero-variant products are valid: score neutral 90 with an info nudge.
  if (total === 0) {
    return {
      moduleId: "variant_intelligence",
      score: 90,
      confidence: 100,
      status: statusFromScore(90),
      recommendation: "No variants configured — add options like size or colour if applicable.",
      action: "Add variants",
      actionHref: input.slug ? `/admin-product/${input.slug}/variants` : undefined,
      potentialImpact: "Low",
      evidence: [
        { key: "variants_none", message: "This product has no variants.", severity: "info", impact: 0 },
      ],
      total: 0,
      matrix: { optionAxes: [], duplicates: 0, orphans: 0, brokenChildren: 0, missingCombinations: [] },
      pricing: { median: null, outliers: [], priceless: 0 },
      inventory: { outOfStock: 0, hiddenPurchasable: 0, missingStock: 0 },
      presentation: { missingImages: 0, singleImageReused: false, missingSwatches: 0, brokenOptionNames: 0 },
    };
  }

  const matrix = analyzeMatrix(variants);
  const pricing = analyzePricing(variants);
  const inventory = analyzeInventory(variants);
  const presentation = analyzePresentation(input);

  const evidence: Evidence[] = [];

  // Matrix
  if (matrix.duplicates > 0) {
    evidence.push({
      key: "variant_duplicates",
      message: `${matrix.duplicates} duplicate variant${matrix.duplicates === 1 ? "" : "s"} detected.`,
      severity: "warning",
      impact: Math.min(20, matrix.duplicates * 6),
    });
  }
  if (matrix.brokenChildren > 0) {
    evidence.push({
      key: "variant_broken",
      message: `${matrix.brokenChildren} variant${matrix.brokenChildren === 1 ? "" : "s"} missing price, SKU, and stock.`,
      severity: "critical",
      impact: Math.min(30, matrix.brokenChildren * 12),
    });
  }
  if (matrix.orphans > 0) {
    evidence.push({
      key: "variant_orphan",
      message: `${matrix.orphans} orphan variant${matrix.orphans === 1 ? "" : "s"} with no options or title.`,
      severity: "warning",
      impact: Math.min(15, matrix.orphans * 5),
    });
  }
  if (matrix.missingCombinations.length > 0) {
    evidence.push({
      key: "variant_matrix_gaps",
      message: `Missing variant combinations: ${matrix.missingCombinations.slice(0, 3).join(", ")}${matrix.missingCombinations.length > 3 ? "…" : ""}.`,
      severity: "warning",
      impact: Math.min(20, matrix.missingCombinations.length * 4),
    });
  }

  // Pricing
  if (pricing.priceless > 0) {
    evidence.push({
      key: "variant_no_price",
      message: `${pricing.priceless} variant${pricing.priceless === 1 ? " has" : "s have"} no price.`,
      severity: "critical",
      impact: Math.min(30, pricing.priceless * 12),
    });
  }
  if (pricing.outliers.length > 0) {
    const sample = pricing.outliers[0];
    evidence.push({
      key: "variant_price_outlier",
      message: `"${sample.title}" price ${sample.price} differs significantly from similar variants.`,
      severity: "warning",
      impact: Math.min(20, pricing.outliers.length * 8),
    });
  }

  // Inventory
  if (inventory.hiddenPurchasable > 0) {
    evidence.push({
      key: "variant_hidden_purchasable",
      message: `${inventory.hiddenPurchasable} variant${inventory.hiddenPurchasable === 1 ? "" : "s"} in stock but marked inactive.`,
      severity: "warning",
      impact: Math.min(15, inventory.hiddenPurchasable * 6),
    });
  }
  if (inventory.outOfStock > 0 && inventory.outOfStock === total) {
    evidence.push({
      key: "variant_all_oos",
      message: "All variants are out of stock.",
      severity: "critical",
      impact: 25,
    });
  } else if (inventory.outOfStock > 0) {
    evidence.push({
      key: "variant_oos",
      message: `${inventory.outOfStock} of ${total} variants out of stock.`,
      severity: "info",
      impact: Math.min(10, inventory.outOfStock * 2),
    });
  }
  if (inventory.missingStock === total) {
    evidence.push({
      key: "variant_no_stock_data",
      message: "No inventory data on any variant.",
      severity: "warning",
      impact: 15,
    });
  }

  // Presentation
  if (presentation.singleImageReused) {
    evidence.push({
      key: "variant_single_image",
      message: "The same image is reused across every variant.",
      severity: "warning",
      impact: 12,
    });
  } else if (presentation.missingImages > 0) {
    evidence.push({
      key: "variant_missing_images",
      message: `${presentation.missingImages} variant${presentation.missingImages === 1 ? "" : "s"} missing a dedicated image.`,
      severity: "info",
      impact: Math.min(10, presentation.missingImages * 2),
    });
  }
  if (presentation.missingSwatches > 0) {
    evidence.push({
      key: "variant_missing_swatches",
      message: `${presentation.missingSwatches} colour variant${presentation.missingSwatches === 1 ? "" : "s"} missing a swatch.`,
      severity: "info",
      impact: Math.min(8, presentation.missingSwatches * 2),
    });
  }
  if (presentation.brokenOptionNames > 0) {
    evidence.push({
      key: "variant_broken_option_names",
      message: `${presentation.brokenOptionNames} variant${presentation.brokenOptionNames === 1 ? "" : "s"} have empty option names.`,
      severity: "warning",
      impact: Math.min(10, presentation.brokenOptionNames * 4),
    });
  }

  evidence.sort((a, b) => b.impact - a.impact);

  // Score: start at 100, subtract weighted impact.
  const rawDeduction = evidence.reduce((a, e) => a + e.impact, 0);
  const score = clamp(Math.round(100 - Math.min(100, rawDeduction)));

  const hasCritical = evidence.some((e) => e.severity === "critical");
  const potentialImpact: PotentialImpact =
    hasCritical ? "High" : score < 70 ? "Medium" : "Low";

  const top = evidence[0];
  const recommendation = top
    ? top.message
    : "Variant set looks healthy — no action needed.";
  const action = top ? actionForKey(top.key) : "Review variants";

  const actionHref = input.slug ? `/admin-product/${input.slug}/variants` : undefined;

  // Confidence lowers when data is very sparse.
  let confidence = 100;
  if (inventory.missingStock === total) confidence -= 15;
  if (pricing.median == null) confidence -= 10;
  confidence = clamp(confidence);

  return {
    moduleId: "variant_intelligence",
    score,
    confidence,
    status: statusFromScore(score),
    recommendation,
    action,
    actionHref,
    potentialImpact,
    evidence,
    total,
    matrix,
    pricing,
    inventory,
    presentation,
  };
}

function actionForKey(key: string): string {
  switch (key) {
    case "variant_broken":
    case "variant_no_price":
      return "Fix broken variants";
    case "variant_duplicates":
      return "Merge duplicates";
    case "variant_matrix_gaps":
      return "Complete variant matrix";
    case "variant_price_outlier":
      return "Review variant pricing";
    case "variant_hidden_purchasable":
      return "Activate variants";
    case "variant_all_oos":
    case "variant_oos":
      return "Restock variants";
    case "variant_no_stock_data":
      return "Set inventory";
    case "variant_single_image":
    case "variant_missing_images":
      return "Add variant images";
    case "variant_missing_swatches":
      return "Add swatches";
    case "variant_broken_option_names":
      return "Fix option names";
    default:
      return "Manage variants";
  }
}
