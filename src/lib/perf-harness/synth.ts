/**
 * Synthetic product generator for the Perf & Scale harness.
 *
 * Deterministic (seeded) pseudo-random products that satisfy the shape
 * the Intelligence Platform analyzers expect. Used ONLY by the perf
 * harness route — never imported by application code.
 */

const CATEGORIES = [
  "Electronics", "Fashion", "Home & Kitchen", "Beauty", "Sports",
  "Toys", "Automotive", "Grocery", "Books", "Health",
];
const BRANDS = [
  "Aster", "Nova", "Loop", "Vibe", "Nimbus", "Halo", "Kite", "Orbit",
  "Prism", "Sable", "Vector", "Wisp", "Zephyr", "Onyx",
];
const ADJ = ["Premium", "Everyday", "Pro", "Compact", "Ultra", "Smart", "Classic", "Modern"];
const NOUN = ["Sneaker", "Kettle", "Lamp", "Backpack", "Charger", "Bottle", "Chair", "Watch", "Speaker"];

export interface SynthProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  brand: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  metaKeywords: string[];
  image: string | null;
  priceInr: number | null;
  priceUsd: number | null;
  comparePriceInr: number | null;
  comparePriceUsd: number | null;
  costPriceInr: number | null;
  costPriceUsd: number | null;
  viewsCount: number;
  attributes: Record<string, string | number | boolean> | null;
  specifications: Record<string, string | number> | null;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate `count` deterministic synthetic products. Varies completeness
 * so the analyzers produce a realistic distribution of readiness scores.
 */
export function generateSynthProducts(count: number, seed = 1): SynthProduct[] {
  const rnd = mulberry32(seed);
  const products: SynthProduct[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[Math.floor(rnd() * CATEGORIES.length)]!;
    const brand = BRANDS[Math.floor(rnd() * BRANDS.length)]!;
    const name = `${ADJ[Math.floor(rnd() * ADJ.length)]} ${brand} ${NOUN[Math.floor(rnd() * NOUN.length)]}`;
    const completeness = rnd(); // 0..1 controls how filled-in the product is
    const price = Math.round(500 + rnd() * 9500);
    const cost = Math.round(price * (0.4 + rnd() * 0.35));
    const compare = Math.round(price * (1.1 + rnd() * 0.3));
    products[i] = {
      id: `synth_${i.toString(36)}`,
      slug: `synth-${i.toString(36)}`,
      name,
      category,
      brand,
      description:
        completeness > 0.25
          ? `A ${name.toLowerCase()} for everyday use. Durable, tested, and ready.`
          : null,
      seoTitle: completeness > 0.4 ? `${name} — ${category}` : null,
      seoDescription:
        completeness > 0.5
          ? `Shop the ${name} from ${brand}. Fast delivery, real reviews, and honest pricing.`
          : null,
      metaKeywords: completeness > 0.6 ? [category.toLowerCase(), brand.toLowerCase(), NOUN[i % NOUN.length]!.toLowerCase()] : [],
      image: completeness > 0.3 ? `https://cdn.example.com/${i}.jpg` : null,
      priceInr: price,
      priceUsd: Math.round(price / 83),
      comparePriceInr: completeness > 0.55 ? compare : null,
      comparePriceUsd: completeness > 0.55 ? Math.round(compare / 83) : null,
      costPriceInr: completeness > 0.35 ? cost : null,
      costPriceUsd: completeness > 0.35 ? Math.round(cost / 83) : null,
      viewsCount: Math.floor(rnd() * 5000),
      attributes:
        completeness > 0.45
          ? { color: ["Black", "White", "Blue"][i % 3]!, material: "Fabric", warranty_months: 12 }
          : null,
      specifications:
        completeness > 0.5
          ? { weight_g: 250 + Math.floor(rnd() * 1000), dimensions: "20x10x5 cm" }
          : null,
    };
  }
  return products;
}
