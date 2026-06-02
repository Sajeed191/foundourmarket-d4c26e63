import type { Category } from "@/lib/use-categories";

export type CategoryLink =
  | { to: "/category/$slug"; params: { slug: string } }
  | { to: "/category/$main/$sub"; params: { main: string; sub: string } };

/**
 * Build the canonical Link target for a category. Subcategories resolve to the
 * nested `/category/$main/$sub` URL; main categories stay at `/category/$slug`.
 */
export function categoryLink(cat: Category, all: Category[]): CategoryLink {
  if (cat.parent_id) {
    const parent = all.find((c) => c.id === cat.parent_id);
    if (parent) {
      return { to: "/category/$main/$sub", params: { main: parent.slug, sub: cat.slug } };
    }
  }
  return { to: "/category/$slug", params: { slug: cat.slug } };
}

/** Absolute href for a category (canonical / og:url / schema). */
export function categoryHref(cat: Category, all: Category[]): string {
  const base = "https://foundourmarket.com";
  if (cat.parent_id) {
    const parent = all.find((c) => c.id === cat.parent_id);
    if (parent) return `${base}/category/${parent.slug}/${cat.slug}`;
  }
  return `${base}/category/${cat.slug}`;
}

export function titleizeSlug(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

