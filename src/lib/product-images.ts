// Build-time responsive image variants for the bundled product photos.
// vite-imagetools generates WebP at 320/640/960/1280 widths plus a tiny
// blurred LQIP placeholder. We never ship the original full-resolution JPEG
// to the homepage — only the device-appropriate WebP is downloaded via srcset.

// @ts-expect-error — imagetools query import returns a srcset string
import earbudsSrcset from "@/assets/product-earbuds.jpg?w=320;640;960;1280&format=webp&as=srcset";
// @ts-expect-error
import earbudsLqip from "@/assets/product-earbuds.jpg?w=24&format=webp&quality=30";
// @ts-expect-error
import watchSrcset from "@/assets/product-watch.jpg?w=320;640;960;1280&format=webp&as=srcset";
// @ts-expect-error
import watchLqip from "@/assets/product-watch.jpg?w=24&format=webp&quality=30";
// @ts-expect-error
import lampSrcset from "@/assets/product-lamp.jpg?w=320;640;960;1280&format=webp&as=srcset";
// @ts-expect-error
import lampLqip from "@/assets/product-lamp.jpg?w=24&format=webp&quality=30";
// @ts-expect-error
import headphonesSrcset from "@/assets/product-headphones.jpg?w=320;640;960;1280&format=webp&as=srcset";
// @ts-expect-error
import headphonesLqip from "@/assets/product-headphones.jpg?w=24&format=webp&quality=30";
// @ts-expect-error
import flaskSrcset from "@/assets/product-flask.jpg?w=320;640;960;1280&format=webp&as=srcset";
// @ts-expect-error
import flaskLqip from "@/assets/product-flask.jpg?w=24&format=webp&quality=30";
// @ts-expect-error
import keyboardSrcset from "@/assets/product-keyboard.jpg?w=320;640;960;1280&format=webp&as=srcset";
// @ts-expect-error
import keyboardLqip from "@/assets/product-keyboard.jpg?w=24&format=webp&quality=30";
// @ts-expect-error
import backpackSrcset from "@/assets/product-backpack.jpg?w=320;640;960;1280&format=webp&as=srcset";
// @ts-expect-error
import backpackLqip from "@/assets/product-backpack.jpg?w=24&format=webp&quality=30";
// @ts-expect-error
import sunglassesSrcset from "@/assets/product-sunglasses.jpg?w=320;640;960;1280&format=webp&as=srcset";
// @ts-expect-error
import sunglassesLqip from "@/assets/product-sunglasses.jpg?w=24&format=webp&quality=30";

export type ResponsiveImage = { srcset: string; placeholder: string };

const RESPONSIVE_MAP: Record<string, ResponsiveImage> = {
  "product-earbuds.jpg": { srcset: earbudsSrcset as string, placeholder: earbudsLqip as string },
  "product-watch.jpg": { srcset: watchSrcset as string, placeholder: watchLqip as string },
  "product-lamp.jpg": { srcset: lampSrcset as string, placeholder: lampLqip as string },
  "product-headphones.jpg": { srcset: headphonesSrcset as string, placeholder: headphonesLqip as string },
  "product-flask.jpg": { srcset: flaskSrcset as string, placeholder: flaskLqip as string },
  "product-keyboard.jpg": { srcset: keyboardSrcset as string, placeholder: keyboardLqip as string },
  "product-backpack.jpg": { srcset: backpackSrcset as string, placeholder: backpackLqip as string },
  "product-sunglasses.jpg": { srcset: sunglassesSrcset as string, placeholder: sunglassesLqip as string },
};

/**
 * Returns responsive WebP srcset + blur-up placeholder for a known bundled
 * product image. Falls back to null for remote/uploaded images (which the
 * browser still lazy-loads at their natural size).
 */
export function getResponsiveImage(src: string | null | undefined): ResponsiveImage | null {
  if (!src) return null;
  const base = src.split("?")[0].split("/").pop() ?? "";
  return RESPONSIVE_MAP[base] ?? null;
}
